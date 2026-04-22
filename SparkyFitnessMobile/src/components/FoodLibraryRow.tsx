import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { FoodItem } from '../types/foods';

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
  const content = (
    <View className="flex-row justify-between items-center">
      <View className="flex-1 mr-3">
        <Text className="text-text-primary text-base font-medium" numberOfLines={1}>
          {food.name}
        </Text>
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
          {food.default_variant.serving_size} {food.default_variant.serving_unit}
        </Text>
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View className={`px-4 py-3 ${showDivider ? 'border-b border-border-subtle' : ''}`}>
        {content}
      </View>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`px-4 py-3 ${showDivider ? 'border-b border-border-subtle' : ''}`}
    >
      {content}
    </TouchableOpacity>
  );
};

export default FoodLibraryRow;
