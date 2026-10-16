import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(db),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { getClient } from '../db/poolManager.js';
import { updateFoodEntryMeal } from '../models/foodEntryMealRepository.js';
import {
  bulkCreateFoodEntries,
  deleteFoodEntryComponentsByFoodEntryMealId,
} from '../models/foodEntry.js';

const entry = {
  user_id: 'user-1',
  food_id: null,
  variant_id: null,
  food_entry_meal_id: 'meal-1',
  meal_type_id: 'dinner-id',
  quantity: 100,
  unit: 'g',
  entry_date: '2026-10-14',
  food_name: 'Stored food',
  serving_size: 100,
  serving_unit: 'g',
  calories: 165,
};

describe('logged meal repository transaction connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query
      .mockReset()
      .mockResolvedValue({ rows: [{ id: 'meal-1' }], rowCount: 1 });
  });

  it('uses the caller connection for all writes without acquiring or releasing another', async () => {
    const client = await getClient('user-1');
    vi.mocked(getClient).mockClear();
    await updateFoodEntryMeal(
      'meal-1',
      { name: 'Edited meal' },
      'user-1',
      client
    );
    await deleteFoodEntryComponentsByFoodEntryMealId(
      'meal-1',
      'user-1',
      client
    );
    await bulkCreateFoodEntries([entry], 'user-1', { client });
    expect(getClient).not.toHaveBeenCalled();
    expect(db.release).not.toHaveBeenCalled();
    const queries = db.query.mock.calls.map((call) => call[0]);
    expect(queries[0]).toContain('UPDATE food_entry_meals');
    expect(queries[1]).toContain('DELETE FROM food_entries');
    expect(queries[2]).toContain('INSERT INTO food_entries');
  });

  it('propagates an insertion failure while leaving rollback and release to the caller', async () => {
    const client = await getClient('user-1');
    vi.mocked(getClient).mockClear();
    db.query.mockRejectedValueOnce(
      new Error('Database constraint rejected insert')
    );
    await expect(
      bulkCreateFoodEntries([entry], 'user-1', { client })
    ).rejects.toThrow('Database constraint rejected insert');
    expect(getClient).not.toHaveBeenCalled();
    expect(db.release).not.toHaveBeenCalled();
  });
});
