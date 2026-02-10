import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { FoodEntry } from '../types/foodEntries';
import Icon, { type IconName } from './Icon';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

interface MealConfig {
  label: string;
  icon: IconName;
}

const MEAL_CONFIG: Record<string, MealConfig> = {
  breakfast: { label: 'Breakfast', icon: 'meal-breakfast' },
  lunch: { label: 'Lunch', icon: 'meal-lunch' },
  snack: { label: 'Snack', icon: 'meal-snack' },
  dinner: { label: 'Dinner', icon: 'meal-dinner' },
  other: { label: 'Other', icon: 'meal-snack' },
};

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
}

function groupByMealType(entries: FoodEntry[]): Record<string, FoodEntry[]> {
  const grouped: Record<string, FoodEntry[]> = {};
  for (const mealType of MEAL_TYPES) {
    grouped[mealType] = [];
  }
  grouped.other = [];
  for (const entry of entries) {
    const mealType = entry.meal_type?.toLowerCase() || 'snack';
    if (MEAL_TYPES.includes(mealType as (typeof MEAL_TYPES)[number])) {
      grouped[mealType].push(entry);
    } else {
      grouped.other.push(entry);
    }
  }
  return grouped;
}

function calculateEntryValue(value: number | undefined, entry: FoodEntry): number {
  if (value === undefined || !entry.serving_size) return 0;
  return (value * entry.quantity) / entry.serving_size;
}

interface EntryNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

function calculateEntryNutrition(entry: FoodEntry): EntryNutrition {
  return {
    calories: Math.round(calculateEntryValue(entry.calories, entry)),
    protein: Math.round(calculateEntryValue(entry.protein, entry)),
    carbs: Math.round(calculateEntryValue(entry.carbs, entry)),
    fat: Math.round(calculateEntryValue(entry.fat, entry)),
  };
}

// function getDominantMacroColor(
//   nutrition: EntryNutrition,
//   proteinColor: string,
//   carbsColor: string,
//   fatColor: string,
// ): string | null {
//   const proteinCals = nutrition.protein * 4;
//   const carbsCals = nutrition.carbs * 4;
//   const fatCals = nutrition.fat * 9;

//   if (proteinCals === 0 && carbsCals === 0 && fatCals === 0) return null;

//   if (fatCals >= proteinCals && fatCals >= carbsCals) return fatColor;
//   if (proteinCals >= carbsCals) return proteinColor;
//   return carbsColor;
// }

interface MealNutrition {
  totalProteinCals: number;
  totalCarbsCals: number;
  totalFatCals: number;
  totalCals: number;
}

function calculateMealNutrition(entries: FoodEntry[]): MealNutrition {
  let totalProteinCals = 0;
  let totalCarbsCals = 0;
  let totalFatCals = 0;

  for (const entry of entries) {
    const nutrition = calculateEntryNutrition(entry);
    totalProteinCals += nutrition.protein * 4;
    totalCarbsCals += nutrition.carbs * 4;
    totalFatCals += nutrition.fat * 9;
  }

  return {
    totalProteinCals,
    totalCarbsCals,
    totalFatCals,
    totalCals: totalProteinCals + totalCarbsCals + totalFatCals,
  };
}

interface MealMacroBarProps {
  entries: FoodEntry[];
  proteinColor: string;
  carbsColor: string;
  fatColor: string;
}

const MealMacroBar: React.FC<MealMacroBarProps> = ({ entries, proteinColor, carbsColor, fatColor }) => {
  const mealNutrition = calculateMealNutrition(entries);
  if (mealNutrition.totalCals === 0) return null;

  return (
    <View className="flex-row h-2 rounded-full overflow-hidden mb-2 mt-1">
      <View style={{ flex: mealNutrition.totalProteinCals, backgroundColor: proteinColor }} />
      <View style={{ flex: mealNutrition.totalCarbsCals, backgroundColor: carbsColor }} />
      <View style={{ flex: mealNutrition.totalFatCals, backgroundColor: fatColor }} />
    </View>
  );
};

interface MealSectionProps {
  mealType: string;
  entries: FoodEntry[];
}

const MealSection: React.FC<MealSectionProps> = ({ mealType, entries }) => {
  const config = MEAL_CONFIG[mealType] || { label: mealType, icon: 'meal-snack' as IconName };
  const [textSecondary, proteinColor, carbsColor, fatColor] = useCSSVariable([
    '--color-text-secondary',
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
  ]) as [string, string, string, string];

  const totalCalories = entries.reduce((sum, entry) => sum + calculateEntryNutrition(entry).calories, 0);

  return (
    <View>
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name={config.icon} size={18} color={textSecondary} />
        <Text className="text-md font-bold text-text-primary flex-1">{config.label}</Text>
        {totalCalories > 0 && (
          <Text className="text-sm text-text-primary font-semibold">{totalCalories} Cal</Text>
        )}
      </View>
      {entries.length === 0 ? (
        <Text className="text-sm text-text-muted pl-7">No entries</Text>
      ) : (
        <>
          <MealMacroBar entries={entries} proteinColor={proteinColor} carbsColor={carbsColor} fatColor={fatColor} />
          {entries.map((entry, index) => {
            const nutrition = calculateEntryNutrition(entry);
            const name = entry.food_name || 'Unknown food';
            return (
              <View
                key={entry.id || index}
                className="py-1.5 flex-row justify-between items-center"
              >
                <Text className="text-base text-text-primary flex-1 mr-2" numberOfLines={1}>
                  {name}
                  <Text className="text-sm text-text-muted">
                    {' · '}{entry.quantity} {entry.unit}
                  </Text>
                </Text>
                <Text className="text-sm text-text-primary">
                  {nutrition.calories} Cal
                </Text>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
};

const FoodSummary: React.FC<FoodSummaryProps> = ({ foodEntries }) => {
  if (foodEntries.length === 0) {
    return (
      <View className="bg-section rounded-xl p-4 mt-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">No food entries yet</Text>
      </View>
    );
  }

  const grouped = groupByMealType(foodEntries);

  return (
    <View className="bg-section rounded-xl p-4 my-2 gap-6 shadow-sm">
      {MEAL_TYPES.map((mealType, index) => (
        <React.Fragment key={mealType}>
          <MealSection mealType={mealType} entries={grouped[mealType]} />
        </React.Fragment>
      ))}
      {grouped.other.length > 0 && (
        <>
          
          <MealSection mealType="other" entries={grouped.other} />
        </>
      )}
    </View>
  );
};

export default FoodSummary;
