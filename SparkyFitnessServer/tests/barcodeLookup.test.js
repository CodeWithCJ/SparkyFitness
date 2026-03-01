jest.mock("../models/foodRepository");
jest.mock("../integrations/openfoodfacts/openFoodFactsService");
jest.mock("../config/logging", () => ({ log: jest.fn() }));

const foodRepository = require("../models/foodRepository");
const {
  searchOpenFoodFactsByBarcode,
} = require("../integrations/openfoodfacts/openFoodFactsService");
const {
  lookupBarcode,
  mapOpenFoodFactsProduct,
} = require("../services/foodCoreService");

const TEST_USER_ID = "user-123";

const makeLocalFood = (overrides = {}) => ({
  id: "food-abc-123",
  name: "Peanut Butter",
  brand: "Jif",
  is_custom: false,
  user_id: TEST_USER_ID,
  provider_external_id: "012345678901",
  provider_type: "openfoodfacts",
  default_variant: {
    id: "variant-xyz",
    serving_size: 100,
    serving_unit: "g",
    calories: 588,
    protein: 25.1,
    carbs: 20,
    fat: 50,
    is_default: true,
  },
  ...overrides,
});

const makeOffResponse = (overrides = {}) => ({
  status: 1,
  product: {
    product_name: "Nutella",
    brands: "Ferrero, Imported",
    code: "3017620422003",
    nutriments: {
      "energy-kcal_100g": 539,
      "proteins_100g": 6.3,
      "carbohydrates_100g": 57.5,
      "fat_100g": 30.9,
      "saturated-fat_100g": 10.6,
      "sodium_100g": 0.041,
      "fiber_100g": 3.4,
      "sugars_100g": 56.3,
    },
    ...overrides.product,
  },
  ...overrides,
});

describe("mapOpenFoodFactsProduct", () => {
  it("should map a full OFF product to the local food schema", () => {
    const offProduct = makeOffResponse().product;
    const result = mapOpenFoodFactsProduct(offProduct);

    expect(result).toEqual({
      name: "Nutella",
      brand: "Ferrero",
      barcode: "3017620422003",
      provider_external_id: "3017620422003",
      provider_type: "openfoodfacts",
      is_custom: false,
      default_variant: {
        serving_size: 100,
        serving_unit: "g",
        calories: 539,
        protein: 6.3,
        carbs: 57.5,
        fat: 30.9,
        saturated_fat: 10.6,
        sodium: 41,
        dietary_fiber: 3.4,
        sugars: 56.3,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 0,
        cholesterol: 0,
        potassium: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        calcium: 0,
        iron: 0,
        is_default: true,
      },
    });
  });

  it("should convert sodium from grams to milligrams", () => {
    const product = {
      product_name: "Salty Snack",
      code: "111",
      nutriments: {
        "energy-kcal_100g": 100,
        "sodium_100g": 1.5,
      },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.default_variant.sodium).toBe(1500);
  });

  it("should default missing nutriments to 0", () => {
    const product = {
      product_name: "Bare Minimum",
      code: "222",
      nutriments: {
        "energy-kcal_100g": 50,
      },
    };
    const result = mapOpenFoodFactsProduct(product);

    expect(result.default_variant.protein).toBe(0);
    expect(result.default_variant.carbs).toBe(0);
    expect(result.default_variant.fat).toBe(0);
    expect(result.default_variant.saturated_fat).toBe(0);
    expect(result.default_variant.sodium).toBe(0);
    expect(result.default_variant.dietary_fiber).toBe(0);
    expect(result.default_variant.sugars).toBe(0);
  });

  it("should handle missing nutriments object entirely", () => {
    const product = {
      product_name: "No Nutriments",
      code: "333",
    };
    const result = mapOpenFoodFactsProduct(product);

    expect(result.default_variant.calories).toBe(0);
    expect(result.default_variant.protein).toBe(0);
  });

  it("should extract only the first brand from comma-separated list", () => {
    const product = {
      product_name: "Multi Brand",
      brands: "  Brand A , Brand B , Brand C ",
      code: "444",
      nutriments: { "energy-kcal_100g": 100 },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.brand).toBe("Brand A");
  });

  it("should default brand to empty string when brands is missing", () => {
    const product = {
      product_name: "No Brand",
      code: "555",
      nutriments: { "energy-kcal_100g": 100 },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.brand).toBe("");
  });

  it("should always set serving_size to 100 and serving_unit to g", () => {
    const product = {
      product_name: "Test",
      code: "666",
      nutriments: { "energy-kcal_100g": 100 },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.default_variant.serving_size).toBe(100);
    expect(result.default_variant.serving_unit).toBe("g");
  });

  it("should round macros to one decimal place and calories to integer", () => {
    const product = {
      product_name: "Rounding Test",
      code: "777",
      nutriments: {
        "energy-kcal_100g": 538.6,
        "proteins_100g": 6.349,
        "fat_100g": 6.351,
        "carbohydrates_100g": 10.05,
      },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.default_variant.calories).toBe(539);
    expect(result.default_variant.protein).toBe(6.3);
    expect(result.default_variant.fat).toBe(6.4);
    expect(result.default_variant.carbs).toBe(10.1);
  });
});

describe("lookupBarcode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return local food when found in DB", async () => {
    const localFood = makeLocalFood();
    foodRepository.findFoodByBarcode.mockResolvedValue(localFood);

    const result = await lookupBarcode("012345678901", TEST_USER_ID);

    expect(result).toEqual({ source: "local", food: localFood });
    expect(foodRepository.findFoodByBarcode).toHaveBeenCalledWith(
      "012345678901",
      TEST_USER_ID,
    );
    expect(searchOpenFoodFactsByBarcode).not.toHaveBeenCalled();
  });

  it("should fall back to OpenFoodFacts when not found locally", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcode.mockResolvedValue(makeOffResponse());

    const result = await lookupBarcode("3017620422003", TEST_USER_ID);

    expect(result.source).toBe("openfoodfacts");
    expect(result.food.name).toBe("Nutella");
    expect(result.food.brand).toBe("Ferrero");
    expect(result.food.barcode).toBe("3017620422003");
    expect(result.food.provider_type).toBe("openfoodfacts");
    expect(result.food.default_variant.calories).toBe(539);
  });

  it("should return not_found when OFF returns status 0", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcode.mockResolvedValue({ status: 0 });

    const result = await lookupBarcode("0000000000000", TEST_USER_ID);

    expect(result).toEqual({ source: "not_found", food: null });
  });

  it("should return not_found when OFF product has no product_name", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcode.mockResolvedValue({
      status: 1,
      product: {
        code: "111",
        nutriments: { "energy-kcal_100g": 100 },
      },
    });

    const result = await lookupBarcode("11111111", TEST_USER_ID);

    expect(result).toEqual({ source: "not_found", food: null });
  });

  it("should return openfoodfacts result when OFF product has no energy-kcal_100g", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcode.mockResolvedValue({
      status: 1,
      product: {
        product_name: "Missing Calories",
        code: "222",
        nutriments: { "proteins_100g": 5 },
      },
    });

    const result = await lookupBarcode("22222222", TEST_USER_ID);

    expect(result.source).toBe("openfoodfacts");
    expect(result.food.name).toBe("Missing Calories");
    expect(result.food.default_variant.calories).toBe(0);
    expect(result.food.default_variant.protein).toBe(5);
  });

  it("should degrade gracefully to not_found when OFF API throws", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcode.mockRejectedValue(
      new Error("Network timeout"),
    );

    const result = await lookupBarcode("99999999", TEST_USER_ID);

    expect(result).toEqual({ source: "not_found", food: null });
  });

  it("should propagate errors from the local DB lookup", async () => {
    foodRepository.findFoodByBarcode.mockRejectedValue(
      new Error("Database error"),
    );

    await expect(
      lookupBarcode("012345678901", TEST_USER_ID),
    ).rejects.toThrow("Database error");

    expect(searchOpenFoodFactsByBarcode).not.toHaveBeenCalled();
  });

  it("should treat whitespace-only product_name as valid (truthy string)", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcode.mockResolvedValue({
      status: 1,
      product: {
        product_name: "   ",
        code: "88888888",
        nutriments: { "energy-kcal_100g": 50 },
      },
    });

    const result = await lookupBarcode("88888888", TEST_USER_ID);

    // Whitespace-only name passes the truthy check — documents current behavior
    expect(result.source).toBe("openfoodfacts");
    expect(result.food.name).toBe("   ");
  });

  it("should accept OFF product with energy-kcal_100g of 0", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcode.mockResolvedValue({
      status: 1,
      product: {
        product_name: "Zero Cal Water",
        code: "77777777",
        nutriments: { "energy-kcal_100g": 0 },
      },
    });

    const result = await lookupBarcode("77777777", TEST_USER_ID);

    expect(result.source).toBe("openfoodfacts");
    expect(result.food.name).toBe("Zero Cal Water");
    expect(result.food.default_variant.calories).toBe(0);
  });
});
