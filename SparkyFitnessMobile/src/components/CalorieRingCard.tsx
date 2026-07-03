import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import ProgressRing from './ProgressRing';

interface SideStatProps {
  label: string;
  value: number;
}

const SideStat: React.FC<SideStatProps> = ({ label, value }) => (
  <View className="items-center justify-center flex-1">
    <Text className="text-xl font-bold text-text-primary">
      {Math.round(value).toLocaleString()}
    </Text>
    <Text className="text-text-secondary text-xs mt-1">{label}</Text>
  </View>
);

interface CalorieRingCardProps {
  caloriesConsumed: number;
  caloriesBurned: number;
  calorieGoal: number;
  remainingCalories: number;
  progressPercent: number;
}

const CalorieRingCard: React.FC<CalorieRingCardProps> = ({
  caloriesConsumed,
  caloriesBurned,
  calorieGoal,
  remainingCalories,
  progressPercent,
}) => {
  const [progressTrackColor, progressFillColor] = useCSSVariable([
    '--color-progress-track',
    '--color-calories',
  ]) as [string, string];

  const displayRemaining = Math.round(remainingCalories) || 0;

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <View className="flex-row items-center justify-center">
        <SideStat label="Consumed" value={caloriesConsumed} />

        <View className="relative items-center justify-center mx-2">
          <View>
            <ProgressRing
              progress={progressPercent}
              size={160}
              strokeWidth={12}
              color={progressFillColor}
              backgroundColor={progressTrackColor}
            />
          </View>
          <View className="absolute items-center justify-center">
            <Text className="text-2xl font-bold text-text-primary">
              {displayRemaining.toLocaleString()}
            </Text>
            <Text className="text-text-secondary text-xs">
              remaining
            </Text>
            <Text className="text-text-muted text-[10px] mt-0.5">
              of {calorieGoal.toLocaleString()} kcal
            </Text>
          </View>
        </View>

        <SideStat label="Burned" value={caloriesBurned} />
      </View>
    </View>
  );
};

export default CalorieRingCard;
