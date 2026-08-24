import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { Meal } from '../types/meals';
import { mealToFoodInfo } from '../types/foodInfo';
import { useProfile } from '../hooks';
import { deriveShareStatus } from '../utils/shareStatus';
import ShareStatusBadge from './ShareStatusBadge';
import Icon from './Icon';
import FoodThumbnail from './FoodThumbnail';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';
import { primaryImageOf, usableFoodImages } from '../utils/foodImages';
import { useOpenLightbox } from './LightboxProvider';

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
  const { t } = useTranslation();
  const { profile } = useProfile();
  const status = deriveShareStatus(meal.user_id, meal.is_public, profile?.id);
  const foodInfo = useMemo(() => mealToFoodInfo(meal), [meal]);
  const itemCount = meal.foods.length;
  // Gold, not accent: this passive marker carries the "favorite" cue by colour,
  // leaving accent (blue) for tappable things. --color-cat-amber is the closest
  // token to web's yellow-500 and has a dark-mode value, unlike a raw hex.
  const [goldColor] = useCSSVariable(['--color-cat-amber']) as [string];
  const getImageSource = useFoodImageSourceContext();
  const images = usableFoodImages(meal.images);

  const openLightbox = useOpenLightbox();
  const openImages =
    images.length > 0 ? () => openLightbox(images, 0, meal.name) : undefined;

  // Sibling, not nested — see FoodLibraryRow for why.
  return (
    <View
      className={`flex-row items-center ${showDivider ? 'border-b border-border-subtle' : ''}`}
    >
      <View className="pl-4 py-3">
        <FoodThumbnail
          image={primaryImageOf(meal)}
          getImageSource={getImageSource}
          size={40}
          onPress={openImages}
          variant="meal"
        />
      </View>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        className="flex-1 pr-4 py-3"
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
              <View className="px-1 py-0.5 rounded border border-border-subtle flex-shrink-0">
                <Text className="text-text-muted text-xs">
                  {t('foodSearch.labels.meal', { defaultValue: 'Meal' })}
                </Text>
              </View>
            ) : null}
            {/* Icons center on the text's full line box (descender included),
                which reads ~1pt low against the visible letters; lift them. */}
            <ShareStatusBadge status={status} style={{ marginTop: -1 }} />
            {isFavorite && (
              <Icon
                name="star"
                size={16}
                color={goldColor}
                style={{ marginTop: -1 }}
                accessibilityLabel={t('foodSearch.accessibility.favorite', { defaultValue: 'Favorite' })}
              />
            )}
          </View>
          {meal.description ? (
            <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={1}>
              {meal.description}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-text-primary text-base font-semibold">
            {foodInfo.calories} {t('foodSearch.labels.caloriesUnit', { defaultValue: 'cal' })}
          </Text>
          <Text className="text-text-secondary text-xs">
            {t('foodSearch.labels.itemCount', { defaultValue: "{{count}} items", defaultValue_one: "{{count}} item", defaultValue_other: "{{count}} items", count: itemCount })}
          </Text>
        </View>
      </View>
      </Pressable>
    </View>
  );
};

export default MealLibraryRow;
