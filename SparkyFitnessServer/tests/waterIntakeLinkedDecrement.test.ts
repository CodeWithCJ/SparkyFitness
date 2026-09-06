import { vi, beforeEach, describe, expect, it } from 'vitest';
import measurementService from '../services/measurementService.js';
import measurementRepository from '../models/measurementRepository.js';
import waterContainerRepository from '../models/waterContainerRepository.js';
import foodRepository from '../models/foodRepository.js';

vi.mock('../models/measurementRepository');
vi.mock('../models/waterContainerRepository');
vi.mock('../models/foodRepository');

describe('Linked Water Container Increment/Decrement (#2115)', () => {
  const mockUserId = 'test-user-123';
  const entryDate = '2026-09-05';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // #2115: the diary entry used to be hardcoded to `quantity: 1`, so there was
  // no way to say "my mug is two servings", and a volume typed on a linked
  // container was silently discarded whenever the food had water of its own.
  describe('upsertWaterIntake - linked quantity and volume override', () => {
    const linkedFood = {
      id: 'food-uuid-1',
      name: 'Brewed Coffee',
      default_variant: { id: 'var-uuid-1' },
    };
    const linkedVariant = {
      id: 'var-uuid-1',
      calories: 5,
      caffeine_mg: 60,
      serving_size: 1,
      serving_unit: 'cup',
      water_ml: 200,
    };

    function arrangeContainer(overrides: Record<string, unknown>) {
      // @ts-expect-error TS mock
      waterContainerRepository.getWaterContainerById.mockResolvedValue({
        id: 10,
        name: 'Travel Mug',
        volume: '0.000',
        linked_quantity: 1,
        servings_per_container: 1,
        hydration_factor: 1,
        linked_food_id: 'food-uuid-1',
        linked_variant_id: 'var-uuid-1',
        linked_meal_type_id: 'meal-type-uuid-1',
        ...overrides,
      });
      // @ts-expect-error TS mock
      foodRepository.getFoodById.mockResolvedValue(linkedFood);
      // @ts-expect-error TS mock
      foodRepository.getFoodVariantById.mockResolvedValue(linkedVariant);
      // @ts-expect-error TS mock
      foodRepository.createFoodEntry.mockResolvedValue({ id: 'entry-1' });
      // @ts-expect-error TS mock
      measurementRepository.getWaterIntakeByDate.mockResolvedValue({
        water_ml: 0,
        manual_ml: 0,
        food_ml: 0,
      });
    }

    it('logs linked_quantity servings, so the nutrition scales with the container', async () => {
      arrangeContainer({ linked_quantity: '2' });

      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 2 }),
        mockUserId
      );
      // ...and the water follows the same multiplier: 200 * 2 * 1.0
      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        400,
        10,
        'Travel Mug',
        'manual',
        null,
        'entry-1',
        1
      );
    });

    it('lets an explicit container volume beat the food water', async () => {
      // The not-the-whole-drink case: a tablet or concentrate in a 500 ml glass.
      // Before this, the food's 200 ml won and the 500 was discarded.
      arrangeContainer({ volume: '500.000', hydration_factor: 1 });

      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        500,
        10,
        'Travel Mug',
        'manual',
        null,
        'entry-1',
        1
      );
    });

    it('still applies the hydration factor to an override', async () => {
      arrangeContainer({ volume: '500.000', hydration_factor: 0.5 });

      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        250,
        10,
        'Travel Mug',
        'manual',
        null,
        'entry-1',
        0.5
      );
    });

    // The fixtures above use serving_size 1, which is the one value that hides a
    // missing divisor. These use a realistic serving so the scaling is real:
    // water_ml is stored per serving_size, so consuming `quantity` of it is
    // water_ml * quantity / serving_size, exactly as the diary scales nutrients.
    it('scales the food water by serving size, not by raw quantity', async () => {
      arrangeContainer({ linked_quantity: '250' });
      // @ts-expect-error TS mock
      foodRepository.getFoodVariantById.mockResolvedValue({
        ...linkedVariant,
        serving_size: 250,
        serving_unit: 'ml',
        water_ml: 22,
      });

      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      // 22 * 250 / 250 = 22. Without the divisor this was 22 * 250 = 5500.
      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        22,
        10,
        'Travel Mug',
        'manual',
        null,
        'entry-1',
        1
      );
    });

    it('credits half the water for half a serving', async () => {
      arrangeContainer({ linked_quantity: '125' });
      // @ts-expect-error TS mock
      foodRepository.getFoodVariantById.mockResolvedValue({
        ...linkedVariant,
        serving_size: 250,
        serving_unit: 'ml',
        water_ml: 22,
      });

      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        11,
        10,
        'Travel Mug',
        'manual',
        null,
        'entry-1',
        1
      );
    });

    it('does not divide by a zero serving size', async () => {
      arrangeContainer({ linked_quantity: '1' });
      // @ts-expect-error TS mock
      foodRepository.getFoodVariantById.mockResolvedValue({
        ...linkedVariant,
        serving_size: 0,
        water_ml: 22,
      });

      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      const call = vi.mocked(measurementRepository.insertWaterIntakeLog).mock
        .calls[0];
      expect(Number.isFinite(call[3])).toBe(true);
      expect(call[3]).toBe(22);
    });

    it('treats a container saved before this column existed as one serving', async () => {
      arrangeContainer({ linked_quantity: undefined });

      await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 1 }),
        mockUserId
      );
    });
  });

  describe('upsertWaterIntake - increment with linked food', () => {
    it('creates a linked food entry and records food_entry_id in water log', async () => {
      // @ts-expect-error TS mock
      waterContainerRepository.getWaterContainerById.mockResolvedValue({
        id: 10,
        name: 'Matcha Bowl',
        // 0 = no override, so the credit comes from the food's water_ml.
        volume: '0.000',
        linked_quantity: 1,
        servings_per_container: 1,
        hydration_factor: 0.9,
        linked_food_id: 'food-uuid-1',
        linked_variant_id: 'var-uuid-1',
        linked_meal_type_id: 'meal-type-uuid-1',
      });

      // @ts-expect-error TS mock
      foodRepository.getFoodById.mockResolvedValue({
        id: 'food-uuid-1',
        name: 'Matcha Latte',
        default_variant: {
          id: 'var-uuid-1',
          calories: 120,
          protein: 4,
          carbs: 15,
          fat: 3,
          serving_size: 1,
          serving_unit: 'cup',
          water_ml: 240,
        },
      });

      // @ts-expect-error TS mock
      foodRepository.getFoodVariantById.mockResolvedValue({
        id: 'var-uuid-1',
        calories: 120,
        protein: 4,
        carbs: 15,
        fat: 3,
        serving_size: 1,
        serving_unit: 'cup',
        water_ml: 240,
      });

      // @ts-expect-error TS mock
      foodRepository.createFoodEntry.mockResolvedValue({
        id: 'created-food-entry-99',
      });

      // @ts-expect-error TS mock
      measurementRepository.getWaterIntakeByDate.mockResolvedValue({
        water_ml: 216,
        manual_ml: 216,
        food_ml: 0,
      });

      const res = await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        1,
        10
      );

      // Food entry was created with food nutrition snapshot
      expect(foodRepository.createFoodEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: mockUserId,
          food_id: 'food-uuid-1',
          variant_id: 'var-uuid-1',
          meal_type_id: 'meal-type-uuid-1',
          calories: 120,
        }),
        mockUserId
      );

      // Water log entry was inserted with explicit water_ml * hydration_factor (240 * 0.9 = 216)
      expect(measurementRepository.insertWaterIntakeLog).toHaveBeenCalledWith(
        mockUserId,
        mockUserId,
        entryDate,
        216,
        10,
        'Matcha Bowl',
        'manual',
        null,
        'created-food-entry-99',
        0.9
      );

      expect(res).toEqual({
        water_ml: 216,
        manual_ml: 216,
        food_ml: 0,
      });
    });
  });

  describe('upsertWaterIntake - decrement with linked food', () => {
    it('deletes the linked food entry and returns removedFoodEntryIds', async () => {
      // @ts-expect-error TS mock
      measurementRepository.getWaterIntakeLogByDate.mockResolvedValue([
        {
          id: 'log-entry-1',
          food_entry_id: 'food-entry-to-remove-123',
          water_ml: 216,
        },
      ]);

      // @ts-expect-error TS mock
      measurementRepository.deleteWaterIntakeLog.mockResolvedValue({
        id: 'log-entry-1',
        food_entry_id: 'food-entry-to-remove-123',
      });

      // @ts-expect-error TS mock
      foodRepository.deleteFoodEntry.mockResolvedValue({ success: true });

      // @ts-expect-error TS mock
      measurementRepository.getWaterIntakeByDate.mockResolvedValue({
        water_ml: 0,
        manual_ml: 0,
        food_ml: 0,
      });

      const res = await measurementService.upsertWaterIntake(
        mockUserId,
        mockUserId,
        entryDate,
        -1,
        null
      );

      expect(measurementRepository.deleteWaterIntakeLog).toHaveBeenCalledWith(
        'log-entry-1',
        mockUserId
      );
      expect(foodRepository.deleteFoodEntry).toHaveBeenCalledWith(
        'food-entry-to-remove-123',
        mockUserId
      );

      expect(res).toEqual({
        water_ml: 0,
        manual_ml: 0,
        food_ml: 0,
        removedFoodEntryIds: ['food-entry-to-remove-123'],
      });
    });
  });
});
