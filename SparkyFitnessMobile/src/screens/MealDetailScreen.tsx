import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import FoodNutritionSummary from '../components/FoodNutritionSummary';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useDeleteMeal, useFavorites, useMeal, useProfile, useServerConnection, usePreferences, useToggleFavorite } from '../hooks';
import { mealToFoodInfo } from '../types/foodInfo';
import type { FoodDisplayValues } from '../utils/foodDetails';
import type { Meal, MealFood } from '../types/meals';
import type { RootStackScreenProps } from '../types/navigation';
import { useScreenHeader, type HeaderItem } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';

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
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const textMuted = useCSSVariable('--color-text-muted') as string;
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

  // Favorites: a saved meal can be starred from its detail screen, so the
  // library is no longer edit-only via search. Access is verified server-side
  // on add, so ownership is not required — only a loaded meal and a connection.
  const canFavorite = isConnected && !!meal;
  const { favoriteMeals } = useFavorites({ enabled: isConnected });
  const isFavorite = useMemo(
    () => !!meal && favoriteMeals.some((m) => m.id === meal.id),
    [favoriteMeals, meal],
  );
  const { toggleFavorite, isPending: isFavoritePending } = useToggleFavorite();
  const handleToggleFavorite = useCallback(() => {
    if (!meal) return;
    // Full Meal in hand, so the optimistic insert flips the star instantly.
    toggleFavorite({ type: 'meal', id: meal.id, isFavorite, meal });
  }, [toggleFavorite, meal, isFavorite]);
  const totalValues = useMemo(
    () => (meal ? buildMealDisplayValues(meal, 'total') : null),
    [meal],
  );
  const perServingValues = useMemo(
    () => (meal ? buildMealDisplayValues(meal, 'perServing') : null),
    [meal],
  );
  const displayValues = viewMode === 'perServing' ? perServingValues : totalValues;

  // The title stays blank on both paths — the meal name is shown in the body's
  // nutrition card, so a bar title would just duplicate it; the header only
  // carries back plus the owner-gated Edit action once the meal loads.
  // Favorite star (accent-tinted, reads as a button) sits before the neutral
  // Edit action, matching the meal-log screen's header order.
  const rightItems: HeaderItem[] = [
    ...(canFavorite
      ? [
          {
            kind: 'icon',
            sfSymbol: isFavorite ? 'star.fill' : 'star',
            ionicon: isFavorite ? 'star' : 'star-outline',
            role: 'primary',
            // Gated on the toggle's own mutation so a double tap before settle
            // can't send the opposite op and land the two writes out of order.
            disabled: isFavoritePending,
            onPress: handleToggleFavorite,
            accessibilityLabel: isFavorite
              ? 'Remove from favorites'
              : 'Add to favorites',
            identifier: 'meal-detail-favorite',
          } as const,
        ]
      : []),
    ...(canManageMeal
      ? [
          {
            kind: 'text',
            label: 'Edit',
            role: 'secondary',
            onPress: () =>
              navigation.navigate('MealAdd', {
                mode: 'edit',
                mealId: meal!.id,
                initialMeal: meal,
              }),
            accessibilityLabel: 'Edit meal',
            identifier: 'meal-detail-edit',
          } as const,
        ]
      : []),
  ];
  const header = useScreenHeader({
    borderless: true,
    left: { kind: 'back' },
    right: rightItems.length > 0 ? rightItems : null,
  });

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
        contentInsetAdjustmentBehavior={usesNativeHeader ? 'automatic' : undefined}
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
            const isLinkedMeal = food.item_type === 'meal';

            const row = (
              <View
                className={`flex-row items-start justify-between gap-3 py-3 ${
                  index === 0 ? '' : 'border-t border-border-subtle'
                }`}
              >
                <View className="flex-1">
                  <Text
                    className={`text-base font-semibold ${
                      isLinkedMeal ? 'text-accent-primary' : 'text-text-primary'
                    }`}
                    numberOfLines={1}
                  >
                    {isLinkedMeal ? food.child_meal_name || food.food_name : food.food_name || 'Food'}
                    {food.brand ? (
                      <Text className="text-text-secondary font-normal">
                        {' · '}
                        {food.brand}
                      </Text>
                    ) : null}
                  </Text>
                  {isLinkedMeal ? (
                    <View className="flex-row items-center gap-1 mt-1">
                      <Icon name="link" size={12} color={textMuted} />
                      <Text className="text-text-muted text-xs font-medium">Linked meal</Text>
                    </View>
                  ) : null}
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

            if (isLinkedMeal && food.child_meal_id) {
              return (
                <TouchableOpacity
                  key={food.id}
                  activeOpacity={0.7}
                  onPress={() =>
                    navigation.push('MealDetail', { mealId: food.child_meal_id! })
                  }
                  accessibilityLabel={`View linked meal ${food.child_meal_name || ''}`}
                  accessibilityRole="button"
                >
                  {row}
                </TouchableOpacity>
              );
            }

            return <View key={food.id}>{row}</View>;
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
  if (usesNativeHeader) {
    return renderContent();
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {header}
      {renderContent()}
    </View>
  );
};

export default MealDetailScreen;
