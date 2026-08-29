import {
  buildMealPlanPayload,
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
  foods: [],
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
});
