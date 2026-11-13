import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import exerciseDb from '../models/exercise.js';
import { getClient } from '../db/poolManager.js';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

describe('getOrCreateActiveCaloriesExercise', () => {
  let client: MockDbClient;

  beforeEach(() => {
    client = createMockDbClient();
    vi.mocked(getClient).mockResolvedValue(client);
  });

  afterEach(() => vi.clearAllMocks());

  it('selects a stable exercise owned by the importing user', async () => {
    client.query.mockResolvedValueOnce({ rows: [{ id: 'owned-exercise' }] });
    expect(
      await exerciseDb.getOrCreateActiveCaloriesExercise('user-1', 'HealthKit')
    ).toBe('owned-exercise');
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('name = $1 AND user_id = $2');
    expect(sql).toContain('ORDER BY created_at, id LIMIT 1');
    expect(params).toEqual(['Active Calories', 'user-1']);
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledOnce();
  });

  // Answers by statement so the tests do not depend on call positions.
  const answer = (found: { id: string } | null, inserted = 'new-exercise') => {
    let selects = 0;
    client.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT id FROM exercises')) {
        selects += 1;
        return { rows: selects > 1 && found ? [found] : [] };
      }
      if (sql.includes('INSERT INTO exercises')) {
        return { rows: [{ id: inserted }] };
      }
      return { rows: [] };
    });
  };

  const statements = () =>
    client.query.mock.calls.map(([sql]) =>
      sql.startsWith('SELECT pg_advisory_xact_lock')
        ? 'LOCK'
        : sql.startsWith('SELECT id FROM exercises')
          ? 'SELECT'
          : sql.includes('INSERT INTO exercises')
            ? 'INSERT'
            : sql
    );

  it('creates a private exercise when the user has no copy', async () => {
    answer(null);
    expect(
      await exerciseDb.getOrCreateActiveCaloriesExercise('user-1', 'HealthKit')
    ).toBe('new-exercise');
    expect(statements()).toEqual([
      'SELECT',
      'BEGIN',
      'LOCK',
      'SELECT',
      'INSERT',
      'COMMIT',
    ]);
    const [lockSql, lockParams] = client.query.mock.calls[2];
    expect(lockSql).toContain("hashtext('active-calories-exercise:' || $1)");
    expect(lockParams).toEqual(['user-1']);
    const [, params] = client.query.mock.calls[4];
    expect(params).toEqual([
      'user-1',
      'Active Calories',
      'Cardio',
      600,
      expect.any(String),
      true,
      false,
      'HealthKit',
      'duration_distance',
    ]);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('reuses the exercise an overlapping import created while it waited', async () => {
    answer({ id: 'created-meanwhile' });
    expect(
      await exerciseDb.getOrCreateActiveCaloriesExercise('user-1', 'HealthKit')
    ).toBe('created-meanwhile');
    expect(statements()).toEqual([
      'SELECT',
      'BEGIN',
      'LOCK',
      'SELECT',
      'COMMIT',
    ]);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('rolls back and releases when the insert fails', async () => {
    answer(null);
    const base = client.query.getMockImplementation()!;
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO exercises')) throw new Error('boom');
      return base(sql);
    });
    await expect(
      exerciseDb.getOrCreateActiveCaloriesExercise('user-1', 'HealthKit')
    ).rejects.toThrow('Failed to create active calories exercise: boom');
    expect(statements().slice(-2)).toEqual(['INSERT', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledTimes(2);
  });
});
