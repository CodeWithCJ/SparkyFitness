import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { Meal } from '../types/meals';
import { mealToFoodInfo } from '../types/foodInfo';
import { useProfile } from '../hooks';
import { deriveShareStatus } from '../utils/shareStatus';
import ShareStatusBadge from './ShareStatusBadge';
import Icon from './Icon';

interface MealLibraryRowProps {
  meal: Meal;
  onPress?: () => void;
  showDivider?: boolean;
  // Renders an outline "Meal" badge next to the name. Used where meals are
  // merged into a list alongside foods (the food-search landing), so a meal is
  // not mistaken for a food. Off by default for lists that already have a
  // meals-only header. Mirrors the web food-search meal badge.
  showBadge?: boolean;
  // Marks the row with an accent star. Opt-in so the star stays confined to
  // food search, where favorites are a meaningful distinction — the other
  // screens using this row (meal library, meal picker) have no favorites
  // concept and should not sprout a star.
  isFavorite?: boolean;
}

const MealLibraryRow: React.FC<MealLibraryRowProps> = ({
  meal,
  onPress,
  showDivider = false,
  showBadge = false,
  isFavorite = false,
}) => {
  const { profile } = useProfile();
  const status = deriveShareStatus(meal.user_id, meal.is_public, profile?.id);
  const foodInfo = useMemo(() => mealToFoodInfo(meal), [meal]);
  const itemCount = meal.foods.length;
  // Gold, not accent: this passive marker carries the "favorite" cue by colour,
  // leaving accent (blue) for tappable things. --color-cat-amber is the closest
  // token to web's yellow-500 and has a dark-mode value, unlike a raw hex.
  const [goldColor] = useCSSVariable(['--color-cat-amber']) as [string];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`px-4 py-3 ${showDivider ? 'border-b border-border-subtle' : ''}`}
      style={({ pressed }) => (pressed && onPress ? { opacity: 0.7 } : null)}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <View className="flex-row items-baseline gap-1.5">
            <Text
              className="text-text-primary text-base font-medium flex-shrink"
              numberOfLines={1}
            >
              {meal.name}
            </Text>
            {showBadge ? (
              // Baseline alignment puts the badge's own text on the name's
              // baseline, which leaves the box hanging under the line; the 2dp
              // lift pulls the box back onto it.
              <View
                className="px-1 py-0.5 rounded border border-border-subtle flex-shrink-0"
                style={{ transform: [{ translateY: -2 }] }}
              >
                <Text className="text-text-secondary text-[9px] font-semibold">
                  Meal
                </Text>
              </View>
            ) : null}
            <ShareStatusBadge status={status} />
          </View>
          {meal.description ? (
            <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={1}>
              {meal.description}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <View className="flex-row items-center gap-1">
            {isFavorite && (
              <Icon
                name="star"
                size={13}
                color={goldColor}
                style={{ marginTop: 1 }}
                accessibilityLabel="Favorite"
              />
            )}
            <Text className="text-text-primary text-base font-semibold">
              {foodInfo.calories} cal
            </Text>
          </View>
          <Text className="text-text-secondary text-xs">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

export default MealLibraryRow;
