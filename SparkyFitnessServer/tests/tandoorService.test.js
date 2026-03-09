const TandoorService = require("../integrations/tandoor/tandoorService");
const { log } = require("../config/logging");

jest.mock("../config/logging", () => ({
  log: jest.fn(),
}));

describe("TandoorService.mapTandoorRecipeToSparkyFood", () => {
  const service = new TandoorService(
    "http://tandoor.example.com",
    "fake-api-key",
  );
  const userId = "user-123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should map nutrition from food_properties (Spanish screenshot example)", () => {
    const mockRecipe = {
      id: 2,
      name: "Pollo con salsa de mostaza y champiñones",
      nutrition: null,
      properties: [],
      food_properties: {
        1: {
          id: 1,
          name: "Proteínas",
          open_data_slug: "property-proteins",
          total_value: 237.57,
        },
        2: {
          id: 2,
          name: "Grasas",
          open_data_slug: "property-fats",
          total_value: 69.838,
        },
        3: {
          id: 3,
          name: "Carbohidratos",
          open_data_slug: "property-carbohydrates",
          total_value: 86.365,
        },
      },
      servings: 4,
    };

    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);

    expect(result.food.name).toBe(mockRecipe.name);
    expect(result.variant.protein).toBe(237.57);
    expect(result.variant.fat).toBe(69.838);
    expect(result.variant.carbs).toBe(86.365);
    expect(result.variant.serving_size).toBe(1); // mapped data is per serving
  });

  it("should map nutrition from nutrition object (explicit structured data)", () => {
    const mockRecipe = {
      id: 5,
      name: "Healthy Salad",
      nutrition: {
        calories: 250,
        proteins: 15,
        fats: 10,
        carbohydrates: 30,
      },
      food_properties: {},
      properties: [],
    };

    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.calories).toBe(250);
    expect(result.variant.protein).toBe(15);
    expect(result.variant.fat).toBe(10);
    expect(result.variant.carbs).toBe(30);
  });

  it("should map nutrition from nutrition array", () => {
    const mockRecipe = {
      id: 6,
      name: "Protein Shake",
      nutrition: [
        { name: "Protein", value: 40 },
        { name: "Kcal", value: 300 },
      ],
      food_properties: {},
      properties: [],
    };

    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.protein).toBe(40);
    expect(result.variant.calories).toBe(300);
  });

  it("should respect priority: nutrition > food_properties > properties", () => {
    const mockRecipe = {
      id: 10,
      name: "Priority Test",
      nutrition: { proteins: 10 },
      food_properties: {
        1: {
          name: "Proteínas",
          open_data_slug: "property-proteins",
          total_value: 20,
        },
      },
      properties: [{ property_type: { name: "Protein" }, property_amount: 30 }],
    };

    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.protein).toBe(10); // nutrition takes precedence
  });

  it("should fallback to food_properties if nutrition is missing", () => {
    const mockRecipe = {
      id: 11,
      name: "Fallback Test",
      nutrition: null,
      food_properties: {
        1: {
          name: "Proteínas",
          open_data_slug: "property-proteins",
          total_value: 20,
        },
      },
      properties: [{ property_type: { name: "Protein" }, property_amount: 30 }],
    };

    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.protein).toBe(20); // food_properties takes precedence over properties
  });

  it("should match open_data_slug even if name is localized", () => {
    const mockRecipe = {
      id: 12,
      name: "Slug Test",
      food_properties: {
        1: {
          name: "Whatever",
          open_data_slug: "property-carbohydrates",
          total_value: 50,
        },
      },
    };

    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.carbs).toBe(50);
  });

  it("should handle empty or missing nutrition data", () => {
    const mockRecipe = {
      id: 13,
      name: "Empty Test",
      nutrition: null,
      food_properties: null,
      properties: null,
    };

    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);

    expect(result.variant.calories).toBe(0);
    expect(result.variant.protein).toBe(0);
  });
});
