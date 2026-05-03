import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import CreateTile from '../components/CreateTile';
import FoodLibraryRow from '../components/FoodLibraryRow';
import Icon from '../components/Icon';
import MealLibraryRow from '../components/MealLibraryRow';
import StatusView from '../components/StatusView';
import { useFoods, useMeals, useRecentMeals, useServerConnection, useSuggestedExercises } from '../hooks';
import { fetchExercisesCount } from '../services/api/exerciseApi';
import { fetchFoodsPage } from '../services/api/foodsApi';
import { fetchWorkoutPresetsPage } from '../services/api/workoutPresetsApi';
import type { Exercise } from '../types/exercise';
import { foodItemToFoodInfo } from '../types/foodInfo';
import type { FoodItem } from '../types/foods';
import type { Meal } from '../types/meals';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type LibraryScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

const RECENT_LIMIT = 4;

type RecentItem =
  | { type: 'meal'; data: Meal }
  | { type: 'food'; data: FoodItem }
  | { type: 'exercise'; data: Exercise };

const LibraryScreen: React.FC<LibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const {
    recentFoods,
    isLoading: isFoodsLoading,
    isError: isFoodsError,
    refetch: refetchFoods,
  } = useFoods({ enabled: isConnected });
  const {
    recentMeals,
    isLoading: isRecentMealsLoading,
    isError: isRecentMealsError,
    refetch: refetchRecentMeals,
  } = useRecentMeals({ enabled: isConnected, limit: RECENT_LIMIT });
  const { meals, refetch: refetchMeals } = useMeals({ enabled: isConnected });
  const {
    recentExercises,
    isLoading: isRecentExercisesLoading,
    isError: isRecentExercisesError,
    refetch: refetchRecentExercises,
  } = useSuggestedExercises();
  // Foods count uses the ['foods', ...] prefix so it is invalidated by the
  // existing `foodsQueryKey` invalidations in useSaveFood / useDeleteFood.
  const { data: foodsCount, refetch: refetchFoodsCount } = useQuery({
    queryKey: ['foods', 'count'] as const,
    queryFn: () => fetchFoodsPage({ page: 1, itemsPerPage: 1 }).then((r) => r.pagination.totalCount),
    enabled: isConnected,
    staleTime: 1000 * 60 * 5,
  });
  const { data: exercisesCount, refetch: refetchExercisesCount } = useQuery({
    queryKey: ['exercises', 'count'] as const,
    queryFn: fetchExercisesCount,
    enabled: isConnected,
    staleTime: 1000 * 60 * 5,
  });
  const { data: presetsCount, refetch: refetchPresetsCount } = useQuery({
    queryKey: ['workoutPresets', 'count'] as const,
    queryFn: () =>
      fetchWorkoutPresetsPage({ page: 1, pageSize: 1 }).then((r) => r.pagination.totalCount),
    enabled: isConnected,
    staleTime: 1000 * 60 * 5,
  });

  const onRefresh = useCallback(async () => {
    if (!isConnected) return;
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchFoods(),
        refetchRecentMeals(),
        refetchMeals(),
        refetchFoodsCount(),
        refetchExercisesCount(),
        refetchPresetsCount(),
        refetchRecentExercises(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [
    isConnected,
    refetchFoods,
    refetchRecentMeals,
    refetchMeals,
    refetchFoodsCount,
    refetchExercisesCount,
    refetchPresetsCount,
    refetchRecentExercises,
  ]);

  const recentItems = useMemo<RecentItem[]>(() => {
    const items: RecentItem[] = [];
    let mi = 0;
    let fi = 0;
    let ei = 0;
    while (items.length < RECENT_LIMIT) {
      const hasMeal = mi < recentMeals.length;
      const hasFood = fi < recentFoods.length;
      const hasExercise = ei < recentExercises.length;
      if (!hasMeal && !hasFood && !hasExercise) break;
      if (hasMeal) {
        items.push({ type: 'meal', data: recentMeals[mi++] });
        if (items.length >= RECENT_LIMIT) break;
      }
      if (hasFood) {
        items.push({ type: 'food', data: recentFoods[fi++] });
        if (items.length >= RECENT_LIMIT) break;
      }
      if (hasExercise) items.push({ type: 'exercise', data: recentExercises[ei++] });
    }
    return items;
  }, [recentMeals, recentFoods, recentExercises]);

  const isRecentLoading = isFoodsLoading || isRecentMealsLoading || isRecentExercisesLoading;
  const showRecentError =
    !isRecentLoading
    && recentItems.length === 0
    && (isFoodsError || isRecentMealsError || isRecentExercisesError);

  const retryRecent = () => {
    void refetchFoods();
    void refetchRecentMeals();
    void refetchRecentExercises();
  };

  if (!isConnectionLoading && !isConnected) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
          iconSize={64}
          title="No server configured"
          subtitle="Configure your server connection in Settings to view your library."
          action={{ label: 'Go to Settings', onPress: () => navigation.navigate('Settings'), variant: 'primary' }}
        />
      </View>
    );
  }

  if (isConnectionLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <StatusView loading title="Loading library..." />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
        }}
        contentInsetAdjustmentBehavior="never"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
          />
        }
      >
        <View className="mb-6">
          <Text className="text-2xl font-bold text-text-primary">Library</Text>
        </View>

        <View className="mb-3">
          <Text className="text-lg font-semibold text-text-primary">Create</Text>
        </View>

        <View className="flex-row flex-wrap justify-between mb-6">
          <CreateTile
            icon="food"
            title="Food"
            subtitle="Manual entry"
            onPress={() => navigation.navigate('FoodForm', { mode: 'create-food', pickerMode: 'library' })}
            className="w-[48%] mb-3"
          />
          <CreateTile
            icon="meal"
            title="Meal"
            subtitle="Group foods"
            onPress={() => navigation.navigate('MealAdd')}
            className="w-[48%] mb-3"
          />
          <CreateTile
            icon="exercise-weights"
            title="Exercise"
            subtitle="Manual entry"
            onPress={() => navigation.navigate('ExerciseForm', { mode: 'create-exercise' })}
            className="w-[48%] mb-3"
          />
          <CreateTile
            icon="bookmark-filled"
            title="Preset"
            subtitle="Workout routine"
            onPress={() => navigation.navigate('WorkoutPresetForm', { mode: 'create-preset' })}
            className="w-[48%] mb-3"
          />
        </View>

        <View className="bg-surface rounded-xl mb-6 shadow-sm overflow-hidden">
          <Pressable
            className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => navigation.navigate('FoodsLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">Foods</Text>
            <View className="flex-row items-center">
              <Text className="text-text-secondary text-base mr-2">{foodsCount ?? '—'}</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </View>
          </Pressable>

          <Pressable
            className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => navigation.navigate('MealsLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">Meals</Text>
            <View className="flex-row items-center">
              <Text className="text-text-secondary text-base mr-2">{meals.length}</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </View>
          </Pressable>
          <Pressable
            className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => navigation.navigate('ExercisesLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">Exercises</Text>
            <View className="flex-row items-center">
              <Text className="text-text-secondary text-base mr-2">{exercisesCount ?? '—'}</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </View>
          </Pressable>
          <Pressable
            className="px-4 py-4 flex-row items-center justify-between"
            onPress={() => navigation.navigate('WorkoutPresetsLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">Workout presets</Text>
            <View className="flex-row items-center">
              <Text className="text-text-secondary text-base mr-2">{presetsCount ?? '—'}</Text>
              <Icon name="chevron-forward" size={20} color="#999" />
            </View>
          </Pressable>
        </View>

        <View className="mb-3">
          <Text className="text-lg font-semibold text-text-primary">Recent</Text>
        </View>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
          {isRecentLoading ? (
            <View className="px-4 py-8 items-center">
              <ActivityIndicator size="small" color="#6B7280" />
              <Text className="text-text-secondary text-sm mt-3">
                Loading recent items...
              </Text>
            </View>
          ) : showRecentError ? (
            <View className="px-4 py-6 items-start">
              <Text className="text-text-secondary text-sm">
                Failed to load recent items.
              </Text>
              <Button
                variant="link"
                className="px-0 py-0 mt-3"
                textClassName="text-sm"
                onPress={retryRecent}
              >
                Retry
              </Button>
            </View>
          ) : recentItems.length > 0 ? (
            recentItems.map((item, index) => {
              const showDivider = index < recentItems.length - 1;
              if (item.type === 'meal') {
                return (
                  <MealLibraryRow
                    key={`meal-${item.data.id}`}
                    meal={item.data}
                    showDivider={showDivider}
                    onPress={() =>
                      navigation.navigate('MealDetail', {
                        mealId: item.data.id,
                        initialMeal: item.data,
                      })
                    }
                  />
                );
              }
              if (item.type === 'food') {
                return (
                  <FoodLibraryRow
                    key={`food-${item.data.id}`}
                    food={item.data}
                    showDivider={showDivider}
                    onPress={() =>
                      navigation.navigate('FoodDetail', { item: foodItemToFoodInfo(item.data) })
                    }
                  />
                );
              }
              return (
                <Pressable
                  key={`exercise-${item.data.id}`}
                  className={`px-4 py-3 ${showDivider ? 'border-b border-border-subtle' : ''}`}
                  onPress={() => navigation.navigate('ExerciseDetail', { item: item.data })}
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                >
                  <Text className="text-text-primary text-base font-medium">{item.data.name}</Text>
                  {item.data.category ? (
                    <Text className="text-text-secondary text-sm mt-0.5">
                      {item.data.category}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })
          ) : (
            <View className="px-4 py-6">
              <Text className="text-text-primary text-base font-medium">
                No recent items yet
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                Foods, meals, and exercises you log will appear here for quick access.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default LibraryScreen;
