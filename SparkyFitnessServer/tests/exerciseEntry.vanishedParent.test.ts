import { describe, it, expect, vi, beforeEach } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import * as poolManager from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// A provider sync range-deletes a source's entries for the batch's day span and
// then re-inserts them. Two overlapping syncs of the same source therefore race:
// one can delete a parent exercise_entries row that the other has already
// matched and is about to update.
//
// The dangerous part is that the parent UPDATE does not error when its row is
// gone, it just affects zero rows. Execution used to carry on and write sets
// against an id that no longer existed. Because the exercise_entry_sets RLS
// policy resolves its parent through an EXISTS subquery, and WITH CHECK is
// evaluated before the foreign key's AFTER ROW trigger, the failure surfaced as
// "new row violates row-level security policy" rather than as a foreign-key
// violation, which reads like a permissions misconfiguration.
describe('createExerciseEntry when the matched parent is deleted mid-request', () => {
  const STALE_ID = 'entry-deleted-by-a-concurrent-sync';
  const FRESH_ID = 'entry-inserted-as-a-replacement';

  const existingEntry = {
    id: STALE_ID,
    user_id: 'user-1',
    exercise_id: 'ex-1',
    entry_date: '2026-08-30',
    duration_minutes: 45,
    calories_burned: 400,
    source: 'Health Connect',
    source_id: 'hc-activity-9',
  };

  const entryData = {
    exercise_id: 'ex-1',
    entry_date: '2026-08-30',
    duration_minutes: 45,
    calories_burned: 400,
    source_id: 'hc-activity-9',
    sets: [{ set_number: 1, reps: 10, weight: 20 }],
  };

  const mockClient = { query: vi.fn(), release: vi.fn() };

  // Wires the mock so the row exists for every read but the UPDATE reports zero
  // affected rows, which is exactly what a delete committing first looks like.
  const arrange = (opts: { updateAffectsRows: number }) => {
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      // Dedup lookup by (user_id, source, source_id): the row is still visible.
      if (/SELECT id FROM exercise_entries/i.test(sql)) {
        return { rows: [{ id: STALE_ID }], rowCount: 1 };
      }
      if (/SELECT \* FROM exercise_entries/i.test(sql)) {
        return { rows: [existingEntry], rowCount: 1 };
      }
      if (/UPDATE exercise_entries/i.test(sql)) {
        return opts.updateAffectsRows === 0
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: STALE_ID }], rowCount: 1 };
      }
      if (/FROM exercises WHERE id/i.test(sql)) {
        return { rows: [{ name: 'Calisthenics', modality: 'strength' }] };
      }
      if (/INSERT INTO exercise_entries/i.test(sql)) {
        return { rows: [{ id: FRESH_ID }], rowCount: 1 };
      }
      if (/INSERT INTO exercise_entry_sets/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      // Final read-back of the entry.
      return { rows: [{ id: FRESH_ID, ...entryData }], rowCount: 1 };
    });
  };

  const queriesMatching = (pattern: RegExp) =>
    mockClient.query.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && pattern.test(c[0] as string)
    );

  const setsInsertParents = () =>
    mockClient.query.mock.calls
      .filter(
        (c: unknown[]) =>
          typeof c[0] === 'string' &&
          /INSERT INTO exercise_entry_sets/i.test(c[0])
      )
      .map((c: unknown[]) => c[0] as string);

  beforeEach(() => {
    vi.clearAllMocks();
    (poolManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient
    );
  });

  it('inserts a replacement instead of failing when the parent is gone', async () => {
    arrange({ updateAffectsRows: 0 });

    const entry = await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect'
    );

    expect(entry.id).toBe(FRESH_ID);
    const insertedEntry = mockClient.query.mock.calls.some(
      (c: unknown[]) =>
        typeof c[0] === 'string' && /INSERT INTO exercise_entries/i.test(c[0])
    );
    expect(insertedEntry, 'expected a replacement parent to be inserted').toBe(
      true
    );
    // The recovery re-checks for a replacement row once before inserting. It
    // must not keep retrying against a writer that deletes on every pass.
    expect(
      queriesMatching(/UPDATE exercise_entries/i).length
    ).toBeLessThanOrEqual(2);
  });

  it('locks the provider source before the deduplication lookup', async () => {
    arrange({ updateAffectsRows: 1 });

    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect'
    );

    const statements = mockClient.query.mock.calls.map((call) =>
      String(call[0])
    );
    const lockIndex = statements.findIndex((sql) =>
      /pg_advisory_xact_lock/i.test(sql)
    );
    const lookupIndex = statements.findIndex((sql) =>
      /SELECT id FROM exercise_entries/i.test(sql)
    );
    expect(lockIndex).toBeGreaterThan(statements.indexOf('BEGIN'));
    expect(lockIndex).toBeLessThan(lookupIndex);
    expect(mockClient.query.mock.calls[lockIndex][1]).toEqual([
      'exercise-entry-sync:user-1:Health Connect',
    ]);
  });

  // The competing writer is a delete-then-insert sync, so by the time our stale
  // UPDATE reports zero rows it may already have committed its own row for the
  // same natural key. exercise_entries has no unique constraint on
  // (user_id, source, source_id), so inserting blindly would store the workout
  // twice with nothing to catch it.
  it('updates the replacement row instead of storing the workout twice', async () => {
    const REPLACEMENT_ID = 'entry-reinserted-by-the-concurrent-sync';
    let dedupLookups = 0;
    mockClient.query.mockImplementation((sql: string, params?: unknown[]) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      if (/SELECT id FROM exercise_entries/i.test(sql)) {
        dedupLookups += 1;
        // The competitor's delete and re-insert both commit between our first
        // lookup and the re-check, which is one pass of its normal sync.
        return dedupLookups === 1
          ? { rows: [{ id: STALE_ID }], rowCount: 1 }
          : { rows: [{ id: REPLACEMENT_ID }], rowCount: 1 };
      }
      if (/SELECT \* FROM exercise_entries/i.test(sql)) {
        return { rows: [existingEntry], rowCount: 1 };
      }
      if (/UPDATE exercise_entries/i.test(sql)) {
        // Only the stale row is gone; the replacement updates normally.
        return params?.includes(STALE_ID)
          ? { rows: [], rowCount: 0 }
          : { rows: [{ id: REPLACEMENT_ID }], rowCount: 1 };
      }
      if (/INSERT INTO exercise_entries/i.test(sql)) {
        return { rows: [{ id: FRESH_ID }], rowCount: 1 };
      }
      return { rows: [{ id: REPLACEMENT_ID, ...entryData }], rowCount: 1 };
    });

    const entry = await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect'
    );

    expect(entry.id).toBe(REPLACEMENT_ID);
    expect(
      queriesMatching(/INSERT INTO exercise_entries/i).length,
      'the replacement row already exists, so a second parent must not be inserted'
    ).toBe(0);
    expect(dedupLookups).toBe(2);
    for (const sql of setsInsertParents()) {
      expect(sql).not.toContain(STALE_ID);
      expect(sql).toContain(REPLACEMENT_ID);
    }
    // The sets of the row we are about to rewrite, never those of the dead id.
    for (const call of queriesMatching(/DELETE FROM exercise_entry_sets/i)) {
      expect(call[1]).not.toContain(STALE_ID);
    }
  });

  // The regression itself. Sets written against the deleted id are what tripped
  // the RLS policy in production, so assert on the id embedded in the statement
  // rather than merely on the call succeeding.
  it('never writes sets against the deleted parent id', async () => {
    arrange({ updateAffectsRows: 0 });

    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect'
    );

    const statements = setsInsertParents();
    expect(statements.length).toBeGreaterThan(0);
    for (const sql of statements) {
      expect(sql).not.toContain(STALE_ID);
      expect(sql).toContain(FRESH_ID);
    }
  });

  // The delete can also land before the update helper's own existence read,
  // which used to throw 'Exercise entry not found for update.' and lose the
  // workout with an error instead of storing it. Same recovery, earlier point.
  it('inserts a replacement when the parent is gone before the existence read', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      if (/SELECT id FROM exercise_entries/i.test(sql)) {
        return { rows: [{ id: STALE_ID }], rowCount: 1 };
      }
      // The row is already gone by the time the update helper reads it.
      if (/SELECT \* FROM exercise_entries/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/FROM exercises WHERE id/i.test(sql)) {
        return { rows: [{ name: 'Calisthenics', modality: 'strength' }] };
      }
      if (/INSERT INTO exercise_entries/i.test(sql)) {
        return { rows: [{ id: FRESH_ID }], rowCount: 1 };
      }
      return { rows: [{ id: FRESH_ID, ...entryData }], rowCount: 1 };
    });

    const entry = await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect'
    );

    expect(entry.id).toBe(FRESH_ID);
    for (const sql of setsInsertParents()) {
      expect(sql).not.toContain(STALE_ID);
    }
  });

  it('still takes the update path when the parent is present', async () => {
    arrange({ updateAffectsRows: 1 });

    await exerciseEntryDb.createExerciseEntry(
      'user-1',
      entryData,
      'user-1',
      'Health Connect'
    );

    const insertedEntry = mockClient.query.mock.calls.some(
      (c: unknown[]) =>
        typeof c[0] === 'string' && /INSERT INTO exercise_entries/i.test(c[0])
    );
    expect(insertedEntry, 'a live parent must not be duplicated').toBe(false);
  });
});

// The recovery above is opt-in. A user editing one of their own diary entries
// must still get a real error when it is gone, not a silent no-op.
describe('updateExerciseEntry on a row that no longer exists', () => {
  const mockClient = { query: vi.fn(), release: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    (poolManager.getClient as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockClient
    );
  });

  it('throws when the UPDATE affects zero rows', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      if (/SELECT \* FROM exercise_entries/i.test(sql)) {
        return {
          rows: [{ id: 'entry-1', user_id: 'user-1', exercise_id: 'ex-1' }],
          rowCount: 1,
        };
      }
      if (/UPDATE exercise_entries/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(
      exerciseEntryDb.updateExerciseEntry('entry-1', 'user-1', 'user-1', {
        duration_minutes: 30,
      })
    ).rejects.toThrow('Exercise entry not found for update.');
  });
});
