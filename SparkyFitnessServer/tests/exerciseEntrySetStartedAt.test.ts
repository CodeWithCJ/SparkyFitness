/**
 * Sets carry an optional started_at (#2840). Clients that do not send the
 * field yet (older apps, the web diary editor before it knows the field) must
 * not clear a start recorded by a newer client, so an update that omits it
 * keeps the stored value and only an explicit null clears it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exerciseEntrySetRequestSchema,
  exerciseEntrySetResponseSchema,
} from '@workspace/shared';
import exerciseEntryDb from '../models/exerciseEntry.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock(
  '../services/exerciseCalorieLinkService.js',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../services/exerciseCalorieLinkService.js')
    >()),
    lockCalorieLinkParticipantsWithClient: vi.fn(),
  })
);

const STARTED = '2026-11-12T09:30:05.000Z';
const COMPLETED = '2026-11-12T09:31:10.000Z';

type QueryCall = [string, unknown[] | undefined];

function insertedSetRows(client: { query: ReturnType<typeof vi.fn> }) {
  const insert = (client.query.mock.calls as QueryCall[]).find(([sql]) =>
    /INSERT INTO exercise_entry_sets/i.test(String(sql))
  );
  expect(insert).toBeDefined();
  const sql = String(insert![0]);
  const columns = sql
    .match(/INSERT INTO exercise_entry_sets \(([^)]*)\)/i)![1]
    .split(',')
    .map((c) => c.trim());
  return { sql, columns };
}

describe('set started_at request and response contract', () => {
  it('accepts a start time, an explicit null, or no field at all', () => {
    const base = { set_number: 1, reps: 8, weight: 60 };
    expect(
      exerciseEntrySetRequestSchema.parse({ ...base, started_at: STARTED })
        .started_at
    ).toBe(STARTED);
    expect(
      exerciseEntrySetRequestSchema.parse({ ...base, started_at: null })
        .started_at
    ).toBeNull();
    const omitted = exerciseEntrySetRequestSchema.parse(base);
    expect('started_at' in omitted).toBe(false);
  });

  it('rejects a start that is not an ISO date-time', () => {
    expect(
      exerciseEntrySetRequestSchema.safeParse({
        set_number: 1,
        started_at: 'yesterday',
      }).success
    ).toBe(false);
  });

  it('keeps started_at when parsing a set response and allows servers that omit it', () => {
    const set = {
      id: 1,
      set_number: 1,
      set_type: 'normal',
      reps: 8,
      weight: 60,
      duration: null,
      rest_time: 90,
      notes: null,
      rpe: null,
      completed_at: COMPLETED,
      is_pr: false,
    };
    expect(
      exerciseEntrySetResponseSchema.parse({ ...set, started_at: STARTED })
        .started_at
    ).toBe(STARTED);
    expect(
      exerciseEntrySetResponseSchema.parse(set).started_at
    ).toBeUndefined();
  });
});

describe('live workout save (reconcile by set id)', () => {
  const client = { query: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockImplementation((sql: string) => {
      if (/SELECT modality FROM exercise_entries/i.test(sql)) {
        return { rows: [{ modality: 'weight_reps' }] };
      }
      if (/SELECT id FROM exercise_entry_sets/i.test(sql)) {
        return { rows: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      }
      return { rows: [], rowCount: 1 };
    });
  });

  // What the mobile app sends today: every column except started_at.
  const sentByCurrentApp = (id: number) => ({
    id,
    set_number: id,
    set_type: 'normal',
    reps: 8,
    weight: 60,
    duration: null,
    distance: null,
    rest_time: 90,
    notes: null,
    rpe: null,
    rir: null,
    completed_at: COMPLETED,
    is_pr: false,
  });

  it('keeps the stored start for a set sent without started_at, sets and clears it otherwise', async () => {
    await exerciseEntryDb._reconcileExerciseEntrySetsWithClient(
      client,
      'entry-1',
      [
        sentByCurrentApp(1),
        { ...sentByCurrentApp(2), started_at: STARTED },
        { ...sentByCurrentApp(3), started_at: null },
      ]
    );
    const updates = (client.query.mock.calls as QueryCall[]).filter(([sql]) =>
      /UPDATE exercise_entry_sets/i.test(String(sql))
    );
    expect(updates).toHaveLength(3);
    for (const [sql] of updates) {
      expect(sql).toMatch(
        /started_at = CASE WHEN \$15::boolean THEN \$16::timestamptz ELSE started_at END/
      );
    }
    const startParams = updates.map(([, params]) => [
      params![12],
      params![14],
      params![15],
    ]);
    expect(startParams).toEqual([
      [1, false, null],
      [2, true, STARTED],
      [3, true, null],
    ]);
  });

  it('writes started_at for a new set', async () => {
    await exerciseEntryDb._reconcileExerciseEntrySetsWithClient(
      client,
      'entry-1',
      [
        sentByCurrentApp(1),
        sentByCurrentApp(2),
        sentByCurrentApp(3),
        {
          set_number: 4,
          reps: 8,
          weight: 60,
          completed_at: COMPLETED,
          started_at: STARTED,
        },
      ]
    );
    const { sql, columns } = insertedSetRows(client);
    expect(columns).toContain('started_at');
    expect(sql).toContain(`'${STARTED}'`);
  });
});

describe('replacing the sets of an entry (diary editor, provider sync)', () => {
  const client = { query: vi.fn() };
  const storedStart = new Date(STARTED);

  beforeEach(() => {
    vi.clearAllMocks();
    client.query.mockImplementation((sql: string) => {
      if (
        /FROM exercise_entries WHERE id = \$1 AND user_id = \$2 FOR UPDATE/i.test(
          sql
        )
      ) {
        return {
          rows: [
            {
              id: 'entry-1',
              user_id: 'user-1',
              exercise_id: 'ex-1',
              modality: 'weight_reps',
              entry_date: '2026-11-12',
              duration_minutes: 20,
              calories_burned: 100,
              calorie_link_id: null,
            },
          ],
        };
      }
      if (/SELECT id, started_at FROM exercise_entry_sets/i.test(sql)) {
        return {
          rows: [
            { id: 11, started_at: storedStart },
            { id: 12, started_at: null },
          ],
        };
      }
      return { rows: [], rowCount: 1 };
    });
  });

  it('carries the stored start over to a set sent back by id without started_at', async () => {
    await exerciseEntryDb._updateExerciseEntryWithClient(
      client as never,
      'entry-1',
      'user-1',
      {
        sets: [
          { id: 11, set_number: 1, reps: 8, weight: 60 },
          { id: 12, set_number: 2, reps: 8, weight: 60, started_at: STARTED },
          { set_number: 3, reps: 8, weight: 60 },
        ],
      },
      'user-1',
      undefined
    );
    const { sql, columns } = insertedSetRows(client);
    expect(columns[columns.length - 1]).toBe('started_at');
    const rows = sql
      .slice(sql.indexOf('VALUES') + 'VALUES'.length)
      .split(/\),\s*\(/);
    expect(rows).toHaveLength(3);
    // pg-format writes a Date as a timestamp literal; any of them names the
    // stored instant, so compare on the instant.
    const lastValue = (row: string) =>
      row
        .replace(/[()\s]+$/, '')
        .split(',')
        .pop()!
        .trim();
    const first = lastValue(rows[0]).replace(/^'|'$/g, '');
    expect(new Date(first).toISOString()).toBe(STARTED);
    expect(lastValue(rows[1])).toBe(`'${STARTED}'`);
    expect(lastValue(rows[2])).toBe('NULL');
  });
});
