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
import SegmentedControl from './SegmentedControl';
import { usePreferences } from '../hooks/usePreferences';
import {
  useAppPreferencesStore,
  type DiaryViewMode,
} from '../stores/appPreferencesStore';
import { formatTimeLabel } from '../utils/entryTimeDisplay';
import { buildTimelineGroups, hourSlotTime } from '../utils/diaryTimeline';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  getMealGroupLabel,
  groupFoodEntriesByMealType,
  getMealTargetCalories,
  type MealGroup,
} from '../utils/mealNutrition';

interface FoodSummaryProps {
  foodEntries: FoodEntry[];
  mealTypes: MealType[];
  goals?: DailyGoals;
  calorieGoal?: number;
  onAddFood?: () => void;
  /** Timeline quick add at an hour slot (HH:MM). */
  onAddFoodAt?: (time: string) => void;
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
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6"
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

  const totalCalories = calculateMealNutrition(group.entries).values.calories;
  const targetCalories = React.useMemo(
    () => getMealTargetCalories(group.name, group.isSystem, goals, calorieGoal),
    [group.isSystem, group.name, goals, calorieGoal]
  );

  const headerContent = (
    <>
      <Icon name={icon} size={18} color={accentPrimary} />
      <Text className="text-base font-bold text-text-secondary flex-1">
        {label}
      </Text>
      {(totalCalories > 0 || targetCalories > 0) && (
        <View className="bg-accent-primary/5 rounded-full px-2.5 py-0.5">
          <Text className="text-xs text-accent-primary font-semibold">
            {totalCalories}
            {targetCalories > 0 ? ` / ${targetCalories}` : ''}{' '}
            {t('foodSummary.caloriesUnit', { defaultValue: 'Cal' })}
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

interface FoodTimelineProps {
  foodEntries: FoodEntry[];
  mealTypes: MealType[];
  onAddFoodAt?: (time: string) => void;
  onAdjustServing?: (entry: FoodEntry) => void;
}

const FoodTimeline: React.FC<FoodTimelineProps> = ({
  foodEntries,
  mealTypes,
  onAddFoodAt,
  onAdjustServing,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const groups = React.useMemo(
    () => buildTimelineGroups(foodEntries, mealTypes),
    [foodEntries, mealTypes]
  );

  return (
    <View className="bg-surface rounded-xl p-4 overflow-hidden shadow-sm gap-3">
      {groups.map((group) => {
        const slot = group.hour === null ? null : hourSlotTime(group.hour);
        const label = slot
          ? (formatTimeLabel(slot, preferences?.time_format) ?? slot)
          : t('diary.timeline.noTime', { defaultValue: 'No time' });
        return (
          <View key={slot ?? 'untimed'}>
            <View className="flex-row items-center mb-1">
              <Text className="text-xs font-semibold uppercase text-text-muted flex-1">
                {label}
              </Text>
              {slot && onAddFoodAt && (
                <Pressable
                  onPress={() => onAddFoodAt(slot)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('diary.timeline.addAt', {
                    defaultValue: 'Add food at {{time}}',
                    time: label,
                  })}
                >
                  <Icon name="add" size={18} color={accentPrimary} />
                </Pressable>
              )}
            </View>
            <View className="border-l border-border-subtle pl-3">
              {group.items.map(({ entry }, index) => (
                <SwipeableFoodRow
                  key={entry.id || index}
                  entry={entry}
                  nutrition={calculateEntryNutrition(entry)}
                  onAdjustServing={onAdjustServing}
                />
              ))}
            </View>
          </View>
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
  onAddFoodAt,
  onAdjustServing,
  onPressMealType,
}) => {
  const { t } = useTranslation();
  const viewMode = useAppPreferencesStore((s) => s.diaryViewMode);
  const setViewMode = useAppPreferencesStore((s) => s.setDiaryViewMode);

  if (foodEntries.length === 0) {
    return <EmptyState onAddFood={onAddFood} />;
  }

  const viewToggle = (
    <SegmentedControl<DiaryViewMode>
      segments={[
        {
          key: 'meals',
          label: t('diary.view.meals', { defaultValue: 'Meals' }),
        },
        {
          key: 'timeline',
          label: t('diary.view.timeline', { defaultValue: 'Timeline' }),
        },
      ]}
      activeKey={viewMode}
      onSelect={setViewMode}
    />
  );

  if (viewMode === 'timeline') {
    return (
      <View className="gap-2 mb-2">
        {viewToggle}
        <FoodTimeline
          foodEntries={foodEntries}
          mealTypes={mealTypes}
          onAddFoodAt={onAddFoodAt}
          onAdjustServing={onAdjustServing}
        />
      </View>
    );
  }

  // groupFoodEntriesByMealType only creates groups that have entries, so the
  // previous visibleGroups re-filter was redundant.
  const groups = groupFoodEntriesByMealType(foodEntries, mealTypes);

  if (groups.length === 0) {
    return <EmptyState onAddFood={onAddFood} />;
  }

  return (
    <View className="gap-2 mb-2">
      {viewToggle}
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
