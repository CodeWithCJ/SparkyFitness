import React from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Button from '../components/ui/Button';
import CreateTile from '../components/CreateTile';
import FoodLibraryRow from '../components/FoodLibraryRow';
import MealLibraryRow from '../components/MealLibraryRow';
import StatusView from '../components/StatusView';
import { useFoods, useRecentMeals, useServerConnection } from '../hooks';
import { foodItemToFoodInfo, mealToFoodInfo } from '../types/foodInfo';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type LibraryScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

const LibraryScreen: React.FC<LibraryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { recentFoods, isLoading, isError, refetch } = useFoods({ enabled: isConnected });
  const {
    recentMeals,
    isLoading: isMealsLoading,
    isError: isMealsError,
    refetch: refetchMeals,
  } = useRecentMeals({ enabled: isConnected, limit: 3 });
  const previewMeals = recentMeals.slice(0, 3);
  const previewFoods = recentFoods.slice(0, 3);

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
      >
        <View className="mb-6">
          <Text className="text-2xl font-bold text-text-primary">Library</Text>
        </View>


        <View className="mb-3">
          <Text className="text-lg font-semibold text-text-primary">Create</Text>
        </View>

        <View className="flex-row flex-wrap justify-between mb-3">
          <CreateTile
            icon="meal"
            title="Meal"
            subtitle="Group foods"
            onPress={() => navigation.navigate('MealBuilder')}
            className="w-[48%] mb-3"
          />
          <CreateTile
            icon="food"
            title="Food"
            subtitle="Manual entry"
            onPress={() => navigation.navigate('FoodForm', { mode: 'create-food' })}
            className="w-[48%] mb-3"
          />
        </View>

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-text-primary">Meals</Text>
          <Button
            variant="link"
            className="px-0 py-0"
            textClassName="text-sm"
            onPress={() => navigation.navigate('MealsLibrary')}
          >
            View all
          </Button>
        </View>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm mb-6">
          {isMealsLoading ? (
            <View className="px-4 py-8 items-center">
              <ActivityIndicator size="small" color="#6B7280" />
              <Text className="text-text-secondary text-sm mt-3">
                Loading recent meals...
              </Text>
            </View>
          ) : isMealsError ? (
            <View className="px-4 py-6 items-start">
              <Text className="text-text-secondary text-sm">
                Failed to load your recent meals.
              </Text>
              <Button
                variant="link"
                className="px-0 py-0 mt-3"
                textClassName="text-sm"
                onPress={() => refetchMeals()}
              >
                Retry
              </Button>
            </View>
          ) : previewMeals.length > 0 ? (
            previewMeals.map((meal, index) => (
              <MealLibraryRow
                key={meal.id}
                meal={meal}
                showDivider={index < previewMeals.length - 1}
                onPress={() => navigation.navigate('FoodEntryAdd', { item: mealToFoodInfo(meal) })}
              />
            ))
          ) : (
            <View className="px-4 py-6">
              <Text className="text-text-primary text-base font-medium">
                No recent meals yet
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                Meals you log will appear here for quick access.
              </Text>
            </View>
          )}
        </View>

        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-text-primary">Foods</Text>
          <Button
            variant="link"
            className="px-0 py-0"
            textClassName="text-sm"
            onPress={() => navigation.navigate('FoodsLibrary')}
          >
            View all
          </Button>
        </View>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
          {isLoading ? (
            <View className="px-4 py-8 items-center">
              <ActivityIndicator size="small" color="#6B7280" />
              <Text className="text-text-secondary text-sm mt-3">
                Loading recent foods...
              </Text>
            </View>
          ) : isError ? (
            <View className="px-4 py-6 items-start">
              <Text className="text-text-secondary text-sm">
                Failed to load your recent foods.
              </Text>
              <Button
                variant="link"
                className="px-0 py-0 mt-3"
                textClassName="text-sm"
                onPress={() => refetch()}
              >
                Retry
              </Button>
            </View>
          ) : previewFoods.length > 0 ? (
            previewFoods.map((food, index) => (
              <FoodLibraryRow
                key={food.id}
                food={food}
                showDivider={index < previewFoods.length - 1}
                onPress={() => navigation.navigate('FoodDetail', { item: foodItemToFoodInfo(food) })}
              />
            ))
          ) : (
            <View className="px-4 py-6">
              <Text className="text-text-primary text-base font-medium">
                No recent foods yet
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                Foods you log will appear here for quick access.
              </Text>
            </View>
          )}
        </View>


      </ScrollView>
    </View>
  );
};

export default LibraryScreen;
