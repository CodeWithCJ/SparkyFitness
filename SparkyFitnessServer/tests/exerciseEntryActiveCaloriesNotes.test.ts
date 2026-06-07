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
// were stamped with "Apple Health" in the entry notes regardless of platform.
describe('upsertExerciseEntryData active-calories notes', () => {
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

  it('records the synced source in the notes on insert (Health Connect, not Apple Health)', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // no existing entry
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] }); // insert

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      'Health Connect'
    );

    const [sql, params] = mockClient.query.mock.calls[1];
    expect(sql).toContain('INSERT INTO exercise_entries');
    expect(params[5]).toBe('Active calories logged from Health Connect.');
    expect(params[5]).not.toContain('Apple Health');
  });

  it('records the synced source in the notes on update', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ id: 'entry-1', calories_burned: 100 }],
      }) // existing entry
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] }); // update

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      'Health Connect'
    );

    const [sql, params] = mockClient.query.mock.calls[1];
    expect(sql).toContain('UPDATE exercise_entries');
    expect(params[1]).toBe(
      'Active calories logged from Health Connect (updated).'
    );
    expect(params[1]).not.toContain('Apple Health');
  });

  it('maps the HealthKit source to the friendly "Apple Health" label', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] });

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      'HealthKit'
    );

    const [, params] = mockClient.query.mock.calls[1];
    expect(params[5]).toBe('Active calories logged from Apple Health.');
  });

  it('falls back to a generic source label when none is provided', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] });

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15'
    );

    const [, params] = mockClient.query.mock.calls[1];
    expect(params[5]).toBe('Active calories logged from Health Data.');
  });

  it('falls back to a generic source label when source is explicitly null', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'entry-1' }] });

    await exerciseEntryDb.upsertExerciseEntryData(
      'user-1',
      'user-1',
      'exercise-1',
      300,
      '2024-01-15',
      // Simulates an untyped (`any`) caller passing null, which bypasses the default param.
      null as unknown as string
    );

    const [, params] = mockClient.query.mock.calls[1];
    expect(params[5]).toBe('Active calories logged from Health Data.');
    expect(params[5]).not.toContain('null');
  });
});
