import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl, Alert } from 'react-native';
import { loadDraft, clearDraft } from '../services/workoutDraftService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from 'react-native-bottom-tabs';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import WorkoutCard from '../components/WorkoutCard';
import { useServerConnection, useExerciseHistory } from '../hooks';
import { formatDateLabel } from '../utils/dateUtils';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { NativeBottomTabScreenProps } from '@bottom-tabs/react-navigation';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import type { ExerciseSessionResponse } from '@workspace/shared';

type WorkoutsScreenProps = CompositeScreenProps<
  NativeBottomTabScreenProps<TabParamList, 'Workouts'>,
  StackScreenProps<RootStackParamList>
>;

const WorkoutsScreen: React.FC<WorkoutsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const accentText = useCSSVariable('--color-accent-text') as string;
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

  const groupedSessions = useMemo(() => {
    const groups: { date: string; label: string; sessions: ExerciseSessionResponse[] }[] = [];
    const dateMap = new Map<string, ExerciseSessionResponse[]>();

    for (const session of sessions) {
      const date = session.entry_date?.split('T')[0] ?? '';
      let group = dateMap.get(date);
      if (!group) {
        group = [];
        dateMap.set(date, group);
        groups.push({ date, label: date ? formatDateLabel(date) : 'Unknown', sessions: group });
      }
      group.push(session);
    }

    return groups;
  }, [sessions]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const navigateWithDraftCheck = useCallback(
    async (
      targetScreen: 'WorkoutForm' | 'ActivityForm',
      targetType: 'workout' | 'activity',
    ) => {
      const draft = await loadDraft();
      const conflictType = targetType === 'workout' ? 'activity' : 'workout';
      const targetLabel = targetType === 'workout' ? 'Workout' : 'Activity';
      const conflictLabel = conflictType === 'workout' ? 'Workout' : 'Activity';

      // Check for a conflicting draft type
      const hasConflict =
        draft &&
        draft.type === conflictType &&
        (draft.type === 'workout'
          ? draft.exercises.length > 0
          : draft.exerciseId != null);

      if (hasConflict) {
        Alert.alert(
          `${conflictLabel} in Progress`,
          `You have an unsaved ${conflictLabel.toLowerCase()} draft.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Discard & ${targetType === 'workout' ? 'Start Workout' : 'Log Activity'}`,
              style: 'destructive',
              onPress: async () => {
                await clearDraft();
                navigation.navigate(targetScreen);
              },
            },
          ],
        );
        return;
      }

      // Check for a matching draft type (resume)
      const hasMatchingDraft =
        draft &&
        draft.type === targetType &&
        (draft.type === 'workout'
          ? draft.exercises.length > 0
          : draft.exerciseId != null);

      if (hasMatchingDraft) {
        Alert.alert(
          `Resume ${targetLabel}?`,
          `You have a ${targetLabel.toLowerCase()} in progress.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Start Fresh',
              style: 'destructive',
              onPress: async () => {
                await clearDraft();
                navigation.navigate(targetScreen);
              },
            },
            {
              text: 'Resume',
              onPress: () => navigation.navigate(targetScreen),
            },
          ],
        );
      } else {
        navigation.navigate(targetScreen);
      }
    },
    [navigation],
  );

  const handleStartWorkout = useCallback(
    () => navigateWithDraftCheck('WorkoutForm', 'workout'),
    [navigateWithDraftCheck],
  );

  const handleLogActivity = useCallback(
    () => navigateWithDraftCheck('ActivityForm', 'activity'),
    [navigateWithDraftCheck],
  );

  const renderActionButtons = () => (
    <View className="flex-row gap-3 px-4 mb-4">
      <Button
        variant="primary"
        onPress={handleStartWorkout}
        className="flex-1 flex-row gap-2 py-4"
      >
        <Icon name="exercise-weights" size={20} color={accentText} />
        <Text className="text-base font-semibold text-accent-text">Start Workout</Text>
      </Button>
      <Button
        variant="primary"
        onPress={handleLogActivity}
        className="flex-1 flex-row gap-2 py-4"
      >
        <Icon name="exercise" size={20} color={accentText} />
        <Text className="text-base font-semibold text-accent-text">Log Activity</Text>
      </Button>
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
          <Button
            variant="primary"
            onPress={() => navigation.navigate('Tabs', { screen: 'Settings' })}
            className="px-6 mt-6"
          >
            Go to Settings
          </Button>
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
          <Button
            variant="primary"
            onPress={() => refetch()}
            className="px-6 mt-6"
          >
            Retry
          </Button>
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
          {groupedSessions.map(group => (
            <View key={group.date}>
              <Text className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2 mt-3">
                {group.label}
              </Text>
              {group.sessions.map(session => (
                <TouchableOpacity
                  key={session.id}
                  onPress={() => navigation.navigate('WorkoutDetail', { session })}
                  activeOpacity={0.7}
                >
                  <WorkoutCard session={session} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
          {hasMore && (
            <Button
              variant="secondary"
              onPress={loadMore}
              disabled={isLoadingMore}
              className="mt-1 mb-4"
            >
              {isLoadingMore ? (
                <ActivityIndicator size="small" color={accentPrimary} />
              ) : (
                <Text className="text-base font-semibold" style={{ color: accentPrimary }}>
                  Load More
                </Text>
              )}
            </Button>
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
