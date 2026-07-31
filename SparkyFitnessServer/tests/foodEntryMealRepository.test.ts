import { vi, beforeEach, describe, expect, it } from 'vitest';
import { moveFoodEntryMealToMealType } from '../models/foodEntryMealRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

interface MockDbClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

describe('foodEntryMealRepository.moveFoodEntryMealToMealType', () => {
  let mockClient: MockDbClient;
  const MEAL_ENTRY_ID = 'meal-entry-1';
  const MEAL_TYPE_ID = 'custom-breakfast-id';
  const USER_ID = 'user-1';
  const ACTOR_ID = 'actor-1';

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  const updateCalls = () =>
    mockClient.query.mock.calls.filter(
      ([sql]) => typeof sql === 'string' && sql.trim().startsWith('UPDATE')
    );
  const rawCalls = () =>
    mockClient.query.mock.calls.map(([sql]) =>
      typeof sql === 'string' ? sql.trim() : String(sql)
    );

  it('runs BEGIN → UPDATE parent → UPDATE components → COMMIT and releases the client', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      const trimmed = sql.trim();
      if (trimmed.startsWith('UPDATE food_entry_meals')) {
        return Promise.resolve({
          rows: [{ id: MEAL_ENTRY_ID, meal_type_id: MEAL_TYPE_ID }],
        });
      }
      if (trimmed.startsWith('UPDATE food_entries')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await moveFoodEntryMealToMealType(
      MEAL_ENTRY_ID,
      MEAL_TYPE_ID,
      USER_ID,
      ACTOR_ID
    );

    expect(result).toEqual({ id: MEAL_ENTRY_ID, meal_type_id: MEAL_TYPE_ID });

    // RLS context: owner + real actor.
    expect(getClient).toHaveBeenCalledWith(USER_ID, ACTOR_ID);

    const calls = rawCalls();
    expect(calls).toEqual([
      'BEGIN',
      expect.stringContaining('UPDATE food_entry_meals'),
      expect.stringContaining('UPDATE food_entries'),
      'COMMIT',
    ]);
    expect(calls).not.toContain('ROLLBACK');

    // Parent UPDATE params: mealTypeId, actor, mealEntryId, userId.
    const parentParams = updateCalls()[0][1];
    expect(parentParams).toEqual([
      MEAL_TYPE_ID,
      ACTOR_ID,
      MEAL_ENTRY_ID,
      USER_ID,
    ]);
    // Components UPDATE params: same mealTypeId, actor, mealEntryId, userId.
    const componentsParams = updateCalls()[1][1];
    expect(componentsParams).toEqual([
      MEAL_TYPE_ID,
      ACTOR_ID,
      MEAL_ENTRY_ID,
      USER_ID,
    ]);
    // food_entries has no updated_at column — it must not appear in the
    // components UPDATE (the real schema would reject it).
    const componentsSql = String(updateCalls()[1][0]);
    expect(componentsSql).not.toContain('updated_at');

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and never runs the components UPDATE when the parent is not found', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      const trimmed = sql.trim();
      if (trimmed.startsWith('UPDATE food_entry_meals')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(
      moveFoodEntryMealToMealType(
        MEAL_ENTRY_ID,
        MEAL_TYPE_ID,
        USER_ID,
        ACTOR_ID
      )
    ).rejects.toThrow('Food entry meal not found or not authorized to update.');

    const calls = rawCalls();
    expect(calls[0]).toBe('BEGIN');
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    // No components UPDATE after the parent failed.
    expect(
      updateCalls().filter(([sql]) => sql.includes('food_entries'))
    ).toHaveLength(0);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back when the components UPDATE fails', async () => {
    mockClient.query.mockImplementation((sql: string) => {
      const trimmed = sql.trim();
      if (trimmed.startsWith('UPDATE food_entry_meals')) {
        return Promise.resolve({
          rows: [{ id: MEAL_ENTRY_ID, meal_type_id: MEAL_TYPE_ID }],
        });
      }
      if (trimmed.startsWith('UPDATE food_entries')) {
        return Promise.reject(new Error('db exploded'));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(
      moveFoodEntryMealToMealType(
        MEAL_ENTRY_ID,
        MEAL_TYPE_ID,
        USER_ID,
        ACTOR_ID
      )
    ).rejects.toThrow('db exploded');

    const calls = rawCalls();
    expect(calls[0]).toBe('BEGIN');
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
