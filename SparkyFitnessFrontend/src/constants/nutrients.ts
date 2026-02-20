import { MealTotals } from '@/pages/Diary/Diary';

export interface NutrientMetadata {
  id: string;
  label: string;
  defaultLabel: string;
  unit: string;
  color: string; // Tailwind class for UI text
  chartColor: string; // Hex color for chart rendering
  decimals: number;
  group: 'macros' | 'fats' | 'minerals' | 'custom';
}

export const CENTRAL_NUTRIENT_CONFIG: Record<string, NutrientMetadata> = {
  calories: {
    id: 'calories',
    label: 'nutrition.calories',
    defaultLabel: 'Calories',
    unit: 'kcal',
    color: 'text-gray-900 dark:text-gray-100',
    chartColor: '#22c55e', // green-500
    decimals: 0,
    group: 'macros',
  },
  protein: {
    id: 'protein',
    label: 'nutrition.protein',
    defaultLabel: 'Protein',
    unit: 'g',
    color: 'text-blue-600',
    chartColor: '#3b82f6', // blue-600
    decimals: 1,
    group: 'macros',
  },
  carbs: {
    id: 'carbs',
    label: 'nutrition.carbohydrates',
    defaultLabel: 'Carbohydrates',
    unit: 'g',
    color: 'text-orange-600',
    chartColor: '#f97316', // orange-600
    decimals: 1,
    group: 'macros',
  },
  fat: {
    id: 'fat',
    label: 'nutrition.fat',
    defaultLabel: 'Fat',
    unit: 'g',
    color: 'text-yellow-600',
    chartColor: '#eab308', // yellow-600
    decimals: 1,
    group: 'macros',
  },
  saturated_fat: {
    id: 'saturated_fat',
    label: 'nutrition.saturatedFat',
    defaultLabel: 'Saturated Fat',
    unit: 'g',
    color: 'text-red-500',
    chartColor: '#ef4444', // red-500
    decimals: 1,
    group: 'fats',
  },
  polyunsaturated_fat: {
    id: 'polyunsaturated_fat',
    label: 'nutrition.polyunsaturatedFat',
    defaultLabel: 'Polyunsaturated Fat',
    unit: 'g',
    color: 'text-lime-500',
    chartColor: '#84cc16', // lime-500
    decimals: 1,
    group: 'fats',
  },
  monounsaturated_fat: {
    id: 'monounsaturated_fat',
    label: 'nutrition.monounsaturatedFat',
    defaultLabel: 'Monounsaturated Fat',
    unit: 'g',
    color: 'text-emerald-500',
    chartColor: '#10b981', // emerald-500
    decimals: 1,
    group: 'fats',
  },
  trans_fat: {
    id: 'trans_fat',
    label: 'nutrition.transFat',
    defaultLabel: 'Trans Fat',
    unit: 'g',
    color: 'text-red-700',
    chartColor: '#b91c1c', // red-700
    decimals: 1,
    group: 'fats',
  },
  cholesterol: {
    id: 'cholesterol',
    label: 'nutrition.cholesterol',
    defaultLabel: 'Cholesterol',
    unit: 'mg',
    color: 'text-indigo-500',
    chartColor: '#6366f1', // indigo-500
    decimals: 0,
    group: 'minerals',
  },
  sodium: {
    id: 'sodium',
    label: 'nutrition.sodium',
    defaultLabel: 'Sodium',
    unit: 'mg',
    color: 'text-purple-500',
    chartColor: '#a855f7', // purple-500
    decimals: 0,
    group: 'minerals',
  },
  potassium: {
    id: 'potassium',
    label: 'nutrition.potassium',
    defaultLabel: 'Potassium',
    unit: 'mg',
    color: 'text-teal-500',
    chartColor: '#14b8a6', // teal-500
    decimals: 0,
    group: 'minerals',
  },
  dietary_fiber: {
    id: 'dietary_fiber',
    label: 'nutrition.dietaryFiber',
    defaultLabel: 'Dietary Fiber',
    unit: 'g',
    color: 'text-green-600',
    chartColor: '#16a34a', // green-600
    decimals: 1,
    group: 'minerals',
  },
  sugars: {
    id: 'sugars',
    label: 'nutrition.sugars',
    defaultLabel: 'Sugars',
    unit: 'g',
    color: 'text-pink-500',
    chartColor: '#ec4899', // pink-500
    decimals: 1,
    group: 'minerals',
  },
  vitamin_a: {
    id: 'vitamin_a',
    label: 'nutrition.vitaminA',
    defaultLabel: 'Vitamin A',
    unit: 'µg',
    color: 'text-yellow-400',
    chartColor: '#facc15', // yellow-400
    decimals: 0,
    group: 'minerals',
  },
  vitamin_c: {
    id: 'vitamin_c',
    label: 'nutrition.vitaminC',
    defaultLabel: 'Vitamin C',
    unit: 'mg',
    color: 'text-orange-400',
    chartColor: '#fb923c', // orange-400
    decimals: 1,
    group: 'minerals',
  },
  calcium: {
    id: 'calcium',
    label: 'nutrition.calcium',
    defaultLabel: 'Calcium',
    unit: 'mg',
    color: 'text-blue-400',
    chartColor: '#60a5fa', // blue-400
    decimals: 0,
    group: 'minerals',
  },
  iron: {
    id: 'iron',
    label: 'nutrition.iron',
    defaultLabel: 'Iron',
    unit: 'mg',
    color: 'text-gray-500',
    chartColor: '#6b7280', // gray-500
    decimals: 1,
    group: 'minerals',
  },
};

export const EMPTY_MEAL_TOTALS: MealTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  dietary_fiber: 0,
  sugars: 0,
  sodium: 0,
  cholesterol: 0,
  saturated_fat: 0,
  monounsaturated_fat: 0,
  polyunsaturated_fat: 0,
  trans_fat: 0,
  potassium: 0,
  vitamin_a: 0,
  vitamin_c: 0,
  iron: 0,
  calcium: 0,
  custom_nutrients: {},
};
