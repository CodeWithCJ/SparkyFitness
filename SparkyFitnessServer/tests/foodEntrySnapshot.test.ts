import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import foodRepository from '../models/foodRepository.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
import { buildFoodEntrySnapshot } from '../utils/foodEntrySnapshot.js';
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('buildFoodEntrySnapshot', () => {
  it('carries caffeine_mg through from the variant', () => {
    const snapshot = buildFoodEntrySnapshot(
      { name: 'Espresso', brand: null },
      {
        serving_size: 30,
        serving_unit: 'ml',
        calories: 3,
        caffeine_mg: 63,
      }
    );
    expect(snapshot.caffeine_mg).toBe(63);
  });

  it('passes through an undefined caffeine_mg unchanged', () => {
    const snapshot = buildFoodEntrySnapshot(
      { name: 'Water', brand: null },
      { serving_size: 250, serving_unit: 'ml' }
    );
    expect(snapshot.caffeine_mg).toBeUndefined();
  });

  it('carries water_ml through from the variant', () => {
    const snapshot = buildFoodEntrySnapshot(
      { name: 'Coconut Water', brand: null },
      {
        serving_size: 330,
        serving_unit: 'ml',
        calories: 60,
        water_ml: 310,
      }
    );
    expect(snapshot.water_ml).toBe(310);
  });

  it('passes through an undefined water_ml unchanged', () => {
    const snapshot = buildFoodEntrySnapshot(
      { name: 'Steak', brand: null },
      { serving_size: 200, serving_unit: 'g' }
    );
    expect(snapshot.water_ml).toBeUndefined();
  });
});
describe('foodRepository snapshot functions', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });
  // --- updateFoodEntriesSnapshot (from foodMisc.js) ---
  describe('updateFoodEntriesSnapshot', () => {
    const userId = uuidv4();
    const foodId = uuidv4();
    const variantId = uuidv4();
    const makeSnapshotData = (overrides = {}) => ({
      food_name: 'Chicken Breast',
      brand_name: 'Acme',
      serving_size: 100,
      serving_unit: 'g',
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      saturated_fat: 1,
      polyunsaturated_fat: 0.8,
      monounsaturated_fat: 1.2,
      trans_fat: 0,
      cholesterol: 85,
      sodium: 74,
      potassium: 256,
      dietary_fiber: 0,
      sugars: 0,
      vitamin_a: 6,
      vitamin_c: 0,
      calcium: 11,
      iron: 0.7,
      caffeine_mg: 5,
      water_ml: 240,
      alcohol_g: 14,
      glycemic_index: null,
      custom_nutrients: { zinc: '1.3mg' },
      ...overrides,
    });
    // With syncImages on the repository runs four statements: BEGIN, a locking
    // SELECT of the photos it is about to overwrite, the UPDATE, then COMMIT.
    // These helpers keep them straight.
    const mockSelectThenUpdate = (
      rowCount = 1,
      entryImages: string[][] = []
    ) => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: entryImages.map((images) => ({ images })),
        })
        .mockResolvedValueOnce({ rowCount })
        .mockResolvedValueOnce({}); // COMMIT
    };
    const sqlCalls = () =>
      mockClient.query.mock.calls.filter(
        ([sql]: [string]) => !['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)
      );
    const updateCall = () => sqlCalls()[1];

    it('should execute UPDATE with all 33 params in correct order and return rowCount', async () => {
      const snapshot = makeSnapshotData();
      mockSelectThenUpdate(3);
      const result = await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        snapshot
      );
      expect(result.rowCount).toBe(3);
      expect(updateCall()[0]).toContain('UPDATE food_entries');
      expect(updateCall()[1]).toEqual([
        snapshot.food_name,
        snapshot.brand_name,
        snapshot.serving_size,
        snapshot.serving_unit,
        snapshot.calories,
        snapshot.protein,
        snapshot.carbs,
        snapshot.fat,
        snapshot.saturated_fat,
        snapshot.polyunsaturated_fat,
        snapshot.monounsaturated_fat,
        snapshot.trans_fat,
        snapshot.cholesterol,
        snapshot.sodium,
        snapshot.potassium,
        snapshot.dietary_fiber,
        snapshot.sugars,
        snapshot.vitamin_a,
        snapshot.vitamin_c,
        snapshot.calcium,
        snapshot.iron,
        snapshot.glycemic_index,
        snapshot.custom_nutrients,
        snapshot.caffeine_mg,
        snapshot.water_ml,
        snapshot.alcohol_g,
        userId,
        foodId,
        variantId,
        // No entry changed unit, so nothing is converted.
        [],
        [],
        // The ids the locking SELECT returned (none here).
        [],
        // Images ride along as the 33rd param whenever they are being synced.
        JSON.stringify([]),
      ]);
    });

    it('forces the new photo onto every entry when syncing images', async () => {
      // The "update nutrition & photos" choice deliberately overwrites photos
      // the user set on individual diary entries, so the statement must carry
      // no guard exempting them.
      mockSelectThenUpdate(1);

      await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ images: ['/uploads/foods/f1/new.jpg'] }),
        true
      );

      const [sql, params] = updateCall();
      expect(sql).toContain('images = $33::jsonb');
      expect(sql).not.toContain('NOT EXISTS');
      expect(params[32]).toBe(JSON.stringify(['/uploads/foods/f1/new.jpg']));
    });

    it('reads and overwrites in one transaction, locking the rows', async () => {
      // A diary photo saved between the read and the UPDATE would otherwise be
      // overwritten without being reported, leaking its file forever.
      mockSelectThenUpdate(1);

      await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ images: ['/uploads/foods/f1/new.jpg'] }),
        true
      );

      const statements = mockClient.query.mock.calls.map(([sql]: [string]) =>
        sql.trim().split('\n')[0].trim()
      );
      expect(statements[0]).toBe('BEGIN');
      expect(statements[statements.length - 1]).toBe('COMMIT');
      expect(sqlCalls()[0][0]).toContain('FOR UPDATE');
    });

    it('rolls back and rethrows when the update fails', async () => {
      mockClient.query
        .mockResolvedValue({}) // ROLLBACK and anything after
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('DB error'));

      await expect(
        foodRepository.updateFoodEntriesSnapshot(
          userId,
          foodId,
          variantId,
          makeSnapshotData(),
          true
        )
      ).rejects.toThrow('DB error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('returns the diary-set photos it replaced so they can be unlinked', async () => {
      // Nothing else references /uploads/food_entries/<entryId>/..., so an
      // unreported path would sit on disk forever. Inherited paths belong to
      // the food and must never be unlinked from here.
      mockSelectThenUpdate(2, [
        ['/uploads/food_entries/e1/custom.jpg', '/uploads/foods/f1/old.jpg'],
        ['/uploads/food_entries/e2/custom.jpg'],
      ]);

      const result = await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ images: ['/uploads/foods/f1/new.jpg'] }),
        true
      );

      expect(result.replacedEntryImages).toEqual([
        '/uploads/food_entries/e1/custom.jpg',
        '/uploads/food_entries/e2/custom.jpg',
      ]);
    });

    it('reports each replaced photo once even when entries share it', async () => {
      mockSelectThenUpdate(2, [
        ['/uploads/food_entries/e1/custom.jpg'],
        ['/uploads/food_entries/e1/custom.jpg'],
      ]);

      const result = await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ images: [] }),
        true
      );

      expect(result.replacedEntryImages).toEqual([
        '/uploads/food_entries/e1/custom.jpg',
      ]);
    });

    it('never reports a replaced photo that survives in the new list', async () => {
      mockSelectThenUpdate(1, [['/uploads/food_entries/e1/keep.jpg']]);

      const result = await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ images: ['/uploads/food_entries/e1/keep.jpg'] }),
        true
      );

      expect(result.replacedEntryImages).toEqual([]);
    });

    it('leaves the photo column out entirely for a nutrition-only sync', async () => {
      // Every entry keeps the photo it is showing, custom or inherited, so the
      // statement must not bind the images parameter either — Postgres rejects
      // a bind carrying more parameters than the statement references.
      mockClient.query.mockResolvedValue({ rowCount: 1 });

      const result = await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ images: ['/uploads/foods/f1/new.jpg'] }),
        false
      );

      // The locking SELECT still runs: quantities may need converting.
      expect(sqlCalls()).toHaveLength(2);
      const [sql, params] = sqlCalls()[1];
      expect(sql).not.toContain('images =');
      expect(params).toHaveLength(32);
      expect(result.replacedEntryImages).toEqual([]);
    });

    it('converts logged quantities when the serving unit changes', async () => {
      // 150 g logged against a 100 g serving; the food is now 1 oz per serving.
      // Without converting, the entry would read as 150 oz.
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            // pg returns numeric columns as strings
            {
              id: 'e1',
              quantity: '150',
              serving_size: '100',
              serving_unit: 'g',
              images: [],
            },
            // already in the new unit: left alone
            {
              id: 'e2',
              quantity: '2',
              serving_size: '1',
              serving_unit: 'oz',
              images: [],
            },
            // a piece has no weight: keep the number of servings (1.5)
            {
              id: 'e3',
              quantity: '3',
              serving_size: '2',
              serving_unit: 'piece',
              images: [],
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 3 })
        .mockResolvedValueOnce({}); // COMMIT

      await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ serving_size: 1, serving_unit: 'oz' }),
        false
      );

      const [sql, params] = sqlCalls()[1];
      expect(sql).toContain('quantity = COALESCE(');
      expect(sql).toContain('THEN $4');
      expect(params[29]).toEqual(['e1', 'e3']);
      expect(params[30]).toEqual([5.2911, 1.5]);
      // The UPDATE is limited to the rows the SELECT locked.
      expect(sql).toContain('ANY($32::text[])');
      expect(params[31]).toEqual(['e1', 'e2', 'e3']);
    });

    it('leaves out entries whose unit changes but cannot be converted', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            // old serving size unknown: no way to convert, so not touched
            {
              id: 'e1',
              quantity: '3',
              serving_size: null,
              serving_unit: 'piece',
              images: [],
            },
            // same unit: updated as before, quantity kept
            {
              id: 'e2',
              quantity: '2',
              serving_size: null,
              serving_unit: 'oz',
              images: [],
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({}); // COMMIT

      await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData({ serving_size: 1, serving_unit: 'oz' }),
        false
      );

      const [, params] = sqlCalls()[1];
      expect(params[29]).toEqual([]);
      expect(params[31]).toEqual(['e2']);
    });

    it('should default custom_nutrients to {} when null or undefined', async () => {
      for (const falsy of [null, undefined]) {
        mockSelectThenUpdate(1);
        await foodRepository.updateFoodEntriesSnapshot(
          userId,
          foodId,
          variantId,
          makeSnapshotData({ custom_nutrients: falsy })
        );
        // custom_nutrients is param index 22 (0-based)
        expect(updateCall()[1][22]).toEqual({});
        mockClient.query.mockClear();
      }
    });
    it('should always release client on success', async () => {
      mockSelectThenUpdate(0);
      await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData()
      );
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
    it('should always release client when query throws', async () => {
      mockClient.query.mockRejectedValue(new Error('DB error'));
      await expect(
        foodRepository.updateFoodEntriesSnapshot(
          userId,
          foodId,
          variantId,
          makeSnapshotData()
        )
      ).rejects.toThrow('DB error');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
  // --- clearUserIgnoredUpdate (from food.js) ---
  describe('clearUserIgnoredUpdate', () => {
    it('should execute DELETE with correct params', async () => {
      const userId = uuidv4();
      const variantId = uuidv4();
      mockClient.query.mockResolvedValue({});
      await foodRepository.clearUserIgnoredUpdate(userId, variantId);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM user_ignored_updates'),
        [userId, variantId]
      );
    });
    it('should always release client', async () => {
      mockClient.query.mockResolvedValue({});
      await foodRepository.clearUserIgnoredUpdate(uuidv4(), uuidv4());
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });
  // --- getFoodsNeedingReview (from food.js) ---
  describe('getFoodsNeedingReview', () => {
    it('should execute SELECT query with userId and return rows', async () => {
      const userId = uuidv4();
      const mockRows = [
        { food_id: uuidv4(), food_name: 'Oats', serving_size: 40 },
      ];
      mockClient.query.mockResolvedValue({ rows: mockRows });
      const result = await foodRepository.getFoodsNeedingReview(userId);
      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('food_entries'),
        [userId]
      );
    });
    it('should use the food.js version that JOINs foods and food_variants tables', async () => {
      const userId = uuidv4();
      mockClient.query.mockResolvedValue({ rows: [] });
      await foodRepository.getFoodsNeedingReview(userId);
      const sql = mockClient.query.mock.calls[0][0];
      // The food.js version JOINs foods and food_variants;
      // the dead-code foodMisc.js version only queries food_entries directly.
      expect(sql).toMatch(/JOIN\s+foods\s+f/);
      expect(sql).toMatch(/JOIN\s+food_variants\s+fv/);
    });
    it('should return empty array when no matches', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });
      const result = await foodRepository.getFoodsNeedingReview(uuidv4());
      expect(result).toEqual([]);
    });
  });
});
