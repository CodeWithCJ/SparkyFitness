import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import { copyReviewedFoodEntriesFromUser } from '../models/foodEntry.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const input = {
  targetUserId: 'actor-a',
  actingUserId: 'actor-a',
  sourceUserId: 'source-b',
  sourceDate: '2026-08-23',
  sourceMealTypeId: 'source-lunch-id',
  targetDate: '2026-08-24',
  targetMealTypeId: 'target-lunch-id',
  reviewedEntries: [
    { entryId: '33333333-3333-4333-8333-333333333333', quantity: 150 },
  ],
};

const reviewedRow = {
  id: input.reviewedEntries[0].entryId,
  quantity: 150,
  food_entry_meal_id: null,
};

describe('copyReviewedFoodEntriesFromUser repository transaction', () => {
  const query = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue({ query, release });
  });

  it.each([
    [
      'added',
      [
        reviewedRow,
        { ...reviewedRow, id: '44444444-4444-4444-8444-444444444444' },
      ],
    ],
    ['removed', []],
    ['quantity-changed', [{ ...reviewedRow, quantity: 175 }]],
  ])(
    'rolls back before any food-entry or meal-container insert when the source is %s after review',
    async (_change, sourceRows) => {
      query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: sourceRows,
      });

      await expect(
        copyReviewedFoodEntriesFromUser(input)
      ).rejects.toMatchObject({ statusCode: 409 });

      const executedSql = query.mock.calls.map(([sql]) => String(sql));
      expect(executedSql).toEqual(
        expect.arrayContaining([
          'BEGIN ISOLATION LEVEL SERIALIZABLE',
          'ROLLBACK',
        ])
      );
      expect(
        executedSql.some((sql) => /^\s*INSERT INTO food_entries/i.test(sql))
      ).toBe(false);
      expect(
        executedSql.some((sql) => /^\s*INSERT INTO food_entry_meals/i.test(sql))
      ).toBe(false);
      expect(release).toHaveBeenCalledOnce();
    }
  );
});
