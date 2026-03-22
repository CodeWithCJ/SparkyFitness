import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { TAB_BAR_HEIGHT } from '../components/CustomTabBar';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import WorkoutCard from '../components/WorkoutCard';
import { useServerConnection, useExerciseHistory } from '../hooks';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useStartExercise } from '../hooks/useStartExercise';
import { normalizeDate, formatDateLabel } from '../utils/dateUtils';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { StackScreenProps } from '@react-navigation/stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { RootStackParamList, TabParamList } from '../types/navigation';
import type { ExerciseSessionResponse } from '@workspace/shared';

type WorkoutsScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Workouts'>,
  StackScreenProps<RootStackParamList>
>;

const WorkoutsScreen: React.FC<WorkoutsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const scrollBottomPadding = TAB_BAR_HEIGHT + insets.bottom + 16;

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { getImageSource } = useExerciseImageSource();
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
      const date = session.entry_date ? normalizeDate(session.entry_date) : '';
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

  const handleAddExercise = useStartExercise({ navigation, entryTarget: 'workout' });

  const [refreshing, setRefreshing] = useState(false);
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
          subtitle="Configure your server connection in Settings to view your workouts."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }), variant: 'primary' }}
        />
      );
    }

    if (isLoading || isConnectionLoading) {
      return <StatusView loading title="Loading workouts..." />;
    }

    if (isError) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title="Failed to load workouts"
          subtitle="Please check your connection and try again."
          action={{ label: 'Retry', onPress: () => refetch(), variant: 'primary' }}
        />
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
          <StatusView
            icon="exercise-default"
            iconColor="#9CA3AF"
            iconSize={64}
            title="No workout history yet"
            subtitle="Start a workout or log an activity to see it here."
          />
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
                  <WorkoutCard session={session} getImageSource={getImageSource} />
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
      <View className="flex-row items-baseline justify-between px-4 pt-4 pb-5">
        <Text className="text-2xl font-bold text-text-primary">Workouts</Text>
        {isConnected && (
          <Button
            variant="header"
            onPress={handleAddExercise}
          >
            <Icon name="add" size={26} color={accentPrimary} />
          </Button>
        )}
      </View>
      {renderContent()}
    </View>
  );
};

export default WorkoutsScreen;
