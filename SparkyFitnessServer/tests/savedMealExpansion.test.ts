import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import mealRepository from '../models/mealRepository.js';
import { expandSavedMeal } from '../utils/savedMealExpansion.js';
import { diaryNutritionTotals } from '../services/foodAssistantDiaryService.js';
vi.mock('../models/mealRepository.js', () => ({
  default: { getMealById: vi.fn() },
}));
const userId = randomUUID(),
  rootId = randomUUID(),
  childId = randomUUID(),
  foodId = randomUUID(),
  variantId = randomUUID();
const updated = '2026-10-09T00:00:00.000Z';
const ingredient = {
  id: randomUUID(),
  food_id: foodId,
  variant_id: variantId,
  quantity: 8,
  unit: 'slice',
  food_name: 'White bread',
  serving_size: 1,
  serving_unit: 'slice',
  calories: 80,
  protein: 3,
  carbs: 15,
  fat: 1,
  sodium: null,
  custom_nutrients: { test: 2 },
  allergens: ['gluten'],
  traces: ['nuts'],
  images: ['/uploads/bread.jpg'],
};
function meal(id = rootId, foods: unknown[] = [ingredient]) {
  return {
    id,
    user_id: userId,
    name: 'Bread portions',
    serving_size: 1,
    serving_unit: 'serving',
    total_servings: 4,
    updated_at: updated,
    foods,
  };
}
const selection = {
  meal_id: rootId,
  quantity: 2,
  unit: 'serving',
  expected_updated_at: updated,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(mealRepository.getMealById).mockResolvedValue(meal());
});
describe('verified saved meal expansion', () => {
  it('uses the actual yield and keeps metadata and unknown micronutrients', async () => {
    const value = await expandSavedMeal(userId, selection);
    expect(value.leaves[0]).toMatchObject({
      quantity: 4,
      calories: 80,
      sodium: null,
      allergens: ['gluten'],
      traces: ['nuts'],
      images: ['/uploads/bread.jpg'],
      custom_nutrients: { test: 2 },
    });
    expect(diaryNutritionTotals(value.leaves)).toMatchObject({
      calories: 320,
      protein: 12,
      sodium: null,
    });
    expect(mealRepository.getMealById).toHaveBeenCalledWith(
      rootId,
      userId,
      undefined,
      false
    );
  });
  it('keeps recorded unknowns even when a joined live variant supplies a number', async () => {
    vi.mocked(mealRepository.getMealById).mockResolvedValue(
      meal(rootId, [
        {
          ...ingredient,
          sodium: 123,
          nutrition_snapshot: { ...ingredient, sodium: null },
        },
      ])
    );
    expect(
      (await expandSavedMeal(userId, selection)).leaves[0]?.sodium
    ).toBeNull();
  });
  it('scales every linked recipe by both yields', async () => {
    vi.mocked(mealRepository.getMealById).mockImplementation(async (id) =>
      id === rootId
        ? meal(rootId, [
            {
              id: randomUUID(),
              food_id: null,
              variant_id: null,
              food_name: null,
              item_type: 'meal',
              child_meal_id: childId,
              quantity: 2,
              unit: 'serving',
            },
          ])
        : meal(childId)
    );
    const value = await expandSavedMeal(userId, selection);
    expect(value.leaves[0]?.quantity).toBe(2);
    expect(diaryNutritionTotals(value.leaves).calories).toBe(160);
    expect(value.references.map((row) => row.meal_id)).toEqual([
      rootId,
      childId,
    ]);
  });
  it.each([
    ['missing core nutrition', { calories: null }, 'Core nutrition'],
    ['missing serving unit', { serving_unit: null }, 'serving'],
    ['implausible bread', { calories: 5 }, 'Calories and macros'],
    ['unconfirmed count conversion', { unit: 'g' }, 'Cannot safely convert'],
  ])(
    'rejects %s without returning a partial meal',
    async (_name, change, message) => {
      vi.mocked(mealRepository.getMealById).mockResolvedValue(
        meal(rootId, [{ ...ingredient, ...change }])
      );
      await expect(expandSavedMeal(userId, selection)).rejects.toThrow(
        String(message)
      );
    }
  );
  it('rejects a stale selected version', async () => {
    await expect(
      expandSavedMeal(userId, {
        ...selection,
        expected_updated_at: '2026-10-08T00:00:00.000Z',
      })
    ).rejects.toThrow('changed');
  });
  it('rejects cycles and inaccessible linked recipes', async () => {
    const linked = {
      id: randomUUID(),
      food_id: null,
      variant_id: null,
      food_name: null,
      child_meal_id: rootId,
      quantity: 1,
      unit: 'serving',
    };
    vi.mocked(mealRepository.getMealById).mockResolvedValue(
      meal(rootId, [linked])
    );
    await expect(expandSavedMeal(userId, selection)).rejects.toThrow('cycle');
    vi.mocked(mealRepository.getMealById)
      .mockResolvedValueOnce(
        meal(rootId, [{ ...linked, child_meal_id: childId }])
      )
      .mockResolvedValueOnce(null);
    await expect(expandSavedMeal(userId, selection)).rejects.toThrow(
      'inaccessible'
    );
  });
  it('records estimated sources so a mutation requires explicit acceptance', async () => {
    vi.mocked(mealRepository.getMealById).mockResolvedValue(
      meal(rootId, [{ ...ingredient, nutrition_source: 'ai_estimate' }])
    );
    expect((await expandSavedMeal(userId, selection)).estimated).toEqual([
      'White bread',
    ]);
  });
});
