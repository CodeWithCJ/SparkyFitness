export const FOOD_VARIANT_NUTRIENT_FIELDS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'saturated_fat',
  'polyunsaturated_fat',
  'monounsaturated_fat',
  'trans_fat',
  'cholesterol',
  'sodium',
  'potassium',
  'dietary_fiber',
  'sugars',
  'vitamin_a',
  'vitamin_c',
  'calcium',
  'iron',
] as const;

export type FoodVariantNutrientField = (typeof FOOD_VARIANT_NUTRIENT_FIELDS)[number];
