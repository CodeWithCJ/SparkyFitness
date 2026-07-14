import React from 'react';
import { View, Text } from 'react-native';

interface NutrientPillProps {
  label: string;
  consumed: number;
  goal?: number;
  unit?: string;
}

const NutrientPill: React.FC<NutrientPillProps> = ({ label, consumed, goal, unit = 'g' }) => {
  return (
    <View className="w-[23%] bg-border rounded-xl px-0.5 py-2 mb-2 items-center">
      <Text className="text-xs text-text-primary mb-1" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-xs font-bold text-text-primary text-center" numberOfLines={1}>
        {Math.round(consumed)}
        {goal && goal > 0 ? `/${Math.round(goal)}` : ''}
        {unit}
      </Text>
    </View>
  );
};

export default NutrientPill;
