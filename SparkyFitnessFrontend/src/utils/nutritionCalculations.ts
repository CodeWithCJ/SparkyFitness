
import { Food, FoodVariant, FoodEntry } from '@/types/food'; // Import from central types file

// Utility functions for nutrition calculations

export const convertStepsToCalories = (steps: number, weightKg: number = 70): number => {
  // More accurate calculation based on weight
  // Formula: steps * 0.04 * (weight in kg / 70)
  const baseCaloriesPerStep = 0.04;
  const weightAdjustment = weightKg / 70;
  return Math.round(steps * baseCaloriesPerStep * weightAdjustment);
};

export const estimateStepsFromWalkingExercise = (durationMinutes: number, intensity: 'light' | 'moderate' | 'brisk' = 'moderate'): number => {
  // Estimate steps based on walking duration and intensity
  const stepsPerMinute = {
    light: 80,     // slow walk
    moderate: 100, // normal pace
    brisk: 120     // fast walk
  };
  
  return Math.round(durationMinutes * stepsPerMinute[intensity]);
};

export const calculateNutritionProgress = (actual: number, goal: number): number => {
  return goal > 0 ? Math.round((actual / goal) * 100) : 0;
};

export const formatNutritionValue = (value: number, unit: string): string => {
  if (value < 1 && value > 0) {
    return `${value.toFixed(1)}${unit}`;
  }
  return `${Math.round(value)}${unit}`;
};

export const formatCalories = (calories: number): number => {
  return Math.round(calories);
};

export const roundNutritionValue = (value: number): number => {
  return Math.round(value);
};

export const calculateFoodEntryNutrition = (entry: FoodEntry) => {
  // Prefer snapshotted data if available, otherwise calculate from variant/food
  const source = entry.calories ? entry : entry.food_variants || entry.foods?.default_variant;

  if (!source) {
    // Return zero for all nutrients if no source is found
    return {
      calories: 0, protein: 0, carbs: 0, fat: 0, saturated_fat: 0,
      polyunsaturated_fat: 0, monounsaturated_fat: 0, trans_fat: 0,
      cholesterol: 0, sodium: 0, potassium: 0, dietary_fiber: 0,
      sugars: 0, vitamin_a: 0, vitamin_c: 0, calcium: 0, iron: 0,
      glycemic_index: 'None', water_ml: 0
    };
  }

  const nutrientValuesPerReferenceSize = {
    calories: Number(source.calories) || 0,
    protein: Number(source.protein) || 0,
    carbs: Number(source.carbs) || 0,
    fat: Number(source.fat) || 0,
    saturated_fat: Number(source.saturated_fat) || 0,
    polyunsaturated_fat: Number(source.polyunsaturated_fat) || 0,
    monounsaturated_fat: Number(source.monounsaturated_fat) || 0,
    trans_fat: Number(source.trans_fat) || 0,
    cholesterol: Number(source.cholesterol) || 0,
    sodium: Number(source.sodium) || 0,
    potassium: Number(source.potassium) || 0,
    dietary_fiber: Number(source.dietary_fiber) || 0,
    sugars: Number(source.sugars) || 0,
    vitamin_a: Number(source.vitamin_a) || 0,
    vitamin_c: Number(source.vitamin_c) || 0,
    calcium: Number(source.calcium) || 0,
    iron: Number(source.iron) || 0,
    glycemic_index: source.glycemic_index,
  };

  const effectiveReferenceSize = Number(source.serving_size) || 100;

  // Calculate total nutrition: (nutrient_value_per_reference_size / effective_reference_size) * quantity_consumed
  return {
    calories: (nutrientValuesPerReferenceSize.calories / effectiveReferenceSize) * entry.quantity,
    protein: (nutrientValuesPerReferenceSize.protein / effectiveReferenceSize) * entry.quantity,
    carbs: (nutrientValuesPerReferenceSize.carbs / effectiveReferenceSize) * entry.quantity,
    fat: (nutrientValuesPerReferenceSize.fat / effectiveReferenceSize) * entry.quantity,
    saturated_fat: (nutrientValuesPerReferenceSize.saturated_fat / effectiveReferenceSize) * entry.quantity,
    polyunsaturated_fat: (nutrientValuesPerReferenceSize.polyunsaturated_fat / effectiveReferenceSize) * entry.quantity,
    monounsaturated_fat: (nutrientValuesPerReferenceSize.monounsaturated_fat / effectiveReferenceSize) * entry.quantity,
    trans_fat: (nutrientValuesPerReferenceSize.trans_fat / effectiveReferenceSize) * entry.quantity,
    cholesterol: (nutrientValuesPerReferenceSize.cholesterol / effectiveReferenceSize) * entry.quantity,
    sodium: (nutrientValuesPerReferenceSize.sodium / effectiveReferenceSize) * entry.quantity,
    potassium: (nutrientValuesPerReferenceSize.potassium / effectiveReferenceSize) * entry.quantity,
    dietary_fiber: (nutrientValuesPerReferenceSize.dietary_fiber / effectiveReferenceSize) * entry.quantity,
    sugars: (nutrientValuesPerReferenceSize.sugars / effectiveReferenceSize) * entry.quantity,
    vitamin_a: (nutrientValuesPerReferenceSize.vitamin_a / effectiveReferenceSize) * entry.quantity,
    vitamin_c: (nutrientValuesPerReferenceSize.vitamin_c / effectiveReferenceSize) * entry.quantity,
    calcium: (nutrientValuesPerReferenceSize.calcium / effectiveReferenceSize) * entry.quantity,
    iron: (nutrientValuesPerReferenceSize.iron / effectiveReferenceSize) * entry.quantity,
    glycemic_index: nutrientValuesPerReferenceSize.glycemic_index, // Pass through glycemic_index
    water_ml: (entry.unit === 'ml' || entry.unit === 'liter' || entry.unit === 'oz') ? entry.quantity : 0, // Assuming water is tracked in ml, liter, or oz
  };
};

export const convertMlToSelectedUnit = (ml: number | null | undefined, unit: 'ml' | 'oz' | 'liter'): number => { // Removed 'cup' from type
  const safeMl = typeof ml === 'number' && !isNaN(ml) ? ml : 0;
  let convertedValue: number;
  switch (unit) {
    case 'oz':
      convertedValue = safeMl / 29.5735;
      break;
    case 'liter':
      convertedValue = safeMl / 1000;
      break;
    case 'ml':
    default:
      convertedValue = safeMl;
      break;
  }

  // Apply decimal formatting based on unit
  return convertedValue; // Return raw converted value
};
