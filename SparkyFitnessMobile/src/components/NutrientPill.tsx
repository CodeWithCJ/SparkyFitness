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
    <View className="w-[23%] bg-surface border border-border-subtle rounded-xl px-2 py-2 mb-2 items-center">
      <Text className="text-xs text-text-secondary mb-1">
        {label}
      </Text>
      <Text className="text-sm font-bold text-text-primary text-center">
        {Math.round(consumed)}
        {goal && goal > 0 ? `/${Math.round(goal)}` : ''}
        {unit}
        {percent !== null && (
          <Text className="text-xs font-normal text-text-secondary"> ({percent}%)</Text>
        )}
      </Text>
    </View>
  );
};

export default NutrientPill;
