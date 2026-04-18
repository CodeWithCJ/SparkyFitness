import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { FoodEntry } from '../types/foodEntries';
import Icon, { type IconName } from './Icon';
import { MEAL_TYPES, MEAL_CONFIG } from '../constants/meals';
import SwipeableFoodRow from './SwipeableFoodRow';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  onAddFood?: () => void;
  onAdjustServing?: (entry: FoodEntry) => void;
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

export interface EntryNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function calculateEntryNutrition(entry: FoodEntry): EntryNutrition {
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
  onAdjustServing?: (entry: FoodEntry) => void;
}

const MealSection: React.FC<MealSectionProps> = ({ mealType, entries, onAdjustServing }) => {
  const config = MEAL_CONFIG[mealType] || { label: mealType, icon: 'meal-snack' as IconName };
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const totalCalories = entries.reduce((sum, entry) => sum + calculateEntryNutrition(entry).calories, 0);

  return (
    <View className="bg-surface rounded-xl p-4 overflow-hidden shadow-sm">
      <View className="flex-row gap-2 mb-3 items-center">
        <Icon name={config.icon} size={18} color={accentPrimary} />
        <Text className="text-base font-bold text-text-secondary flex-1">{config.label}</Text>
        {totalCalories > 0 && (
          <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
            <Text className="text-xs text-accent-primary font-semibold">{totalCalories} Cal</Text>
          </View>
        )}
      </View>
      {entries.map((entry, index) => {
        const nutrition = calculateEntryNutrition(entry);
        return (
          <SwipeableFoodRow
            key={entry.id || index}
            entry={entry}
            nutrition={nutrition}
            onAdjustServing={onAdjustServing}
          />
        );
      })}
    </View>
  );
};

const FoodSummary: React.FC<FoodSummaryProps> = ({ foodEntries, onAddFood, onAdjustServing }) => {
  if (foodEntries.length === 0) {
    return (
      <Pressable onPress={onAddFood} className="bg-surface rounded-xl p-4 mt-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">Tap to add food</Text>
      </Pressable>
    );
  }

  const grouped = groupByMealType(foodEntries);
  const mealTypesWithEntries = MEAL_TYPES.filter((mealType) => grouped[mealType].length > 0);
  const hasOther = grouped.other.length > 0;

  if (mealTypesWithEntries.length === 0 && !hasOther) {
    return (
      <Pressable onPress={onAddFood} className="bg-surface rounded-xl p-4 mt-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">Tap to add food</Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-2 my-2">
      {mealTypesWithEntries.map((mealType) => (
        <MealSection key={mealType} mealType={mealType} entries={grouped[mealType]} onAdjustServing={onAdjustServing} />
      ))}
      {hasOther && (
        <MealSection mealType="other" entries={grouped.other} onAdjustServing={onAdjustServing} />
      )}
    </View>
  );
};

export default FoodSummary;
