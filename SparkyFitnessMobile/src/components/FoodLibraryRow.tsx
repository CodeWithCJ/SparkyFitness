import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { FoodItem } from '../types/foods';
import { formatServingUnit } from '../utils/foodDetails';
import { useProfile } from '../hooks';
import { deriveShareStatus } from '../utils/shareStatus';
import ShareStatusBadge from './ShareStatusBadge';
import Icon from './Icon';
import VerifiedBadge from './VerifiedBadge';
import FoodThumbnail from './FoodThumbnail';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';
import { primaryImageOf, usableFoodImages } from '../utils/foodImages';
import { useOpenLightbox } from './LightboxProvider';

interface FoodLibraryRowProps {
  food: FoodItem;
  onPress?: () => void;
  showDivider?: boolean;
  // Marks the row with a gold star. Off by default so lists with no favorites
  // concept stay unadorned; the library screens opt in. Mirrors MealLibraryRow.
  isFavorite?: boolean;
}

const FoodLibraryRow: React.FC<FoodLibraryRowProps> = ({
  food,
  onPress,
  showDivider = false,
  isFavorite = false,
}) => {
  const { t } = useTranslation();
  const { profile } = useProfile();
  const status = deriveShareStatus(food.user_id, food.shared_with_public, profile?.id);
  // Gold, not accent: a passive indicator, not a tap target. See MealLibraryRow.
  const [goldColor] = useCSSVariable(['--color-cat-amber']) as [string];
  const getImageSource = useFoodImageSourceContext();
  const images = usableFoodImages(food.images);
  const openLightbox = useOpenLightbox();
  const openImages =
    images.length > 0 ? () => openLightbox(images, 0, food.name) : undefined;

  // The thumbnail is a SIBLING of the row's pressable, never nested inside it:
  // a Pressable within a Pressable leaves both live, so a tap on the photo can
  // open the detail screen instead of the viewer. Mirrors the exercise rows.
  return (
    <View
      className={`flex-row items-center ${showDivider ? 'border-b border-border-subtle' : ''}`}
    >
      <View className="pl-4 py-3">
        <FoodThumbnail
          image={primaryImageOf(food)}
          getImageSource={getImageSource}
          size={40}
          onPress={openImages}
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
            <Text className="text-text-primary text-base font-medium flex-shrink" numberOfLines={1}>
              {food.name}
            </Text>
            {food.provider_verified ? (
              <VerifiedBadge size="sm" style={{ marginLeft: 4 }} />
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
          {food.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={1}>
              {food.brand}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-text-primary text-base font-semibold">
            {food.default_variant.calories} {t('foodSearch.labels.caloriesUnit', { defaultValue: 'cal' })}
          </Text>
          <Text className="text-text-secondary text-xs">
            {food.default_variant.serving_size} {formatServingUnit(food.default_variant.serving_unit)}
          </Text>
        </View>
      </View>
      </Pressable>
    </View>
  );
};

export default FoodLibraryRow;
