import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from '../Icon';
import ShareStatusBadge from '../ShareStatusBadge';
import VerifiedBadge from '../VerifiedBadge';
import { deriveShareStatus } from '../../utils/shareStatus';
import { formatServingUnit } from '../../utils/foodDetails';
import { foodItemToFoodInfo } from '../../types/foodInfo';
import type { FoodInfoItem } from '../../types/foodInfo';
import type { FoodItem, TopFoodItem } from '../../types/foods';

interface FoodResultRowProps {
  item: FoodItem | TopFoodItem;
  profileId?: string;
  isFavorite: boolean;
  favoriteGold: string;
  onSelect: (item: FoodInfoItem) => void;
}

const FoodResultRow: React.FC<FoodResultRowProps> = ({
  item,
  profileId,
  isFavorite,
  favoriteGold,
  onSelect,
}) => {
  const status = deriveShareStatus(item.user_id, item.shared_with_public, profileId);
  return (
    <TouchableOpacity
      className="px-4 py-2 border-b border-border-subtle"
      activeOpacity={0.7}
      onPress={() => onSelect(foodItemToFoodInfo(item))}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <View className="flex-row items-start gap-1">
            <Text className="text-text-primary text-base font-medium flex-shrink">
              {item.name}
            </Text>
            {item.provider_verified ? <VerifiedBadge size="sm" style={{ marginTop: 2 }} /> : null}
            <ShareStatusBadge status={status} />
          </View>
          {item.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5">{item.brand}</Text>
          ) : null}
        </View>
        <View className="items-end">
          <View className="flex-row items-center gap-1">
            {isFavorite && (
              <Icon
                name="star"
                size={13}
                color={favoriteGold}
                style={{ marginTop: 1 }}
                accessibilityLabel="Favorite"
              />
            )}
            <Text className="text-text-primary text-base font-semibold">
              {item.default_variant.calories} cal
            </Text>
          </View>
          <Text className="text-text-secondary text-xs">
            {`${item.default_variant.serving_size} ${formatServingUnit(item.default_variant.serving_unit)}`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default FoodResultRow;
