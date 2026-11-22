import { vi, beforeEach, describe, expect, it } from 'vitest';

const fakeClient = vi.hoisted(() => ({
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => fakeClient),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { bulkCreateFoodEntries: vi.fn() },
}));
vi.mock('../models/foodEntryMealRepository.js', () => ({
  default: {
    createFoodEntryMealWithClient: vi.fn(),
    findFoodEntryMealByClientId: vi.fn(),
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

function statements(): string[] {
  return fakeClient.query.mock.calls.map((call) => String(call[0]));
}

describe('createFoodEntryMeal with a client id (offline replay)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
    repo.createFoodEntryMealWithClient.mockResolvedValue(created as never);
    repo.findFoodEntryMealByClientId.mockResolvedValue(null);
    vi.mocked(foodRepository.bulkCreateFoodEntries).mockResolvedValue(
      undefined as never
    );
  });

  it('stores the key on the meal it creates, in one transaction', async () => {
    const result = await createFoodEntryMeal(USER_ID, USER_ID, request);

    expect(result).toBe(created);
    expect(repo.createFoodEntryMealWithClient).toHaveBeenCalledWith(
      fakeClient,
      expect.objectContaining({ client_id: CLIENT_ID }),
      USER_ID
    );
    expect(statements()).toEqual(['BEGIN', 'COMMIT']);
    expect(fakeClient.release).toHaveBeenCalledTimes(1);
  });

  it('returns the meal an earlier request stored and logs nothing', async () => {
    const stored = { id: 'stored-meal', user_id: USER_ID };
    repo.findFoodEntryMealByClientId.mockResolvedValue(stored as never);

    const result = await createFoodEntryMeal(USER_ID, USER_ID, request);

    // A stored meal is always a finished one, even one with no foods, so it is
    // never cleared or rebuilt.
    expect(result).toBe(stored);
    expect(repo.createFoodEntryMealWithClient).not.toHaveBeenCalled();
    expect(fakeClient.query).not.toHaveBeenCalled();
  });

  it('rolls everything back when writing the meal fails', async () => {
    repo.createFoodEntryMealWithClient.mockRejectedValue(new Error('boom'));

    await expect(
      createFoodEntryMeal(USER_ID, USER_ID, request)
    ).rejects.toThrow('boom');

    expect(statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(fakeClient.release).toHaveBeenCalledTimes(1);
  });

  it('answers with the winner when two copies race on the key', async () => {
    const winner = { id: 'winner', user_id: USER_ID };
    repo.createFoodEntryMealWithClient.mockRejectedValue(
      Object.assign(new Error('duplicate key'), {
        code: '23505',
        constraint: INDEX,
      })
    );
    repo.findFoodEntryMealByClientId
      .mockResolvedValueOnce(null) // before the insert
      .mockResolvedValueOnce(winner as never); // after losing the race

    const result = await createFoodEntryMeal(USER_ID, USER_ID, request);

    // The insert only fails once the other copy has committed, so that meal is
    // whole.
    expect(result).toBe(winner);
    expect(statements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(foodRepository.bulkCreateFoodEntries).not.toHaveBeenCalled();
  });

  it('does not look anything up for a request without a key', async () => {
    await createFoodEntryMeal(USER_ID, USER_ID, {
      ...(request as object),
      client_id: undefined,
    } as never);

    expect(repo.findFoodEntryMealByClientId).not.toHaveBeenCalled();
  });
});
