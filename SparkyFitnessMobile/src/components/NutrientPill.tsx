import React from 'react';
import { View, Text } from 'react-native';
import { formatLocalizedNumber } from '../localization';

interface NutrientPillProps {
  label: string;
  consumed: number;
  goal?: number;
  unit?: string;
}

const NutrientPill: React.FC<NutrientPillProps> = ({ label, consumed, goal, unit = 'g' }) => {
  return (
    <View className="w-[23%] bg-border rounded-xl px-0.5 py-2 items-center">
      <Text className="text-xs text-text-primary mb-1" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-xs font-bold text-text-primary text-center" numberOfLines={1}>
        {goal && goal > 0
          ? `${formatLocalizedNumber(Math.round(consumed))}${unit} / ${formatLocalizedNumber(Math.round(goal))}${unit}`
          : `${formatLocalizedNumber(Math.round(consumed))}${unit}`}
      </Text>
    </View>
  );
};

export default NutrientPill;
