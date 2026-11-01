import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import {
  copyReviewedFoodEntriesFromUser,
  copySelectedFoodEntries,
} from '../models/foodEntry.js';
import {
  foodEntryCopyFingerprint,
  foodEntryCopyToUserFingerprint,
} from '@workspace/shared';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const row = {
  id: '33333333-3333-4333-8333-333333333333',
  user_id: 'actor',
  entry_date: '2026-10-27',
  meal_type_id: 'source-meal',
  quantity: 100,
  food_id: null,
  variant_id: null,
  meal_id: 'source-meal-template',
  meal_plan_template_id: 'source-plan-template',
  food_entry_meal_id: 'source-container',
  food_name: 'Saved food',
  serving_size: 100,
  unit: 'g',
  serving_unit: 'g',
  calories: 120,
  protein: 10,
  notes: 'Saved note',
  water_ml: 50,
};
const baseInput = {
  sourceUserId: 'actor',
  actingUserId: 'actor',
  targetUserId: 'recipient',
  sourceDate: row.entry_date,
  targetDate: '2026-10-28',
  targetMealTypeId: 'recipient-meal',
  fingerprintVersion: 'to-user' as const,
};
const wholeInput = () => ({
  ...baseInput,
  sourceMealTypeId: row.meal_type_id,
  reviewedEntries: [
    { entryId: row.id, sourceFingerprint: foodEntryCopyToUserFingerprint(row) },
  ],
});
const selectedInput = () => ({
  ...baseInput,
  selections: [
    {
      entryId: row.id,
      sourceFingerprint: foodEntryCopyToUserFingerprint(row),
      quantity: 175,
    },
  ],
});

describe('family copy atomic repository', () => {
  const query = vi.fn();
  const release = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getClient).mockResolvedValue({ query, release });
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM food_entries fe')) return { rows: [row] };
      if (sql.includes('FROM meal_types'))
        return { rows: [{ id: baseInput.targetMealTypeId }] };
      if (sql.includes('FROM food_entry_meals'))
        return {
          rows: [
            {
              id: 'source-container',
              meal_template_id: row.meal_id,
              name: 'Saved meal',
              description: 'Meal description',
              notes: 'Meal note',
              quantity: 2,
              unit: 'serving',
              legacy_serving_unit_math: false,
              entry_total_servings: 4,
            },
          ],
        };
      if (sql.includes('INSERT INTO food_entry_meals'))
        return { rows: [{ id: 'copied-container' }] };
      if (sql.includes('INSERT INTO food_entries'))
        return { rows: [{ id: 'copied-row' }] };
      return { rows: [] };
    });
  });

  it('copies grouped meals and snapshot-only foods in one actor-scoped transaction', async () => {
    await expect(
      copyReviewedFoodEntriesFromUser(wholeInput())
    ).resolves.toEqual([{ id: 'copied-row' }]);
    expect(getClient).toHaveBeenCalledExactlyOnceWith('recipient', 'actor');
    expect(query).toHaveBeenNthCalledWith(
      1,
      'BEGIN ISOLATION LEVEL SERIALIZABLE'
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR SHARE'), [
      'actor',
      row.entry_date,
      'source-meal',
    ]);
    const mealInsert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO food_entry_meals')
    );
    expect(mealInsert?.[1]).toEqual(
      expect.arrayContaining(['recipient', 'Saved meal', 'Meal note', 2])
    );
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO food_entries')
    );
    expect(insert?.[1]).toEqual(
      expect.arrayContaining([
        'recipient',
        null,
        100,
        120,
        'Saved note',
        'copied-container',
      ])
    );
    expect(query).toHaveBeenLastCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('copies selected components as standalone adjusted rows while preserving nutrient basis and notes', async () => {
    await expect(copySelectedFoodEntries(selectedInput())).resolves.toEqual([
      { id: 'copied-row' },
    ]);
    const sqls = query.mock.calls.map(([sql]) => String(sql));
    expect(
      sqls.some((sql) => sql.includes('INSERT INTO food_entry_meals'))
    ).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('fe.id = ANY'), [
      'actor',
      row.entry_date,
      [row.id],
    ]);
    const insert = query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO food_entries')
    );
    expect(insert?.[1][3]).toBe(175);
    expect(insert?.[1][9]).toBeNull();
    expect(insert?.[1][14]).toBe(100);
    expect(insert?.[1][16]).toBe(120);
    expect(insert?.[1][38]).toBe('Saved note');
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it.each([
    ['whole', 'to-user'],
    ['selected', 'to-user'],
    ['whole', 'from-user'],
    ['selected', 'from-user'],
  ] as const)(
    'detaches source library references from %s %s copies while preserving diary grouping',
    async (mode, direction) => {
      const sourceUserId = direction === 'to-user' ? 'actor' : 'family';
      const targetUserId = direction === 'to-user' ? 'family' : 'actor';
      const sourceRow = { ...row, user_id: sourceUserId };
      const normalQuery = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string) =>
        sql.includes('FROM food_entries fe')
          ? { rows: [sourceRow] }
          : normalQuery(sql)
      );
      const copyInput = {
        ...baseInput,
        sourceUserId,
        targetUserId,
        fingerprintVersion: direction === 'to-user' ? direction : undefined,
      };
      const reviewedEntry = {
        entryId: sourceRow.id,
        sourceFingerprint:
          direction === 'to-user'
            ? foodEntryCopyToUserFingerprint(sourceRow)
            : foodEntryCopyFingerprint(sourceRow),
      };

      const copied =
        mode === 'whole'
          ? await copyReviewedFoodEntriesFromUser({
              ...copyInput,
              sourceMealTypeId: sourceRow.meal_type_id,
              reviewedEntries: [reviewedEntry],
            })
          : await copySelectedFoodEntries({
              ...copyInput,
              selections: [{ ...reviewedEntry, quantity: 175 }],
            });

      expect(copied).toEqual([{ id: 'copied-row' }]);
      expect(getClient).toHaveBeenCalledExactlyOnceWith(targetUserId, 'actor');
      const entryInserts = query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO food_entries')
      );
      expect(entryInserts).toHaveLength(1);
      const values = entryInserts[0][1];
      expect(values[0]).toBe(targetUserId);
      expect(values[3]).toBe(mode === 'whole' ? sourceRow.quantity : 175);
      expect(values[8]).toBeNull(); // No source meal-plan assignment.
      expect(values[9]).toBe(mode === 'whole' ? 'copied-container' : null);
      expect(values[12]).toBe(sourceRow.food_name);
      expect(values[16]).toBe(sourceRow.calories);
      expect(values[38]).toBe(sourceRow.notes);
      expect(values[39]).toBeNull(); // meal_id would cascade on template deletion.
      const mealInserts = query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO food_entry_meals')
      );
      expect(mealInserts).toHaveLength(mode === 'whole' ? 1 : 0);
      if (mode === 'whole') {
        // This optional container link uses ON DELETE SET NULL.
        expect(mealInserts[0][1][1]).toBe(sourceRow.meal_id);
      }
      expect(query).toHaveBeenLastCalledWith('COMMIT');
    }
  );

  it.each(['whole', 'selected'] as const)(
    'rejects source changes after preliminary validation for %s copies before creating any rows',
    async (mode) => {
      query.mockImplementation(async (sql: string) => ({
        rows: sql.includes('FROM food_entries fe')
          ? [{ ...row, quantity: 101 }]
          : [],
      }));
      await expect(
        mode === 'whole'
          ? copyReviewedFoodEntriesFromUser(wholeInput())
          : copySelectedFoodEntries(selectedInput())
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(
        query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))
      ).toBe(false);
      expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    }
  );

  it('rolls back created containers when an entry insert fails', async () => {
    const normalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO food_entries'))
        throw new Error('Insert failed');
      return normalQuery(sql);
    });
    await expect(copyReviewedFoodEntriesFromUser(wholeInput())).rejects.toThrow(
      'Insert failed'
    );
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO food_entry_meals')
      )
    ).toBe(true);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');
  });

  it('maps a selected source serialization race to 409 and rolls back', async () => {
    const normalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM food_entries fe'))
        throw Object.assign(new Error('Concurrent update'), { code: '40001' });
      return normalQuery(sql);
    });
    await expect(
      copySelectedFoodEntries(selectedInput())
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it.each([
    [
      'selected',
      'from-user',
      'matching catalog identity',
      'food',
      'variant',
      0,
    ],
    ['selected', 'from-user', 'legacy null variant', 'food', null, 1],
    ['selected', 'from-user', 'unlinked snapshot', null, null, 1],
    [
      'selected',
      'to-user',
      'explicit selection with a variant',
      'food',
      'variant',
      1,
    ],
    [
      'selected',
      'to-user',
      'explicit selection without a variant',
      'food',
      null,
      1,
    ],
    ['whole', 'from-user', 'matching catalog identity', 'food', 'variant', 0],
    ['whole', 'from-user', 'matching null variant', 'food', null, 0],
    ['whole', 'to-user', 'matching catalog identity', 'food', 'variant', 1],
    ['whole', 'to-user', 'matching null variant', 'food', null, 1],
  ] as const)(
    '%s %s copies preserve %s behavior when the recipient already has that food',
    async (mode, direction, _case, foodId, variantId, expectedCopies) => {
      const sourceUserId = direction === 'to-user' ? 'actor' : 'family';
      const targetUserId = direction === 'to-user' ? 'family' : 'actor';
      const sourceRow = {
        ...row,
        user_id: sourceUserId,
        food_id: foodId,
        meal_id: foodId === null ? row.meal_id : null,
        variant_id: variantId,
        food_entry_meal_id: mode === 'whole' ? null : row.food_entry_meal_id,
      };
      const normalQuery = query.getMockImplementation()!;
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM food_entries fe')) return { rows: [sourceRow] };
        if (sql.includes('SELECT food_id, variant_id'))
          return { rows: [{ food_id: foodId, variant_id: variantId }] };
        return normalQuery(sql);
      });
      const copyInput = {
        ...baseInput,
        sourceUserId,
        targetUserId,
        fingerprintVersion: direction === 'to-user' ? direction : undefined,
      };
      const reviewedEntry = {
        entryId: row.id,
        sourceFingerprint:
          direction === 'to-user'
            ? foodEntryCopyToUserFingerprint(sourceRow)
            : foodEntryCopyFingerprint(sourceRow),
      };
      const result =
        mode === 'whole'
          ? await copyReviewedFoodEntriesFromUser({
              ...copyInput,
              sourceMealTypeId: sourceRow.meal_type_id,
              reviewedEntries: [reviewedEntry],
            })
          : await copySelectedFoodEntries({
              ...copyInput,
              selections: [{ ...reviewedEntry, quantity: 125 }],
            });
      expect(result).toHaveLength(expectedCopies);
      const inserts = query.mock.calls.filter(([sql]) =>
        String(sql).includes('INSERT INTO food_entries')
      );
      expect(inserts).toHaveLength(expectedCopies);
      if (expectedCopies > 0) {
        expect(inserts[0][1][3]).toBe(
          mode === 'whole' ? sourceRow.quantity : 125
        );
        expect(inserts[0][1][9]).toBeNull();
        expect(inserts[0][1][16]).toBe(sourceRow.calories);
        expect(inserts[0][1][38]).toBe(sourceRow.notes);
      }
    }
  );

  it('rechecks recipient meal ownership before making any insert', async () => {
    const normalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM meal_types') ? { rows: [] } : normalQuery(sql)
    );
    await expect(
      copySelectedFoodEntries(selectedInput())
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO'))
    ).toBe(false);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
