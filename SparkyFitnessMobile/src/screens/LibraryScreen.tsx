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
import { useNativeIOSTabsActive } from '../services/nativeTabBarPreference';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
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
import {
  isMobileRtl,
  localizeExerciseCategory,
  mobileT,
} from '../localization';

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
  const usesNativeTabs = useNativeIOSTabsActive();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { isNavigationLocked, runNavigationAction } = useNavigationActionGuard(navigation);
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
      <View className="flex-1 bg-background" style={usesNativeTabs ? undefined : { paddingTop: insets.top }}>
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
          iconSize={64}
          title={mobileT('library.noServerTitle')}
          subtitle={mobileT('library.noServerDescription')}
          action={{
            label: mobileT('common.goToSettings'),
            onPress: () => navigation.navigate('Settings'),
            variant: 'primary',
          }}
        />
      </View>
    );
  }

  if (isConnectionLoading) {
    return (
      <View className="flex-1 bg-background" style={usesNativeTabs ? undefined : { paddingTop: insets.top }}>
        <StatusView loading title={mobileT('library.loading')} />
      </View>
    );
  }

  return (
    <ScrollView
        className="flex-1 bg-background"
        style={[{ flex: 1 }, usesNativeTabs ? undefined : { paddingTop: insets.top }]}
        contentContainerStyle={{
          paddingHorizontal: 16,
          ...(!usesNativeTabs ? { paddingTop: 16 } : null),
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
        }}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior={usesNativeTabs ? 'automatic' : 'never'}
        automaticallyAdjustsScrollIndicatorInsets={usesNativeTabs}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={accentColor}
          />
        }
      >
        {!usesNativeTabs && (
          <View className="mb-6">
            <Text className="text-2xl font-bold text-text-primary">
              {mobileT('tabs.library')}
            </Text>
          </View>
        )}

        <View className="mb-3">
          <Text className="text-lg font-semibold text-text-primary">
            {mobileT('library.create')}
          </Text>
        </View>

        <View className="flex-row flex-wrap justify-between mb-6">
          <CreateTile
            icon="food"
            title={mobileT('library.food')}
            subtitle={mobileT('library.manualEntry')}
            disabled={isNavigationLocked}
            onPress={() =>
              runNavigationAction(() =>
                navigation.navigate('FoodForm', { mode: 'create-food', pickerMode: 'library' }),
              )
            }
            className="w-[48%] mb-3"
          />
          <CreateTile
            icon="meal"
            title={mobileT('library.meal')}
            subtitle={mobileT('library.groupFoods')}
            disabled={isNavigationLocked}
            onPress={() => runNavigationAction(() => navigation.navigate('MealAdd'))}
            className="w-[48%] mb-3"
          />
          <CreateTile
            icon="exercise-weights"
            title={mobileT('library.exercise')}
            subtitle={mobileT('library.manualEntry')}
            disabled={isNavigationLocked}
            onPress={() =>
              runNavigationAction(() =>
                navigation.navigate('ExerciseForm', { mode: 'create-exercise' }),
              )
            }
            className="w-[48%] mb-3"
          />
          <CreateTile
            icon="bookmark-filled"
            title={mobileT('library.workoutPreset')}
            subtitle={mobileT('library.exerciseRoutine')}
            disabled={isNavigationLocked}
            onPress={() =>
              runNavigationAction(() =>
                navigation.navigate('WorkoutPresetForm', { mode: 'create-preset' }),
              )
            }
            className="w-[48%] mb-3"
          />
        </View>

        <View className="mb-3">
          <Text className="text-lg font-semibold text-text-primary">
            {mobileT('library.browse')}
          </Text>
        </View>

        <View className="bg-surface rounded-xl mb-6 shadow-sm overflow-hidden">
          <Pressable
            className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => navigation.navigate('FoodsLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">
              {mobileT('library.foods')}
            </Text>
            <View className="flex-row items-center">
              <Text
                className="text-text-secondary text-base"
                style={{ marginEnd: 8 }}
              >
                {foodsCount ?? '—'}
              </Text>
              <Icon
                name={isMobileRtl ? 'chevron-back' : 'chevron-forward'}
                size={20}
                color="#999"
              />
            </View>
          </Pressable>

          <Pressable
            className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => navigation.navigate('MealsLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">
              {mobileT('library.meals')}
            </Text>
            <View className="flex-row items-center">
              <Text
                className="text-text-secondary text-base"
                style={{ marginEnd: 8 }}
              >
                {meals.length}
              </Text>
              <Icon
                name={isMobileRtl ? 'chevron-back' : 'chevron-forward'}
                size={20}
                color="#999"
              />
            </View>
          </Pressable>
          <Pressable
            className="px-4 py-4 flex-row items-center justify-between border-b border-border-subtle"
            onPress={() => navigation.navigate('ExercisesLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">
              {mobileT('library.exercises')}
            </Text>
            <View className="flex-row items-center">
              <Text
                className="text-text-secondary text-base"
                style={{ marginEnd: 8 }}
              >
                {exercisesCount ?? '—'}
              </Text>
              <Icon
                name={isMobileRtl ? 'chevron-back' : 'chevron-forward'}
                size={20}
                color="#999"
              />
            </View>
          </Pressable>
          <Pressable
            className="px-4 py-4 flex-row items-center justify-between"
            onPress={() => navigation.navigate('WorkoutPresetsLibrary')}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-base font-semibold text-text-primary">
              {mobileT('library.workoutPresets')}
            </Text>
            <View className="flex-row items-center">
              <Text
                className="text-text-secondary text-base"
                style={{ marginEnd: 8 }}
              >
                {presetsCount ?? '—'}
              </Text>
              <Icon
                name={isMobileRtl ? 'chevron-back' : 'chevron-forward'}
                size={20}
                color="#999"
              />
            </View>
          </Pressable>
        </View>

        <View className="mb-3">
          <Text className="text-lg font-semibold text-text-primary">
            {mobileT('library.recentlyLogged')}
          </Text>
        </View>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
          {isRecentLoading ? (
            <View className="px-4 py-8 items-center">
              <ActivityIndicator size="small" color="#6B7280" />
              <Text className="text-text-secondary text-sm mt-3">
                {mobileT('library.loadingRecent')}
              </Text>
            </View>
          ) : showRecentError ? (
            <View className="px-4 py-6 items-start">
              <Text className="text-text-secondary text-sm">
                {mobileT('library.recentError')}
              </Text>
              <Button
                variant="link"
                className="px-0 py-0 mt-3"
                textClassName="text-sm"
                onPress={retryRecent}
              >
                {mobileT('common.retry')}
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
                      {localizeExerciseCategory(item.data.category)}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })
          ) : (
            <View className="px-4 py-6">
              <Text className="text-text-primary text-base font-medium">
                {mobileT('library.emptyTitle')}
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                {mobileT('library.emptyDescription')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
  );
};

export default LibraryScreen;
