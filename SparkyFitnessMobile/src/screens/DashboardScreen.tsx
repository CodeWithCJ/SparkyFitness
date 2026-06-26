import React, { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, RefreshControl, Pressable } from 'react-native';
import Button from '../components/ui/Button';
import { useFocusEffect } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';
import { useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import {
  useServerConnection,
  useDailySummary,
  usePreferences,
  useMeasurements,
  useWaterIntakeMutation,
  useMeasurementsRange,
  useWidgetSync,
  useCustomNutrients,
  useNutrientDisplayPreferences,
  fastingRootQueryKey,
} from '../hooks';
import type { StepsRange } from '../hooks';
import CalorieRingCard from '../components/CalorieRingCard';
import MacroCard from '../components/MacroCard';
import DateNavigator from '../components/DateNavigator';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { addDays, getTodayDate } from '../utils/dateUtils';
import {
  setNativeHeaderDatePickerOptions,
  type NativeHeaderDatePickerNavigation,
} from '../utils/nativeHeaderDatePicker';
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { weightFromKg } from '../utils/unitConversions';
import { getNetCarbsValue } from '../utils/nutrientUtils';
import HydrationGauge from '../components/HydrationGauge';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import HealthTrendsPager from '../components/HealthTrendsPager';
import ExerciseProgressCard from '../components/ExerciseProgressCard';
import StatusView from '../components/StatusView';
import FastingCard from '../components/FastingCard';
import FastingGoalReconciler from '../components/FastingGoalReconciler';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useFastingCardVisible } from '../services/fastingCardVisibility';
import { useHydrationCardVisible } from '../services/hydrationCardVisibility';
import { useAskSparkyVisible } from '../services/askSparkyVisibility';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import { NUTRIENT_META } from '../constants/nutrients';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';

const RANGE_SEGMENTS: Segment<StepsRange>[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

type DashboardScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const [stepsRange, setStepsRange] = useState<StepsRange>('7d');
  const lastKnownToday = useRef(getTodayDate());
  const scrollViewRef = useRef<ScrollView>(null);
  const calendarRef = useRef<CalendarSheetRef>(null);

  // Only reset to today when the calendar day has actually changed (midnight rollover)
  useFocusEffect(
    useCallback(() => {
      const today = getTodayDate();
      if (today !== lastKnownToday.current) {
        lastKnownToday.current = today;
        setSelectedDate(today);
      }
    }, [])
  );

  const goToPreviousDay = useCallback(() => setSelectedDate(prev => addDays(prev, -1)), []);
  const goToNextDay = useCallback(() => setSelectedDate(prev => addDays(prev, 1)), []);
  const goToToday = useCallback(() => setSelectedDate(getTodayDate()), []);

  // Re-tapping the active Dashboard tab acts as a quick return to
  // today's summary and the top of the screen.
  useEffect(() => {
    return navigation.addListener('tabPress', () => {
      if (navigation.isFocused()) {
        setSelectedDate(getTodayDate());
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
  }, [navigation]);
  const openCalendar = useCallback(() => calendarRef.current?.present(), []);
  const handleCalendarSelect = useCallback((date: string) => setSelectedDate(date), []);
  const usesNativeTabs = useNativeIOSTabsActive();
  const { defaultColor: nativeHeaderActionColor } = useHeaderActionColors();
  const syncNativeHeaderDatePicker = useCallback(() => {
    if (!usesNativeTabs) return;

    setNativeHeaderDatePickerOptions(
      navigation as unknown as NativeHeaderDatePickerNavigation,
      {
        selectedDate,
        onPreviousDate: goToPreviousDay,
        onDatePress: openCalendar,
        onNextDate: goToNextDay,
        tintColor: nativeHeaderActionColor,
        accessibilityLabel: 'Choose dashboard date',
      },
    );
  }, [
    goToNextDay,
    goToPreviousDay,
    nativeHeaderActionColor,
    navigation,
    openCalendar,
    selectedDate,
    usesNativeTabs,
  ]);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { summary, isLoading, isError, refetch } = useDailySummary({
    date: selectedDate,
    enabled: isConnected,
  });
  const { preferences, isLoading: isPreferencesLoading, isError: isPreferencesError, refetch: refetchPreferences } = usePreferences({
    enabled: isConnected,
  });
  const { isLoading: isMeasurementsLoading, isError: isMeasurementsError, refetch: refetchMeasurements } = useMeasurements({
    date: selectedDate,
    enabled: isConnected,
  });
  const { increment: incrementWater, decrement: decrementWater, unit: waterUnit, servingVolume, isContainersLoaded, containers: waterContainers, activeContainer: activeWaterContainer, selectContainer: selectWaterContainer } = useWaterIntakeMutation({
    date: selectedDate,
    enabled: isConnected,
  });

  const { stepsData, weightData: rawWeightData, isLoading: isStepsLoading, isError: isStepsError, refetch: refetchSteps } = useMeasurementsRange({
    range: stepsRange,
    enabled: isConnected,
  });

  const { customNutrients, refetch: refetchCustomNutrients } = useCustomNutrients({ enabled: isConnected });
  const { summaryNutrients, refetch: refetchNutrientPrefs } = useNutrientDisplayPreferences({ enabled: isConnected });

  useWidgetSync(summary);

  // The chart is a single-axis line graph; if the user picked stones+lbs, plot lbs.
  const weightUnit: 'kg' | 'lbs' =
    (preferences?.default_weight_unit ?? 'kg') === 'kg' ? 'kg' : 'lbs';
  const weightData = useMemo(() => {
    if (weightUnit === 'kg') return rawWeightData;
    return rawWeightData.map(p => ({ ...p, weight: weightFromKg(p.weight, weightUnit) }));
  }, [rawWeightData, weightUnit]);

  // CSS variable macro colors are theme-aware (lower saturation than hardcoded hex)
  const [proteinColor, carbsColor, fatColor, fiberColor, progressTrackOverfillColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-macro-fiber',
    '--color-progress-overfill',
  ]) as [string, string, string, string, string];

  const accentColor = useCSSVariable('--color-accent-primary') as string;

  const [chartPage, setChartPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const fastingCardVisible = useFastingCardVisible();
  const hydrationCardVisible = useHydrationCardVisible();
  const askSparkyVisible = useAskSparkyVisible();

  useLayoutEffect(() => {
    syncNativeHeaderDatePicker();
  }, [syncNativeHeaderDatePicker]);

  useFocusEffect(
    useCallback(() => {
      syncNativeHeaderDatePicker();
    }, [syncNativeHeaderDatePicker])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      refetch(),
      refetchPreferences(),
      refetchMeasurements(),
      refetchSteps(),
      refetchCustomNutrients(),
      refetchNutrientPrefs(),
      // FastingCard owns its own queries; nudge them on pull-to-refresh.
      queryClient.invalidateQueries({ queryKey: fastingRootQueryKey }),
    ]);
    setRefreshing(false);
  }, [refetch, refetchPreferences, refetchMeasurements, refetchSteps, refetchCustomNutrients, refetchNutrientPrefs, queryClient]);

  // Render content based on state
  const renderContent = () => {
    // No server configured
    if (!isConnectionLoading && !isConnected) {
      return (
        <View className="flex-1">
          {!usesNativeTabs && (
            <View className="px-4 pt-4 pb-5">
              <Text className="text-2xl font-bold text-text-primary">Dashboard</Text>
            </View>
          )}
          <StatusView
            icon="cloud-offline"
            iconColor="#9CA3AF"
            iconSize={64}
            title="No server configured"
            subtitle="Configure your server connection in Settings to view your daily summary."
            action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Settings'), variant: 'primary' }}
          />
        </View>
      );
    }

    // Loading state
    if (isLoading || isConnectionLoading || isPreferencesLoading || isMeasurementsLoading) {
      return (
        <View className="flex-1 items-center justify-center p-8 shadow-sm">
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="text-text-muted text-base mt-4">Loading summary...</Text>
        </View>
      );
    }

    // Error state
    if (isError || isPreferencesError || isMeasurementsError) {
      return (
        <View className="flex-1 items-center justify-center p-8 shadow-sm">
          <Icon name="alert-circle" size={64} color="#EF4444" />
          <Text className="text-text-muted text-lg text-center mt-4">
            Failed to load summary
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

    // Data loaded successfully
    if (!summary || !preferences) {
      return null;
    }

    const { eaten, burned, remaining, goal, progress } = summary.calorieBalance;
    const showNetCarbs = preferences.show_net_carbs === true;

    return (
      <ScrollView
        ref={scrollViewRef}
        className="flex-1 bg-background"
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior={usesNativeTabs ? 'automatic' : 'never'}
        automaticallyAdjustsScrollIndicatorInsets={usesNativeTabs}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor || '#3B82F6'} />
        }
      >
        {(summary.foodEntries.length > 0 || summary.exerciseEntries.length > 0 || goal > 0) && (
          <CalorieRingCard
            caloriesConsumed={eaten}
            caloriesBurned={burned}
            calorieGoal={goal}
            remainingCalories={remaining}
            progressPercent={progress / 100}
          />
        )}
        {/* Tap-to-open launcher for the Sparky chat. Styled like an input to
            invite, but it pushes the full chat screen rather than capturing text
            here — the Dashboard's scroll + date-fling gestures make a live input
            on this screen more trouble than it's worth. The composer autofocuses
            on arrival so the affordance is honored immediately. Visibility is a
            local app setting toggled from Dashboard Settings. */}
        {askSparkyVisible && (
          <Pressable
            onPress={() => navigation.navigate('Chat')}
            className="flex-row items-center bg-surface rounded-lg  px-4 py-3 mb-3 shadow-sm"
          >
            <Icon name="sparkles" size={18} color={accentColor} />
            <Text className="text-text-muted text-base ml-3">Ask Sparky…</Text>
          </Pressable>
        )}

        {/* Macros Section — driven by nutrient display preferences (summary/mobile).
            Only the 4 core macros (with goals) and user-defined custom nutrients are
            shown here. Other enabled nutrients (sodium, sugars, etc.) belong in a
            detail view, not the at-a-glance dashboard grid. */}
        {summary.foodEntries.length > 0 && summaryNutrients.length > 0 ? (() => {
          const CORE_MACROS = new Set(['protein', 'carbs', 'fat', 'dietary_fiber']);
          const customNutrientNames = new Set(customNutrients.map((cn) => cn.name));
          const dashboardNutrients = summaryNutrients.filter(
            (key) => CORE_MACROS.has(key) || customNutrientNames.has(key),
          );
          if (dashboardNutrients.length === 0) return null;
          return (
            <View className="bg-surface rounded-xl p-3 mb-3 shadow-sm">
              <Text className="text-md font-bold text-text-secondary mb-2 px-1">Macronutrients</Text>
              <View className="flex-row flex-wrap justify-between">
                {dashboardNutrients.map((nutrientKey) => {
                  // Resolve display label and unit.
                  const meta = NUTRIENT_META[nutrientKey];
                  const customDef = !meta
                    ? customNutrients.find((cn) => cn.name === nutrientKey)
                    : undefined;
                  const label = meta?.label ?? customDef?.name ?? nutrientKey;
                  const unit = meta?.unit ?? customDef?.unit ?? 'g';

                  // Use theme-aware CSS variable colors for the 4 core macros;
                  // custom nutrients fall back to the app accent color.
                  let color: string;
                  if (nutrientKey === 'protein') color = proteinColor;
                  else if (nutrientKey === 'carbs') color = carbsColor;
                  else if (nutrientKey === 'fat') color = fatColor;
                  else if (nutrientKey === 'dietary_fiber') color = fiberColor;
                  else color = accentColor;

                  // Resolve consumed value.
                  let consumed: number;
                  if (nutrientKey === 'carbs' && showNetCarbs) {
                    consumed = getNetCarbsValue(summary.carbs.consumed, summary.fiber.consumed);
                  } else if (nutrientKey === 'protein') {
                    consumed = summary.protein.consumed;
                  } else if (nutrientKey === 'carbs') {
                    consumed = summary.carbs.consumed;
                  } else if (nutrientKey === 'fat') {
                    consumed = summary.fat.consumed;
                  } else if (nutrientKey === 'dietary_fiber') {
                    consumed = summary.fiber.consumed;
                  } else {
                    consumed = summary.customNutrientTotals[nutrientKey] ?? 0;
                  }

                  // Resolve goal. Core macros use their tracked goals; custom
                  // nutrients use their per-nutrient goal when one is set. When a
                  // custom nutrient has no goal, `goal` stays undefined and
                  // MacroCard hides the "/0".
                  let goal: number | undefined;
                  if (nutrientKey === 'protein') goal = summary.protein.goal || undefined;
                  else if (nutrientKey === 'carbs') goal = summary.carbs.goal || undefined;
                  else if (nutrientKey === 'fat') goal = summary.fat.goal || undefined;
                  else if (nutrientKey === 'dietary_fiber') goal = summary.fiber.goal || undefined;
                  else goal = summary.customNutrientGoals[nutrientKey] || undefined;

                  const displayLabel = nutrientKey === 'carbs' && showNetCarbs ? 'Net Carbs' : label;

                  return (
                    <MacroCard
                      key={nutrientKey}
                      label={displayLabel}
                      consumed={consumed}
                      goal={goal}
                      color={color}
                      overfillColor={progressTrackOverfillColor}
                      unit={unit}
                    />
                  );
                })}
              </View>
            </View>
          );
        })() : null}

        {summary.foodEntries.length === 0 && (
          <Pressable
            className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
            onPress={() => navigation.navigate('FoodSearch', { date: selectedDate })}
          >
            <Text className="text-md font-bold text-text-primary mb-4">Food</Text>
            <Text className="text-text-muted text-sm text-center mb-4">Tap to add food</Text>
          </Pressable>
        )}

        {(summary.foodEntries.length > 0 || summary.exerciseEntries.length > 0) &&
          (summary.exerciseMinutesGoal > 0 || summary.exerciseCaloriesGoal > 0 || summary.exerciseMinutes > 0 || summary.otherExerciseCalories > 0) && (
          <ExerciseProgressCard
            exerciseMinutes={summary.exerciseMinutes}
            exerciseMinutesGoal={summary.exerciseMinutesGoal}
            exerciseCalories={summary.otherExerciseCalories}
            exerciseCaloriesGoal={summary.exerciseCaloriesGoal}
          />
        )}

        {/* Hydration card visibility is a local app setting toggled from
            Dashboard Settings. */}
        {hydrationCardVisible && (
          <HydrationGauge
            consumed={summary.waterConsumed}
            goal={summary.waterGoal}
            unit={waterUnit}
            containerVolume={servingVolume}
            onIncrement={isContainersLoaded ? incrementWater : undefined}
            onDecrement={isContainersLoaded ? decrementWater : undefined}
            disableDecrement={summary.waterConsumed <= 0}
            containers={waterContainers}
            activeContainerId={activeWaterContainer?.id}
            onSelectContainer={selectWaterContainer}
          />
        )}

        {/* Goal-notification reconciliation is owned here (headless, always
            mounted) so it survives the card being hidden. Fasting is "now"-based,
            so the card is deliberately date-independent — it always reflects the
            current/active fast regardless of the date navigator. Do not wire it
            to `selectedDate`. Visibility is a local app setting toggled from
            Dashboard Settings. */}
        <FastingGoalReconciler />
        {fastingCardVisible && <FastingCard navigation={navigation} />}

        <Text className="text-text-primary text-xl font-bold mt-2 mb-2">Health Trends</Text>
        <SegmentedControl segments={RANGE_SEGMENTS} activeKey={stepsRange} onSelect={setStepsRange} />

        <HealthTrendsPager
          stepsData={stepsData}
          weightData={weightData}
          isLoading={isStepsLoading}
          isError={isStepsError}
          range={stepsRange}
          weightUnit={weightUnit}
          activePage={chartPage}
          onPageSelected={setChartPage}
        />
      </ScrollView>
    );
  };

  const renderedContent = renderContent();

  if (usesNativeTabs) {
    return (
      <>
        {renderedContent}
        <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />
      </>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {!isConnectionLoading && isConnected ? (
        <DateNavigator
          title="Dashboard"
          selectedDate={selectedDate}
          onPreviousDay={goToPreviousDay}
          onNextDay={goToNextDay}
          onToday={goToToday}
          onDatePress={openCalendar}
          showDateAlways
        />
      ) : null}
      {renderedContent}
      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />
    </View>
  );
};

export default DashboardScreen;
