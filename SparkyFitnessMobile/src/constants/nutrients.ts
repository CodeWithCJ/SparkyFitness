/**
 * Display metadata (label + unit) for standard (predefined) nutrients.
 *
 * Colors are intentionally NOT stored here — nutrient bar colors come from
 * theme-aware CSS variables (e.g. --color-macro-protein) resolved in the
 * consuming component so they adapt to the light/dark/AMOLED themes.
 *
 * Custom nutrients (user-defined) are not listed here — their label/unit come
 * from the UserCustomNutrient definition fetched via useCustomNutrients.
 */
export interface NutrientMeta {
  label: string;
  unit: string;
}

export const NUTRIENT_META: Record<string, NutrientMeta> = {
  calories: { label: 'Calories', unit: 'kcal' },
  protein: { label: 'Protein', unit: 'g' },
  carbs: { label: 'Carbs', unit: 'g' },
  fat: { label: 'Fat', unit: 'g' },
  dietary_fiber: { label: 'Fiber', unit: 'g' },
  saturated_fat: { label: 'Sat. Fat', unit: 'g' },
  polyunsaturated_fat: { label: 'Poly. Fat', unit: 'g' },
  monounsaturated_fat: { label: 'Mono. Fat', unit: 'g' },
  trans_fat: { label: 'Trans Fat', unit: 'g' },
  cholesterol: { label: 'Cholesterol', unit: 'mg' },
  sodium: { label: 'Sodium', unit: 'mg' },
  potassium: { label: 'Potassium', unit: 'mg' },
  sugars: { label: 'Sugars', unit: 'g' },
  vitamin_a: { label: 'Vitamin A', unit: 'µg' },
  vitamin_c: { label: 'Vitamin C', unit: 'mg' },
  calcium: { label: 'Calcium', unit: 'mg' },
  iron: { label: 'Iron', unit: 'mg' },
  glycemic_index: { label: 'Glycemic Index', unit: '' },
};

/**
 * Nutrients shown in the Dashboard summary by default (when no user preference
 * is configured). Matches the server-side defaultNutrients list, minus 'calories'
 * which is shown in the CalorieRingCard instead.
 */
export const DEFAULT_SUMMARY_NUTRIENTS = ['protein', 'carbs', 'fat', 'dietary_fiber'] as const;
