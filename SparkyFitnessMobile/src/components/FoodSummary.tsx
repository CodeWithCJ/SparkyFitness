import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { FoodEntry } from '../types/foodEntries';
import Icon, { type IconName } from './Icon';
import { MEAL_TYPES, MEAL_CONFIG } from '../constants/meals';
import SwipeableFoodRow from './SwipeableFoodRow';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  groupFoodEntriesByMealType,
  type MealTypeKey,
} from '../utils/mealNutrition';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  onAddFood?: () => void;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (mealType: MealTypeKey, entries: FoodEntry[]) => void;
}

interface MealSectionProps {
  mealType: MealTypeKey;
  entries: FoodEntry[];
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (mealType: MealTypeKey, entries: FoodEntry[]) => void;
}

const MealSection: React.FC<MealSectionProps> = ({ mealType, entries, onAdjustServing, onPressMealType }) => {
  const config = MEAL_CONFIG[mealType] || { label: mealType, icon: 'meal-snack' as IconName };
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const totalCalories = calculateMealNutrition(entries).calories;
  const headerContent = (
    <>
      <Icon name={config.icon} size={18} color={accentPrimary} />
      <Text className="text-base font-bold text-text-secondary flex-1">{config.label}</Text>
      {totalCalories > 0 && (
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">{totalCalories} Cal</Text>
        </View>
      )}
      {onPressMealType && (
        <Icon name="chevron-forward" size={14} color={accentPrimary} />
      )}
    </>
  );

  return (
    <View className="bg-surface rounded-xl p-4 overflow-hidden shadow-sm">
      {onPressMealType ? (
        <Pressable
          onPress={() => onPressMealType(mealType, entries)}
          className="flex-row gap-2 mb-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={`${config.label} nutrition breakdown`}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View className="flex-row gap-2 mb-3 items-center">
          {headerContent}
        </View>
      )}
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

const FoodSummary: React.FC<FoodSummaryProps> = ({ foodEntries, onAddFood, onAdjustServing, onPressMealType }) => {
  if (foodEntries.length === 0) {
    return (
      <Pressable onPress={onAddFood} className="bg-surface rounded-xl p-4 mt-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">Tap to add food</Text>
      </Pressable>
    );
  }

  const grouped = groupFoodEntriesByMealType(foodEntries);
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
        <MealSection
          key={mealType}
          mealType={mealType}
          entries={grouped[mealType]}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
        />
      ))}
      {hasOther && (
        <MealSection
          mealType="other"
          entries={grouped.other}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
        />
      )}
    </View>
  );
};

export default FoodSummary;
