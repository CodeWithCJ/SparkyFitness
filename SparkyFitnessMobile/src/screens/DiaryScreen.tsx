import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import DateNavigator from '../components/DateNavigator';
import FoodSummary from '../components/FoodSummary';
import ExerciseSummary from '../components/ExerciseSummary';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { useServerConnection, useDailySummary } from '../hooks';
import { addDays, getTodayDate } from '../utils/dateUtils';

interface DiaryScreenProps {
  navigation: { navigate: (screen: string) => void };
}

const DiaryScreen: React.FC<DiaryScreenProps> = ({ navigation }) => {
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const lastKnownToday = useRef(getTodayDate());
  const calendarRef = useRef<CalendarSheetRef>(null);

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

  const accentColor = useCSSVariable('--color-accent-primary') as string;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <View className="flex-1 items-center justify-center p-8 shadow-sm">
          <Icon name="cloud-offline" size={64} color="#9CA3AF" />
          <Text className="text-text-muted text-lg text-center mt-4">
            No server configured
          </Text>
          <Text className="text-text-muted text-sm text-center mt-2">
            Configure your server connection in Settings to view your diary.
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
          <TouchableOpacity
            className="bg-accent-primary rounded-xl py-3 px-6 mt-6"
            onPress={() => refetch()}
          >
            <Text className="text-white font-semibold">Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!summary) {
      return null;
    }

    return (
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      >
        <FoodSummary foodEntries={summary.foodEntries} />
        <ExerciseSummary exerciseEntries={summary.exerciseEntries} />
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background">
      {!isConnectionLoading && isConnected && (
        <DateNavigator
          title="Diary"
          selectedDate={selectedDate}
          onPreviousDay={goToPreviousDay}
          onNextDay={goToNextDay}
          onToday={goToToday}
          onDatePress={openCalendar}
          hideChevrons
          showDateAlways
        />
      )}
      {renderContent()}
      <CalendarSheet ref={calendarRef} selectedDate={selectedDate} onSelectDate={handleCalendarSelect} />
    </View>
  );
};

export default DiaryScreen;
