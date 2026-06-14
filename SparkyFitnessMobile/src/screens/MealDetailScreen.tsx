import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import { createNativeHeaderTextButtonItem } from '../utils/nativeHeaderItems';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useDeleteMeal, useMeal, useProfile, useServerConnection, usePreferences } from '../hooks';
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

// mode='total' shows the full recipe; mode='perServing' divides totals by
// meal.total_servings and labels the values as one serving's quantity in
// serving_unit.
function buildMealDisplayValues(
  meal: Meal,
  mode: 'total' | 'perServing' = 'total',
): FoodDisplayValues {
  const totalServings = meal.total_servings || 1;
  const divisor = mode === 'perServing' ? totalServings : 1;
  const safeDivisor = divisor > 0 ? divisor : 1;
  const optionalField = (field: MealFoodNumericField) =>
    hasMealField(meal, field) ? divide(sumMealField(meal, field), safeDivisor) : undefined;

  const servingSize = meal.serving_size || 1;

  return {
    // Per-serving mode shows one serving's quantity; total mode shows the
    // whole recipe quantity (serving_size × total_servings).
    servingSize: mode === 'perServing' ? servingSize : servingSize * totalServings,
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
  const headerTintColor = useCSSVariable('--color-text-primary') as string;
  const [viewMode, setViewMode] = useState<ViewMode>('perServing');

  const { isConnected, isLoading: isConnectionLoading } = useServerConnection();
  const { profile } = useProfile();
  const { preferences } = usePreferences({ enabled: isConnected });
  const showNetCarbs = preferences?.show_net_carbs === true;
  const { meal, isLoading, isError, refetch } = useMeal(mealId, {
    enabled: isConnected,
    initialMeal,
  });
  const { confirmAndDelete, isPending: isDeletePending } = useDeleteMeal({
    mealId,
    onSuccess: () => navigation.goBack(),
  });

  const canManageMeal = !!(isConnected && meal && profile?.id === meal.user_id);
  const totalValues = useMemo(
    () => (meal ? buildMealDisplayValues(meal, 'total') : null),
    [meal],
  );
  const perServingValues = useMemo(
    () => (meal ? buildMealDisplayValues(meal, 'perServing') : null),
    [meal],
  );
  const displayValues = viewMode === 'perServing' ? perServingValues : totalValues;

  // iOS uses the native glass header (configured in App.tsx). The title stays
  // blank — the meal name is shown in the body's nutrition card, so a bar title
  // would just duplicate it; we only drive the owner-gated Edit action here once
  // the meal loads. Android keeps the custom in-screen header below.
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;

    navigation.setOptions({
      unstable_headerRightItems: canManageMeal
        ? () => [
            createNativeHeaderTextButtonItem({
              label: 'Edit',
              identifier: 'meal-detail-edit',
              tintColor: headerTintColor,
              accessibilityLabel: 'Edit meal',
              onPress: () =>
                navigation.navigate('MealAdd', {
                  mode: 'edit',
                  mealId: meal!.id,
                  initialMeal: meal,
                }),
            }),
          ]
        : undefined,
    });
  }, [navigation, meal, canManageMeal, headerTintColor]);

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
        className="flex-1 bg-background"
        contentContainerClassName="px-4 py-4 gap-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + activeWorkoutBarPadding + 16 }}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
      >
        <View className="gap-2">
          <SegmentedControl
            segments={VIEW_MODE_SEGMENTS}
            activeKey={viewMode}
            onSelect={setViewMode}
          />
          <Text className="text-text-muted text-xs text-center">
            Makes {meal.total_servings || 1}{' '}
            {(meal.total_servings || 1) === 1 ? 'serving' : 'servings'} ·{' '}
            {foodCount} {foodCount === 1 ? 'ingredient' : 'ingredients'}
          </Text>
        </View>

        <FoodNutritionSummary
          name={meal.name}
          brand={meal.description}
          values={displayValues}
          showNetCarbs={showNetCarbs}
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

  // iOS: the native glass header replaces the custom header entirely. Return the
  // content (a ScrollView in the loaded state) as the screen root — UIKit only
  // attaches the large-title collapse to a scroll view it finds at the top of
  // the screen, so wrapping it in another View breaks the inset + collapse.
  if (Platform.OS === 'ios') {
    return renderContent();
  }

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
