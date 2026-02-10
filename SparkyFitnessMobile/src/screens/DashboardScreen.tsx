import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import { useServerConnection, useDailySummary, usePreferences, useMeasurements, useWaterIntakeMutation } from '../hooks';
import OnboardingModal, { shouldShowOnboardingModal } from '../components/OnboardingModal';
import CalorieRingCard from '../components/CalorieRingCard';
import MacroCard from '../components/MacroCard';
import DateNavigator from '../components/DateNavigator';
import { getActiveServerConfig } from '../services/storage';
import { calculateEffectiveBurned, calculateCalorieBalance } from '../services/calculations';
import { addDays, getTodayDate } from '../utils/dateUtils';
import HydrationGauge from '../components/HydrationGauge';
import ExerciseProgressCard from '../components/ExerciseProgressCard';

const buildEmptyStateSvg = (main: string, subtle: string, medium: string, accent: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 746.83 359.73" opacity=".9">
  <g opacity=".74">
    <circle fill="${main}" opacity=".77" cx="367.15" cy="168.1" r="168.1"/>
    <circle fill="none" stroke="${main}" stroke-miterlimit="10" stroke-width="14" cx="657.93" cy="174.83" r="81.9"/>
    <circle fill="${main}" cx="141.81" cy="313.53" r="13.79"/>
    <circle fill="${main}" cx="70.73" cy="152.49" r="57.76"/>
    <circle fill="${main}" cx="499.07" cy="21.56" r="19.83"/>
    <circle fill="${main}" cx="501.24" cy="324.63" r="21.55"/>
    <circle fill="${accent}" cx="293.87" cy="278.45" r="12.93"/>
    <circle fill="${medium}" cx="361.59" cy="283.6" r="23.98"/>
  </g>
  <g>
    <path fill="none" stroke="${main}" stroke-miterlimit="10" stroke-linecap="round" stroke-width="10" opacity=".5" d="M5,248.26c27.51-34.39,81.15-77.71,132.73-3.44"/>
    <rect fill="${main}" x="495.37" y="105.34" width="224.59" height="65.19" rx="14.44" ry="14.44" transform="translate(46.6 -133.16) rotate(13)"/>
  </g>
  <g>
    <path fill="${main}" d="M341.87,164.2l-21.83-100.16c-3.64-16.69-19.99-27.38-36.74-24.02l-106.7,21.42c-17.14,3.44-28.14,20.26-24.42,37.34l21.83,100.16c3.64,16.69,19.99,27.38,36.74,24.02l106.7-21.42c17.14-3.44,28.14-20.26,24.42-37.34Z"/>
    <rect fill="${main}" opacity=".69" x="597.85" y="286.15" width="65.52" height="65.52" rx="13.29" ry="13.29" transform="translate(407.82 -351.72) rotate(44.8)"/>
  </g>
</svg>`;

interface DashboardScreenProps {
  navigation: { navigate: (screen: string) => void };
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ navigation }) => {
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const [showOnboardingModal, setShowOnboardingModal] = useState<boolean>(false);
  const hasCheckedOnboarding = useRef(false);
  const lastKnownToday = useRef(getTodayDate());

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

  // Check for onboarding on initial mount only
  useEffect(() => {
    const checkOnboarding = async () => {
      if (hasCheckedOnboarding.current) return;
      hasCheckedOnboarding.current = true;

      if (!shouldShowOnboardingModal()) return;

      const activeConfig = await getActiveServerConfig();
      if (!activeConfig) {
        setShowOnboardingModal(true);
      }
    };

    checkOnboarding();
  }, []);

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
  const { increment: incrementWater, decrement: decrementWater, isReady: isWaterReady, unit: waterUnit } = useWaterIntakeMutation({
    date: selectedDate,
  });

  // Get macro colors from CSS variables (theme-aware)
  const [proteinColor, carbsColor, fatColor, fiberColor, progressTrackOverfillColor] = useCSSVariable([
    '--color-macro-protein',
    '--color-macro-carbs',
    '--color-macro-fat',
    '--color-macro-fiber',
    '--color-progress-overfill',
  ]) as [string, string, string, string, string];

  const accentColor = useCSSVariable('--color-accent-primary') as string;

  // Illustration colors (theme-aware)
  const [illustrationMain, illustrationSubtle, illustrationMedium, illustrationAccent] = useCSSVariable([
    '--color-progress-track',
    '--color-border-subtle',
    '--color-border-strong',
    '--color-accent-subtle',
  ]) as [string, string, string, string];

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), refetchPreferences(), refetchMeasurements()]);
    setRefreshing(false);
  }, [refetch, refetchPreferences, refetchMeasurements]);

  // Render content based on state
  const renderContent = () => {
    // No server configured
    if (!isConnectionLoading && !isConnected) {
      return (
        <View className="flex-1 items-center justify-center p-8 shadow-sm">
          <Icon name="cloud-offline" size={64} color="#9CA3AF" />
          <Text className="text-text-muted text-lg text-center mt-4">
            No server configured
          </Text>
          <Text className="text-text-muted text-sm text-center mt-2">
            Configure your server connection in Settings to view your daily summary.
          </Text>
          <TouchableOpacity
            className="bg-accent-primary rounded-xl py-3 px-6 mt-6"
            onPress={() => navigation.navigate('Settings')}
          >
            <Text className="text-white font-semibold">Go to Settings</Text>
          </TouchableOpacity>
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
          <TouchableOpacity
            className="bg-accent-primary rounded-xl py-3 px-6 mt-6"
            onPress={() => refetch()}
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
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
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      >
        <CalorieRingCard
          caloriesConsumed={summary.caloriesConsumed}
          caloriesBurned={totalBurned}
          calorieGoal={summary.calorieGoal}
          remainingCalories={remainingCalories}
          progressPercent={progressPercent}
        />
        {/* Macros Section - 2x2 grid */}
        {summary.foodEntries.length > 0 ? (
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
        ) : (
          <View className="bg-section rounded-xl p-4 mb-2 shadow-sm items-center">
            <SvgXml xml={buildEmptyStateSvg(illustrationMain, illustrationSubtle, illustrationMedium, illustrationAccent)} width="80%" height={100} />
            <Text className="text-sm text-text-muted mt-2">No entries recorded for this day</Text>
          </View>
        )}

        {(summary.exerciseMinutesGoal > 0 || summary.exerciseCaloriesGoal > 0 || summary.exerciseMinutes > 0 || summary.otherExerciseCalories > 0) && (
          <ExerciseProgressCard
            exerciseMinutes={summary.exerciseMinutes}
            exerciseMinutesGoal={summary.exerciseMinutesGoal}
            exerciseCalories={summary.otherExerciseCalories}
            exerciseCaloriesGoal={summary.exerciseCaloriesGoal}
          />
        )}

        <HydrationGauge
          consumed={summary.waterConsumed}
          goal={summary.waterGoal}
          unit={waterUnit}
          onIncrement={isWaterReady ? incrementWater : undefined}
          onDecrement={isWaterReady ? decrementWater : undefined}
          disableDecrement={summary.waterConsumed <= 0}
        />
      </ScrollView>
    );
  };

  const handleOnboardingGoToSettings = () => {
    setShowOnboardingModal(false);
    navigation.navigate('Settings');
  };

  const handleOnboardingDismiss = () => {
    setShowOnboardingModal(false);
  };

  return (
    <View className="flex-1 bg-canvas">
      {!isConnectionLoading && isConnected && (
        <DateNavigator
          title="Dashboard"
          selectedDate={selectedDate}
          onPreviousDay={goToPreviousDay}
          onNextDay={goToNextDay}
          onToday={goToToday}
        />
      )}
      {renderContent()}

      <OnboardingModal
        visible={showOnboardingModal}
        onGoToSettings={handleOnboardingGoToSettings}
        onDismiss={handleOnboardingDismiss}
      />
    </View>
  );
};

export default DashboardScreen;
