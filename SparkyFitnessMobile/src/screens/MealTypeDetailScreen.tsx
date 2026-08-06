import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';
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
import { formatLocalizedNumber } from '../localization';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  filterFoodEntriesByMealType,
  getMealPercentage,
  getMealTypeSystemKey,
} from '../utils/mealNutrition';
import type { RootStackScreenProps } from '../types/navigation';

type MealTypeDetailScreenProps = RootStackScreenProps<'MealTypeDetail'>;

const MealTypeDetailScreen: React.FC<MealTypeDetailScreenProps> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const { date, mealType, mealLabel } = route.params;
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const servingSheetRef = useRef<ServingAdjustSheetRef>(null);
  const copySheetRef = useRef<CopyMealSheetRef>(null);
  const accentColor = useCSSVariable('--color-accent-primary') as string;

  const { mealTypes } = useMealTypes();
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { summary, isLoading, isError, refetch } = useDailySummary({
    date,
    enabled: isConnected,
  });
  const { preferences } = usePreferences({ enabled: isConnected });
  const showNetCarbs = preferences?.show_net_carbs === true;

  const [refreshing, setRefreshing] = useState(false);

  const systemMealType = getMealTypeSystemKey(mealType);
  let translatedMealType: string;
  switch (systemMealType) {
    case 'breakfast': translatedMealType = t('mealTypes.breakfast'); break;
    case 'lunch': translatedMealType = t('mealTypes.lunch'); break;
    case 'dinner': translatedMealType = t('mealTypes.dinner'); break;
    case 'snacks': translatedMealType = t('mealTypes.snacks'); break;
    case 'other': translatedMealType = t('mealTypes.other'); break;
    default: translatedMealType = mealType;
  }
  const label = mealLabel ?? translatedMealType;
  const entries = useMemo(
    () => filterFoodEntriesByMealType(summary?.foodEntries ?? [], mealType, mealTypes),
    [summary?.foodEntries, mealType, mealTypes],
  );
  const nutrition = useMemo(() => calculateMealNutrition(entries), [entries]);
  const targetCalories = useMemo(() => {
    if (!summary?.goals || !summary?.calorieGoal) return 0;
    const percentage = getMealPercentage(mealType, summary.goals);
    return Math.round((summary.calorieGoal * percentage) / 100);
  }, [summary, mealType]);

  const { copyMeal, isPending: isCopying } = useCopyFoodEntries({
    onSuccess: () => copySheetRef.current?.dismiss(),
  });
  // "other" is a synthetic bucket that aggregates every non-standard meal type,
  // so it has no single real meal type to copy from (the server would match
  // nothing). Only offer copy for concrete meal types.
  const canCopy = isConnected && entries.length > 0 && mealType !== 'other';

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
           title={t('dashboard.noServerTitle')}
           subtitle={t('foodMeals.noServerMealNutrition')}
           action={{ label: t('dashboard.goToSettings'), onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={t('foodMeals.loadingMeal')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          iconSize={64}
          title={t('foodMeals.failedToLoadMeal')}
          subtitle={t('batch.connectionRetry')}
          action={{ label: t('common.retry'), onPress: () => refetch(), variant: 'primary' }}
        />
      );
    }

    if (entries.length === 0) {
      return (
        <StatusView
          icon="food"
          iconTone="muted"
          iconSize={64}
           title={t('foodMeals.noMealFoods', { meal: label.toLowerCase() })}
           subtitle={t('foodMeals.noFoodsLogged', { date: formatDateLabel(date) })}
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
           brand={targetCalories > 0 ? t('foodMeals.targetCalories', { date: formatDateLabel(date), calories: targetCalories }) : formatDateLabel(date)}
          values={nutrition.values}
          showNetCarbs={showNetCarbs}
          customNutrients={Object.keys(nutrition.customNutrients).length > 0 ? nutrition.customNutrients : null}
          calorieGoal={targetCalories > 0 ? targetCalories : undefined}
        />

        <View className="bg-surface rounded-xl p-4 shadow-sm">
          <View className="flex-row items-center mb-3">
             <Text className="text-base font-bold text-text-secondary flex-1">{t('library.foods')}</Text>
            <Text className="text-xs text-text-muted font-medium">
               {formatLocalizedNumber(entries.length)} {t('mealLibrary.item', { count: entries.length })}
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
    right: canCopy
      ? {
          kind: 'icon',
          sfSymbol: 'doc.on.doc',
          ionicon: 'copy-outline',
          role: 'secondary',
          onPress: () => copySheetRef.current?.present(date, mealType),
           accessibilityLabel: t('foodMeals.copyMealToDay'),
          identifier: 'meal-type-detail-copy',
        }
      : null,
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
