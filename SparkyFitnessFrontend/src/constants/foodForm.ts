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
];

// Unit groups mirror the lookup tables in servingSizeConversions.ts so that
// compatible-unit detection is consistent in both directions.
export const UNIT_GROUPS = [
  { label: 'Weight', units: ['g', 'kg', 'mg', 'oz', 'lb'] },
  { label: 'Volume', units: ['ml', 'l', 'cup', 'tbsp', 'tsp'] },
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
    ],
  },
];
