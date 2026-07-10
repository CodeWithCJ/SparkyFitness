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
import { useDailySummary, useServerConnection } from '../hooks';
import { useCopyFoodEntries } from '../hooks/useCopyFoodEntries';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatDateLabel } from '../utils/dateUtils';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  filterFoodEntriesByMealType,
} from '../utils/mealNutrition';
import type { RootStackScreenProps } from '../types/navigation';
import {
  formatMobileFoodCount,
  localizeMealType,
  mobileT,
} from '../localization';

type MealTypeDetailScreenProps = RootStackScreenProps<'MealTypeDetail'>;

const MealTypeDetailScreen: React.FC<MealTypeDetailScreenProps> = ({ navigation, route }) => {
  const { date, mealType, mealLabel } = route.params;
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

  const [refreshing, setRefreshing] = useState(false);

  const label = mealLabel ?? localizeMealType(mealType);
  const entries = useMemo(
    () => filterFoodEntriesByMealType(summary?.foodEntries ?? [], mealType),
    [summary?.foodEntries, mealType],
  );
  const nutrition = useMemo(() => calculateMealNutrition(entries), [entries]);

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
          iconColor="#9CA3AF"
          iconSize={64}
          title={mobileT('mealTypeDetail.noServerTitle')}
          subtitle={mobileT('mealTypeDetail.noServerDescription')}
          action={{ label: mobileT('common.goToSettings'), onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title={mobileT('mealTypeDetail.loading')} />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title={mobileT('mealTypeDetail.loadFailed')}
          subtitle={mobileT('mealTypeDetail.loadFailedDescription')}
          action={{
            label: mobileT('common.retry'),
            onPress: () => void refetch(),
            variant: 'primary',
          }}
        />
      );
    }

    if (entries.length === 0) {
      return (
        <StatusView
          icon="food"
          iconColor="#9CA3AF"
          iconSize={64}
          title={mobileT('mealTypeDetail.emptyTitle', { meal: label })}
          subtitle={mobileT('mealTypeDetail.emptyDescription', {
            date: formatDateLabel(date),
          })}
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
          brand={formatDateLabel(date)}
          values={nutrition.values}
          showNetCarbs={showNetCarbs}
          customNutrients={Object.keys(nutrition.customNutrients).length > 0 ? nutrition.customNutrients : null}
        />

        <View className="bg-surface rounded-xl p-4 shadow-sm">
          <View className="flex-row items-center mb-3">
            <Text className="text-base font-bold text-text-secondary flex-1">
              {mobileT('mealTypeDetail.foods')}
            </Text>
            <Text className="text-xs text-text-muted font-medium">
              {formatMobileFoodCount(entries.length)}
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
          accessibilityLabel: mobileT('mealTypeDetail.copyMeal'),
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
