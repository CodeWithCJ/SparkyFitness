jest.mock("../models/foodRepository");
jest.mock("../integrations/openfoodfacts/openFoodFactsService", () => ({
  ...jest.requireActual("../integrations/openfoodfacts/openFoodFactsService"),
  searchOpenFoodFactsByBarcodeFields: jest.fn(),
}));
jest.mock("../integrations/usda/usdaService", () => ({
  ...jest.requireActual("../integrations/usda/usdaService"),
  searchUsdaFoodsByBarcode: jest.fn(),
}));
jest.mock("../services/externalProviderService");
jest.mock("../services/preferenceService");
jest.mock("../config/logging", () => ({ log: jest.fn() }));

const foodRepository = require("../models/foodRepository");
const {
  searchOpenFoodFactsByBarcodeFields,
  mapOpenFoodFactsProduct,
} = require("../integrations/openfoodfacts/openFoodFactsService");
const {
  searchUsdaFoodsByBarcode,
  mapUsdaBarcodeProduct,
} = require("../integrations/usda/usdaService");
const externalProviderService = require("../services/externalProviderService");
const preferenceService = require("../services/preferenceService");
const { lookupBarcode } = require("../services/foodCoreService");
const { normalizeBarcode } = require("../utils/foodUtils");

describe("normalizeBarcode", () => {
  it("should pad a 12-digit UPC-A to 13-digit EAN-13", () => {
    expect(normalizeBarcode("094395000172")).toBe("0094395000172");
  });

  it("should leave a 13-digit EAN-13 unchanged", () => {
    expect(normalizeBarcode("0094395000172")).toBe("0094395000172");
  });

  it("should leave an 8-digit EAN-8 unchanged", () => {
    expect(normalizeBarcode("12345678")).toBe("12345678");
  });

  it("should pass through null", () => {
    expect(normalizeBarcode(null)).toBe(null);
  });

  it("should pass through undefined", () => {
    expect(normalizeBarcode(undefined)).toBe(undefined);
  });

  it("should pass through non-string values", () => {
    expect(normalizeBarcode(123456789012)).toBe(123456789012);
  });
});

const TEST_USER_ID = "user-123";
const TEST_PROVIDER_ID = "provider-usda-001";

const makeUsdaFood = (overrides = {}) => ({
  fdcId: 2345678,
  description: "CHOCOLATE HAZELNUT SPREAD",
  brandName: "NUTELLA",
  brandOwner: "Ferrero",
  gtinUpc: "3017620422003",
  servingSize: 37,
  foodNutrients: [
    { nutrientId: 1008, value: 539 },
    { nutrientId: 1003, value: 6.3 },
    { nutrientId: 1005, value: 57.5 },
    { nutrientId: 1004, value: 30.9 },
    { nutrientId: 1258, value: 10.6 },
    { nutrientId: 1257, value: 0 },
    { nutrientId: 1253, value: 5 },
    { nutrientId: 1093, value: 41 },
    { nutrientId: 1092, value: 200 },
    { nutrientId: 1079, value: 3.4 },
    { nutrientId: 2000, value: 56.3 },
    { nutrientId: 1087, value: 120 },
    { nutrientId: 1089, value: 2.3 },
  ],
  ...overrides,
});

const makeUsdaProvider = (overrides = {}) => ({
  id: TEST_PROVIDER_ID,
  provider_type: "usda",
  app_key: "test-usda-api-key",
  is_active: true,
  ...overrides,
});

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
    serving_quantity: 37,
    nutriments: {
      "energy-kcal_100g": 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
      "saturated-fat_100g": 10.6,
      sodium_100g: 0.041,
      fiber_100g: 3.4,
      sugars_100g: 56.3,
    },
    ...overrides.product,
  },
  ...overrides,
});

describe("mapOpenFoodFactsProduct", () => {
  it("should map a full OFF product to the local food schema", () => {
    const offProduct = makeOffResponse().product;
    const result = mapOpenFoodFactsProduct(offProduct);

    // serving_quantity=37, scale=0.37, all per-100g values scaled to per-serving
    expect(result).toEqual({
      name: "Nutella",
      brand: "Ferrero",
      barcode: "3017620422003",
      provider_external_id: "3017620422003",
      provider_type: "openfoodfacts",
      is_custom: false,
      default_variant: {
        serving_size: 37,
        serving_unit: "g",
        calories: 199,
        protein: 2.3,
        carbs: 21.3,
        fat: 11.4,
        saturated_fat: 3.9,
        sodium: 15,
        dietary_fiber: 1.3,
        sugars: 20.8,
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
        sodium_100g: 1.5,
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

  it("should fall back to serving_size 100 when serving_quantity is missing", () => {
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
        proteins_100g: 6.349,
        fat_100g: 6.351,
        carbohydrates_100g: 10.05,
      },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.default_variant.calories).toBe(539);
    expect(result.default_variant.protein).toBe(6.3);
    expect(result.default_variant.fat).toBe(6.4);
    expect(result.default_variant.carbs).toBe(10.1);
  });

  it("should fall back to 100g when serving_quantity is 0", () => {
    const product = {
      product_name: "Zero Serving",
      code: "888",
      serving_quantity: 0,
      nutriments: { "energy-kcal_100g": 200 },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.default_variant.serving_size).toBe(100);
    expect(result.default_variant.calories).toBe(200);
  });

  it("should fall back to 100g when serving_quantity is negative", () => {
    const product = {
      product_name: "Negative Serving",
      code: "999",
      serving_quantity: -10,
      nutriments: { "energy-kcal_100g": 200 },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.default_variant.serving_size).toBe(100);
    expect(result.default_variant.calories).toBe(200);
  });

  it("should normalize a 12-digit barcode to 13 digits", () => {
    const product = {
      product_name: "UPC Product",
      code: "094395000172",
      nutriments: { "energy-kcal_100g": 100 },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.barcode).toBe("0094395000172");
    expect(result.provider_external_id).toBe("094395000172");
  });

  it("should scale nutrient values to the serving size", () => {
    const product = {
      product_name: "Scaled Product",
      code: "1010",
      serving_quantity: 50,
      nutriments: {
        "energy-kcal_100g": 400,
        proteins_100g: 20,
        fat_100g: 10,
      },
    };
    const result = mapOpenFoodFactsProduct(product);
    expect(result.default_variant.serving_size).toBe(50);
    expect(result.default_variant.calories).toBe(200);
    expect(result.default_variant.protein).toBe(10);
    expect(result.default_variant.fat).toBe(5);
  });
});

describe("mapUsdaBarcodeProduct", () => {
  it("should map a full USDA branded food to the local food schema", () => {
    const usdaFood = makeUsdaFood();
    const result = mapUsdaBarcodeProduct(usdaFood);

    // servingSize=37, scale=0.37, all per-100g values scaled to per-serving
    expect(result).toEqual({
      name: "CHOCOLATE HAZELNUT SPREAD",
      brand: "NUTELLA",
      barcode: "3017620422003",
      provider_external_id: "2345678",
      provider_type: "usda",
      is_custom: false,
      default_variant: {
        serving_size: 37,
        serving_unit: "g",
        calories: 199,
        protein: 2.3,
        carbs: 21.3,
        fat: 11.4,
        saturated_fat: 3.9,
        trans_fat: 0,
        cholesterol: 2,
        sodium: 15,
        potassium: 74,
        dietary_fiber: 1.3,
        sugars: 20.8,
        calcium: 44,
        iron: 0.9,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        vitamin_a: 0,
        vitamin_c: 0,
        is_default: true,
      },
    });
  });

  it("should default missing nutrients to 0", () => {
    const usdaFood = makeUsdaFood({
      foodNutrients: [{ nutrientId: 1008, value: 100 }],
    });
    const result = mapUsdaBarcodeProduct(usdaFood);

    expect(result.default_variant.protein).toBe(0);
    expect(result.default_variant.carbs).toBe(0);
    expect(result.default_variant.fat).toBe(0);
    expect(result.default_variant.sodium).toBe(0);
    expect(result.default_variant.cholesterol).toBe(0);
    expect(result.default_variant.calcium).toBe(0);
    expect(result.default_variant.iron).toBe(0);
  });

  it("should round calories to integer and macros to one decimal", () => {
    const usdaFood = makeUsdaFood({
      servingSize: 100,
      foodNutrients: [
        { nutrientId: 1008, value: 538.6 },
        { nutrientId: 1003, value: 6.349 },
        { nutrientId: 1004, value: 6.351 },
        { nutrientId: 1005, value: 10.05 },
        { nutrientId: 1093, value: 41.7 },
      ],
    });
    const result = mapUsdaBarcodeProduct(usdaFood);

    expect(result.default_variant.calories).toBe(539);
    expect(result.default_variant.protein).toBe(6.3);
    expect(result.default_variant.fat).toBe(6.4);
    expect(result.default_variant.carbs).toBe(10.1);
    expect(result.default_variant.sodium).toBe(42);
  });

  it("should use brandOwner when brandName is missing", () => {
    const usdaFood = makeUsdaFood({ brandName: undefined });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.brand).toBe("Ferrero");
  });

  it("should default brand to empty string when both are missing", () => {
    const usdaFood = makeUsdaFood({
      brandName: undefined,
      brandOwner: undefined,
    });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.brand).toBe("");
  });

  it("should handle missing foodNutrients array", () => {
    const usdaFood = makeUsdaFood({ foodNutrients: undefined });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.default_variant.calories).toBe(0);
    expect(result.default_variant.protein).toBe(0);
  });

  it("should convert fdcId to string for provider_external_id", () => {
    const usdaFood = makeUsdaFood({ fdcId: 9999999 });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.provider_external_id).toBe("9999999");
  });

  it("should fall back to 100g when servingSize is missing", () => {
    const usdaFood = makeUsdaFood({ servingSize: undefined });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.default_variant.serving_size).toBe(100);
  });

  it("should fall back to 100g when servingSize is 0", () => {
    const usdaFood = makeUsdaFood({ servingSize: 0 });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.default_variant.serving_size).toBe(100);
  });

  it("should scale nutrient values to the serving size", () => {
    const usdaFood = makeUsdaFood({
      servingSize: 50,
      foodNutrients: [
        { nutrientId: 1008, value: 400 },
        { nutrientId: 1003, value: 20 },
        { nutrientId: 1004, value: 10 },
      ],
    });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.default_variant.serving_size).toBe(50);
    expect(result.default_variant.calories).toBe(200);
    expect(result.default_variant.protein).toBe(10);
    expect(result.default_variant.fat).toBe(5);
  });

  it("should use servingSizeUnit when provided", () => {
    const usdaFood = makeUsdaFood({ servingSizeUnit: "ml" });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.default_variant.serving_unit).toBe("ml");
  });

  it("should normalize non-standard servingSizeUnit values", () => {
    const usdaFood = makeUsdaFood({ servingSizeUnit: "GRM" });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.default_variant.serving_unit).toBe("g");
  });

  it("should normalize a 12-digit gtinUpc to 13 digits", () => {
    const usdaFood = makeUsdaFood({ gtinUpc: "094395000172" });
    const result = mapUsdaBarcodeProduct(usdaFood);
    expect(result.barcode).toBe("0094395000172");
    expect(result.provider_external_id).toBe("2345678");
  });
});

describe("lookupBarcode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no barcode provider preference
    preferenceService.getUserPreferences.mockResolvedValue({
      default_barcode_provider_id: null,
    });
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
    expect(searchOpenFoodFactsByBarcodeFields).not.toHaveBeenCalled();
  });

  it("should fall back to OpenFoodFacts when not found locally", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue(makeOffResponse());

    const result = await lookupBarcode("3017620422003", TEST_USER_ID);

    expect(result.source).toBe("openfoodfacts");
    expect(result.food.name).toBe("Nutella");
    expect(result.food.brand).toBe("Ferrero");
    expect(result.food.barcode).toBe("3017620422003");
    expect(result.food.provider_type).toBe("openfoodfacts");
    expect(result.food.default_variant.calories).toBe(199);
  });

  it("should return not_found when OFF returns status 0", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue({ status: 0 });

    const result = await lookupBarcode("0000000000000", TEST_USER_ID);

    expect(result).toEqual({ source: "not_found", food: null });
  });

  it("should return not_found when OFF product has no product_name", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue({
      status: 1,
      product: {
        code: "111",
        nutriments: { "energy-kcal_100g": 100 },
      },
    });

    const result = await lookupBarcode("11111111", TEST_USER_ID);

    expect(result).toEqual({ source: "not_found", food: null });
  });

  it("should accept OFF product with missing nutrient fields and default them to 0", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue({
      status: 1,
      product: {
        product_name: "Missing Calories",
        code: "222",
        nutriments: { proteins_100g: 5 },
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
    searchOpenFoodFactsByBarcodeFields.mockRejectedValue(
      new Error("Network timeout"),
    );

    const result = await lookupBarcode("99999999", TEST_USER_ID);

    expect(result).toEqual({ source: "not_found", food: null });
  });

  it("should propagate errors from the local DB lookup", async () => {
    foodRepository.findFoodByBarcode.mockRejectedValue(
      new Error("Database error"),
    );

    await expect(lookupBarcode("012345678901", TEST_USER_ID)).rejects.toThrow(
      "Database error",
    );

    expect(searchOpenFoodFactsByBarcodeFields).not.toHaveBeenCalled();
  });

  it("should treat whitespace-only product_name as valid (truthy string)", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue({
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
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue({
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

  // --- USDA provider path tests ---

  it("should return USDA result when providerId is given and USDA matches", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    searchUsdaFoodsByBarcode.mockResolvedValue({
      foods: [makeUsdaFood()],
    });

    const result = await lookupBarcode(
      "3017620422003",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("usda");
    expect(result.food.name).toBe("CHOCOLATE HAZELNUT SPREAD");
    expect(result.food.provider_type).toBe("usda");
    expect(searchOpenFoodFactsByBarcodeFields).not.toHaveBeenCalled();
  });

  it("should cascade to OFF when USDA returns no matching barcode", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    searchUsdaFoodsByBarcode.mockResolvedValue({
      foods: [makeUsdaFood({ gtinUpc: "9999999999999" })],
    });
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue(makeOffResponse());

    const result = await lookupBarcode(
      "3017620422003",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("openfoodfacts");
    expect(result.food.name).toBe("Nutella");
  });

  it("should cascade to OFF when USDA throws an error", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    searchUsdaFoodsByBarcode.mockRejectedValue(new Error("USDA API error"));
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue(makeOffResponse());

    const result = await lookupBarcode(
      "3017620422003",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("openfoodfacts");
  });

  it("should cascade to OFF when provider resolution throws (Forbidden)", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockRejectedValue(
      new Error("Forbidden: You do not have permission"),
    );
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue(makeOffResponse());

    const result = await lookupBarcode(
      "3017620422003",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("openfoodfacts");
    expect(searchUsdaFoodsByBarcode).not.toHaveBeenCalled();
  });

  it("should use default_barcode_provider_id from preferences when no providerId given", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    preferenceService.getUserPreferences.mockResolvedValue({
      default_barcode_provider_id: TEST_PROVIDER_ID,
    });
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    searchUsdaFoodsByBarcode.mockResolvedValue({
      foods: [makeUsdaFood()],
    });

    const result = await lookupBarcode("3017620422003", TEST_USER_ID);

    expect(result.source).toBe("usda");
    expect(
      externalProviderService.getExternalDataProviderDetails,
    ).toHaveBeenCalledWith(TEST_USER_ID, TEST_PROVIDER_ID);
  });

  it("should skip USDA when provider is inactive", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider({ is_active: false }),
    );
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue(makeOffResponse());

    const result = await lookupBarcode(
      "3017620422003",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("openfoodfacts");
    expect(searchUsdaFoodsByBarcode).not.toHaveBeenCalled();
  });

  it("should use OFF when no provider is configured (existing behavior)", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    searchOpenFoodFactsByBarcodeFields.mockResolvedValue(makeOffResponse());

    const result = await lookupBarcode("3017620422003", TEST_USER_ID);

    expect(result.source).toBe("openfoodfacts");
    expect(searchUsdaFoodsByBarcode).not.toHaveBeenCalled();
    expect(
      externalProviderService.getExternalDataProviderDetails,
    ).not.toHaveBeenCalled();
  });

  it("should filter USDA results by exact barcode match", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    // USDA returns multiple foods, only one matches the barcode
    searchUsdaFoodsByBarcode.mockResolvedValue({
      foods: [
        makeUsdaFood({
          gtinUpc: "0000000000000",
          description: "Wrong Product",
        }),
        makeUsdaFood({
          gtinUpc: "3017620422003",
          description: "Correct Product",
        }),
      ],
    });

    const result = await lookupBarcode(
      "3017620422003",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("usda");
    expect(result.food.name).toBe("Correct Product");
  });

  it("should match USDA result when request barcode is 12-digit UPC and USDA returns 12-digit gtinUpc", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    searchUsdaFoodsByBarcode.mockResolvedValue({
      foods: [
        makeUsdaFood({ gtinUpc: "094395000172", description: "Test Product" }),
      ],
    });

    const result = await lookupBarcode(
      "094395000172",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("usda");
    expect(result.food.name).toBe("Test Product");
    // Stored barcode should be normalized to 13-digit EAN-13
    expect(result.food.barcode).toBe("0094395000172");
  });

  it("should retry USDA with 12-digit UPC when 13-digit EAN search finds no match", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    // First call with "0094395000172" returns no matching barcode,
    // second call with "094395000172" returns the product
    searchUsdaFoodsByBarcode
      .mockResolvedValueOnce({ foods: [] })
      .mockResolvedValueOnce({
        foods: [
          makeUsdaFood({
            gtinUpc: "094395000172",
            description: "Cross Format Match",
          }),
        ],
      });

    const result = await lookupBarcode(
      "0094395000172",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("usda");
    expect(result.food.name).toBe("Cross Format Match");
    expect(result.food.barcode).toBe("0094395000172");
    expect(searchUsdaFoodsByBarcode).toHaveBeenCalledTimes(2);
    expect(searchUsdaFoodsByBarcode).toHaveBeenNthCalledWith(
      1,
      "0094395000172",
      "test-usda-api-key",
    );
    expect(searchUsdaFoodsByBarcode).toHaveBeenNthCalledWith(
      2,
      "094395000172",
      "test-usda-api-key",
    );
  });

  it("should not retry USDA when 13-digit EAN search finds a match on first try", async () => {
    foodRepository.findFoodByBarcode.mockResolvedValue(null);
    externalProviderService.getExternalDataProviderDetails.mockResolvedValue(
      makeUsdaProvider(),
    );
    searchUsdaFoodsByBarcode.mockResolvedValue({
      foods: [
        makeUsdaFood({ gtinUpc: "0094395000172", description: "Direct Match" }),
      ],
    });

    const result = await lookupBarcode(
      "0094395000172",
      TEST_USER_ID,
      TEST_PROVIDER_ID,
    );

    expect(result.source).toBe("usda");
    expect(result.food.name).toBe("Direct Match");
    expect(searchUsdaFoodsByBarcode).toHaveBeenCalledTimes(1);
  });
});
