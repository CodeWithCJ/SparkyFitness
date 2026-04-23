import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { View, Text, ActivityIndicator, ScrollView, RefreshControl, Platform } from 'react-native';
import Button from '../components/ui/Button';
import { Gesture, GestureDetector, Directions } from 'react-native-gesture-handler';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import DateNavigator from '../components/DateNavigator';
import FoodSummary from '../components/FoodSummary';
import ExerciseSummary from '../components/ExerciseSummary';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import ServingAdjustSheet, { type ServingAdjustSheetRef } from '../components/ServingAdjustSheet';
import EmptyDayIllustration from '../components/EmptyDayIllustration';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useServerConnection, useDailySummary } from '../hooks';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { addDays, getTodayDate } from '../utils/dateUtils';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type DiaryScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Diary'>,
  NativeStackScreenProps<RootStackParamList>
>;

const DiaryScreen: React.FC<DiaryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const lastKnownToday = useRef(getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);
  const servingSheetRef = useRef<ServingAdjustSheetRef>(null);

  useFocusEffect(
    useCallback(() => {
      const today = getTodayDate();
      if (today !== lastKnownToday.current) {
        lastKnownToday.current = today;
        setSelectedDate(today);
      }
    }, [])
  );

  useEffect(() => {
    navigation.setParams({ selectedDate });
  }, [navigation, selectedDate]);

  const goToPreviousDay = useCallback(() => setSelectedDate(prev => addDays(prev, -1)), []);
  const goToNextDay = useCallback(() => setSelectedDate(prev => {
    const today = getTodayDate();
    const next = addDays(prev, 1);
    return next > today ? prev : next;
  }), []);
  const goToToday = useCallback(() => setSelectedDate(getTodayDate()), []);

  const swipeGesture = useMemo(() => Gesture.Race(
    Gesture.Fling().direction(Directions.RIGHT).onEnd(goToPreviousDay).runOnJS(true),
    Gesture.Fling().direction(Directions.LEFT).onEnd(goToNextDay).runOnJS(true),
  ), [goToPreviousDay, goToNextDay]);

  const openCalendar = useCallback(() => calendarRef.current?.present(), []);
  const handleCalendarSelect = useCallback((date: string) => setSelectedDate(date), []);

  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit as 'kg' | 'lbs') ?? 'kg';
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { getImageSource } = useExerciseImageSource();

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { summary, isLoading, isError, refetch } = useDailySummary({
    date: selectedDate,
    enabled: isConnected,
  });

  const accentColor = useCSSVariable('--color-accent-primary') as string;

  const [refreshing, setRefreshing] = useState(false);
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const topSafeAreaStyle = Platform.OS === 'ios' ? { paddingTop: insets.top } : undefined;
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
          subtitle="Configure your server connection in Settings to view your diary."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Settings'), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return (
        <View className="flex-1 items-center justify-center p-8 shadow-sm">
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text className="text-text-muted text-base mt-4">Loading diary...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View className="flex-1 items-center justify-center p-8 shadow-sm">
          <Icon name="alert-circle" size={64} color="#EF4444" />
          <Text className="text-text-muted text-lg text-center mt-4">
            Failed to load diary
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

    if (!summary) {
      return null;
    }

    return (
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 80 + activeWorkoutBarPadding }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      >
        {summary.foodEntries.length === 0 && summary.exerciseEntries.length === 0 ? (
          <>
            <EmptyDayIllustration />
            <Button
              variant="primary"
              className="px-6 mt-4 self-center"
              onPress={() => navigation.navigate('FoodSearch', { date: selectedDate })}
            >
              Add Food
            </Button>
          </>
        ) : (
          <>
            <FoodSummary foodEntries={summary.foodEntries} onAddFood={() => navigation.navigate('FoodSearch', { date: selectedDate })} onAdjustServing={(entry) => servingSheetRef.current?.present(entry)} />
            <ExerciseSummary exerciseEntries={summary.exerciseEntries} entryDate={selectedDate} getImageSource={getImageSource} weightUnit={weightUnit} distanceUnit={distanceUnit} onPressWorkout={(session) => {
              if (session.type === 'preset') {
                navigation.navigate('WorkoutDetail', { session });
              } else {
                navigation.navigate('ActivityDetail', { session });
              }
            }} />
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <GestureDetector gesture={swipeGesture}>
      <View className="flex-1 bg-background" style={topSafeAreaStyle}>
        {!isConnectionLoading && isConnected ? (
          <DateNavigator
            title="Diary"
            selectedDate={selectedDate}
            onPreviousDay={goToPreviousDay}
            onNextDay={goToNextDay}
            onToday={goToToday}
            onDatePress={openCalendar}
            showDateAlways
            skipSafeAreaTop
          />
        ) : !isConnectionLoading && (
          <View className="px-4 pt-4 pb-5">
            <Text className="text-2xl font-bold text-text-primary">Diary</Text>
          </View>
        )}
        {renderContent()}
        <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />
        <ServingAdjustSheet ref={servingSheetRef} onViewEntry={(entry) => navigation.navigate('FoodEntryView', { entry })} />
      </View>
    </GestureDetector>
  );
};

export default DiaryScreen;
