import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, Alert } from 'react-native';
import { loadSessionDraft, clearSessionDraft } from '../services/workoutDraftService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import SessionCard from '../components/SessionCard';
import { useServerConnection, useExerciseHistory } from '../hooks';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { NativeBottomTabScreenProps } from '@bottom-tabs/react-navigation';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type WorkoutsScreenProps = CompositeScreenProps<
  NativeBottomTabScreenProps<TabParamList, 'Workouts'>,
  StackScreenProps<RootStackParamList>
>;

const WorkoutsScreen: React.FC<WorkoutsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const scrollBottomPadding = Math.max(tabBarHeight, insets.bottom) + 16;

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const {
    sessions,
    isLoading,
    isLoadingMore,
    isError,
    refetch,
    loadMore,
    hasMore,
  } = useExerciseHistory({ enabled: isConnected });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleStartWorkout = useCallback(async () => {
    const draft = await loadSessionDraft();
    if (draft && draft.type === 'activity' && draft.exerciseId) {
      Alert.alert('Activity in Progress', 'You have an unsaved activity draft.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard & Start Workout',
          style: 'destructive',
          onPress: async () => {
            await clearSessionDraft();
            navigation.navigate('WorkoutForm');
          },
        },
      ]);
      return;
    }
    if (draft && draft.type === 'workout' && draft.exercises.length > 0) {
      Alert.alert('Resume Workout?', 'You have a workout in progress.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Fresh',
          style: 'destructive',
          onPress: async () => {
            await clearSessionDraft();
            navigation.navigate('WorkoutForm');
          },
        },
        {
          text: 'Resume',
          onPress: () => navigation.navigate('WorkoutForm'),
        },
      ]);
    } else {
      navigation.navigate('WorkoutForm');
    }
  }, [navigation]);

  const handleLogActivity = useCallback(async () => {
    const draft = await loadSessionDraft();
    if (draft && draft.type === 'workout' && draft.exercises.length > 0) {
      Alert.alert('Workout in Progress', 'You have an unsaved workout draft.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard & Log Activity',
          style: 'destructive',
          onPress: async () => {
            await clearSessionDraft();
            navigation.navigate('ActivityForm');
          },
        },
      ]);
      return;
    }
    if (draft && draft.type === 'activity' && draft.exerciseId) {
      Alert.alert('Resume Activity?', 'You have an activity in progress.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Fresh',
          style: 'destructive',
          onPress: async () => {
            await clearSessionDraft();
            navigation.navigate('ActivityForm');
          },
        },
        {
          text: 'Resume',
          onPress: () => navigation.navigate('ActivityForm'),
        },
      ]);
    } else {
      navigation.navigate('ActivityForm');
    }
  }, [navigation]);

  const renderActionButtons = () => (
    <View className="flex-row gap-3 px-4 mb-4">
      <TouchableOpacity
        className="bg-raised rounded-xl py-4 flex-1 items-center flex-row justify-center gap-2"
        onPress={handleStartWorkout}
        activeOpacity={0.7}
      >
        <Icon name="exercise-weights" size={20} color={accentPrimary} />
        <Text className="text-base font-semibold text-text-primary">Start Workout</Text>
      </TouchableOpacity>
      <TouchableOpacity
        className="bg-raised rounded-xl py-4 flex-1 items-center flex-row justify-center gap-2"
        onPress={handleLogActivity}
        activeOpacity={0.7}
      >
        <Icon name="exercise" size={20} color={accentPrimary} />
        <Text className="text-base font-semibold text-text-primary">Log Activity</Text>
      </TouchableOpacity>
    </View>
  );

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Icon name="cloud-offline" size={64} color="#9CA3AF" />
          <Text className="text-text-muted text-lg text-center mt-4">
            No server configured
          </Text>
          <Text className="text-text-muted text-sm text-center mt-2">
            Configure your server connection in Settings to view your workouts.
          </Text>
          <TouchableOpacity
            className="bg-accent-primary rounded-xl py-3 px-6 mt-6"
            onPress={() => navigation.navigate('Tabs', { screen: 'Settings' })}
          >
            <Text className="text-white font-semibold">Go to Settings</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (isLoading || isConnectionLoading) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color={accentPrimary} />
          <Text className="text-text-muted text-base mt-4">Loading workouts...</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <View className="flex-1 items-center justify-center p-8">
          <Icon name="alert-circle" size={64} color="#EF4444" />
          <Text className="text-text-muted text-lg text-center mt-4">
            Failed to load workouts
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

    if (sessions.length === 0) {
      return (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentPrimary} />
          }
        >
          {renderActionButtons()}
          <View className="flex-1 items-center justify-center p-8">
            <Icon name="exercise-default" size={64} color="#9CA3AF" />
            <Text className="text-text-muted text-lg text-center mt-4">
              No workout history yet
            </Text>
            <Text className="text-text-muted text-sm text-center mt-2">
              Start a workout or log an activity to see it here.
            </Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentPrimary} />
        }
      >
        {renderActionButtons()}
        <View className="px-4">
          <Text className="text-lg font-bold text-text-primary mb-3">Recent Activity</Text>
          {sessions.map(session => (
            <SessionCard key={session.id} session={session} />
          ))}
          {hasMore && (
            <TouchableOpacity
              className="bg-raised rounded-xl py-3 items-center mt-1 mb-4"
              onPress={loadMore}
              disabled={isLoadingMore}
              activeOpacity={0.7}
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={accentPrimary} />
              ) : (
                <Text className="text-base font-semibold" style={{ color: accentPrimary }}>
                  Load More
                </Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-4 py-3">
        <Text className="text-2xl font-bold text-text-primary">Workouts</Text>
      </View>
      {renderContent()}
    </View>
  );
};

export default WorkoutsScreen;
