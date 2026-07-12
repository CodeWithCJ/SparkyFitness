import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { Meal } from '../types/meals';
import { mealToFoodInfo } from '../types/foodInfo';

interface MealLibraryRowProps {
  meal: Meal;
  onPress?: () => void;
  showDivider?: boolean;
  // Renders an outline "Meal" badge next to the name. Used where meals are
  // merged into a list alongside foods (the food-search landing), so a meal is
  // not mistaken for a food. Off by default for lists that already have a
  // meals-only header. Mirrors the web food-search meal badge.
  showBadge?: boolean;
}

const MealLibraryRow: React.FC<MealLibraryRowProps> = ({
  meal,
  onPress,
  showDivider = false,
  showBadge = false,
}) => {
  const foodInfo = useMemo(() => mealToFoodInfo(meal), [meal]);
  const itemCount = meal.foods.length;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`px-4 py-3 ${showDivider ? 'border-b border-border-subtle' : ''}`}
      style={({ pressed }) => (pressed && onPress ? { opacity: 0.7 } : null)}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center gap-1.5">
            <Text
              className="text-text-primary text-base font-medium flex-shrink"
              numberOfLines={1}
            >
              {meal.name}
            </Text>
            {showBadge ? (
              <View className="px-1.5 py-0.5 rounded border border-border-subtle flex-shrink-0">
                <Text className="text-text-secondary text-xs font-semibold uppercase">
                  Meal
                </Text>
              </View>
            ) : null}
          </View>
          {meal.description ? (
            <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={1}>
              {meal.description}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-text-primary text-base font-semibold">
            {foodInfo.calories} cal
          </Text>
          <Text className="text-text-secondary text-xs">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

export default MealLibraryRow;
