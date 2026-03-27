import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, ActivityIndicator, ScrollView, RefreshControl, Pressable, Platform } from 'react-native';
import Button from '../components/ui/Button';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import { useServerConnection, useDailySummary, usePreferences, useMeasurements, useWaterIntakeMutation, useMeasurementsRange } from '../hooks';
import type { StepsRange } from '../hooks';
import CalorieRingCard from '../components/CalorieRingCard';
import MacroCard from '../components/MacroCard';
import DateNavigator from '../components/DateNavigator';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { calculateEffectiveBurned, calculateCalorieBalance } from '../services/calculations';
import { addDays, getTodayDate } from '../utils/dateUtils';
import { weightFromKg } from '../utils/unitConversions';
import HydrationGauge from '../components/HydrationGauge';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import HealthTrendsPager from '../components/HealthTrendsPager';
import ExerciseProgressCard from '../components/ExerciseProgressCard';
import StatusView from '../components/StatusView';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { RootStackParamList, TabParamList } from '../types/navigation';

const RANGE_SEGMENTS: Segment<StepsRange>[] = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
];

type DashboardScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Dashboard'>,
  StackScreenProps<RootStackParamList>
>;

const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const [stepsRange, setStepsRange] = useState<StepsRange>('7d');
  const lastKnownToday = useRef(getTodayDate());
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

  const goToPreviousDay = () => setSelectedDate(prev => addDays(prev, -1));
  const goToNextDay = () => setSelectedDate(prev => {
    const today = getTodayDate();
    const next = addDays(prev, 1);
    return next > today ? prev : next;
  });
  const goToToday = () => setSelectedDate(getTodayDate());
  const openCalendar = useCallback(() => calendarRef.current?.present(), []);
  const handleCalendarSelect = useCallback((date: string) => setSelectedDate(date), []);

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { summary, isLoading, isError, refetch } = useDailySummary({
    date: selectedDate,
    enabled: isConnected,
  });
  const { preferences, isLoading: isPreferencesLoading, isError: isPreferencesError, refetch: refetchPreferences } = usePreferences({
    enabled: isConnected,
  });
  const { measurements, isLoading: isMeasurementsLoading, isError: isMeasurementsError, refetch: refetchMeasurements } = useMeasurements({
    date: selectedDate,
    enabled: isConnected,
  });
  const { increment: incrementWater, decrement: decrementWater, unit: waterUnit, servingVolume, isContainersLoaded } = useWaterIntakeMutation({
    date: selectedDate,
    enabled: isConnected,
  });
  const { stepsData, weightData: rawWeightData, isLoading: isStepsLoading, isError: isStepsError, refetch: refetchSteps } = useMeasurementsRange({
    range: stepsRange,
    enabled: isConnected,
  });

  const weightUnit = preferences?.default_weight_unit ?? 'kg';
  const weightData = useMemo(() => {
    if (weightUnit === 'kg') return rawWeightData;
    return rawWeightData.map(p => ({ ...p, weight: weightFromKg(p.weight, weightUnit) }));
  }, [rawWeightData, weightUnit]);

  // Get macro colors from CSS variables (theme-aware)
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
  const topSafeAreaStyle = Platform.OS === 'ios' ? { paddingTop: insets.top } : undefined;
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchPreferences(), refetchMeasurements(), refetchSteps()]);
    setRefreshing(false);
  }, [refetch, refetchPreferences, refetchMeasurements, refetchSteps]);

  // Render content based on state
  const renderContent = () => {
    // No server configured
    if (!isConnectionLoading && !isConnected) {
      return (
        <View className="flex-1">
          <View className="px-4 pt-4 pb-5">
            <Text className="text-2xl font-bold text-text-primary">Dashboard</Text>
          </View>
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
        <View className="flex-1">
          {!isConnectionLoading && isConnected && (
            <DateNavigator
              title="Dashboard"
              selectedDate={selectedDate}
              onPreviousDay={goToPreviousDay}
              onNextDay={goToNextDay}
              onToday={goToToday}
              onDatePress={openCalendar}
              skipSafeAreaTop
            />
          )}
          <View className="flex-1 items-center justify-center p-8 shadow-sm">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className="text-text-muted text-base mt-4">Loading summary...</Text>
          </View>
        </View>
      );
    }

    // Error state
    if (isError || isPreferencesError || isMeasurementsError) {
      return (
        <View className="flex-1">
          <DateNavigator
            title="Dashboard"
            selectedDate={selectedDate}
            onPreviousDay={goToPreviousDay}
            onNextDay={goToNextDay}
            onToday={goToToday}
            onDatePress={openCalendar}
            skipSafeAreaTop
          />
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
        </View>
      );
    }

    // Data loaded successfully
    if (!summary || !preferences) {
      return null;
    }

    const totalBurned = calculateEffectiveBurned({
      activeCalories: summary.activeCalories,
      otherExerciseCalories: summary.otherExerciseCalories,
      steps: measurements?.steps || 0,
    });

    const { netCalories, remainingCalories } = calculateCalorieBalance({
      calorieGoal: summary.calorieGoal,
      caloriesConsumed: summary.caloriesConsumed,
      caloriesBurned: totalBurned,
    });
    const progressPercent = summary.calorieGoal > 0 ? netCalories / summary.calorieGoal : 0;

    return (
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor || '#3B82F6'} />
        }
      >
        <DateNavigator
          title="Dashboard"
          selectedDate={selectedDate}
          onPreviousDay={goToPreviousDay}
          onNextDay={goToNextDay}
          onToday={goToToday}
          onDatePress={openCalendar}
          skipSafeAreaTop
          skipHorizontalPadding
        />
        {(summary.foodEntries.length > 0 || summary.exerciseEntries.length > 0 || summary.calorieGoal > 0) && (
          <CalorieRingCard
            caloriesConsumed={summary.caloriesConsumed}
            caloriesBurned={totalBurned}
            calorieGoal={summary.calorieGoal}
            remainingCalories={remainingCalories}
            progressPercent={progressPercent}
          />
        )}
        {/* Macros Section - 2x2 grid in one card */}
        {summary.foodEntries.length > 0 ? (
          <View className="bg-surface rounded-xl p-3 mb-3 shadow-sm">
            <Text className="text-md font-bold text-text-secondary mb-2 px-1">Macronutrients</Text>
            <View className="flex-row flex-wrap justify-between">
            <MacroCard
              label="Protein"
              consumed={summary.protein.consumed}
              goal={summary.protein.goal}
              color={proteinColor}
              overfillColor={progressTrackOverfillColor}
            />
            <MacroCard
              label="Carbs"
              consumed={summary.carbs.consumed}
              goal={summary.carbs.goal}
              color={carbsColor}
              overfillColor={progressTrackOverfillColor}
            />
            <MacroCard
              label="Fat"
              consumed={summary.fat.consumed}
              goal={summary.fat.goal}
              color={fatColor}
              overfillColor={progressTrackOverfillColor}
            />
            <MacroCard
              label="Fiber"
              consumed={summary.fiber.consumed}
              goal={summary.fiber.goal}
              color={fiberColor}
              overfillColor={progressTrackOverfillColor}
            />
            </View>
          </View>
        ) : null}

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
          (summary.exerciseMinutesGoal > 0 || summary.exerciseCaloriesGoal > 0 || summary.exerciseMinutes > 0 || summary.otherExerciseCalories > 0 || summary.activeCalories > 0) && (
          <ExerciseProgressCard
            exerciseMinutes={summary.exerciseMinutes}
            exerciseMinutesGoal={summary.exerciseMinutesGoal}
            exerciseCalories={summary.otherExerciseCalories > 0 ? summary.otherExerciseCalories : summary.activeCalories}
            exerciseCaloriesGoal={summary.exerciseCaloriesGoal}
          />
        )}

        <HydrationGauge
          consumed={summary.waterConsumed}
          goal={summary.waterGoal}
          unit={waterUnit}
          containerVolume={servingVolume}
          onIncrement={isContainersLoaded ? incrementWater : undefined}
          onDecrement={isContainersLoaded ? decrementWater : undefined}
          disableDecrement={summary.waterConsumed <= 0}
        />

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

  return (
    <View className="flex-1 bg-background" style={topSafeAreaStyle}>
      {renderContent()}

      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />
    </View>
  );
};

export default DashboardScreen;
