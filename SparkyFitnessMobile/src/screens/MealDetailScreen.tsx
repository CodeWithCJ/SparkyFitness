import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useDeleteMeal, useMeal, useProfile, useServerConnection } from '../hooks';
import { mealToFoodInfo } from '../types/foodInfo';
import type { FoodDisplayValues } from '../utils/foodDetails';
import type { Meal, MealFood } from '../types/meals';
import type { RootStackScreenProps } from '../types/navigation';

type MealDetailScreenProps = RootStackScreenProps<'MealDetail'>;

type ViewMode = 'perServing' | 'total';

const VIEW_MODE_SEGMENTS: Segment<ViewMode>[] = [
  { key: 'perServing', label: 'Per serving' },
  { key: 'total', label: 'Total' },
];

type MealFoodNumericField = keyof Pick<
  MealFood,
  | 'calories'
  | 'protein'
  | 'carbs'
  | 'fat'
  | 'dietary_fiber'
  | 'saturated_fat'
  | 'sodium'
  | 'sugars'
  | 'trans_fat'
  | 'potassium'
  | 'calcium'
  | 'iron'
  | 'cholesterol'
  | 'vitamin_a'
  | 'vitamin_c'
>;

const ingredientScale = (food: MealFood) =>
  food.serving_size > 0 ? food.quantity / food.serving_size : 0;

const sumMealField = (meal: Meal, field: MealFoodNumericField) =>
  meal.foods.reduce((sum, food) => {
    const value = food[field];
    return typeof value === 'number' ? sum + value * ingredientScale(food) : sum;
  }, 0);

const hasMealField = (meal: Meal, field: MealFoodNumericField) =>
  meal.foods.some((food) => food[field] != null);

const divide = (value: number | undefined, divisor: number) =>
  value == null ? undefined : value / divisor;

function buildMealDisplayValues(meal: Meal, divisor = 1): FoodDisplayValues {
  const safeDivisor = divisor > 0 ? divisor : 1;
  const optionalField = (field: MealFoodNumericField) =>
    hasMealField(meal, field) ? divide(sumMealField(meal, field), safeDivisor) : undefined;

  return {
    servingSize: divisor > 1 ? 1 : meal.serving_size,
    servingUnit: meal.serving_unit,
    calories: sumMealField(meal, 'calories') / safeDivisor,
    protein: sumMealField(meal, 'protein') / safeDivisor,
    carbs: sumMealField(meal, 'carbs') / safeDivisor,
    fat: sumMealField(meal, 'fat') / safeDivisor,
    fiber: optionalField('dietary_fiber'),
    saturatedFat: optionalField('saturated_fat'),
    sodium: optionalField('sodium'),
    sugars: optionalField('sugars'),
    transFat: optionalField('trans_fat'),
    potassium: optionalField('potassium'),
    calcium: optionalField('calcium'),
    iron: optionalField('iron'),
    cholesterol: optionalField('cholesterol'),
    vitaminA: optionalField('vitamin_a'),
    vitaminC: optionalField('vitamin_c'),
  };
}

const MealDetailScreen: React.FC<MealDetailScreenProps> = ({ navigation, route }) => {
  const { mealId, initialMeal } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const [viewMode, setViewMode] = useState<ViewMode>('perServing');

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { profile } = useProfile();
  const { meal, isLoading, isError, refetch } = useMeal(mealId, {
    enabled: isConnected,
    initialMeal,
  });
  const { confirmAndDelete, isPending: isDeletePending } = useDeleteMeal({
    mealId,
    onSuccess: () => navigation.goBack(),
  });

  const canManageMeal = !!(isConnected && meal && profile?.id === meal.user_id);
  const totalValues = useMemo(() => (meal ? buildMealDisplayValues(meal) : null), [meal]);
  const perServingValues = useMemo(
    () => (meal ? buildMealDisplayValues(meal, meal.serving_size) : null),
    [meal],
  );
  const displayValues = viewMode === 'perServing' ? perServingValues : totalValues;

  const renderContent = () => {
    if (!isConnectionLoading && !isConnected) {
      return (
        <StatusView
          icon="cloud-offline"
          iconColor="#9CA3AF"
          iconSize={64}
          title="No server configured"
          subtitle="Configure your server connection in Settings to view meal details."
          action={{
            label: 'Go to Settings',
            onPress: () => navigation.navigate('Tabs', { screen: 'Settings' }),
            variant: 'primary',
          }}
        />
      );
    }

    if ((isLoading || isConnectionLoading) && !meal) {
      return <StatusView loading title="Loading meal..." />;
    }

    if (isError || !meal || !displayValues) {
      return (
        <StatusView
          icon="alert-circle"
          iconColor="#EF4444"
          iconSize={64}
          title="Failed to load meal"
          subtitle="Please check your connection and try again."
          action={{ label: 'Retry', onPress: () => void refetch(), variant: 'primary' }}
        />
      );
    }

    const foodCount = meal.foods.length;

    return (
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 py-4 gap-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + activeWorkoutBarPadding + 16 }}
      >
        <View className="gap-2">
          <SegmentedControl
            segments={VIEW_MODE_SEGMENTS}
            activeKey={viewMode}
            onSelect={setViewMode}
          />
          <Text className="text-text-muted text-xs text-center">
            Makes {meal.serving_size} {meal.serving_unit} · {foodCount}{' '}
            {foodCount === 1 ? 'ingredient' : 'ingredients'}
          </Text>
        </View>

        <FoodNutritionSummary
          name={meal.name}
          brand={meal.description}
          values={displayValues}
        />

        <View className="bg-surface rounded-xl p-4 shadow-sm">
          <View className="flex-row items-center mb-3">
            <Text className="text-base font-bold text-text-secondary flex-1">Foods in Meal</Text>
            <Text className="text-xs text-text-muted font-medium">
              {meal.foods.length} {meal.foods.length === 1 ? 'item' : 'items'}
            </Text>
          </View>
          {meal.foods.map((food, index) => {
            const scale = ingredientScale(food);
            const calories = Math.round(food.calories * scale);
            const protein = Math.round(food.protein * scale);
            const carbs = Math.round(food.carbs * scale);
            const fat = Math.round(food.fat * scale);

            return (
              <View
                key={food.id}
                className={`flex-row items-start justify-between gap-3 py-3 ${
                  index === 0 ? '' : 'border-t border-border-subtle'
                }`}
              >
                <View className="flex-1">
                  <Text className="text-text-primary text-base font-semibold" numberOfLines={1}>
                    {food.food_name || 'Food'}
                    {food.brand ? (
                      <Text className="text-text-secondary font-normal">
                        {' · '}
                        {food.brand}
                      </Text>
                    ) : null}
                  </Text>
                  <Text className="text-text-muted text-sm mt-1">
                    {protein}g protein{' · '}{carbs}g carbs{' · '}{fat}g fat
                  </Text>
                </View>
                <View className="items-end">
                  <Text className="text-text-primary text-base font-semibold">
                    {calories} cal
                  </Text>
                  <Text className="text-text-muted text-sm mt-1">
                    {food.quantity} {food.unit}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <Button
          variant="primary"
          onPress={() => navigation.navigate('FoodEntryAdd', { item: mealToFoodInfo(meal) })}
        >
          <Text className="text-white text-base font-semibold">Log Meal</Text>
        </Button>

        {canManageMeal ? (
          <Button
            variant="ghost"
            onPress={() => {
              void confirmAndDelete();
            }}
            disabled={isDeletePending}
            textClassName="text-bg-danger font-medium"
          >
            {isDeletePending ? 'Deleting...' : 'Delete Meal'}
          </Button>
        ) : null}
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        {canManageMeal ? (
          <View className="ml-auto z-10">
            <Button
              variant="ghost"
              onPress={() => navigation.navigate('MealAdd', {
                mode: 'edit',
                mealId: meal!.id,
                initialMeal: meal,
              })}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              textClassName="font-medium"
            >
              Edit
            </Button>
          </View>
        ) : null}
      </View>

      {renderContent()}
    </View>
  );
};

export default MealDetailScreen;
