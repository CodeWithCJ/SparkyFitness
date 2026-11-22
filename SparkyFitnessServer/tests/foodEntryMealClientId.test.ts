import { vi, beforeEach, describe, expect, it } from 'vitest';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { bulkCreateFoodEntries: vi.fn() },
}));
vi.mock('../models/foodEntryMealRepository.js', () => ({
  default: {
    createFoodEntryMeal: vi.fn(),
    findFoodEntryMealByClientId: vi.fn(),
    countFoodEntryMealComponents: vi.fn(),
    deleteFoodEntryMeal: vi.fn(),
  },
}));
vi.mock('../models/mealRepository.js', () => ({
  default: { getMealById: vi.fn() },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { createFoodEntryMeal } from '../services/foodEntryService.js';
import foodRepository from '../models/foodRepository.js';
import foodEntryMealRepository from '../models/foodEntryMealRepository.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const INDEX = 'idx_food_entry_meals_user_client_id';

const repo = vi.mocked(foodEntryMealRepository);
const request = {
  user_id: USER_ID,
  meal_type_id: 'mt-1',
  entry_date: '2026-11-21',
  name: 'Porridge',
  quantity: 1,
  unit: 'serving',
  // No components: building them needs the food library, which is not what
  // these tests are about.
  foods: [],
  client_id: CLIENT_ID,
  _clientMealModelVersion: 2,
} as never;

const created = { id: 'new-meal', user_id: USER_ID, meal_type_id: 'mt-1' };

describe('createFoodEntryMeal with a client id (offline replay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.createFoodEntryMeal.mockResolvedValue(created as never);
    repo.findFoodEntryMealByClientId.mockResolvedValue(null);
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue(
      undefined as never
    );
  });

  it('stores the key on the meal it creates', async () => {
    await createFoodEntryMeal(USER_ID, USER_ID, request);

    expect(repo.createFoodEntryMeal).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID }),
      USER_ID
    );
  });

  it('returns the meal an earlier request stored and logs nothing', async () => {
    const stored = { id: 'stored-meal', user_id: USER_ID };
    repo.findFoodEntryMealByClientId.mockResolvedValue(stored as never);
    repo.countFoodEntryMealComponents.mockResolvedValue(1);

    const result = await createFoodEntryMeal(USER_ID, USER_ID, request);

    expect(result).toBe(stored);
    expect(repo.createFoodEntryMeal).not.toHaveBeenCalled();
    expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
  });

  it('finishes a meal whose parent was stored but whose components never were', async () => {
    repo.findFoodEntryMealByClientId.mockResolvedValue({
      id: 'orphan',
      user_id: USER_ID,
      created_at: new Date(Date.now() - 5 * 60 * 1000),
    } as never);
    repo.countFoodEntryMealComponents.mockResolvedValue(0);

    const result = await createFoodEntryMeal(USER_ID, USER_ID, request);

    // The empty parent goes, and the meal is made again in full.
    expect(repo.deleteFoodEntryMeal).toHaveBeenCalledWith('orphan', USER_ID);
    expect(repo.createFoodEntryMeal).toHaveBeenCalledTimes(1);
    expect(result).toBe(created);
  });

  it('does not clear an empty parent that is young: its request may still be writing the components', async () => {
    repo.findFoodEntryMealByClientId.mockResolvedValue({
      id: 'in-flight',
      user_id: USER_ID,
      created_at: new Date(Date.now() - 2000),
    } as never);
    repo.countFoodEntryMealComponents.mockResolvedValue(0);

    await expect(
      createFoodEntryMeal(USER_ID, USER_ID, request)
    ).rejects.toMatchObject({ status: 503 });

    expect(repo.deleteFoodEntryMeal).not.toHaveBeenCalled();
    expect(repo.createFoodEntryMeal).not.toHaveBeenCalled();
  });

  it('answers with the winner when two copies race on the key', async () => {
    const winner = { id: 'winner', user_id: USER_ID };
    repo.createFoodEntryMeal.mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: INDEX,
      })
    );
    repo.findFoodEntryMealByClientId
      .mockResolvedValueOnce(null) // before the insert
      .mockResolvedValueOnce(winner as never); // after losing the race

    const result = await createFoodEntryMeal(USER_ID, USER_ID, request);

    expect(result).toBe(winner);
    expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
  });

  it('passes on any other failure', async () => {
    repo.createFoodEntryMeal.mockRejectedValue(new Error('boom'));

    await expect(
      createFoodEntryMeal(USER_ID, USER_ID, request)
    ).rejects.toThrow('boom');
  });

  it('does not look anything up for a request without a key', async () => {
    await createFoodEntryMeal(USER_ID, USER_ID, {
      ...(request as object),
      client_id: undefined,
    } as never);

    expect(repo.findFoodEntryMealByClientId).not.toHaveBeenCalled();
    expect(repo.createFoodEntryMeal).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: null }),
      USER_ID
    );
  });
});
