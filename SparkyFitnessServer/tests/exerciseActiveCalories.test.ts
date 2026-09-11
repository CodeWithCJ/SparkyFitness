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

  it('creates a private exercise when the user has no copy', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-exercise' }] });
    expect(
      await exerciseDb.getOrCreateActiveCaloriesExercise('user-1', 'HealthKit')
    ).toBe('new-exercise');
    const [sql, params] = client.query.mock.calls[1];
    expect(sql).toContain('INSERT INTO exercises');
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
});
