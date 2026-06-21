/**
 * Display metadata for standard (predefined) nutrients.
 * Mirrors the web's CENTRAL_NUTRIENT_CONFIG but uses React Native–compatible
 * hex color values instead of Tailwind class names.
 *
 * Custom nutrients (user-defined) are not listed here — their label/unit come
 * from the UserCustomNutrient definition fetched via useCustomNutrients.
 */
export interface NutrientMeta {
  label: string;
  unit: string;
  /** Hex color used for the MacroCard progress bar. */
  color: string;
  decimals: number;
}

export const NUTRIENT_META: Record<string, NutrientMeta> = {
  calories: {
    label: 'Calories',
    unit: 'kcal',
    color: '#22c55e', // green-500
    decimals: 0,
  },
  protein: {
    label: 'Protein',
    unit: 'g',
    color: '#3b82f6', // blue-600
    decimals: 1,
  },
  carbs: {
    label: 'Carbs',
    unit: 'g',
    color: '#f97316', // orange-600
    decimals: 1,
  },
  fat: {
    label: 'Fat',
    unit: 'g',
    color: '#eab308', // yellow-600
    decimals: 1,
  },
  dietary_fiber: {
    label: 'Fiber',
    unit: 'g',
    color: '#16a34a', // green-600
    decimals: 1,
  },
  saturated_fat: {
    label: 'Sat. Fat',
    unit: 'g',
    color: '#ef4444', // red-500
    decimals: 1,
  },
  polyunsaturated_fat: {
    label: 'Poly. Fat',
    unit: 'g',
    color: '#84cc16', // lime-500
    decimals: 1,
  },
  monounsaturated_fat: {
    label: 'Mono. Fat',
    unit: 'g',
    color: '#10b981', // emerald-500
    decimals: 1,
  },
  trans_fat: {
    label: 'Trans Fat',
    unit: 'g',
    color: '#b91c1c', // red-700
    decimals: 1,
  },
  cholesterol: {
    label: 'Cholesterol',
    unit: 'mg',
    color: '#6366f1', // indigo-500
    decimals: 1,
  },
  sodium: {
    label: 'Sodium',
    unit: 'mg',
    color: '#a855f7', // purple-500
    decimals: 1,
  },
  potassium: {
    label: 'Potassium',
    unit: 'mg',
    color: '#14b8a6', // teal-500
    decimals: 1,
  },
  sugars: {
    label: 'Sugars',
    unit: 'g',
    color: '#ec4899', // pink-500
    decimals: 1,
  },
  vitamin_a: {
    label: 'Vitamin A',
    unit: 'µg',
    color: '#facc15', // yellow-400
    decimals: 1,
  },
  vitamin_c: {
    label: 'Vitamin C',
    unit: 'mg',
    color: '#fb923c', // orange-400
    decimals: 1,
  },
  calcium: {
    label: 'Calcium',
    unit: 'mg',
    color: '#60a5fa', // blue-400
    decimals: 1,
  },
  iron: {
    label: 'Iron',
    unit: 'mg',
    color: '#6b7280', // gray-500
    decimals: 1,
  },
  glycemic_index: {
    label: 'Glycemic Index',
    unit: '',
    color: '#f59e0b', // amber-500
    decimals: 0,
  },
};

/** Default color for unknown/custom nutrients not in NUTRIENT_META. */
export const CUSTOM_NUTRIENT_DEFAULT_COLOR = '#6366f1'; // indigo-500

/**
 * Nutrients shown in the Dashboard summary by default (when no user preference
 * is configured). Matches the server-side defaultNutrients list, minus 'calories'
 * which is shown in the CalorieRingCard instead.
 */
export const DEFAULT_SUMMARY_NUTRIENTS = ['protein', 'carbs', 'fat', 'dietary_fiber'] as const;
