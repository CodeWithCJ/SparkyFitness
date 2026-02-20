import { EMPTY_MEAL_TOTALS } from '@/constants/nutrients';
import i18n from '@/i18n';
import { MealTotals } from '@/pages/Diary/Diary';
import type { FoodEntry, FoodVariant } from '@/types/food';
import { FoodEntryMeal } from '@/types/meal';

// Utility functions for nutrition calculations

export const convertStepsToCalories = (
  steps: number,
  weightKg: number = 70
): number => {
  // More accurate calculation based on weight
  // Formula: steps * 0.04 * (weight in kg / 70)
  const baseCaloriesPerStep = 0.04;
  const weightAdjustment = weightKg / 70;
  return Math.round(steps * baseCaloriesPerStep * weightAdjustment);
};

export const estimateStepsFromWalkingExercise = (
  durationMinutes: number,
  intensity: 'light' | 'moderate' | 'brisk' = 'moderate'
): number => {
  // Estimate steps based on walking duration and intensity
  const stepsPerMinute = {
    light: 80, // slow walk
    moderate: 100, // normal pace
    brisk: 120, // fast walk
  };

  return Math.round(durationMinutes * stepsPerMinute[intensity]);
};

export const calculateNutritionProgress = (
  actual: number,
  goal: number
): number => {
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
  const source = entry.calories
    ? entry
    : entry.food_variants || entry.foods?.default_variant;

  if (!source) {
    // Return zero for all nutrients if no source is found
    return {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      saturated_fat: 0,
      polyunsaturated_fat: 0,
      monounsaturated_fat: 0,
      trans_fat: 0,
      cholesterol: 0,
      sodium: 0,
      potassium: 0,
      dietary_fiber: 0,
      sugars: 0,
      vitamin_a: 0,
      vitamin_c: 0,
      calcium: 0,
      iron: 0,
      glycemic_index: 'None',
      water_ml: 0,
      custom_nutrients: {},
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
    custom_nutrients: source.custom_nutrients || {},
  };

  const effectiveReferenceSize = Number(source.serving_size) || 100;

  // Calculate total nutrition: (nutrient_value_per_reference_size / effective_reference_size) * quantity_consumed
  return {
    calories:
      (nutrientValuesPerReferenceSize.calories / effectiveReferenceSize) *
      entry.quantity,
    protein:
      (nutrientValuesPerReferenceSize.protein / effectiveReferenceSize) *
      entry.quantity,
    carbs:
      (nutrientValuesPerReferenceSize.carbs / effectiveReferenceSize) *
      entry.quantity,
    fat:
      (nutrientValuesPerReferenceSize.fat / effectiveReferenceSize) *
      entry.quantity,
    saturated_fat:
      (nutrientValuesPerReferenceSize.saturated_fat / effectiveReferenceSize) *
      entry.quantity,
    polyunsaturated_fat:
      (nutrientValuesPerReferenceSize.polyunsaturated_fat /
        effectiveReferenceSize) *
      entry.quantity,
    monounsaturated_fat:
      (nutrientValuesPerReferenceSize.monounsaturated_fat /
        effectiveReferenceSize) *
      entry.quantity,
    trans_fat:
      (nutrientValuesPerReferenceSize.trans_fat / effectiveReferenceSize) *
      entry.quantity,
    cholesterol:
      (nutrientValuesPerReferenceSize.cholesterol / effectiveReferenceSize) *
      entry.quantity,
    sodium:
      (nutrientValuesPerReferenceSize.sodium / effectiveReferenceSize) *
      entry.quantity,
    potassium:
      (nutrientValuesPerReferenceSize.potassium / effectiveReferenceSize) *
      entry.quantity,
    dietary_fiber:
      (nutrientValuesPerReferenceSize.dietary_fiber / effectiveReferenceSize) *
      entry.quantity,
    sugars:
      (nutrientValuesPerReferenceSize.sugars / effectiveReferenceSize) *
      entry.quantity,
    vitamin_a:
      (nutrientValuesPerReferenceSize.vitamin_a / effectiveReferenceSize) *
      entry.quantity,
    vitamin_c:
      (nutrientValuesPerReferenceSize.vitamin_c / effectiveReferenceSize) *
      entry.quantity,
    calcium:
      (nutrientValuesPerReferenceSize.calcium / effectiveReferenceSize) *
      entry.quantity,
    iron:
      (nutrientValuesPerReferenceSize.iron / effectiveReferenceSize) *
      entry.quantity,
    glycemic_index: nutrientValuesPerReferenceSize.glycemic_index, // Pass through glycemic_index
    water_ml:
      entry.unit === 'ml' || entry.unit === 'liter' || entry.unit === 'oz'
        ? entry.quantity
        : 0, // Assuming water is tracked in ml, liter, or oz
    custom_nutrients: Object.entries(
      nutrientValuesPerReferenceSize.custom_nutrients
    ).reduce(
      (acc, [key, value]) => {
        acc[key] = (Number(value) / effectiveReferenceSize) * entry.quantity;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
};

export const convertMlToSelectedUnit = (
  ml: number | null | undefined,
  unit: 'ml' | 'oz' | 'liter'
): number => {
  // Removed 'cup' from type
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

export const convertSelectedUnitToMl = (
  value: number,
  unit: 'ml' | 'oz' | 'liter'
): number => {
  switch (unit) {
    case 'oz':
      return value * 29.5735;
    case 'liter':
      return value * 1000;
    case 'ml':
    default:
      return value;
  }
};

export const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
  return unit === 'kcal'
    ? i18n.t('common.kcalUnit', 'kcal')
    : i18n.t('common.kJUnit', 'kJ');
};

export interface CalculatedNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
  custom_nutrients: Record<string, number>;
}

export const calculateNutrition = (
  variant: FoodVariant,
  quantity: number
): CalculatedNutrition | null => {
  if (!variant || !variant.serving_size) {
    return null;
  }

  const ratio = quantity / variant.serving_size;

  const nutrition: CalculatedNutrition = {
    calories: (variant.calories || 0) * ratio,
    protein: (variant.protein || 0) * ratio,
    carbs: (variant.carbs || 0) * ratio,
    fat: (variant.fat || 0) * ratio,
    saturated_fat: (variant.saturated_fat || 0) * ratio,
    polyunsaturated_fat: (variant.polyunsaturated_fat || 0) * ratio,
    monounsaturated_fat: (variant.monounsaturated_fat || 0) * ratio,
    trans_fat: (variant.trans_fat || 0) * ratio,
    cholesterol: (variant.cholesterol || 0) * ratio,
    sodium: (variant.sodium || 0) * ratio,
    potassium: (variant.potassium || 0) * ratio,
    dietary_fiber: (variant.dietary_fiber || 0) * ratio,
    sugars: (variant.sugars || 0) * ratio,
    vitamin_a: (variant.vitamin_a || 0) * ratio,
    vitamin_c: (variant.vitamin_c || 0) * ratio,
    calcium: (variant.calcium || 0) * ratio,
    iron: (variant.iron || 0) * ratio,
    custom_nutrients: {},
  };

  if (variant.custom_nutrients) {
    for (const [key, value] of Object.entries(variant.custom_nutrients)) {
      nutrition.custom_nutrients[key] = (Number(value) || 0) * ratio;
    }
  }

  return nutrition;
};

export const calculateDayTotals = (
  entries: FoodEntry[],
  meals: FoodEntryMeal[]
): MealTotals => {
  if (!entries || !meals || (entries.length === 0 && meals.length === 0)) {
    return EMPTY_MEAL_TOTALS;
  }
  const combinedItems: { nutrition: MealTotals; meal_type: string }[] = [];

  entries.forEach((entry) => {
    const entryNutrition = calculateFoodEntryNutrition(entry); // Assumes this returns kcal
    // calculateFoodEntryNutrition returns custom_nutrients, we need to ensure they are passed along
    combinedItems.push({
      nutrition: {
        ...entryNutrition,
        // Explicitly ensure custom_nutrients are carried over if calculateFoodEntryNutrition returns them
        custom_nutrients: entryNutrition.custom_nutrients || {},
      },
      meal_type: entry.meal_type,
    });
  });

  meals.forEach((meal) => {
    // For FoodEntryMeal, its aggregated nutritional data is directly available (assumed to be in kcal)
    // Note: The backend already scales component food entries by the meal quantity when creating,
    // and aggregates those scaled values. Do NOT multiply by quantity again here.
    combinedItems.push({
      nutrition: {
        calories: meal.calories || 0, // kcal - already aggregated with quantity
        protein: meal.protein || 0,
        carbs: meal.carbs || 0,
        fat: meal.fat || 0,
        dietary_fiber: meal.dietary_fiber || 0,
        sugars: meal.sugars || 0,
        sodium: meal.sodium || 0,
        cholesterol: meal.cholesterol || 0,
        saturated_fat: meal.saturated_fat || 0,
        monounsaturated_fat: meal.monounsaturated_fat || 0,
        polyunsaturated_fat: meal.polyunsaturated_fat || 0,
        trans_fat: meal.trans_fat || 0,
        potassium: meal.potassium || 0,
        vitamin_a: meal.vitamin_a || 0,
        vitamin_c: meal.vitamin_c || 0,
        iron: meal.iron || 0,
        calcium: meal.calcium || 0,
        custom_nutrients:
          (meal.custom_nutrients as Record<string, number>) || {},
      },
      meal_type: meal.meal_type,
    });
  });

  const totals = combinedItems.reduce(
    (acc, item) => {
      Object.keys(acc).forEach((key) => {
        if (key === 'custom_nutrients') return; // Handle separately

        const k = key as keyof MealTotals;
        const val = item.nutrition[k];

        // Safely add numbers, ignoring other types
        if (typeof val === 'number') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (acc as any)[key] += val;
        }
      });

      // Aggregate custom nutrients
      if (item.nutrition.custom_nutrients && acc.custom_nutrients) {
        Object.entries(item.nutrition.custom_nutrients).forEach(
          ([name, value]) => {
            acc.custom_nutrients![name] =
              (acc.custom_nutrients![name] || 0) + (value as number);
          }
        );
      }

      return acc;
    },
    {
      calories: 0, // kcal
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
      custom_nutrients: {} as Record<string, number>,
    }
  );

  return totals;
};

export const getMealTotals = (
  mealType: string,
  foodEntries: FoodEntry[],
  foodEntryMeals: FoodEntryMeal[]
): MealTotals => {
  if (
    !foodEntries ||
    !foodEntryMeals ||
    (foodEntries.length === 0 && foodEntryMeals.length === 0)
  ) {
    return EMPTY_MEAL_TOTALS;
  }
  const entries = foodEntries.filter((entry) => entry.meal_type === mealType);
  const meals = foodEntryMeals.filter((meal) => meal.meal_type === mealType);

  const combinedItems: (FoodEntry | FoodEntryMeal)[] = [...entries, ...meals];

  const totals = combinedItems.reduce(
    (acc, item) => {
      const itemNutrition = getEntryNutrition(item);
      Object.keys(acc).forEach((key) => {
        if (key === 'custom_nutrients') return; // Handle separately

        const k = key as keyof MealTotals;
        const val = itemNutrition[k];

        if (typeof val === 'number') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (acc as any)[key] += val;
        }
      });

      // Aggregate custom nutrients
      if (itemNutrition.custom_nutrients && acc.custom_nutrients) {
        Object.entries(itemNutrition.custom_nutrients).forEach(
          ([name, value]) => {
            acc.custom_nutrients![name] =
              (acc.custom_nutrients![name] || 0) + (value as number);
          }
        );
      }

      return acc;
    },
    {
      calories: 0, // kcal
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
      custom_nutrients: {} as Record<string, number>,
    }
  );
  return totals;
};

export const getEntryNutrition = (
  item: FoodEntry | FoodEntryMeal
): MealTotals => {
  let nutrition: MealTotals;
  if ('foods' in item) {
    // It's a FoodEntryMeal, use its aggregated properties (assumed to be in kcal)
    // Note: The backend already scales component food entries by the meal quantity when creating,
    // and aggregates those scaled values. Do NOT multiply by quantity again here.
    nutrition = {
      calories: item.calories || 0, // kcal - already aggregated with quantity
      protein: item.protein || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      dietary_fiber: item.dietary_fiber || 0,
      sugars: item.sugars || 0,
      sodium: item.sodium || 0,
      cholesterol: item.cholesterol || 0,
      saturated_fat: item.saturated_fat || 0,
      monounsaturated_fat: item.monounsaturated_fat || 0,
      polyunsaturated_fat: item.polyunsaturated_fat || 0,
      trans_fat: item.trans_fat || 0,
      potassium: item.potassium || 0,
      vitamin_a: item.vitamin_a || 0,
      vitamin_c: item.vitamin_c || 0,
      iron: item.iron || 0,
      calcium: item.calcium || 0,
      custom_nutrients: (item.custom_nutrients as Record<string, number>) || {},
    };
  } else {
    // It's a FoodEntry
    const calculated = calculateFoodEntryNutrition(item);
    nutrition = {
      ...calculated,
      custom_nutrients: calculated.custom_nutrients || {},
    };
  }
  return nutrition;
};

export const getMealData = (
  mealType: string,
  foodEntries: FoodEntry[],
  foodEntryMeals: FoodEntryMeal[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  goals: any
): {
  name: string;
  type: string;
  entries: (FoodEntry | FoodEntryMeal)[];
  targetCalories: number;
} => {
  if (!foodEntries || !foodEntryMeals) {
    return { name: '', type: '', targetCalories: 0, entries: [] };
  }

  // Filter both standalone food entries and food entry meals
  const entries =
    foodEntries.length !== 0
      ? foodEntries.filter((entry) => entry.meal_type === mealType)
      : [];
  const meals =
    foodEntryMeals.length !== 0
      ? foodEntryMeals.filter((meal) => meal.meal_type === mealType)
      : [];

  const combinedEntries: (FoodEntry | FoodEntryMeal)[] = [...entries, ...meals];

  const percentageKey = `${mealType.toLowerCase()}_percentage`;

  const percentage = goals ? goals[percentageKey] || 0 : 0;

  let displayName = mealType;
  if (mealType.toLowerCase() === 'breakfast')
    displayName = i18n.t('common.breakfast', 'Breakfast');
  else if (mealType.toLowerCase() === 'lunch')
    displayName = i18n.t('common.lunch', 'Lunch');
  else if (mealType.toLowerCase() === 'dinner')
    displayName = i18n.t('common.dinner', 'Dinner');
  else if (mealType.toLowerCase() === 'snacks')
    displayName = i18n.t('common.snacks', 'Snacks');

  return {
    name: displayName,
    type: mealType,
    entries: combinedEntries,
    targetCalories: goals ? (goals.calories * percentage) / 100 : 0,
  };
};
