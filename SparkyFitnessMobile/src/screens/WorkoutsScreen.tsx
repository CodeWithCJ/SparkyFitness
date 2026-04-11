import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, SectionList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import { TAB_BAR_HEIGHT } from '../components/CustomTabBar';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import StatusView from '../components/StatusView';
import WorkoutCard from '../components/WorkoutCard';
import { useServerConnection, useExerciseHistory } from '../hooks';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
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

type SessionSection = { title: string; data: ExerciseSessionResponse[] };

const WorkoutsScreen: React.FC<WorkoutsScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const scrollBottomPadding =
    TAB_BAR_HEIGHT + activeWorkoutBarPadding + insets.bottom + 16;

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { preferences } = usePreferences();
  const weightUnit = (preferences?.default_weight_unit as 'kg' | 'lbs') ?? 'kg';
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
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

  const sections = useMemo(() => {
    const result: SessionSection[] = [];
    const dateMap = new Map<string, ExerciseSessionResponse[]>();

    for (const session of sessions) {
      const date = session.entry_date ? normalizeDate(session.entry_date) : '';
      let group = dateMap.get(date);
      if (!group) {
        group = [];
        dateMap.set(date, group);
        result.push({ title: date ? formatDateLabel(date) : 'Unknown', data: group });
      }
      group.push(session);
    }

    return result;
  }, [sessions]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderItem = useCallback(({ item: session }: { item: ExerciseSessionResponse }) => (
    <TouchableOpacity
      onPress={() => {
        if (session.type === 'preset') {
          navigation.navigate('WorkoutDetail', { session });
        } else {
          navigation.navigate('ActivityDetail', { session });
        }
      }}
      activeOpacity={0.7}
    >
      <WorkoutCard session={session} getImageSource={getImageSource} weightUnit={weightUnit} distanceUnit={distanceUnit} />
    </TouchableOpacity>
  ), [navigation, getImageSource, weightUnit, distanceUnit]);

  const renderSectionHeader = useCallback(({ section }: { section: SessionSection }) => (
    <Text className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2 mt-3">
      {section.title}
    </Text>
  ), []);

  const renderFooter = useCallback(() => {
    if (!hasMore) return null;
    return (
      <Button
        variant="ghost"
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
    );
  }, [hasMore, isLoadingMore, loadMore, accentPrimary]);

  const renderEmpty = useCallback(() => (
    <StatusView
      icon="exercise-default"
      iconColor="#9CA3AF"
      iconSize={64}
      title="No workout history yet"
      subtitle="Start a workout or log an activity to see it here."
    />
  ), []);

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

    return (
      <SectionList
        sections={sections}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: scrollBottomPadding, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentPrimary} />
        }
        stickySectionHeadersEnabled={false}
      />
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-4 pb-5">
        <Text className="text-2xl font-bold text-text-primary">Workouts</Text>
      </View>
      {renderContent()}
    </View>
  );
};

export default WorkoutsScreen;
