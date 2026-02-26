import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';
import type { FoodEntry } from '../types/foodEntries';
import Icon, { type IconName } from './Icon';
import { MEAL_TYPES, MEAL_CONFIG } from '../constants/meals';

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
    const mealType = entry.meal_type?.toLowerCase() || 'snacks';
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


interface MealSectionProps {
  mealType: string;
  entries: FoodEntry[];
}

const MealSection: React.FC<MealSectionProps> = ({ mealType, entries }) => {
  const navigation = useNavigation<any>();
  const config = MEAL_CONFIG[mealType] || { label: mealType, icon: 'meal-snack' as IconName };
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const totalCalories = entries.reduce((sum, entry) => sum + calculateEntryNutrition(entry).calories, 0);

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name={config.icon} size={18} color={accentPrimary} />
        <Text className="text-base font-bold text-text-primary flex-1">{config.label}</Text>
        {totalCalories > 0 && (
          <View className="bg-accent-primary/10 rounded-full px-2.5 py-0.5">
            <Text className="text-xs text-accent-primary font-semibold">{totalCalories} Cal</Text>
          </View>
        )}
      </View>
      {entries.map((entry, index) => {
        const nutrition = calculateEntryNutrition(entry);
        const name = entry.food_name || 'Unknown food';
        return (
          <TouchableOpacity
            key={entry.id || index}
            className="py-2 flex-row justify-between items-center"
            activeOpacity={0.7}
            onPress={() => navigation.navigate('FoodEntryView', { entry })}
          >
            <Text className="text-md text-text-primary flex-1 mr-2" numberOfLines={1}>
              {name}
              <Text className="text-sm text-text-secondary">
                {' · '}{entry.quantity} {entry.unit}
              </Text>
            </Text>
            <Text className="text-sm text-text-secondary font-medium mr-2">
              {nutrition.calories} Cal
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const FoodSummary: React.FC<FoodSummaryProps> = ({ foodEntries }) => {
  if (foodEntries.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 mt-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">No food entries yet</Text>
      </View>
    );
  }

  const grouped = groupByMealType(foodEntries);
  const mealTypesWithEntries = MEAL_TYPES.filter((mealType) => grouped[mealType].length > 0);
  const hasOther = grouped.other.length > 0;

  if (mealTypesWithEntries.length === 0 && !hasOther) {
    return (
      <View className="bg-surface rounded-xl p-4 mt-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">No food entries yet</Text>
      </View>
    );
  }

  return (
    <View className="gap-2 my-2">
      {mealTypesWithEntries.map((mealType) => (
        <MealSection key={mealType} mealType={mealType} entries={grouped[mealType]} />
      ))}
      {hasOther && (
        <MealSection mealType="other" entries={grouped.other} />
      )}
    </View>
  );
};

export default FoodSummary;
