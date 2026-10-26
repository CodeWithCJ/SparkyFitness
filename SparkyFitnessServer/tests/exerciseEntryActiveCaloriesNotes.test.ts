import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryDb from '../models/exerciseEntry.js';
import { getClient } from '../db/poolManager.js';
import exerciseRepository from '../models/exercise.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

vi.mock('../models/exercise', () => ({
  default: {
    getExerciseById: vi.fn(),
  },
}));

vi.mock('../models/activityDetailsRepository', () => ({
  default: {},
}));

// Reproduces the bug where active calories synced from Android Health Connect
// were stamped with "Apple Health" in the entry notes regardless of platform,
// and the bug where the source column was never written (left NULL, so clients
// displayed synced entries as manual "Sparky" entries).
describe('upsertExerciseEntryData active-calories notes and source', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
    // @ts-expect-error mock typing
    exerciseRepository.getExerciseById.mockResolvedValue({
      name: 'Active Calories',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Answers the existing-entry lookup with `existing` and every other
  // statement (BEGIN, the lock, the write, COMMIT) with one row.
  const respondWith = (existing: Record<string, unknown> | undefined) => {
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('SELECT id, calories_burned')
        ? { rows: existing ? [existing] : [] }
        : { rows: [{ id: 'entry-1' }] }
    );
  };
  const writeCall = () =>
    mockClient.query.mock.calls.find(([sql]: [string]) =>
      /^\s*(INSERT|UPDATE) /.test(sql)
    );

  it('writes inside one transaction under a per-user, per-day lock', async () => {
    respondWith(undefined);

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      'Health Connect'
    );

    const statements = mockClient.query.mock.calls.map(
      ([sql]: [string]) => sql.trim().split(/\s+/)[0]
    );
    expect(statements).toEqual([
      'BEGIN',
      'SELECT',
      'SELECT',
      'INSERT',
      'COMMIT',
    ]);
    const [lockSql, lockParams] = mockClient.query.mock.calls[1];
    expect(lockSql).toContain('pg_advisory_xact_lock');
    expect(lockParams).toEqual(['user-1', '2024-01-15']);
    expect(getClient).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the client when the write fails', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO exercise_entries')) {
        throw new Error('boom');
      }
      return { rows: [] };
    });

    await expect(
      exerciseEntryDb.upsertExerciseEntryData(
        'user-1',
        'user-1',
        'exercise-1',
        300,
        '2024-01-15'
      )
    ).rejects.toThrow(/Failed to insert active calories exercise entry: boom/);
    expect(mockClient.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('records the synced source in the notes on insert (Health Connect, not Apple Health)', async () => {
    respondWith(undefined);

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      'Health Connect'
    );

    const [sql, params] = writeCall();
    expect(sql).toContain('INSERT INTO exercise_entries');
    expect(params[5]).toBe('Active calories logged from Health Connect.');
    expect(params[5]).not.toContain('Apple Health');
    expect(sql).toContain('source');
    expect(params[8]).toBe('Health Connect');
  });

  it('records the synced source in the notes on update', async () => {
    respondWith({ id: 'entry-1', calories_burned: 100 });

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      'Health Connect'
    );

    const [sql, params] = writeCall();
    expect(sql).toContain('UPDATE exercise_entries');
    expect(params[1]).toBe(
      'Active calories logged from Health Connect (updated).'
    );
    expect(params[1]).not.toContain('Apple Health');
    expect(sql).toContain('source = $5');
    expect(params[4]).toBe('Health Connect');
    expect(sql).toContain('updated_at = now()');
  });

  it('maps the HealthKit source to the friendly "Apple Health" label', async () => {
    respondWith(undefined);

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      'HealthKit'
    );

    const [, params] = writeCall();
    expect(params[5]).toBe('Active calories logged from Apple Health.');
    // The source column keeps the raw value; clients map it to a display name.
    expect(params[8]).toBe('HealthKit');
  });

  it('falls back to a generic source label when none is provided', async () => {
    respondWith(undefined);

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15'
    );

    const [, params] = writeCall();
    expect(params[5]).toBe('Active calories logged from Health Data.');
    expect(params[8]).toBe('Health Data');
  });

  it('falls back to a generic source label when source is explicitly null', async () => {
    respondWith(undefined);

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      // Simulates an untyped (`any`) caller passing null, which bypasses the default param.
      null as unknown as string
    );

    const [, params] = writeCall();
    expect(params[5]).toBe('Active calories logged from Health Data.');
    expect(params[5]).not.toContain('null');
    expect(params[8]).toBe('Health Data');
  });
});
