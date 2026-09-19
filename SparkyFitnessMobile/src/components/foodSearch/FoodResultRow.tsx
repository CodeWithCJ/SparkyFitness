import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from '../Icon';
import ShareStatusBadge from '../ShareStatusBadge';
import VerifiedBadge from '../VerifiedBadge';
import { deriveShareStatus } from '../../utils/shareStatus';
import { formatServingUnit } from '../../utils/foodDetails';
import { foodItemToFoodInfo } from '../../types/foodInfo';
import FoodThumbnail from '../FoodThumbnail';
import { useFoodImageSourceContext } from '../FoodImageSourceProvider';
import { primaryImageOf, usableFoodImages } from '../../utils/foodImages';
import { useOpenLightbox } from '../LightboxProvider';
import type { FoodInfoItem } from '../../types/foodInfo';
import type { FoodItem, TopFoodItem } from '../../types/foods';

/**
 * Multi-select affordance for the food-search landing lists (#1980). When
 * present, the row toggles basket selection instead of navigating, and shows
 * a leading checkbox glyph. Colors come from the caller (which owns the
 * theme's CSS variables) because this row keeps to className styling.
 */
export interface FoodRowSelection {
  isSelected: boolean;
  onToggle: () => void;
  accentColor: string;
  inactiveColor: string;
}

interface FoodResultRowProps {
  item: FoodItem | TopFoodItem;
  profileId?: string;
  isFavorite: boolean;
  favoriteGold: string;
  onSelect: (item: FoodInfoItem) => void;
  selection?: FoodRowSelection;
}

const FoodResultRow: React.FC<FoodResultRowProps> = ({
  item,
  profileId,
  isFavorite,
  favoriteGold,
  onSelect,
  selection,
}) => {
  const { t } = useTranslation();
  const status = deriveShareStatus(
    item.user_id,
    item.shared_with_public,
    profileId
  );
  const getImageSource = useFoodImageSourceContext();
  const openLightbox = useOpenLightbox();
  const images = usableFoodImages(item.images);
  // The thumbnail is a SIBLING of the row's pressable, never nested inside it —
  // nesting leaves the inner one live while the parent is disabled. Matches
  // FoodLibraryRow.
  return (
    <View className="flex-row items-center border-b border-border-subtle">
      <View className="pl-4 py-2">
        <FoodThumbnail
          image={primaryImageOf(item)}
          getImageSource={getImageSource}
          size={40}
          onPress={
            images.length > 0
              ? () => openLightbox(images, 0, item.name)
              : undefined
          }
        />
      </View>
      <TouchableOpacity
        className="flex-1 flex-row justify-between items-center pr-4 py-2"
        activeOpacity={0.7}
        accessibilityRole={selection ? 'checkbox' : undefined}
        accessibilityState={
          selection ? { checked: selection.isSelected } : undefined
        }
        accessibilityLabel={
          selection
            ? t('foodSearch.multiSelect.foodCheckbox', {
                defaultValue: 'Select {{name}}',
                name: item.name,
              })
            : undefined
        }
        onPress={() =>
          selection ? selection.onToggle() : onSelect(foodItemToFoodInfo(item))
        }
      >
        {selection ? (
          <View className="ml-3">
            <Icon
              name={
                selection.isSelected
                  ? 'checkmark-circle-filled'
                  : 'checkmark-circle'
              }
              size={22}
              color={
                selection.isSelected
                  ? selection.accentColor
                  : selection.inactiveColor
              }
            />
          </View>
        ) : null}
        <View className="flex-1 mx-3">
          <View className="flex-row items-start gap-1">
            <Text className="text-text-primary text-base font-medium flex-shrink">
              {item.name}
            </Text>
            {item.provider_verified ? (
              <VerifiedBadge size="sm" style={{ marginTop: 2 }} />
            ) : null}
            <ShareStatusBadge status={status} style={{ marginTop: 3 }} />
            {isFavorite && (
              <Icon
                name="star"
                size={16}
                color={favoriteGold}
                style={{ marginTop: 3 }}
                accessibilityLabel={t('foodSearch.accessibility.favorite', {
                  defaultValue: 'Favorite',
                })}
              />
            )}
          </View>
          {item.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5">
              {item.brand}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-text-primary text-base font-semibold">
            {Math.round(item.default_variant.calories)}{' '}
            {t('foodSearch.labels.caloriesUnit', { defaultValue: 'cal' })}
          </Text>
          <Text className="text-text-secondary text-xs">
            {/* i18n-audit-ignore-next-line hardcoded-ui-text -- quantity and unit are literal data values. */}
            <>
              {item.default_variant.serving_size}{' '}
              {formatServingUnit(item.default_variant.serving_unit)}
            </>
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
};

export default FoodResultRow;
