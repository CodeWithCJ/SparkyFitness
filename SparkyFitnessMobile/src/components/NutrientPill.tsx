import React from 'react';
import { View, Text } from 'react-native';

interface NutrientPillProps {
  label: string;
  consumed: number;
  goal?: number;
  unit?: string;
}

/** Returns the rounded consumed/goal percentage, or null when there's no goal to compare against. */
const goalPercent = (value: number, goalValue?: number): number | null => {
  if (!goalValue || goalValue <= 0) return null;
  return Math.round((value / goalValue) * 100);
};

const NutrientPill: React.FC<NutrientPillProps> = ({ label, consumed, goal, unit = 'g' }) => {
  const percent = goalPercent(consumed, goal);

  return (
    <View className="w-[23%] bg-border rounded-xl px-0.5 py-2 mb-2 items-center">
      <Text className="text-xs text-text-primary mb-1" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-[10px] font-bold text-text-primary text-center" numberOfLines={1}>
        {Math.round(consumed)}
        {goal && goal > 0 ? `/${Math.round(goal)}` : ''}
        {unit}
        {percent !== null && (
          <Text className="text-[9px] font-normal text-text-secondary"> ({percent}%)</Text>
        )}
      </Text>
    </View>
  );
};

export default NutrientPill;
