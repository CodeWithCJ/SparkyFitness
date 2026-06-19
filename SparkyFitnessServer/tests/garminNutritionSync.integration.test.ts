import { describe, it, expect, vi, beforeEach } from 'vitest';
import foodRepository from '../models/food.js';
import foodEntryRepository from '../models/foodEntry.js';
import mealTypeRepository from '../models/mealType.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exerciseEntry.js');
vi.mock('../models/exercise.js');
vi.mock('../models/activityDetailsRepository.js');
vi.mock('../models/exercisePresetEntryRepository.js');
vi.mock('../models/workoutPresetRepository.js');
vi.mock('./measurementService.js');
vi.mock('../models/moodRepository.js');
vi.mock('../integrations/garminconnect/garminConnectService.js');
vi.mock('../integrations/garminconnect/garminMeasurementMapping.js');
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../models/sleepRepository.js');

vi.mock('../models/food.js', () => ({
  default: {
    findFoodByProviderExternalId: vi.fn(),
    updateFoodVariantNutrition: vi.fn(),
    createFood: vi.fn(),
  },
}));
vi.mock('../models/foodEntry.js', () => ({
  default: {
    createFoodEntry: vi.fn(),
    deleteStaleProviderEntries: vi.fn(),
  },
}));
vi.mock('../models/mealType.js', () => ({
  default: {
    getAllMealTypes: vi.fn(),
  },
}));

const MOCK_MEAL_TYPES = [
  { id: 'mt-breakfast', name: 'Breakfast' },
  { id: 'mt-lunch', name: 'Lunch' },
  { id: 'mt-dinner', name: 'Dinner' },
  { id: 'mt-snacks', name: 'Snacks' },
];

const sampleDay = {
  mealDate: '2024-06-15',
  mealDetails: [
    {
      meal: { mealName: 'BREAKFAST' },
      loggedFoods: [
        {
          servingQty: 1,
          foodMetaData: {
            foodId: 12345,
            foodName: 'Oatmeal',
            brandName: 'Quaker',
          },
          nutritionContent: {
            calories: 150,
            protein: 5,
            carbs: 27,
            fat: 3,
            servingUnit: 'serving',
          },
        },
        {
          servingQty: 0.5,
          foodMetaData: {
            foodId: 67890,
            foodName: 'Banana',
            brandName: null,
          },
          nutritionContent: {
            calories: 105,
            protein: 1.3,
            carbs: 27,
            fat: 0.4,
            servingUnit: 'medium',
          },
        },
      ],
    },
  ],
};

describe('processGarminNutritionData integration', () => {
  let processGarminNutritionData: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    (mealTypeRepository.getAllMealTypes as any).mockResolvedValue(
      MOCK_MEAL_TYPES
    );
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue(
      null
    );
    (foodRepository.createFood as any).mockResolvedValue({
      id: 'food-new',
      default_variant_id: 'variant-new',
    });
    (foodEntryRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-new',
    });
    (foodEntryRepository.deleteStaleProviderEntries as any).mockResolvedValue(
      0
    );

    const garminService = await import('../services/garminService.js');
    processGarminNutritionData = garminService.processGarminNutritionData;
  });

  it('creates entries with source=garmin and deterministic source_id', async () => {
    await processGarminNutritionData(
      'user-1',
      [sampleDay],
      '2024-06-15',
      '2024-06-15'
    );

    const calls = (foodEntryRepository.createFoodEntry as any).mock.calls;
    expect(calls).toHaveLength(2);

    expect(calls[0][0]).toMatchObject({
      source: 'garmin',
      source_id: '2024-06-15:breakfast:12345:0',
      food_name: 'Oatmeal',
      calories: 150,
    });
    expect(calls[1][0]).toMatchObject({
      source: 'garmin',
      source_id: '2024-06-15:breakfast:67890:1',
      food_name: 'Banana',
      calories: 105,
    });
  });

  it('produces identical source_ids on re-sync (idempotent)', async () => {
    await processGarminNutritionData(
      'user-1',
      [sampleDay],
      '2024-06-15',
      '2024-06-15'
    );
    const firstCalls = (
      foodEntryRepository.createFoodEntry as any
    ).mock.calls.map((c: any) => c[0].source_id);

    vi.clearAllMocks();
    (mealTypeRepository.getAllMealTypes as any).mockResolvedValue(
      MOCK_MEAL_TYPES
    );
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue({
      id: 'food-existing',
      default_variant_id: 'variant-existing',
    });
    (foodEntryRepository.createFoodEntry as any).mockResolvedValue({
      id: 'entry-2',
    });

    await processGarminNutritionData(
      'user-1',
      [sampleDay],
      '2024-06-15',
      '2024-06-15'
    );
    const secondCalls = (
      foodEntryRepository.createFoodEntry as any
    ).mock.calls.map((c: any) => c[0].source_id);

    expect(firstCalls).toEqual(secondCalls);
  });

  it('assigns distinct source_ids to different foods in same meal', async () => {
    const dayWithThreeFoods = {
      mealDate: '2024-06-15',
      mealDetails: [
        {
          meal: { mealName: 'LUNCH' },
          loggedFoods: [
            {
              servingQty: 1,
              foodMetaData: { foodId: 111, foodName: 'Rice', brandName: null },
              nutritionContent: { calories: 200, servingUnit: 'cup' },
            },
            {
              servingQty: 1,
              foodMetaData: {
                foodId: 222,
                foodName: 'Chicken',
                brandName: null,
              },
              nutritionContent: { calories: 250, servingUnit: 'piece' },
            },
            {
              servingQty: 1,
              foodMetaData: { foodId: 333, foodName: 'Salad', brandName: null },
              nutritionContent: { calories: 50, servingUnit: 'bowl' },
            },
          ],
        },
      ],
    };

    await processGarminNutritionData(
      'user-1',
      [dayWithThreeFoods],
      '2024-06-15',
      '2024-06-15'
    );

    const sourceIds = (
      foodEntryRepository.createFoodEntry as any
    ).mock.calls.map((c: any) => c[0].source_id);
    expect(sourceIds).toEqual([
      '2024-06-15:lunch:111:0',
      '2024-06-15:lunch:222:1',
      '2024-06-15:lunch:333:2',
    ]);
    const unique = new Set(sourceIds);
    expect(unique.size).toBe(3);
  });

  it('reuses existing food by provider_external_id and refreshes variant', async () => {
    (foodRepository.findFoodByProviderExternalId as any).mockResolvedValue({
      id: 'food-existing',
      default_variant_id: 'variant-existing',
    });

    await processGarminNutritionData(
      'user-1',
      [sampleDay],
      '2024-06-15',
      '2024-06-15'
    );

    expect(foodRepository.createFood).not.toHaveBeenCalled();
    expect(foodRepository.updateFoodVariantNutrition).toHaveBeenCalledTimes(2);

    const entryData = (foodEntryRepository.createFoodEntry as any).mock
      .calls[0][0];
    expect(entryData.food_id).toBe('food-existing');
    expect(entryData.variant_id).toBe('variant-existing');
  });

  it('continues processing when one entry fails', async () => {
    (foodEntryRepository.createFoodEntry as any)
      .mockRejectedValueOnce(new Error('DB constraint violation'))
      .mockResolvedValueOnce({ id: 'entry-ok' });

    const result = await processGarminNutritionData(
      'user-1',
      [sampleDay],
      '2024-06-15',
      '2024-06-15'
    );

    expect(foodEntryRepository.createFoodEntry).toHaveBeenCalledTimes(2);
    expect(result.processedEntries).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DB constraint violation');
  });

  it('reconciles stale entries after successful sync', async () => {
    (foodEntryRepository.deleteStaleProviderEntries as any).mockResolvedValue(
      1
    );

    await processGarminNutritionData(
      'user-1',
      [sampleDay],
      '2024-06-15',
      '2024-06-15'
    );

    expect(foodEntryRepository.deleteStaleProviderEntries).toHaveBeenCalledWith(
      'user-1',
      'garmin',
      '2024-06-15',
      '2024-06-15',
      ['2024-06-15:breakfast:12345:0', '2024-06-15:breakfast:67890:1']
    );
  });

  it('skips reconciliation when no entries were synced (empty response)', async () => {
    const emptyDay = { mealDate: '2024-06-15', mealDetails: [] };

    await processGarminNutritionData(
      'user-1',
      [emptyDay],
      '2024-06-15',
      '2024-06-15'
    );

    expect(
      foodEntryRepository.deleteStaleProviderEntries
    ).not.toHaveBeenCalled();
  });
});
