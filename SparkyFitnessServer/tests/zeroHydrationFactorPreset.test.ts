import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import foodRepository from '../models/foodRepository.js';
import mealTypeRepository from '../models/mealType.js';

vi.mock('../models/measurementRepository.js');
vi.mock('../models/waterContainerRepository.js');
vi.mock('../models/foodRepository.js');
vi.mock('../models/mealType.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/foodMisc.js');

describe('Zero Hydration Factor Preset (#1958, #1925, #2115)', () => {
  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const entryDate = '2026-09-05';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('increments an espresso preset: logs food entry with caffeine, records 0 ml water intake, and excludes from food_ml', async () => {
    vi.mocked(mealTypeRepository.getAllMealTypes).mockResolvedValue([
      { id: 'meal-snack-uuid', name: 'Snacks' },
    ] as any);

    // 1. Container with hydration_factor = 0 (Espresso preset)
    vi.mocked(waterContainerRepository.getWaterContainerById).mockResolvedValue(
      {
        id: 50,
        user_id: mockUserId,
        name: 'Espresso',
        volume: 30,
        unit: 'ml',
        is_primary: false,
        servings_per_container: 1,
        linked_quantity: 1,
        hydration_factor: 0,
        linked_food_id: 'food-espresso-1',
        linked_variant_id: 'var-espresso-1',
        linked_meal_type_id: 'meal-snack-uuid',
        is_quick_add: true,
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    vi.mocked(foodRepository.getFoodById).mockResolvedValue({
      id: 'food-espresso-1',
      name: 'Espresso',
      default_variant: {
        id: 'var-espresso-1',
        caffeine_mg: 63,
        water_ml: 0,
        serving_size: 30,
        serving_unit: 'ml',
      },
    } as any);

    vi.mocked(foodRepository.getFoodVariantById).mockResolvedValue({
      id: 'var-espresso-1',
      caffeine_mg: 63,
      water_ml: 0,
      serving_size: 30,
      serving_unit: 'ml',
    } as any);

    vi.mocked(foodRepository.createFoodEntry).mockResolvedValue({
      id: 'food-entry-espresso-1',
    } as any);

    vi.mocked(measurementRepository.getWaterIntakeByDate).mockResolvedValue({
      water_ml: 0,
      manual_ml: 0,
      food_ml: 0,
    } as any);

    const result = await measurementService.upsertWaterIntake(
      mockUserId,
      mockUserId,
      entryDate,
      1,
      50
    );

    // Food entry was created with variant's caffeine and 0 water_ml
    expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: mockUserId,
        food_id: 'food-espresso-1',
        variant_id: 'var-espresso-1',
        caffeine_mg: 63,
      }),
      mockUserId
    );

    // Water intake log was recorded with water_ml = 0 and linked food_entry_id
    expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
      mockUserId,
      mockUserId,
      entryDate,
      0, // 0 ml credited to water
      50,
      'Espresso',
      'manual',
      null,
      'food-entry-espresso-1',
      0
    );

    // The upsert now answers with the same four-field breakdown the GET
    // returns, rather than the bare ledger aggregate.
    expect(result).toEqual({
      water_ml: 0,
      manual_ml: 0,
      ledger_ml: 0,
      food_ml: 0,
    });
  });
});
