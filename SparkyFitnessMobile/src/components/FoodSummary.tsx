import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { FoodEntry } from '../types/foodEntries';
import type { DailyGoals } from '../types/goals';
import type { MealType } from '../types/mealTypes';
import Icon from './Icon';
import { MEAL_CONFIG } from '../constants/meals';
import SwipeableFoodRow from './SwipeableFoodRow';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  getMealGroupLabel,
  groupFoodEntriesByMealType,
  getMealTargetCalories,
  type MealGroup,
} from '../utils/mealNutrition';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { usePreferences } from '../hooks/usePreferences';
import { formatTimeLabel } from '../utils/entryTimeDisplay';
import { energyUnitLabel, roundedEnergy } from '../utils/energyUnit';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  mealTypes: MealType[];
  goals?: DailyGoals;
  calorieGoal?: number;
  onAddFood?: () => void;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (
    mealTypeId: string | null,
    mealTypeName: string,
    entries: FoodEntry[]
  ) => void;
}

interface MealSectionProps {
  group: MealGroup;
  goals?: DailyGoals;
  calorieGoal?: number;
  onAdjustServing?: (entry: FoodEntry) => void;
  onPressMealType?: (
    mealTypeId: string | null,
    mealTypeName: string,
    entries: FoodEntry[]
  ) => void;
}

const EmptyState: React.FC<{ onAddFood?: () => void }> = ({ onAddFood }) => {
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onAddFood}
      accessibilityRole="button"
      accessibilityLabel={t('foodSummary.tapToAddFood', {
        defaultValue: 'Tap to add food',
      })}
      className="rounded-xl p-4 mb-2 items-center py-6 border border-dashed border-border-strong"
    >
      <Text className="text-text-muted text-base">
        {t('foodSummary.tapToAddFood', { defaultValue: 'Tap to add food' })}
      </Text>
    </Pressable>
  );
};

const MealSection: React.FC<MealSectionProps> = ({
  group,
  goals,
  calorieGoal,
  onAdjustServing,
  onPressMealType,
}) => {
  const { t } = useTranslation();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const label = getMealGroupLabel(group, t);
  // Single canonical MEAL_CONFIG lookup (read once, reuse both fields). A
  // custom category named "breakfast" still gets the neutral icon, never the
  // system one — ownership is decided by isSystem, not by the name.
  const systemConfig = group.isSystem
    ? MEAL_CONFIG[group.name.toLowerCase()]
    : undefined;
  const icon = systemConfig?.icon ?? 'meal-snack';

  const energyUnit = useEnergyUnit();
  const { preferences } = usePreferences();
  const startTime = formatTimeLabel(
    group.defaultTime,
    preferences?.time_format
  );
  const totalCalories = calculateMealNutrition(group.entries).values.calories;
  const targetCalories = React.useMemo(
    () => getMealTargetCalories(group.name, group.isSystem, goals, calorieGoal),
    [group.isSystem, group.name, goals, calorieGoal]
  );

  const headerContent = (
    <>
      {/* The meal icon sits on the timeline rail that runs past its entries. */}
      <View className="w-9 h-9 rounded-full bg-accent-primary/10 items-center justify-center">
        <Icon name={icon} size={18} color={accentPrimary} />
      </View>
      <View className="flex-1">
        <Text className="text-base font-bold text-text-secondary">{label}</Text>
        {startTime && (
          <Text className="text-xs text-text-muted">
            {t('foodSummary.fromTime', {
              defaultValue: 'from {{time}}',
              time: startTime,
            })}
          </Text>
        )}
      </View>
      {(totalCalories > 0 || targetCalories > 0) && (
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">
            {roundedEnergy(totalCalories, energyUnit)}
            {targetCalories > 0
              ? ` / ${roundedEnergy(targetCalories, energyUnit)}`
              : ''}{' '}
            {energyUnitLabel(energyUnit, t)}
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
          onPress={() =>
            onPressMealType(group.mealTypeId, group.name, group.entries)
          }
          className="flex-row gap-2 mb-3 items-center"
          accessibilityRole="button"
          accessibilityLabel={t('foodSummary.nutritionBreakdown', {
            defaultValue: '{{label}} nutrition breakdown',
            label,
          })}
        >
          {headerContent}
        </Pressable>
      ) : (
        <View className="flex-row gap-2 mb-3 items-center">
          {headerContent}
        </View>
      )}
      <View>
        <View
          className="absolute top-0 bottom-0 bg-border"
          style={{ left: 17.5, width: 1 }}
        />
        {group.entries.map((entry, index) => {
          const nutrition = calculateEntryNutrition(entry);
          return (
            <View key={entry.id || index} className="flex-row items-center">
              <View className="w-9 items-center">
                <View className="w-2.5 h-2.5 rounded-full border-2 border-accent-primary bg-surface" />
              </View>
              <View className="flex-1 ml-2">
                <SwipeableFoodRow
                  entry={entry}
                  nutrition={nutrition}
                  onAdjustServing={onAdjustServing}
                />
              </View>
            </View>
          );
        })}
      </View>
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
  if (foodEntries.length === 0) {
    return <EmptyState onAddFood={onAddFood} />;
  }

  // groupFoodEntriesByMealType only creates groups that have entries, so the
  // previous visibleGroups re-filter was redundant.
  const groups = groupFoodEntriesByMealType(foodEntries, mealTypes);

  if (groups.length === 0) {
    return <EmptyState onAddFood={onAddFood} />;
  }

  return (
    <View className="gap-2 mb-2">
      {groups.map((group) => (
        <MealSection
          key={
            group.mealTypeId
              ? `meal:${group.mealTypeId}`
              : `historical:${group.name.toLowerCase()}`
          }
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
