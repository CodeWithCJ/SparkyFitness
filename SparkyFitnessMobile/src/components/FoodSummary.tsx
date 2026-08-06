import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';
import type { FoodEntry } from '../types/foodEntries';
import type { DailyGoals } from '../types/goals';
import type { MealType } from '../types/mealTypes';
import Icon, { type IconName } from './Icon';
import SwipeableFoodRow from './SwipeableFoodRow';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  getMealTypeDisplayLabel,
  groupFoodEntriesByMealType,
  getMealPercentage,
  type MealGroup,
} from '../utils/mealNutrition';
import { formatLocalizedNumber } from '../localization';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  mealTypes: MealType[];
  goals?: DailyGoals;
  calorieGoal?: number;
  onAddFood?: () => void;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (mealTypeId: string | null, mealTypeName: string, entries: FoodEntry[]) => void;
}

interface MealSectionProps {
  group: MealGroup;
  goals?: DailyGoals;
  calorieGoal?: number;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (mealTypeId: string | null, mealTypeName: string, entries: FoodEntry[]) => void;
}

function getMealTypeIcon(name: string): IconName {
  const lower = name.toLowerCase();
  if (lower === 'breakfast') return 'meal-breakfast';
  if (lower === 'lunch') return 'meal-lunch';
  if (lower === 'dinner') return 'meal-dinner';
  if (lower === 'snacks' || lower === 'snack') return 'meal-snack';
  return 'meal-snack';
}

const MealSection: React.FC<MealSectionProps> = ({
  group,
  goals,
  calorieGoal,
  onAdjustServing,
  onPressMealType,
}) => {
  const { t } = useTranslation();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const label = getMealTypeDisplayLabel({ name: group.name, user_id: group.user_id }, t);
  // Icons follow the same ownership rule as labels: a custom category named
  // "breakfast" still gets the neutral icon, never the system one.
  const icon = group.isSystem ? getMealTypeIcon(group.name) : 'meal-snack';

  const totalCalories = calculateMealNutrition(group.entries).values.calories;
  const targetCalories = React.useMemo(() => {
    if (!goals || !calorieGoal) return 0;
    const percentage = getMealPercentage(group.name, goals);
    return Math.round((calorieGoal * percentage) / 100);
  }, [goals, calorieGoal, group.name]);

  const headerContent = (
    <>
      <Icon name={icon} size={18} color={accentPrimary} />
      <Text className="text-base font-bold text-text-secondary flex-1">{label}</Text>
      {(totalCalories > 0 || targetCalories > 0) && (
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">
            {formatLocalizedNumber(totalCalories)}
            {targetCalories > 0 ? ` / ${formatLocalizedNumber(targetCalories)}` : ''}{' '}
            {t('units.kcalShort')}
          </Text>
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
          onPress={() => onPressMealType(group.mealTypeId, group.name, group.entries)}
          className="flex-row gap-2 mb-3 items-center"
          accessibilityRole="button"
           accessibilityLabel={t('foodSummary.nutritionBreakdown', { mealType: label })}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View className="flex-row gap-2 mb-3 items-center">
          {headerContent}
        </View>
      )}
      {group.entries.map((entry, index) => {
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

const FoodSummary: React.FC<FoodSummaryProps> = ({
  foodEntries,
  mealTypes,
  goals,
  calorieGoal,
  onAddFood,
  onAdjustServing,
  onPressMealType,
}) => {
  const { t } = useTranslation();
  if (foodEntries.length === 0) {
    return (
      <Pressable
        onPress={onAddFood}
        accessibilityRole="button"
        accessibilityLabel={t('foodSummary.tapToAdd')}
        className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6"
      >
        <Text className="text-text-muted text-base">{t('foodSummary.tapToAdd')}</Text>
      </Pressable>
    );
  }

  const groups = groupFoodEntriesByMealType(foodEntries, mealTypes);
  const visibleGroups = groups.filter((g) => g.entries.length > 0);

  if (visibleGroups.length === 0) {
    return (
      <Pressable
        onPress={onAddFood}
        accessibilityRole="button"
        accessibilityLabel={t('foodSummary.tapToAdd')}
        className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6"
      >
        <Text className="text-text-muted text-base">{t('foodSummary.tapToAdd')}</Text>
      </Pressable>
    );
  }

  return (
    <View className="gap-2 mb-2">
      {visibleGroups.map((group) => (
        <MealSection
          key={group.mealTypeId ?? 'other'}
          group={group}
          goals={goals}
          calorieGoal={calorieGoal}
          onAdjustServing={onAdjustServing}
          onPressMealType={onPressMealType}
        />
      ))}
    </View>
  );
};

export default FoodSummary;
