const foodRepository = require("../models/foodRepository");
const { v4: uuidv4 } = require("uuid");

jest.mock("../db/poolManager", () => ({
  getClient: jest.fn(),
}));

const { getClient } = require("../db/poolManager");

describe("foodRepository snapshot functions", () => {
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- updateFoodEntriesSnapshot (from foodMisc.js) ---

  describe("updateFoodEntriesSnapshot", () => {
    const userId = uuidv4();
    const foodId = uuidv4();
    const variantId = uuidv4();

    const makeSnapshotData = (overrides = {}) => ({
      food_name: "Chicken Breast",
      brand_name: "Acme",
      serving_size: 100,
      serving_unit: "g",
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
      glycemic_index: null,
      custom_nutrients: { zinc: "1.3mg" },
      ...overrides,
    });

    it("should execute UPDATE with all 26 params in correct order and return rowCount", async () => {
      const snapshot = makeSnapshotData();
      mockClient.query.mockResolvedValue({ rowCount: 3 });

      const result = await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        snapshot,
      );

      expect(result).toBe(3);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE food_entries"),
        [
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
          userId,
          foodId,
          variantId,
        ],
      );
    });

    it("should default custom_nutrients to {} when null or undefined", async () => {
      for (const falsy of [null, undefined]) {
        mockClient.query.mockResolvedValue({ rowCount: 1 });

        await foodRepository.updateFoodEntriesSnapshot(
          userId,
          foodId,
          variantId,
          makeSnapshotData({ custom_nutrients: falsy }),
        );

        const params = mockClient.query.mock.calls[0][1];
        // custom_nutrients is param index 22 (0-based)
        expect(params[22]).toEqual({});
        mockClient.query.mockClear();
      }
    });

    it("should always release client on success", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0 });

      await foodRepository.updateFoodEntriesSnapshot(
        userId,
        foodId,
        variantId,
        makeSnapshotData(),
      );

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it("should always release client when query throws", async () => {
      mockClient.query.mockRejectedValue(new Error("DB error"));

      await expect(
        foodRepository.updateFoodEntriesSnapshot(
          userId,
          foodId,
          variantId,
          makeSnapshotData(),
        ),
      ).rejects.toThrow("DB error");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // --- clearUserIgnoredUpdate (from food.js) ---

  describe("clearUserIgnoredUpdate", () => {
    it("should execute DELETE with correct params", async () => {
      const userId = uuidv4();
      const variantId = uuidv4();
      mockClient.query.mockResolvedValue({});

      await foodRepository.clearUserIgnoredUpdate(userId, variantId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM user_ignored_updates"),
        [userId, variantId],
      );
    });

    it("should always release client", async () => {
      mockClient.query.mockResolvedValue({});

      await foodRepository.clearUserIgnoredUpdate(uuidv4(), uuidv4());

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  // --- getFoodsNeedingReview (from food.js) ---

  describe("getFoodsNeedingReview", () => {
    it("should execute SELECT query with userId and return rows", async () => {
      const userId = uuidv4();
      const mockRows = [
        { food_id: uuidv4(), food_name: "Oats", serving_size: 40 },
      ];
      mockClient.query.mockResolvedValue({ rows: mockRows });

      const result = await foodRepository.getFoodsNeedingReview(userId);

      expect(result).toEqual(mockRows);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("food_entries"),
        [userId],
      );
    });

    it("should use the food.js version that JOINs foods and food_variants tables", async () => {
      const userId = uuidv4();
      mockClient.query.mockResolvedValue({ rows: [] });

      await foodRepository.getFoodsNeedingReview(userId);

      const sql = mockClient.query.mock.calls[0][0];
      // The food.js version JOINs foods and food_variants;
      // the dead-code foodMisc.js version only queries food_entries directly.
      expect(sql).toMatch(/JOIN\s+foods\s+f/);
      expect(sql).toMatch(/JOIN\s+food_variants\s+fv/);
    });

    it("should return empty array when no matches", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await foodRepository.getFoodsNeedingReview(uuidv4());

      expect(result).toEqual([]);
    });
  });
});
