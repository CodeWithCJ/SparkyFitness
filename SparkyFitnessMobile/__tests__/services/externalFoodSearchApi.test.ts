import {
  transformOpenFoodFactsProduct,
  searchOpenFoodFacts,
  transformUsdaFoodItem,
  searchUsda,
  parseFatSecretDescription,
  transformFatSecretSearchItem,
  selectFatSecretServing,
  searchFatSecret,
  fetchFatSecretNutrients,
} from '../../src/services/api/externalFoodSearchApi';
import { getActiveServerConfig, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('externalFoodSearchApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('transformOpenFoodFactsProduct', () => {
    test('transforms a complete product', () => {
      const product = {
        product_name: 'Peanut Butter',
        brands: 'Jif',
        code: '12345',
        nutriments: {
          'energy-kcal_100g': 588.5,
          proteins_100g: 25.1,
          carbohydrates_100g: 19.8,
          fat_100g: 50.3,
          'saturated-fat_100g': 10.2,
          sodium_100g: 0.43,
          fiber_100g: 6.1,
          sugars_100g: 9.7,
        },
      };

      const result = transformOpenFoodFactsProduct(product);

      expect(result).toEqual({
        id: '12345',
        name: 'Peanut Butter',
        brand: 'Jif',
        calories: 589,
        protein: 25,
        carbs: 20,
        fat: 50,
        saturated_fat: 10,
        sodium: 430,
        fiber: 6,
        sugars: 10,
        serving_size: 100,
        serving_unit: 'g',
        source: 'openfoodfacts',
      });
    });

    test('handles missing optional fields', () => {
      const product = {
        product_name: 'Mystery Food',
        code: '99999',
        nutriments: {},
      };

      const result = transformOpenFoodFactsProduct(product);

      expect(result).toEqual({
        id: '99999',
        name: 'Mystery Food',
        brand: null,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        saturated_fat: 0,
        sodium: 0,
        fiber: 0,
        sugars: 0,
        serving_size: 100,
        serving_unit: 'g',
        source: 'openfoodfacts',
      });
    });

    test('rounds nutriment values', () => {
      const product = {
        product_name: 'Test',
        code: '1',
        nutriments: {
          'energy-kcal_100g': 123.456,
          proteins_100g: 7.89,
          carbohydrates_100g: 45.123,
          fat_100g: 2.999,
        },
      };

      const result = transformOpenFoodFactsProduct(product);

      expect(result.calories).toBe(123);
      expect(result.protein).toBe(8);
      expect(result.carbs).toBe(45);
      expect(result.fat).toBe(3);
    });
  });

  describe('searchOpenFoodFacts', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key',
    };

    test('calls correct endpoint with query', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 0,
            page: 1,
            page_count: 0,
            page_size: 20,
            products: [],
            skip: 0,
          }),
      });

      await searchOpenFoodFacts('peanut butter');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/foods/openfoodfacts/search?query=peanut+butter'),
        expect.anything(),
      );
    });

    test('unwraps response and transforms products', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 1,
            page: 1,
            page_count: 1,
            page_size: 20,
            products: [
              {
                product_name: 'Banana',
                brands: 'Chiquita',
                code: 'abc',
                nutriments: { 'energy-kcal_100g': 89 },
              },
            ],
            skip: 0,
          }),
      });

      const results = await searchOpenFoodFacts('banana');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Banana');
      expect(results[0].brand).toBe('Chiquita');
      expect(results[0].calories).toBe(89);
      expect(results[0].source).toBe('openfoodfacts');
    });

    test('filters out products with falsy product_name', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            count: 3,
            page: 1,
            page_count: 1,
            page_size: 20,
            products: [
              { product_name: 'Good Food', code: '1', nutriments: {} },
              { product_name: '', code: '2', nutriments: {} },
              { product_name: 'Also Good', code: '3', nutriments: {} },
            ],
            skip: 0,
          }),
      });

      const results = await searchOpenFoodFacts('food');

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Good Food');
      expect(results[1].name).toBe('Also Good');
    });

    test('propagates errors', async () => {
      mockGetActiveServerConfig.mockResolvedValue(testConfig);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(searchOpenFoodFacts('test')).rejects.toThrow('Server error: 500');
    });
  });

  describe('USDA', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key',
    };

    describe('transformUsdaFoodItem', () => {
      test('transforms a complete item', () => {
        const item = {
          fdcId: 12345,
          description: 'Blueberries, raw',
          brandOwner: 'Nature Brand',
          foodNutrients: [
            { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 57.2 },
            { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 0.74 },
            { nutrientId: 1004, nutrientName: 'Total lipid (fat)', unitName: 'G', value: 0.33 },
            { nutrientId: 1005, nutrientName: 'Carbohydrate', unitName: 'G', value: 14.49 },
            { nutrientId: 2000, nutrientName: 'Sugars', unitName: 'G', value: 9.96 },
            { nutrientId: 1093, nutrientName: 'Sodium', unitName: 'MG', value: 1.0 },
            { nutrientId: 1079, nutrientName: 'Fiber', unitName: 'G', value: 2.4 },
            { nutrientId: 1258, nutrientName: 'Saturated fatty acids', unitName: 'G', value: 0.028 },
          ],
        };

        const result = transformUsdaFoodItem(item);

        expect(result).toEqual({
          id: '12345',
          name: 'Blueberries, raw',
          brand: 'Nature Brand',
          calories: 57,
          protein: 1,
          carbs: 14,
          fat: 0,
          saturated_fat: 0,
          sodium: 1,
          fiber: 2,
          sugars: 10,
          serving_size: 100,
          serving_unit: 'g',
          source: 'usda',
        });
      });

      test('defaults missing nutrients to 0', () => {
        const item = {
          fdcId: 99999,
          description: 'Mystery Food',
          foodNutrients: [],
        };

        const result = transformUsdaFoodItem(item);

        expect(result.calories).toBe(0);
        expect(result.protein).toBe(0);
        expect(result.carbs).toBe(0);
        expect(result.fat).toBe(0);
        expect(result.brand).toBeNull();
      });

      test('rounds nutrient values', () => {
        const item = {
          fdcId: 1,
          description: 'Test',
          foodNutrients: [
            { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 123.456 },
            { nutrientId: 1003, nutrientName: 'Protein', unitName: 'G', value: 7.89 },
          ],
        };

        const result = transformUsdaFoodItem(item);

        expect(result.calories).toBe(123);
        expect(result.protein).toBe(8);
      });

      test('converts fdcId to string', () => {
        const item = {
          fdcId: 42,
          description: 'Test',
          foodNutrients: [],
        };

        expect(transformUsdaFoodItem(item).id).toBe('42');
      });
    });

    describe('searchUsda', () => {
      test('calls correct endpoint with x-provider-id header', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ foods: [] }),
        });

        await searchUsda('blueberry', 'provider-abc');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/foods/usda/search?query=blueberry'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'x-provider-id': 'provider-abc',
            }),
          }),
        );
      });

      test('transforms response items', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              foods: [
                {
                  fdcId: 100,
                  description: 'Banana, raw',
                  brandOwner: 'Fresh Farms',
                  foodNutrients: [
                    { nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 89 },
                  ],
                },
              ],
            }),
        });

        const results = await searchUsda('banana', 'provider-1');

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Banana, raw');
        expect(results[0].brand).toBe('Fresh Farms');
        expect(results[0].calories).toBe(89);
        expect(results[0].source).toBe('usda');
      });

      test('filters out items with empty description', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              foods: [
                { fdcId: 1, description: 'Good Food', foodNutrients: [] },
                { fdcId: 2, description: '', foodNutrients: [] },
                { fdcId: 3, description: 'Also Good', foodNutrients: [] },
              ],
            }),
        });

        const results = await searchUsda('food', 'provider-1');

        expect(results).toHaveLength(2);
        expect(results[0].name).toBe('Good Food');
        expect(results[1].name).toBe('Also Good');
      });

      test('propagates errors', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });

        await expect(searchUsda('test', 'provider-1')).rejects.toThrow('Server error: 500');
      });
    });
  });

  describe('FatSecret', () => {
    const testConfig: ServerConfig = {
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'test-api-key',
    };

    describe('parseFatSecretDescription', () => {
      test('parses a standard description string', () => {
        const result = parseFatSecretDescription(
          'Per 246g - Calories: 627kcal | Fat: 24.67g | Carbs: 101.62g | Protein: 4.53g',
        );

        expect(result).toEqual({
          calories: 627,
          fat: 25,
          carbs: 102,
          protein: 5,
          servingSize: 246,
          servingUnit: 'g',
        });
      });

      test('parses small values', () => {
        const result = parseFatSecretDescription(
          'Per 10g - Calories: 5kcal | Fat: 0.1g | Carbs: 0.9g | Protein: 0.2g',
        );

        expect(result.calories).toBe(5);
        expect(result.fat).toBe(0);
        expect(result.carbs).toBe(1);
        expect(result.protein).toBe(0);
        expect(result.servingSize).toBe(10);
      });

      test('returns defaults for unparseable input', () => {
        const result = parseFatSecretDescription('No useful info here');

        expect(result).toEqual({
          calories: 0,
          fat: 0,
          carbs: 0,
          protein: 0,
          servingSize: 100,
          servingUnit: 'g',
        });
      });

      test('handles missing fields with partial match', () => {
        const result = parseFatSecretDescription('Per 50g - Calories: 100kcal | Fat: 5g');

        expect(result.calories).toBe(100);
        expect(result.fat).toBe(5);
        expect(result.carbs).toBe(0);
        expect(result.protein).toBe(0);
        expect(result.servingSize).toBe(50);
      });

      test('handles non-gram units', () => {
        const result = parseFatSecretDescription(
          'Per 250ml - Calories: 120kcal | Fat: 3g | Carbs: 20g | Protein: 5g',
        );

        expect(result.servingSize).toBe(250);
        expect(result.servingUnit).toBe('ml');
      });
    });

    describe('transformFatSecretSearchItem', () => {
      test('maps search item correctly', () => {
        const item = {
          food_id: '12345',
          food_name: 'Fried Rice',
          food_description: 'Per 246g - Calories: 627kcal | Fat: 24.67g | Carbs: 101.62g | Protein: 4.53g',
        };

        const result = transformFatSecretSearchItem(item);

        expect(result.id).toBe('12345');
        expect(result.name).toBe('Fried Rice');
        expect(result.brand).toBeNull();
        expect(result.source).toBe('fatsecret');
        expect(result.calories).toBe(627);
        expect(result.serving_size).toBe(246);
        expect(result.serving_unit).toBe('g');
      });
    });

    describe('selectFatSecretServing', () => {
      test('prefers serving with "serving" in measurement_description', () => {
        const servings = [
          { serving_id: '1', serving_description: '100g', measurement_description: '100 g', calories: '100', protein: '5', carbohydrate: '10', fat: '3' },
          { serving_id: '2', serving_description: '1 serving (200g)', measurement_description: '1 serving', calories: '200', protein: '10', carbohydrate: '20', fat: '6' },
        ];

        const result = selectFatSecretServing(servings as any);
        expect(result.serving_id).toBe('2');
      });

      test('falls back to first serving when no "serving" match', () => {
        const servings = [
          { serving_id: '1', serving_description: '100g', measurement_description: '100 g', calories: '100', protein: '5', carbohydrate: '10', fat: '3' },
          { serving_id: '2', serving_description: '1 cup', measurement_description: 'cup', calories: '250', protein: '12', carbohydrate: '25', fat: '8' },
        ];

        const result = selectFatSecretServing(servings as any);
        expect(result.serving_id).toBe('1');
      });
    });

    describe('searchFatSecret', () => {
      test('calls correct endpoint with x-provider-id header', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ foods: { food: [] } }),
        });

        await searchFatSecret('rice', 'provider-fs');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/foods/fatsecret/search?query=rice'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'x-provider-id': 'provider-fs',
            }),
          }),
        );
      });

      test('transforms and filters response', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              foods: {
                food: [
                  {
                    food_id: '1',
                    food_name: 'Fried Rice',
                    food_description: 'Per 246g - Calories: 627kcal | Fat: 24.67g | Carbs: 101.62g | Protein: 4.53g',
                  },
                  {
                    food_id: '2',
                    food_name: '',
                    food_description: 'Per 100g - Calories: 100kcal',
                  },
                ],
              },
            }),
        });

        const results = await searchFatSecret('rice', 'provider-fs');

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Fried Rice');
        expect(results[0].source).toBe('fatsecret');
        expect(results[0].calories).toBe(627);
      });

      test('handles single food object (not array)', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              foods: {
                food: {
                  food_id: '1',
                  food_name: 'Solo Result',
                  food_description: 'Per 100g - Calories: 200kcal | Fat: 10g | Carbs: 20g | Protein: 15g',
                },
              },
            }),
        });

        const results = await searchFatSecret('solo', 'provider-fs');

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('Solo Result');
      });

      test('returns empty array when foods.food is missing (no matches)', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ foods: {} }),
        });

        const results = await searchFatSecret('nonexistent', 'provider-fs');

        expect(results).toEqual([]);
      });

      test('returns empty array when foods is missing', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({}),
        });

        const results = await searchFatSecret('nonexistent', 'provider-fs');

        expect(results).toEqual([]);
      });
    });

    describe('fetchFatSecretNutrients', () => {
      test('selects preferred serving and rounds string values', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              food: {
                food_id: '42',
                food_name: 'Pasta',
                servings: {
                  serving: [
                    {
                      serving_id: '1',
                      serving_description: '100g',
                      measurement_description: '100 g',
                      metric_serving_amount: '100.00',
                      metric_serving_unit: 'g',
                      calories: '157.50',
                      protein: '5.76',
                      carbohydrate: '30.86',
                      fat: '0.93',
                      saturated_fat: '0.18',
                      sodium: '1.00',
                      fiber: '1.80',
                      sugar: '0.56',
                    },
                    {
                      serving_id: '2',
                      serving_description: '1 serving (140g)',
                      measurement_description: '1 serving',
                      metric_serving_amount: '140.00',
                      metric_serving_unit: 'g',
                      calories: '220.50',
                      protein: '8.06',
                      carbohydrate: '43.20',
                      fat: '1.30',
                      saturated_fat: '0.25',
                      sodium: '1.40',
                      fiber: '2.52',
                      sugar: '0.78',
                    },
                  ],
                },
              },
            }),
        });

        const result = await fetchFatSecretNutrients('42', 'provider-fs');

        expect(result.id).toBe('42');
        expect(result.name).toBe('Pasta');
        expect(result.calories).toBe(221);
        expect(result.protein).toBe(8);
        expect(result.carbs).toBe(43);
        expect(result.fat).toBe(1);
        expect(result.saturated_fat).toBe(0);
        expect(result.sodium).toBe(1);
        expect(result.fiber).toBe(3);
        expect(result.sugars).toBe(1);
        expect(result.serving_size).toBe(140);
        expect(result.serving_unit).toBe('g');
        expect(result.source).toBe('fatsecret');
        expect(result.brand).toBeNull();
      });

      test('handles single serving (not array)', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              food: {
                food_id: '99',
                food_name: 'Simple Food',
                servings: {
                  serving: {
                    serving_id: '1',
                    serving_description: '1 serving',
                    measurement_description: 'serving',
                    metric_serving_amount: '200.00',
                    metric_serving_unit: 'g',
                    calories: '300',
                    protein: '10',
                    carbohydrate: '40',
                    fat: '12',
                  },
                },
              },
            }),
        });

        const result = await fetchFatSecretNutrients('99', 'provider-fs');

        expect(result.id).toBe('99');
        expect(result.calories).toBe(300);
        expect(result.serving_size).toBe(200);
        expect(result.saturated_fat).toBe(0);
        expect(result.sodium).toBe(0);
      });

      test('sodium is not multiplied (already in mg)', async () => {
        mockGetActiveServerConfig.mockResolvedValue(testConfig);
        mockFetch.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              food: {
                food_id: '55',
                food_name: 'Salty Snack',
                servings: {
                  serving: {
                    serving_id: '1',
                    serving_description: '1 serving',
                    measurement_description: 'serving',
                    metric_serving_amount: '30.00',
                    metric_serving_unit: 'g',
                    calories: '150',
                    protein: '2',
                    carbohydrate: '18',
                    fat: '8',
                    sodium: '480',
                  },
                },
              },
            }),
        });

        const result = await fetchFatSecretNutrients('55', 'provider-fs');

        expect(result.sodium).toBe(480);
      });
    });
  });
});
