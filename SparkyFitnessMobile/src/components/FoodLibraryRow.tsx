import React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { FoodItem } from '../types/foods';
import { formatServingUnit } from '../utils/foodDetails';
import VerifiedBadge from './VerifiedBadge';

interface FoodLibraryRowProps {
  food: FoodItem;
  onPress?: () => void;
  showDivider?: boolean;
}

const FoodLibraryRow: React.FC<FoodLibraryRowProps> = ({
  food,
  onPress,
  showDivider = false,
}) => {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className={`px-4 py-3 ${showDivider ? 'border-b border-border-subtle' : ''}`}
      style={({ pressed }) => (pressed && onPress ? { opacity: 0.7 } : null)}
    >
      <View className="flex-row justify-between items-center">
        <View className="flex-1 mr-3">
          <View className="flex-row items-center">
            <Text className="text-text-primary text-base font-medium flex-shrink" numberOfLines={1}>
              {food.name}
            </Text>
            {food.provider_verified ? (
              <VerifiedBadge size="sm" style={{ marginLeft: 4 }} />
            ) : null}
          </View>
          {food.brand ? (
            <Text className="text-text-secondary text-sm mt-0.5" numberOfLines={1}>
              {food.brand}
            </Text>
          ) : null}
        </View>
        <View className="items-end">
          <Text className="text-text-primary text-base font-semibold">
            {food.default_variant.calories} cal
          </Text>
          <Text className="text-text-secondary text-xs">
            {food.default_variant.serving_size} {formatServingUnit(food.default_variant.serving_unit)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
};

export default FoodLibraryRow;
