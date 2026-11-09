import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue(db),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
import { getClient } from '../db/poolManager.js';
import mealRepository from '../models/mealRepository.js';
describe('imported meal caller-owned transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockReset().mockResolvedValue({ rows: [{ id: 'meal' }] });
  });
  it('reloads the uncommitted meal and its ingredients on the supplied transaction client', async () => {
    const client = await getClient('owner');
    vi.mocked(getClient).mockClear();
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'meal', name: 'Rice' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'ingredient',
            meal_id: 'meal',
            food_id: 'rice',
            quantity: 400,
            unit: 'g',
          },
        ],
      });

    await expect(
      mealRepository.getMealById('meal', 'owner', client)
    ).resolves.toEqual({
      id: 'meal',
      name: 'Rice',
      foods: [
        {
          id: 'ingredient',
          meal_id: 'meal',
          food_id: 'rice',
          quantity: 400,
          unit: 'g',
        },
      ],
    });
    expect(getClient).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM meals WHERE id = $1'),
      ['meal']
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM meal_foods mf'),
      [['meal']]
    );
    expect(db.release).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'leaves transaction and release to the caller (insertion fails: %s)',
    async (fail) => {
      const client = await getClient('owner');
      vi.mocked(getClient).mockClear();
      db.query.mockImplementation(async (sql: string) => {
        if (fail && sql.includes('INSERT INTO meal_foods'))
          throw new Error('Insert rejected');
        return { rows: [{ id: 'meal' }] };
      });
      const operation = mealRepository.createMeal(
        {
          user_id: 'owner',
          name: 'Rice',
          foods: [
            {
              food_id: 'food',
              variant_id: 'variant',
              quantity: 600,
              unit: 'g',
            },
          ],
        },
        client
      );
      if (fail) await expect(operation).rejects.toThrow('Insert rejected');
      else await expect(operation).resolves.toMatchObject({ id: 'meal' });
      expect(getClient).not.toHaveBeenCalled();
      expect(db.release).not.toHaveBeenCalled();
      const queries = db.query.mock.calls.map((call) => call[0]);
      expect(queries).toHaveLength(2);
      expect(queries[0]).toContain('INSERT INTO meals');
      expect(queries[1]).toContain('INSERT INTO meal_foods');
      expect(queries).not.toEqual(expect.arrayContaining(['BEGIN']));
      expect(queries).not.toEqual(expect.arrayContaining(['COMMIT']));
      expect(queries).not.toEqual(expect.arrayContaining(['ROLLBACK']));
    }
  );
});
