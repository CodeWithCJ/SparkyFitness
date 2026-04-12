import { vi, beforeEach, describe, expect, it } from 'vitest';
import foodRepository from '../models/foodRepository.js';
import foodCoreService from '../services/foodCoreService.js';
vi.mock('../models/foodRepository');
vi.mock('../config/logging', () => ({ log: vi.fn() }));
const TEST_USER_ID = 'user-123';
const FOOD_ID = 'food-456';
const VARIANT_ID = 'variant-789';
const makeFood = (overrides = {}) => ({
  id: FOOD_ID,
  name: 'Chicken Breast',
  brand: 'Acme',
  is_custom: true,
  user_id: TEST_USER_ID,
  ...overrides,
});
const makeVariant = (overrides = {}) => ({
  id: VARIANT_ID,
  food_id: FOOD_ID,
  serving_size: 100,
  serving_unit: 'g',
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
  custom_nutrients: { zinc: '1.3mg' },
  is_default: true,
  ...overrides,
});
describe('foodCoreService.updateFoodEntriesSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('should fetch food + variant, update snapshot, clear ignored updates, and return success message', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(makeFood());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(makeVariant());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFoodEntriesSnapshot.mockResolvedValue(2);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.clearUserIgnoredUpdate.mockResolvedValue();
    const result = await foodCoreService.updateFoodEntriesSnapshot(
      TEST_USER_ID,
      FOOD_ID,
      VARIANT_ID
    );
    expect(result).toEqual({ message: 'Food entries updated successfully.' });
    expect(foodRepository.getFoodById).toHaveBeenCalledWith(
      FOOD_ID,
      TEST_USER_ID
    );
    expect(foodRepository.getFoodVariantById).toHaveBeenCalledWith(
      VARIANT_ID,
      TEST_USER_ID
    );
    expect(foodRepository.updateFoodEntriesSnapshot).toHaveBeenCalled();
    expect(foodRepository.clearUserIgnoredUpdate).toHaveBeenCalledWith(
      TEST_USER_ID,
      VARIANT_ID
    );
  });
  it('should pass the exact snapshot shape to the repository', async () => {
    const food = makeFood();
    const variant = makeVariant();
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(food);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(variant);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFoodEntriesSnapshot.mockResolvedValue(1);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.clearUserIgnoredUpdate.mockResolvedValue();
    await foodCoreService.updateFoodEntriesSnapshot(
      TEST_USER_ID,
      FOOD_ID,
      VARIANT_ID
    );
    // This is the key test — verifies the 4-arg call with the full snapshot object.
    // The original 3-arg bug would have failed here because newSnapshotData
    // would have been missing entirely.
    expect(foodRepository.updateFoodEntriesSnapshot).toHaveBeenCalledWith(
      TEST_USER_ID,
      FOOD_ID,
      VARIANT_ID,
      {
        food_name: food.name,
        brand_name: food.brand,
        serving_size: variant.serving_size,
        serving_unit: variant.serving_unit,
        calories: variant.calories,
        protein: variant.protein,
        carbs: variant.carbs,
        fat: variant.fat,
        saturated_fat: variant.saturated_fat,
        polyunsaturated_fat: variant.polyunsaturated_fat,
        monounsaturated_fat: variant.monounsaturated_fat,
        trans_fat: variant.trans_fat,
        cholesterol: variant.cholesterol,
        sodium: variant.sodium,
        potassium: variant.potassium,
        dietary_fiber: variant.dietary_fiber,
        sugars: variant.sugars,
        vitamin_a: variant.vitamin_a,
        vitamin_c: variant.vitamin_c,
        calcium: variant.calcium,
        iron: variant.iron,
        glycemic_index: variant.glycemic_index,
        custom_nutrients: { zinc: '1.3mg' },
      }
    );
  });
  it('should sanitize custom_nutrients by stripping empty and null values', async () => {
    const variant = makeVariant({
      custom_nutrients: { zinc: '1.3mg', empty: '', blank: null, ok: '5mg' },
    });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(makeFood());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(variant);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFoodEntriesSnapshot.mockResolvedValue(1);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.clearUserIgnoredUpdate.mockResolvedValue();
    await foodCoreService.updateFoodEntriesSnapshot(
      TEST_USER_ID,
      FOOD_ID,
      VARIANT_ID
    );
    const snapshotArg =
      // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(userId: a... Remove this comment to see the full error message
      foodRepository.updateFoodEntriesSnapshot.mock.calls[0][3];
    expect(snapshotArg.custom_nutrients).toEqual({ zinc: '1.3mg', ok: '5mg' });
  });
  it('should throw "Food not found." when food is null', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(null);
    await expect(
      foodCoreService.updateFoodEntriesSnapshot(
        TEST_USER_ID,
        FOOD_ID,
        VARIANT_ID
      )
    ).rejects.toThrow('Food not found.');
    expect(foodRepository.updateFoodEntriesSnapshot).not.toHaveBeenCalled();
    expect(foodRepository.clearUserIgnoredUpdate).not.toHaveBeenCalled();
  });
  it('should throw "Food variant not found." when variant is null', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(makeFood());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(null);
    await expect(
      foodCoreService.updateFoodEntriesSnapshot(
        TEST_USER_ID,
        FOOD_ID,
        VARIANT_ID
      )
    ).rejects.toThrow('Food variant not found.');
    expect(foodRepository.updateFoodEntriesSnapshot).not.toHaveBeenCalled();
    expect(foodRepository.clearUserIgnoredUpdate).not.toHaveBeenCalled();
  });
  it('should not clear ignored updates when snapshot update throws', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(makeFood());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(makeVariant());
    // @ts-expect-error TS(2339): Property 'mockRejectedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFoodEntriesSnapshot.mockRejectedValue(
      new Error('DB write failed')
    );
    await expect(
      foodCoreService.updateFoodEntriesSnapshot(
        TEST_USER_ID,
        FOOD_ID,
        VARIANT_ID
      )
    ).rejects.toThrow('DB write failed');
    expect(foodRepository.updateFoodEntriesSnapshot).toHaveBeenCalled();
    expect(foodRepository.clearUserIgnoredUpdate).not.toHaveBeenCalled();
  });
  // Snapshot update must succeed before clearing ignored updates, so a failure
  // doesn't also lose the user's ignore state.
  it('should call updateFoodEntriesSnapshot before clearUserIgnoredUpdate', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const callOrder: any = [];
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(makeFood());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantById.mockResolvedValue(makeVariant());
    // @ts-expect-error TS(2339): Property 'mockImplementation' does not exist on ty... Remove this comment to see the full error message
    foodRepository.updateFoodEntriesSnapshot.mockImplementation(() => {
      callOrder.push('updateFoodEntriesSnapshot');
      return Promise.resolve(1);
    });
    // @ts-expect-error TS(2339): Property 'mockImplementation' does not exist on ty... Remove this comment to see the full error message
    foodRepository.clearUserIgnoredUpdate.mockImplementation(() => {
      callOrder.push('clearUserIgnoredUpdate');
      return Promise.resolve();
    });
    await foodCoreService.updateFoodEntriesSnapshot(
      TEST_USER_ID,
      FOOD_ID,
      VARIANT_ID
    );
    expect(callOrder).toEqual([
      'updateFoodEntriesSnapshot',
      'clearUserIgnoredUpdate',
    ]);
  });
  // --- No variantId: update all variants for the food ---
  it('should fetch all variants and update each one when variantId is not provided', async () => {
    const variantA = makeVariant({ id: 'variant-aaa' });
    const variantB = makeVariant({ id: 'variant-bbb', calories: 200 });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(makeFood());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantsByFoodId.mockResolvedValue([
      variantA,
      variantB,
    ]);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFoodEntriesSnapshot.mockResolvedValue(1);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.clearUserIgnoredUpdate.mockResolvedValue();
    // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
    const result = await foodCoreService.updateFoodEntriesSnapshot(
      TEST_USER_ID,
      FOOD_ID
    );
    expect(result).toEqual({ message: 'Food entries updated successfully.' });
    expect(foodRepository.getFoodVariantsByFoodId).toHaveBeenCalledWith(
      FOOD_ID,
      TEST_USER_ID
    );
    expect(foodRepository.getFoodVariantById).not.toHaveBeenCalled();
    expect(foodRepository.updateFoodEntriesSnapshot).toHaveBeenCalledTimes(2);
    expect(foodRepository.clearUserIgnoredUpdate).toHaveBeenCalledTimes(2);
    expect(foodRepository.clearUserIgnoredUpdate).toHaveBeenCalledWith(
      TEST_USER_ID,
      'variant-aaa'
    );
    expect(foodRepository.clearUserIgnoredUpdate).toHaveBeenCalledWith(
      TEST_USER_ID,
      'variant-bbb'
    );
  });
  it('should pass correct snapshot data for each variant when variantId is not provided', async () => {
    const food = makeFood();
    const variantA = makeVariant({ id: 'variant-aaa', calories: 100 });
    const variantB = makeVariant({ id: 'variant-bbb', calories: 250 });
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(food);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantsByFoodId.mockResolvedValue([
      variantA,
      variantB,
    ]);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.updateFoodEntriesSnapshot.mockResolvedValue(1);
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.clearUserIgnoredUpdate.mockResolvedValue();
    // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
    await foodCoreService.updateFoodEntriesSnapshot(TEST_USER_ID, FOOD_ID);
    // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(userId: a... Remove this comment to see the full error message
    const firstCall = foodRepository.updateFoodEntriesSnapshot.mock.calls[0];
    expect(firstCall[2]).toBe('variant-aaa');
    expect(firstCall[3].calories).toBe(100);
    expect(firstCall[3].food_name).toBe(food.name);
    // @ts-expect-error TS(2339): Property 'mock' does not exist on type '(userId: a... Remove this comment to see the full error message
    const secondCall = foodRepository.updateFoodEntriesSnapshot.mock.calls[1];
    expect(secondCall[2]).toBe('variant-bbb');
    expect(secondCall[3].calories).toBe(250);
    expect(secondCall[3].food_name).toBe(food.name);
  });
  it('should succeed with no updates when food has no variants and variantId is not provided', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(makeFood());
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodVariantsByFoodId.mockResolvedValue([]);
    // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
    const result = await foodCoreService.updateFoodEntriesSnapshot(
      TEST_USER_ID,
      FOOD_ID
    );
    expect(result).toEqual({ message: 'Food entries updated successfully.' });
    expect(foodRepository.updateFoodEntriesSnapshot).not.toHaveBeenCalled();
    expect(foodRepository.clearUserIgnoredUpdate).not.toHaveBeenCalled();
  });
  it('should throw "Food not found." when food is null and variantId is not provided', async () => {
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    foodRepository.getFoodById.mockResolvedValue(null);
    await expect(
      // @ts-expect-error TS(2554): Expected 3 arguments, but got 2.
      foodCoreService.updateFoodEntriesSnapshot(TEST_USER_ID, FOOD_ID)
    ).rejects.toThrow('Food not found.');
    expect(foodRepository.getFoodVariantsByFoodId).not.toHaveBeenCalled();
    expect(foodRepository.updateFoodEntriesSnapshot).not.toHaveBeenCalled();
  });
});
