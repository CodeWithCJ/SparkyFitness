import {
  buildMealIngredientDraft,
  buildMealIngredientDraftFromSavedFood,
} from '../../src/utils/mealBuilderDraft';

describe('mealBuilderDraft', () => {
  it('maps display values, quantity, unit override, and nullable brand', () => {
    const draft = buildMealIngredientDraft({
      foodId: 'food-1',
      variantId: 'variant-1',
      quantity: 2.5,
      unit: 'cup',
      foodName: 'Greek Yogurt',
      brand: null,
      values: {
        servingSize: 1,
        servingUnit: 'container',
        calories: 120,
        protein: 15,
        carbs: 8,
        fat: 2,
        fiber: 1,
        saturatedFat: 0.5,
        sodium: 55,
        sugars: 6,
        transFat: 0,
        potassium: 120,
        calcium: 180,
        iron: 1,
        cholesterol: 12,
        vitaminA: 30,
        vitaminC: 4,
      },
    });

    expect(draft).toEqual({
      food_id: 'food-1',
      variant_id: 'variant-1',
      quantity: 2.5,
      unit: 'cup',
      food_name: 'Greek Yogurt',
      brand: null,
      serving_size: 1,
      serving_unit: 'container',
      calories: 120,
      protein: 15,
      carbs: 8,
      fat: 2,
      dietary_fiber: 1,
      saturated_fat: 0.5,
      sodium: 55,
      sugars: 6,
      trans_fat: 0,
      potassium: 120,
      calcium: 180,
      iron: 1,
      cholesterol: 12,
      vitamin_a: 30,
      vitamin_c: 4,
    });
  });

  it('maps the saved default variant correctly', () => {
    const draft = buildMealIngredientDraftFromSavedFood(
      {
        id: 'food-2',
        name: 'Blueberries',
        brand: 'Fresh Farm',
        is_custom: false,
        default_variant: {
          id: 'variant-2',
          serving_size: 140,
          serving_unit: 'g',
          calories: 80,
          protein: 1,
          carbs: 21,
          fat: 0,
          dietary_fiber: 3,
          saturated_fat: 0,
          sodium: 1,
          sugars: 14,
          trans_fat: 0,
          potassium: 110,
          calcium: 8,
          iron: 0.4,
          cholesterol: 0,
          vitamin_a: 4,
          vitamin_c: 10,
        },
      },
      280,
      'g',
    );

    expect(draft).toEqual({
      food_id: 'food-2',
      variant_id: 'variant-2',
      quantity: 280,
      unit: 'g',
      food_name: 'Blueberries',
      brand: 'Fresh Farm',
      serving_size: 140,
      serving_unit: 'g',
      calories: 80,
      protein: 1,
      carbs: 21,
      fat: 0,
      dietary_fiber: 3,
      saturated_fat: 0,
      sodium: 1,
      sugars: 14,
      trans_fat: 0,
      potassium: 110,
      calcium: 8,
      iron: 0.4,
      cholesterol: 0,
      vitamin_a: 4,
      vitamin_c: 10,
    });
  });

  it('throws when the saved food has no default variant id', () => {
    expect(() =>
      buildMealIngredientDraftFromSavedFood(
        {
          id: 'food-3',
          name: 'Oatmeal',
          brand: null,
          is_custom: true,
          default_variant: {
            serving_size: 40,
            serving_unit: 'g',
            calories: 150,
            protein: 5,
            carbs: 27,
            fat: 3,
          },
        },
        40,
      ),
    ).toThrow('Server did not return a variant ID for the saved food');
  });
});
