import { NumericFoodVariantKeys } from '@/types/food';

export const nutrientFields: NumericFoodVariantKeys[] = [
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
  'caffeine_mg',
  'water_ml',
  'alcohol_g',
  'abv_percent',
];

// Fields in `nutrientFields` that are NOT per-serving quantities and must be
// carried across a serving-size change unchanged. ABV is a property of the
// liquid: doubling the serving does not double the percentage. Scaling it
// would turn a 5% beer into a 10% one on the second serving, and alcohol_g
// (which IS scaled) is derived from it at save time.
export const UNSCALED_NUTRIENT_FIELDS: NumericFoodVariantKeys[] = [
  'abv_percent',
];

// Unit groups mirror the lookup tables in servingSizeConversions.ts so that
// compatible-unit detection is consistent in both directions.
export const UNIT_GROUPS = [
  { label: 'Weight', units: ['g', 'kg', 'mg', 'oz', 'lb'] },
  { label: 'Volume', units: ['ml', 'l', 'cup', 'tbsp', 'tsp', 'fl oz'] },
  {
    label: 'Quantity',
    units: [
      'piece',
      'slice',
      'serving',
      'portion',
      'can',
      'bottle',
      'packet',
      'bag',
      'bowl',
      'plate',
      'handful',
      'scoop',
      'bar',
      'stick',
      'whole',
    ],
  },
];
