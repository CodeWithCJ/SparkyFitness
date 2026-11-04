import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import * as poolManager from '../db/poolManager.js';
import {
  editedSyncFields,
  mergeManualFields,
  storedManualFields,
} from '../utils/manualFields.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

describe('editedSyncFields', () => {
  const current = {
    duration_minutes: '45',
    calories_burned: '500',
    distance: '5.57',
    avg_heart_rate: null,
    steps: 6836,
    notes: null,
  };

  it('returns only protected fields whose value changed', () => {
    expect(
      editedSyncFields(
        { distance: 6.25, calories_burned: 500, exercise_id: 'ex-2' },
        current
      )
    ).toEqual(['distance']);
  });

  it('compares numeric strings from pg as numbers', () => {
    expect(
      editedSyncFields({ duration_minutes: 45, distance: '5.57' }, current)
    ).toEqual([]);
  });

  it('treats a cleared value as a change and empty notes as unchanged', () => {
    expect(editedSyncFields({ steps: null, notes: '' }, current)).toEqual([
      'steps',
    ]);
    expect(editedSyncFields({ avg_heart_rate: 140 }, current)).toEqual([
      'avg_heart_rate',
    ]);
  });

  it('ignores fields the request does not send', () => {
    expect(editedSyncFields({}, current)).toEqual([]);
  });
});

describe('manual_fields helpers', () => {
  it('keeps only known names from the stored column', () => {
    expect(storedManualFields(['distance', 'exercise_id', 7])).toEqual([
      'distance',
    ]);
    expect(storedManualFields(null)).toEqual([]);
  });

  it('merges without duplicates in a stable order', () => {
    expect(mergeManualFields(['notes', 'distance'], ['distance'])).toEqual([
      'distance',
      'notes',
    ]);
  });
});

describe('manual_fields on exercise entry writes', () => {
  const syncedEntry = {
    id: 'entry-1',
    user_id: 'user-1',
    exercise_id: 'ex-1',
    entry_date: '2026-10-09',
    duration_minutes: '66',
    calories_burned: '546',
    distance: '6.25',
    avg_heart_rate: null,
    steps: 6836,
    notes: null,
    source: 'Health Connect',
    source_id: 'hc-run-1',
    manual_fields: ['distance'],
  };

  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (poolManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient
    );
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] };
      if (/SELECT id FROM exercise_entries WHERE user_id/i.test(sql)) {
        return { rows: [{ id: 'entry-1' }] };
      }
      if (/UPDATE exercise_entries SET/i.test(sql)) {
        return { rows: [{ id: 'entry-1' }], rowCount: 1 };
      }
      return { rows: [{ ...syncedEntry }], rowCount: 1 };
    });
  });

  // The parameters of the main UPDATE, keyed by column name.
  const writtenColumns = () => {
    const call = mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        /UPDATE exercise_entries SET/i.test(c[0]) &&
        /manual_fields\s*=/.test(c[0])
    );
    expect(call, 'expected the main UPDATE to have run').toBeDefined();
    const sql = call?.[0] as string;
    const params = call?.[1] as unknown[];
    // `<name> = $<n>` at the start of a SET line, e.g. "      distance = $8,".
    const column = (name: string) => {
      const line = sql
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith(`${name} = $`));
      expect(line, `no placeholder for ${name}`).toBeDefined();
      const index = Number.parseInt(
        (line as string).slice(`${name} = $`.length),
        10
      );
      return params[index - 1];
    };
    return column;
  };

  it('a re-sent workout keeps the fields the user edited', async () => {
    await exerciseEntryDb._createExerciseEntryWithClient(
      mockClient,
      'user-1',
      {
        exercise_id: 'ex-1',
        entry_date: '2026-10-09',
        source_id: 'hc-run-1',
        duration_minutes: 66,
        calories_burned: 500,
        distance: 5.57,
      },
      'user-1',
      'Health Connect'
    );

    const column = writtenColumns();
    expect(column('distance')).toBe('6.25');
    expect(column('calories_burned')).toBe(500);
    expect(column('manual_fields')).toEqual(['distance']);
  });

  it('a re-sent workout without manual fields updates everything', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (/SELECT id FROM exercise_entries WHERE user_id/i.test(sql)) {
        return { rows: [{ id: 'entry-1' }] };
      }
      if (/UPDATE exercise_entries SET/i.test(sql)) {
        return { rows: [{ id: 'entry-1' }], rowCount: 1 };
      }
      return { rows: [{ ...syncedEntry, manual_fields: null }], rowCount: 1 };
    });

    await exerciseEntryDb._createExerciseEntryWithClient(
      mockClient,
      'user-1',
      {
        exercise_id: 'ex-1',
        entry_date: '2026-10-09',
        source_id: 'hc-run-1',
        distance: 5.57,
      },
      'user-1',
      'Health Connect'
    );

    const column = writtenColumns();
    expect(column('distance')).toBe(5.57);
    // Nothing marked: the column stays NULL instead of an empty list.
    expect(column('manual_fields')).toBeNull();
  });

  it('a diary edit adds the changed fields to manual_fields', async () => {
    await exerciseEntryDb.updateExerciseEntry(
      'entry-1',
      'user-1',
      'user-1',
      { calories_burned: 480 },
      ['calories_burned']
    );

    const column = writtenColumns();
    expect(column('calories_burned')).toBe(480);
    expect(column('manual_fields')).toEqual(['calories_burned', 'distance']);
  });

  it('an edit built from the stored entry gets the row read under the lock', async () => {
    const resolveUpdate = vi.fn(() => ({
      updateData: { calories_burned: 480 },
      markManualFields: ['calories_burned'],
    }));

    await exerciseEntryDb.updateExerciseEntry(
      'entry-1',
      'user-1',
      'user-1',
      { calories_burned: 1 },
      [],
      resolveUpdate
    );

    const lockAt = mockClient.query.mock.calls.findIndex(
      (c: unknown[]) =>
        typeof c[0] === 'string' && /pg_advisory_xact_lock/i.test(c[0])
    );
    const readAt = mockClient.query.mock.calls.findIndex(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        /^SELECT \* FROM exercise_entries/.test(c[0])
    );
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(readAt).toBeGreaterThan(lockAt);
    expect(resolveUpdate).toHaveBeenCalledWith(syncedEntry);
    const column = writtenColumns();
    expect(column('calories_burned')).toBe(480);
    expect(column('manual_fields')).toEqual(['calories_burned', 'distance']);
  });

  it('a diary edit still writes the fields the user marked before', async () => {
    await exerciseEntryDb.updateExerciseEntry('entry-1', 'user-1', 'user-1', {
      distance: 6.3,
    });

    const column = writtenColumns();
    expect(column('distance')).toBe(6.3);
    expect(column('manual_fields')).toEqual(['distance']);
  });
});
