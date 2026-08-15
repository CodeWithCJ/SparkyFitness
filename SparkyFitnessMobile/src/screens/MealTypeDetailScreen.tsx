import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import ServingAdjustSheet, { type ServingAdjustSheetRef } from '../components/ServingAdjustSheet';
import CopyMealSheet, { type CopyMealSheetRef } from '../components/CopyMealSheet';
import SwipeableFoodRow from '../components/SwipeableFoodRow';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useDailySummary, useServerConnection, useMealTypes } from '../hooks';
import { useCopyFoodEntries } from '../hooks/useCopyFoodEntries';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatDateLabel } from '../utils/dateUtils';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  filterFoodEntriesByMealTypeId,
  getHistoricalMealTypeLabel,
  getMealTypeDisplayLabel,
  getMealPercentage,
} from '../utils/mealNutrition';
import type { RootStackScreenProps } from '../types/navigation';

type MealTypeDetailScreenProps = RootStackScreenProps<'MealTypeDetail'>;

const MealTypeDetailScreen: React.FC<MealTypeDetailScreenProps> = ({ navigation, route }) => {
  const { date, mealType, mealTypeId, mealLabel } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const servingSheetRef = useRef<ServingAdjustSheetRef>(null);
  const copySheetRef = useRef<CopyMealSheetRef>(null);
  const accentColor = useCSSVariable('--color-accent-primary') as string;

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { summary, isLoading, isError, refetch } = useDailySummary({
    date,
    enabled: isConnected,
  });
  const { preferences } = usePreferences({ enabled: isConnected });
  const showNetCarbs = preferences?.show_net_carbs === true;

  const { mealTypes } = useMealTypes();

  const [refreshing, setRefreshing] = useState(false);

  // Resolve the display label from the canonical definition (ownership-aware):
  // a pre-resolved mealLabel wins (Diary sends it), otherwise resolve from the
  // active meal type by id, then fall back to the literal historical name.
  const resolvedType = useMemo(() => {
    if (mealTypeId) {
      return mealTypes.find((m) => m.id === mealTypeId) ?? null;
    }
    return null;
  }, [mealTypeId, mealTypes]);
  const mealTypeName = resolvedType?.name ?? mealType ?? '';
  const label =
    mealLabel ??
    (resolvedType
      ? getMealTypeDisplayLabel(resolvedType)
      : getHistoricalMealTypeLabel(mealTypeName));

  const entries = useMemo(
    () =>
      filterFoodEntriesByMealTypeId(
        summary?.foodEntries ?? [],
        mealTypeId,
        mealTypeName,
        mealTypes,
      ),
    [summary?.foodEntries, mealTypeId, mealTypeName, mealTypes],
  );
  const nutrition = useMemo(() => calculateMealNutrition(entries), [entries]);
  const isSystemMealType = resolvedType ? resolvedType.user_id === null : false;
  const targetCalories = useMemo(() => {
    // Target-calorie percentages are only meaningful for SYSTEM meal types: a
    // custom type named "breakfast" (or a historical group) must never inherit
    // the system Breakfast target calories.
    if (!isSystemMealType || !summary?.goals || !summary?.calorieGoal) return 0;
    const percentage = getMealPercentage(mealTypeName, summary.goals);
    return Math.round((summary.calorieGoal * percentage) / 100);
  }, [isSystemMealType, summary, mealTypeName]);

  const { copyMeal, isPending: isCopying } = useCopyFoodEntries({
    onSuccess: () => copySheetRef.current?.dismiss(),
  });
  // "other" is a synthetic bucket that aggregates every non-standard meal type,
  // so it has no single real meal type to copy from (the server would match
  // nothing). Only offer copy for concrete meal types.
  const canCopy = isConnected && entries.length > 0 && mealTypeName.toLowerCase() !== 'other';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconTone="muted"
          iconSize={64}
          title="No server configured"
          subtitle="Configure your server connection in Settings to view meal nutrition."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title="Loading meal..." />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title="Failed to load meal"
          subtitle="Please check your connection and try again."
          action={{ label: 'Retry', onPress: () => refetch(), variant: 'primary' }}
        />
      );
    }

    if (entries.length === 0) {
      return (
        <StatusView
          icon="food"
          iconTone="muted"
          iconSize={64}
          title={`No ${label.toLowerCase()} foods`}
          subtitle={`${formatDateLabel(date)} has no foods logged for this meal.`}
        />
      );
    }

    return (
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 gap-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      >
        <FoodNutritionSummary
          name={label}
          brand={targetCalories > 0 ? `${formatDateLabel(date)} · Target: ${targetCalories} Cal` : formatDateLabel(date)}
          values={nutrition.values}
          showNetCarbs={showNetCarbs}
          customNutrients={Object.keys(nutrition.customNutrients).length > 0 ? nutrition.customNutrients : null}
          calorieGoal={targetCalories > 0 ? targetCalories : undefined}
        />

        <View className="bg-surface rounded-xl p-4 shadow-sm">
          <View className="flex-row items-center mb-3">
            <Text className="text-base font-bold text-text-secondary flex-1">Foods</Text>
            <Text className="text-xs text-text-muted font-medium">
              {entries.length} {entries.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          {entries.map((entry, index) => (
            <SwipeableFoodRow
              key={entry.id || index}
              entry={entry}
              nutrition={calculateEntryNutrition(entry)}
              onAdjustServing={(foodEntry) => servingSheetRef.current?.present(foodEntry)}
            />
          ))}
        </View>
      </ScrollView>
    );
  };

  const header = useScreenHeader({
    left: { kind: 'back' },
    right: [
      {
        kind: 'icon',
        sfSymbol: 'plus',
        ionicon: 'add',
        role: 'primary',
        onPress: () =>
          navigation.navigate('FoodSearch', {
            date,
            mealTypeId: resolvedType?.id,
          }),
        accessibilityLabel: 'Add Food',
        identifier: 'meal-type-detail-add',
      },
      ...(canCopy
        ? [
            {
              kind: 'icon' as const,
              sfSymbol: 'doc.on.doc',
              ionicon: 'copy-outline',
              role: 'secondary' as const,
              onPress: () => copySheetRef.current?.present(date, mealTypeId ?? null, mealTypeName),
              accessibilityLabel: 'Copy meal to another day',
              identifier: 'meal-type-detail-copy',
            },
          ]
        : []),
    ],
  });

  return (
      <View className="flex-1 bg-background" style={usesNativeHeader ? undefined : { paddingTop: insets.top }}>
        {header}

        {renderContent()}

        <ServingAdjustSheet ref={servingSheetRef} onViewEntry={(entry) => navigation.navigate('FoodEntryView', { entry })} />
        <CopyMealSheet ref={copySheetRef} isPending={isCopying} onCopy={copyMeal} />
      </View>
  );
};

export default MealTypeDetailScreen;
