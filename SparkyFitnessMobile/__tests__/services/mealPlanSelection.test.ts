import {
  consumePendingMealPlanSelection,
  setPendingMealPlanSelection,
} from '../../src/services/mealPlanSelection';

describe('mealPlanSelection', () => {
  test('returns a pending assignment once and clears it', () => {
    const selection = {
      assignment: {
        item_type: 'food' as const,
        day_of_week: 2,
        meal_type_id: 'lunch',
        meal_type: 'Lunch',
        food_id: 'food-1',
        food_name: 'Oats',
        variant_id: 'variant-1',
        quantity: 80,
        quantityText: '80',
        unit: 'g',
        nutrition: {
          servingSize: 40,
          calories: 150,
          protein: 5,
          carbs: 27,
          fat: 3,
        },
      },
    };

    setPendingMealPlanSelection({ ...selection, assignmentIndex: 2 });

    expect(consumePendingMealPlanSelection()).toEqual({
      ...selection,
      assignmentIndex: 2,
    });
    expect(consumePendingMealPlanSelection()).toBeNull();
  });
});
