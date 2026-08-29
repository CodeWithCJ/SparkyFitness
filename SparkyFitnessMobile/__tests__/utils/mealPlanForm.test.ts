import {
  buildMealPlanPayload,
  calculateMealPlanDayNutrition,
  createMealAssignment,
  createMealPlanDraft,
  validateMealPlanDraft,
} from '../../src/utils/mealPlanForm';
import type { MealPlanTemplate } from '../../src/types/mealPlans';

const reusableMeal = {
  id: 'meal-1',
  user_id: 'user-1',
  name: 'Chicken and rice',
  description: null,
  is_public: false,
  serving_size: 350,
  serving_unit: 'g',
  total_servings: 4,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  foods: [{
    id: 'meal-food-1',
    food_id: 'food-1',
    variant_id: 'variant-1',
    quantity: 400,
    unit: 'g',
    food_name: 'Chicken',
    brand: null,
    serving_size: 100,
    serving_unit: 'g',
    calories: 200,
    protein: 30,
    carbs: 10,
    fat: 5,
  }],
};

describe('mealPlanForm', () => {
  test('prefills one serving using the reusable meal serving size and unit', () => {
    expect(createMealAssignment(reusableMeal, 'lunch', 1)).toEqual({
      item_type: 'meal',
      day_of_week: 1,
      meal_type_id: 'lunch',
      meal_id: 'meal-1',
      meal_name: 'Chicken and rice',
      quantity: 350,
      quantityText: '350',
      unit: 'g',
      nutrition: {
        servingSize: 350,
        calories: 200,
        protein: 30,
        carbs: 10,
        fat: 5,
      },
    });
  });

  test('preserves fractional per-serving meal nutrition in a new assignment', () => {
    const fractionalMeal = {
      ...reusableMeal,
      total_servings: 3,
      foods: [{
        ...reusableMeal.foods[0],
        quantity: 100,
        serving_size: 100,
        calories: 100,
        protein: 10,
        carbs: 20,
        fat: 5,
      }],
    };

    const nutrition = createMealAssignment(fractionalMeal, 'lunch', 1).nutrition;

    expect(nutrition?.calories).toBeCloseTo(33.333333);
    expect(nutrition?.protein).toBeCloseTo(3.333333);
    expect(nutrition?.carbs).toBeCloseTo(6.666667);
    expect(nutrition?.fat).toBeCloseTo(1.666667);
  });

  test('calculates live nutrition for the selected day and scales edited quantities', () => {
    const mealAssignment = createMealAssignment(reusableMeal, 'lunch', 1);
    const foodAssignment = {
      item_type: 'food' as const,
      day_of_week: 1,
      meal_type_id: 'breakfast',
      food_id: 'food-2',
      variant_id: 'variant-2',
      food_name: 'Oats',
      quantity: 80,
      unit: 'g',
      nutrition: {
        servingSize: 40,
        calories: 150,
        protein: 5,
        carbs: 27,
        fat: 3,
      },
    };

    expect(calculateMealPlanDayNutrition([mealAssignment, foodAssignment], 1)).toEqual({
      calories: 500,
      protein: 40,
      carbs: 64,
      fat: 11,
    });
    expect(calculateMealPlanDayNutrition([mealAssignment, foodAssignment], 2)).toEqual({
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });

  test('normalizes API timestamps to local calendar-day fields', () => {
    const template: MealPlanTemplate = {
      id: 'plan-1',
      user_id: 'user-1',
      plan_name: 'Prep week',
      description: null,
      start_date: '2026-09-01T00:00:00.000Z',
      end_date: '2026-09-30T00:00:00.000Z',
      is_active: true,
      assignments: [],
      created_at: '2026-08-29T00:00:00.000Z',
      updated_at: '2026-08-29T00:00:00.000Z',
    };

    expect(createMealPlanDraft('2026-08-29', template)).toMatchObject({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });

  test('normalizes legacy assignments without an amount before editing', () => {
    const template: MealPlanTemplate = {
      id: 'plan-legacy',
      user_id: 'user-1',
      plan_name: 'Legacy plan',
      description: null,
      start_date: '2026-09-01',
      end_date: null,
      is_active: false,
      assignments: [{
        item_type: 'food',
        day_of_week: 0,
        meal_type_id: 'breakfast',
        food_id: 'food-1',
        quantity: null,
        unit: null,
      }],
    };

    expect(createMealPlanDraft('2026-08-29', template).assignments[0]).toMatchObject({
      quantity: 1,
      unit: 'serving',
    });
  });

  test.each([
    { quantity: 350, unit: null },
    { quantity: null, unit: 'g' },
  ])('normalizes a half-null legacy amount as one coherent serving', ({ quantity, unit }) => {
    const template: MealPlanTemplate = {
      id: 'plan-half-null',
      user_id: 'user-1',
      plan_name: 'Legacy plan',
      description: null,
      start_date: '2026-09-01',
      end_date: null,
      is_active: false,
      assignments: [{
        item_type: 'food',
        day_of_week: 0,
        meal_type_id: 'breakfast',
        food_id: 'food-1',
        quantity,
        unit,
      }],
    };

    expect(createMealPlanDraft('2026-08-29', template).assignments[0]).toMatchObject({
      quantity: 1,
      quantityText: '1',
      unit: 'serving',
    });
  });

  test('rejects missing fields, invalid quantities, and backwards date ranges', () => {
    expect(
      validateMealPlanDraft({
        planName: ' ',
        description: '',
        startDate: '2026-09-10',
        endDate: '2026-09-01',
        isActive: true,
        assignments: [
          {
            item_type: 'meal',
            day_of_week: 1,
            meal_type_id: '',
            meal_id: '',
            quantity: 0,
            unit: '',
          },
        ],
      }),
    ).toEqual({
      planName: 'required',
      endDate: 'beforeStart',
      assignments: 'invalid',
    });
  });

  test('preserves web-created food assignments in the save payload', () => {
    const foodAssignment = {
      id: 'assignment-food',
      item_type: 'food' as const,
      day_of_week: 2,
      meal_type_id: 'breakfast',
      meal_type: 'Breakfast',
      food_id: 'food-1',
      food_name: 'Oats',
      variant_id: 'variant-1',
      quantity: 80,
      unit: 'g',
    };
    const mealAssignment = createMealAssignment(reusableMeal, 'lunch', 3);

    expect(
      buildMealPlanPayload({
        planName: 'Prep week',
        description: '  Batch cooking  ',
        startDate: '2026-09-01',
        endDate: '',
        isActive: true,
        assignments: [foodAssignment, mealAssignment],
      }),
    ).toEqual({
      plan_name: 'Prep week',
      description: 'Batch cooking',
      start_date: '2026-09-01',
      end_date: null,
      is_active: true,
      assignments: [
        foodAssignment,
        {
          item_type: 'meal',
          day_of_week: 3,
          meal_type_id: 'lunch',
          meal_id: 'meal-1',
          meal_name: 'Chicken and rice',
          quantity: 350,
          unit: 'g',
        },
      ],
    });
  });

  test('removes mobile-only nutrition snapshots from the API payload', () => {
    const assignment = createMealAssignment(reusableMeal, 'lunch', 1);

    const payload = buildMealPlanPayload({
      planName: 'Prep week',
      description: '',
      startDate: '2026-09-01',
      endDate: '',
      isActive: true,
      assignments: [assignment],
    });

    expect(payload.assignments[0]).not.toHaveProperty('nutrition');
    expect(payload.assignments[0]).not.toHaveProperty('quantityText');
  });
});
