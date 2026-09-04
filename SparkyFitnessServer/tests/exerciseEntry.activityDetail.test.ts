import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// A provider's raw dump used to be stored after the exercise entry had already
// committed, on a connection of its own. That leaves a window in which another
// sync of the same source deletes the parent it is about to reference, and
// because the exercise_entry_activity_details RLS policy resolves the parent
// through an EXISTS subquery, the insert fails as a row-level security
// violation rather than a foreign-key error. The workout survives, its raw data
// does not, and the failure reads like a permissions misconfiguration.
describe('createExerciseEntry with a provider activity detail', () => {
  const ENTRY_ID = 'entry-created-by-this-request';

  const entryData = {
    exercise_id: 'ex-1',
    entry_date: '2026-08-30',
    duration_minutes: 45,
    calories_burned: 400,
    source_id: 'hc-activity-9',
  };

  const activityDetail = {
    provider_name: 'Health Connect',
    detail_type: 'ExerciseSession_raw_data',
    detail_data: JSON.stringify({ activityId: 'hc-activity-9' }),
    created_by_user_id: 'user-1',
    updated_by_user_id: 'user-1',
  };

  const mockClient = { query: vi.fn(), release: vi.fn() };

  const arrange = (opts: { detailInsertFails?: boolean } = {}) => {
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      // No match on the dedup lookup: this is a brand new entry.
      if (/SELECT id FROM exercise_entries/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM exercises WHERE id/i.test(sql)) {
        return { rows: [{ name: 'Calisthenics', modality: 'strength' }] };
      }
      if (/INSERT INTO exercise_entries/i.test(sql)) {
        return { rows: [{ id: ENTRY_ID }], rowCount: 1 };
      }
      if (/INSERT INTO exercise_entry_activity_details/i.test(sql)) {
        if (opts.detailInsertFails) {
          throw new Error('new row violates row-level security policy');
        }
        return { rows: [{ id: 'detail-1' }], rowCount: 1 };
      }
      return { rows: [{ id: ENTRY_ID, ...entryData }], rowCount: 1 };
    });
  };

  const statements = () =>
    mockClient.query.mock.calls.map((c: unknown[]) => String(c[0]));

  const indexOfStatement = (pattern: RegExp) =>
    statements().findIndex((sql) => pattern.test(sql));

  beforeEach(() => {
    vi.clearAllMocks();
    (poolManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient
    );
  });

  it('writes the detail on the entry transaction, before it commits', async () => {
    arrange();

    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect',
      null,
      { activityDetail }
    );

    // One connection means one transaction: a second getClient would put the
    // detail back on its own connection, which is the defect being fixed.
    expect(poolManager.getClient).toHaveBeenCalledTimes(1);
    const detailAt = indexOfStatement(
      /INSERT INTO exercise_entry_activity_details/i
    );
    expect(detailAt).toBeGreaterThan(indexOfStatement(/^\s*BEGIN/i));
    expect(detailAt).toBeLessThan(indexOfStatement(/^\s*COMMIT/i));
  });

  it('carries the entry id and the caller detail into the insert', async () => {
    arrange();

    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect',
      null,
      { activityDetail }
    );

    const call = mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        typeof c[0] === 'string' &&
        /INSERT INTO exercise_entry_activity_details/i.test(c[0])
    );
    const values = call?.[1] as unknown[];
    expect(values[0]).toBe(ENTRY_ID);
    expect(values[2]).toBe('Health Connect');
    expect(values[3]).toBe('ExerciseSession_raw_data');
    expect(values[4]).toEqual({ activityId: 'hc-activity-9' });
  });

  // Atomicity in the other direction. A half-written pair is what made the
  // reported failure so hard to see, so a detail that cannot be stored must
  // take the entry down with it rather than leave the workout without it.
  it('rolls the entry back when the detail cannot be written', async () => {
    arrange({ detailInsertFails: true });

    await expect(
      exerciseEntryDb.createExerciseEntry(
        'user-1',
        entryData,
        'user-1',
        'Health Connect',
        null,
        { activityDetail }
      )
    ).rejects.toThrow(/row-level security policy/);

    expect(statements().some((sql) => /^\s*ROLLBACK/i.test(sql))).toBe(true);
    expect(statements().some((sql) => /^\s*COMMIT/i.test(sql))).toBe(false);
  });

  it('writes no detail when the caller has none', async () => {
    arrange();

    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect'
    );

    expect(
      indexOfStatement(/INSERT INTO exercise_entry_activity_details/i)
    ).toBe(-1);
  });

  it('replaces the matching detail when the same source record is synced twice', async () => {
    let parentExists = false;
    let detailRows = 0;
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      if (/pg_advisory_xact_lock/i.test(sql)) return { rows: [] };
      if (/DELETE FROM exercise_entry_activity_details/i.test(sql)) {
        detailRows = 0;
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT id FROM exercise_entries/i.test(sql)) {
        return {
          rows: parentExists ? [{ id: ENTRY_ID }] : [],
          rowCount: parentExists ? 1 : 0,
        };
      }
      if (/SELECT \* FROM exercise_entries/i.test(sql)) {
        return {
          rows: [{ id: ENTRY_ID, user_id: 'user-1', ...entryData }],
          rowCount: 1,
        };
      }
      if (/UPDATE exercise_entries/i.test(sql)) {
        return { rows: [{ id: ENTRY_ID }], rowCount: 1 };
      }
      if (/FROM exercises WHERE id/i.test(sql)) {
        return { rows: [{ name: 'Calisthenics', modality: 'strength' }] };
      }
      if (/INSERT INTO exercise_entries/i.test(sql)) {
        parentExists = true;
        return { rows: [{ id: ENTRY_ID }], rowCount: 1 };
      }
      if (/INSERT INTO exercise_entry_activity_details/i.test(sql)) {
        detailRows += 1;
        return { rows: [{ id: `detail-${detailRows}` }], rowCount: 1 };
      }
      return { rows: [{ id: ENTRY_ID, ...entryData }], rowCount: 1 };
    });

    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect',
      null,
      { activityDetail }
    );
    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect',
      null,
      { activityDetail }
    );

    expect(detailRows).toBe(1);
    const deleteCalls = mockClient.query.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' &&
        /DELETE FROM exercise_entry_activity_details/i.test(call[0])
    );
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][1]).toEqual([
      ENTRY_ID,
      'Health Connect',
      'user-1',
      'ExerciseSession_raw_data',
    ]);
  });
});
