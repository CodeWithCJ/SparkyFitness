import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import ServingAdjustSheet, { type ServingAdjustSheetRef } from '../components/ServingAdjustSheet';
import SwipeableFoodRow from '../components/SwipeableFoodRow';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useDailySummary, useServerConnection } from '../hooks';
import { formatDateLabel } from '../utils/dateUtils';
import {
  calculateEntryNutrition,
  calculateMealNutrition,
  filterFoodEntriesByMealType,
} from '../utils/mealNutrition';
import { getMealTypeLabel } from '../constants/meals';
import type { RootStackScreenProps } from '../types/navigation';

type MealNutritionScreenProps = RootStackScreenProps<'MealNutrition'>;

const MealNutritionScreen: React.FC<MealNutritionScreenProps> = ({ navigation, route }) => {
  const { date, mealType, mealLabel } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const servingSheetRef = useRef<ServingAdjustSheetRef>(null);
  const accentColor = useCSSVariable('--color-accent-primary') as string;

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { summary, isLoading, isError, refetch } = useDailySummary({
    date,
    enabled: isConnected,
  });

  const [refreshing, setRefreshing] = useState(false);

  const label = mealLabel ?? getMealTypeLabel(mealType);
  const entries = useMemo(
    () => filterFoodEntriesByMealType(summary?.foodEntries ?? [], mealType),
    [summary?.foodEntries, mealType],
  );
  const nutrition = useMemo(() => calculateMealNutrition(entries), [entries]);

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
          title="No server configured"
          subtitle="Configure your server connection in Settings to view meal nutrition."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color={accentColor} />
          <Text className="text-text-muted text-base mt-4">Loading meal...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Icon name="alert-circle" size={64} color="#EF4444" />
          <Text className="text-text-muted text-lg text-center mt-4">
            Failed to load meal
          </Text>
          <Text className="text-text-muted text-sm text-center mt-2">
            Please check your connection and try again.
          </Text>
          <Button
            variant="primary"
            className="px-6 mt-6"
            onPress={() => refetch()}
          >
            Retry
          </Button>
        </View>
      );
    }

    if (entries.length === 0) {
      return (
        <StatusView
          icon="food"
          iconColor="#9CA3AF"
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
          brand={formatDateLabel(date)}
          values={nutrition}
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

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
      </View>

      {renderContent()}

      <ServingAdjustSheet ref={servingSheetRef} onViewEntry={(entry) => navigation.navigate('FoodEntryView', { entry })} />
    </View>
  );
};

export default MealNutritionScreen;
