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
  /** i18n key for the label */
  labelKey: string;
  /** English label fallback retained for non-UI metadata consumers */
  defaultLabel: string;
  unit: string;
}

export const NUTRIENT_META: Record<string, NutrientMeta> = {
  calories: { labelKey: 'nutrients.calories', defaultLabel: 'Calories', unit: 'kcal' },
  protein: { labelKey: 'nutrients.protein', defaultLabel: 'Protein', unit: 'g' },
  carbs: { labelKey: 'nutrients.carbs', defaultLabel: 'Carbs', unit: 'g' },
  fat: { labelKey: 'nutrients.fat', defaultLabel: 'Fat', unit: 'g' },
  dietary_fiber: { labelKey: 'nutrients.fiber', defaultLabel: 'Fiber', unit: 'g' },
  saturated_fat: { labelKey: 'nutrients.saturatedFatShort', defaultLabel: 'Sat. Fat', unit: 'g' },
  polyunsaturated_fat: { labelKey: 'nutrients.polyunsaturatedFatShort', defaultLabel: 'Poly. Fat', unit: 'g' },
  monounsaturated_fat: { labelKey: 'nutrients.monounsaturatedFatShort', defaultLabel: 'Mono. Fat', unit: 'g' },
  trans_fat: { labelKey: 'nutrients.transFat', defaultLabel: 'Trans Fat', unit: 'g' },
  cholesterol: { labelKey: 'nutrients.cholesterol', defaultLabel: 'Cholesterol', unit: 'mg' },
  sodium: { labelKey: 'nutrients.sodium', defaultLabel: 'Sodium', unit: 'mg' },
  potassium: { labelKey: 'nutrients.potassium', defaultLabel: 'Potassium', unit: 'mg' },
  sugars: { labelKey: 'nutrients.sugars', defaultLabel: 'Sugars', unit: 'g' },
  vitamin_a: { labelKey: 'nutrients.vitaminA', defaultLabel: 'Vitamin A', unit: 'µg' },
  vitamin_c: { labelKey: 'nutrients.vitaminC', defaultLabel: 'Vitamin C', unit: 'mg' },
  calcium: { labelKey: 'nutrients.calcium', defaultLabel: 'Calcium', unit: 'mg' },
  iron: { labelKey: 'nutrients.iron', defaultLabel: 'Iron', unit: 'mg' },
  glycemic_index: { labelKey: 'nutrients.glycemicIndex', defaultLabel: 'Glycemic Index', unit: '' },
};

/**
 * Nutrients shown in the Dashboard summary by default (when no user preference
 * is configured). Matches the server-side defaultNutrients list, minus 'calories'
 * which is shown in the CalorieRingCard instead.
 */
export const DEFAULT_SUMMARY_NUTRIENTS = ['protein', 'carbs', 'fat', 'dietary_fiber'] as const;

export function getNutrientLabel(t: (key: string, options: { defaultValue: string }) => string, key: string): string {
  switch (key) {
    case 'calories': return t('nutrients.calories', { defaultValue: 'Calories' });
    case 'protein': return t('nutrients.protein', { defaultValue: 'Protein' });
    case 'carbs': return t('nutrients.carbs', { defaultValue: 'Carbs' });
    case 'fat': return t('nutrients.fat', { defaultValue: 'Fat' });
    case 'dietary_fiber': return t('nutrients.fiber', { defaultValue: 'Fiber' });
    case 'saturated_fat': return t('nutrients.saturatedFatShort', { defaultValue: 'Sat. Fat' });
    case 'polyunsaturated_fat': return t('nutrients.polyunsaturatedFatShort', { defaultValue: 'Poly. Fat' });
    case 'monounsaturated_fat': return t('nutrients.monounsaturatedFatShort', { defaultValue: 'Mono. Fat' });
    case 'trans_fat': return t('nutrients.transFat', { defaultValue: 'Trans Fat' });
    case 'cholesterol': return t('nutrients.cholesterol', { defaultValue: 'Cholesterol' });
    case 'sodium': return t('nutrients.sodium', { defaultValue: 'Sodium' });
    case 'potassium': return t('nutrients.potassium', { defaultValue: 'Potassium' });
    case 'sugars': return t('nutrients.sugars', { defaultValue: 'Sugars' });
    case 'vitamin_a': return t('nutrients.vitaminA', { defaultValue: 'Vitamin A' });
    case 'vitamin_c': return t('nutrients.vitaminC', { defaultValue: 'Vitamin C' });
    case 'calcium': return t('nutrients.calcium', { defaultValue: 'Calcium' });
    case 'iron': return t('nutrients.iron', { defaultValue: 'Iron' });
    case 'glycemic_index': return t('nutrients.glycemicIndex', { defaultValue: 'Glycemic Index' });
    default: return NUTRIENT_META[key]?.defaultLabel ?? key;
  }
}
