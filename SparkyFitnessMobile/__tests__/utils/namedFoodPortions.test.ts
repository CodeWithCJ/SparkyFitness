import {
  saveNamedFoodPortions,
  isCalculatedFoodPortion,
} from '../../src/utils/namedFoodPortions';
import {
  createFoodVariant,
  fetchFoodVariants,
  updateFoodVariant,
  deleteFoodVariant,
} from '../../src/services/api/foodsApi';
import type { FoodVariantDetail } from '../../src/types/foods';

jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(),
  fetchFoodVariants: jest.fn(),
  updateFoodVariant: jest.fn(),
  deleteFoodVariant: jest.fn(),
}));

let stored: FoodVariantDetail[];
let failBottle = false;
const source = {
  serving_size: 100,
  serving_unit: 'g',
  calories: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  water_ml: 40,
  custom_nutrients: { iodine: 2 },
};

describe('saving named food portions', () => {
  it('identifies derived portions while preserving independently customized saved nutrition', () => {
    const derived = {
      ...source,
      serving_size: 1,
      serving_unit: 'packet (150 g)',
      calories: 300,
      protein: 15,
      carbs: 30,
      fat: 7.5,
      water_ml: 60,
      custom_nutrients: { iodine: 3 },
    };
    expect(isCalculatedFoodPortion(source, derived)).toBe(true);
    expect(isCalculatedFoodPortion(source, { ...derived, calories: 380 })).toBe(
      false
    );
  });
  beforeEach(() => {
    jest.clearAllMocks();
    failBottle = false;
    stored = [{ ...source, id: 'grams', food_id: 'food-1' }];
    jest
      .mocked(fetchFoodVariants)
      .mockImplementation(async () => stored.map((row) => ({ ...row })));
    jest.mocked(createFoodVariant).mockImplementation(async (payload) => {
      if (failBottle && payload.serving_unit.startsWith('bottle'))
        throw new Error('offline');
      const row = { ...payload, id: `variant-${stored.length}` };
      stored.push(row);
      return row;
    });
    jest.mocked(updateFoodVariant).mockImplementation(async (id, payload) => {
      const row = { ...payload, id };
      stored = stored.map((previous) => (previous.id === id ? row : previous));
      return row;
    });
    jest.mocked(deleteFoodVariant).mockImplementation(async (id) => {
      stored = stored.filter((row) => row.id !== id);
      return {};
    });
  });

  it('keeps grams and calculates every portion on the same food from the latest nutrition', async () => {
    await saveNamedFoodPortions('food-1', source, [
      { name: 'packet', amount: 150, unit: 'g' },
    ]);
    expect(stored).toHaveLength(2);
    expect(stored[0]).toMatchObject({
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
    });
    expect(stored[1]).toMatchObject({
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'packet (150 g)',
      calories: 300,
      water_ml: 60,
      custom_nutrients: { iodine: 3 },
    });
    await saveNamedFoodPortions('food-1', { ...source, calories: 240 }, [
      { name: 'packet', amount: 150, unit: 'g' },
    ]);
    expect(stored).toHaveLength(2);
    expect(stored[1].calories).toBe(360);
  });

  it('retries a partial save without duplicating a portion that already succeeded', async () => {
    const portions = [
      { name: 'packet', amount: 150, unit: 'g' as const },
      { name: 'bottle', amount: 500, unit: 'g' as const },
    ];
    failBottle = true;
    await expect(
      saveNamedFoodPortions('food-1', source, portions)
    ).rejects.toThrow('offline');
    expect(stored).toHaveLength(2);
    failBottle = false;
    await saveNamedFoodPortions('food-1', source, portions);
    expect(stored).toHaveLength(3);
    expect(
      stored.filter((row) => row.serving_unit === 'packet (150 g)')
    ).toHaveLength(1);
  });

  it('removes only explicitly removed named portions and confirms the resulting rows', async () => {
    stored.push({
      ...source,
      serving_size: 1,
      serving_unit: 'packet (150 g)',
      id: 'packet',
      food_id: 'food-1',
    });
    const rows = await saveNamedFoodPortions('food-1', source, [], ['packet']);
    expect(rows.map((row) => row.id)).toEqual(['grams']);
  });

  it('leaves custom saved portion nutrition and metadata unchanged', async () => {
    const custom = {
      ...source,
      id: 'custom',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'slice (150 g)',
      calories: 380,
      source: 'imported' as const,
      glycemic_index: 'low',
    };
    stored.push(custom);
    await saveNamedFoodPortions('food-1', { ...source, calories: 240 }, [
      {
        id: 'custom',
        name: 'slice',
        amount: 150,
        unit: 'g',
        preserveNutrition: true,
      },
    ]);
    expect(stored[1]).toEqual(custom);
  });
});
