import { vi, beforeEach, describe, expect, it } from 'vitest';
import TandoorService from '../integrations/tandoor/tandoorService.js';
vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));
describe('TandoorService.mapTandoorRecipeToSparkyFood', () => {
  const service = new TandoorService(
    'http://tandoor.example.com',
    'fake-api-key'
  );
  const userId = 'user-123';
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should map nutrition from food_properties (Spanish screenshot example)', () => {
    const mockRecipe = {
      id: 2,
      name: 'Pollo con salsa de mostaza y champiñones',
      nutrition: null,
      properties: [],
      food_properties: {
        1: {
          id: 1,
          name: 'Proteínas',
          open_data_slug: 'property-proteins',
          total_value: 237.57,
        },
        2: {
          id: 2,
          name: 'Grasas',
          open_data_slug: 'property-fats',
          total_value: 69.838,
        },
        3: {
          id: 3,
          name: 'Carbohidratos',
          open_data_slug: 'property-carbohydrates',
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
  it('should map nutrition from nutrition object (explicit structured data)', () => {
    const mockRecipe = {
      id: 5,
      name: 'Healthy Salad',
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
  it('should map nutrition from nutrition array', () => {
    const mockRecipe = {
      id: 6,
      name: 'Protein Shake',
      nutrition: [
        { name: 'Protein', value: 40 },
        { name: 'Kcal', value: 300 },
      ],
      food_properties: {},
      properties: [],
    };
    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);
    expect(result.variant.protein).toBe(40);
    expect(result.variant.calories).toBe(300);
  });
  it('should respect priority: nutrition > food_properties > properties', () => {
    const mockRecipe = {
      id: 10,
      name: 'Priority Test',
      nutrition: { proteins: 10 },
      food_properties: {
        1: {
          name: 'Proteínas',
          open_data_slug: 'property-proteins',
          total_value: 20,
        },
      },
      properties: [{ property_type: { name: 'Protein' }, property_amount: 30 }],
    };
    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);
    expect(result.variant.protein).toBe(10); // nutrition takes precedence
  });
  it('should fallback to food_properties if nutrition is missing', () => {
    const mockRecipe = {
      id: 11,
      name: 'Fallback Test',
      nutrition: null,
      food_properties: {
        1: {
          name: 'Proteínas',
          open_data_slug: 'property-proteins',
          total_value: 20,
        },
      },
      properties: [{ property_type: { name: 'Protein' }, property_amount: 30 }],
    };
    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);
    expect(result.variant.protein).toBe(20); // food_properties takes precedence over properties
  });
  it('should match open_data_slug even if name is localized', () => {
    const mockRecipe = {
      id: 12,
      name: 'Slug Test',
      food_properties: {
        1: {
          name: 'Whatever',
          open_data_slug: 'property-carbohydrates',
          total_value: 50,
        },
      },
    };
    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);
    expect(result.variant.carbs).toBe(50);
  });
  it('should ignore 0 values in food_properties and fallback to non-zero values in properties', () => {
    const mockRecipe = {
      id: 14,
      name: 'Chicken Pasta (0-value fallback test)',
      food_properties: {
        1: { name: 'Calories', total_value: 0 },
        2: { name: 'Proteins', total_value: 0 },
      },
      properties: [
        { property_type: { name: 'Calories' }, property_amount: 482 },
        { property_type: { name: 'Proteins' }, property_amount: 34 },
      ],
    };
    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);
    expect(result.variant.calories).toBe(482);
    expect(result.variant.protein).toBe(34);
  });
  it("should not match 'ca' as 'calories' (partial slug bug fix)", () => {
    const mockRecipe = {
      id: 15,
      name: 'Partial match test',
      properties: [
        {
          property_type: { name: 'ca', open_data_slug: 'ca' },
          property_amount: 50,
        },
      ],
    };
    const result = service.mapTandoorRecipeToSparkyFood(mockRecipe, userId);
    expect(result.variant.calories).toBe(0); // Should NOT match 'ca'
    expect(result.variant.calcium).toBe(50); // Should match 'calcium'
  });
});

describe('TandoorService.getRecipeDetails enrichment', () => {
  const service = new TandoorService(
    'http://tandoor.example.com',
    'fake-api-key'
  );

  it('should fetch property types and enrich food_properties with open_data_slug and fdc_id', async () => {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn().mockImplementation((url) => {
      if (url.toString().includes('/api/property-type/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              results: [
                {
                  id: 1,
                  name: 'Kalorien',
                  open_data_slug: 'property-calories',
                  fdc_id: 1008,
                },
                {
                  id: 2,
                  name: 'Proteine',
                  open_data_slug: 'property-proteins',
                  fdc_id: 1003,
                },
              ],
            }),
        });
      }
      if (url.toString().includes('/api/recipe/2/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 2,
              name: 'German Spinach Recipe',
              food_properties: {
                1: { id: 1, name: 'Kalorien', total_value: 309.1 },
                2: { id: 2, name: 'Proteine', total_value: 34.6 },
              },
            }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch to ${url}`));
    });

    global.fetch = fetchSpy as any;

    try {
      const details = await service.getRecipeDetails(2);
      expect(details).not.toBeNull();
      expect(details!.food_properties).toBeDefined();

      // Verify that food_properties entries have been enriched
      expect(details!.food_properties!['1'].open_data_slug).toBe(
        'property-calories'
      );
      expect(details!.food_properties!['1'].fdc_id).toBe(1008);
      expect(details!.food_properties!['2'].open_data_slug).toBe(
        'property-proteins'
      );
      expect(details!.food_properties!['2'].fdc_id).toBe(1003);

      // Verify fetch calls
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(fetchSpy.mock.calls[0][0].toString()).toContain('/api/recipe/2/');
      expect(fetchSpy.mock.calls[1][0].toString()).toContain(
        '/api/property-type/'
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
