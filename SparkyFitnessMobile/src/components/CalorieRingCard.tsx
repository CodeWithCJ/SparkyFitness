import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import ProgressRing from './ProgressRing';
import { formatMobileNumber, mobileT } from '../localization';

interface SideStatProps {
  label: string;
  value: number;
}

const SideStat: React.FC<SideStatProps> = ({ label, value }) => (
  <View className="items-center justify-center flex-1">
    <Text className="text-xl font-bold text-text-primary">
      {formatMobileNumber(Math.round(value), { maximumFractionDigits: 0 })}
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
        <SideStat label={mobileT('dashboard.consumed')} value={caloriesConsumed} />

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
              {formatMobileNumber(displayRemaining, {
                maximumFractionDigits: 0,
              })}
            </Text>
            <Text className="text-text-secondary text-xs">
              {mobileT('dashboard.remaining')}
            </Text>
            <Text className="text-text-muted text-[10px] mt-0.5">
              {mobileT('dashboard.calorieGoal', {
                goal: formatMobileNumber(calorieGoal, {
                  maximumFractionDigits: 0,
                }),
              })}
            </Text>
          </View>
        </View>

        <SideStat label={mobileT('dashboard.burned')} value={caloriesBurned} />
      </View>
    </View>
  );
};

export default CalorieRingCard;
