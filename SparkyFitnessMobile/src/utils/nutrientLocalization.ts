import type { TFunction } from 'i18next';

/** Translate application-owned nutrient identifiers; custom nutrient names remain literal. */
export function localizeNutrientKey(t: TFunction, key: string): string {
  switch (key) {
    case 'calories': return t('nutrients.calories', { defaultValue: 'Calories' });
    case 'protein': return t('nutrients.protein', { defaultValue: 'Protein' });
    case 'carbs': return t('nutrients.carbs', { defaultValue: 'Carbs' });
    case 'fat': return t('nutrients.fat', { defaultValue: 'Fat' });
    case 'fiber': return t('nutrients.fiber', { defaultValue: 'Fiber' });
    case 'saturatedFat': return t('nutrients.saturatedFatShort', { defaultValue: 'Sat. Fat' });
    case 'polyunsaturatedFat': return t('nutrients.polyunsaturatedFatShort', { defaultValue: 'Poly. Fat' });
    case 'monounsaturatedFat': return t('nutrients.monounsaturatedFatShort', { defaultValue: 'Mono. Fat' });
    case 'transFat': return t('nutrients.transFat', { defaultValue: 'Trans Fat' });
    case 'cholesterol': return t('nutrients.cholesterol', { defaultValue: 'Cholesterol' });
    case 'sodium': return t('nutrients.sodium', { defaultValue: 'Sodium' });
    case 'potassium': return t('nutrients.potassium', { defaultValue: 'Potassium' });
    case 'sugars': return t('nutrients.sugars', { defaultValue: 'Sugars' });
    case 'vitaminA': return t('nutrients.vitaminA', { defaultValue: 'Vitamin A' });
    case 'vitaminC': return t('nutrients.vitaminC', { defaultValue: 'Vitamin C' });
    case 'calcium': return t('nutrients.calcium', { defaultValue: 'Calcium' });
    case 'iron': return t('nutrients.iron', { defaultValue: 'Iron' });
    case 'glycemicIndex': return t('nutrients.glycemicIndex', { defaultValue: 'Glycemic Index' });
    case 'totalCarbs': return t('nutrients.totalCarbs', { defaultValue: 'Total Carbs' });
    case 'netCarbs': return t('nutrients.netCarbs', { defaultValue: 'Net Carbs' });
    default: return key;
  }
}
