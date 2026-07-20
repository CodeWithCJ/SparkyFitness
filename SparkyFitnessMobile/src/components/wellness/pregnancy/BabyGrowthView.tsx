import React from 'react';
import { View, Text } from 'react-native';
import { babyWeek } from '@workspace/shared';
import { useWellnessTokens } from '../theme/wellnessTokens';
import WombScene from './WombScene';

interface BabyGrowthViewProps {
  week: number;
}

/** Fetal size/development for the current gestational week (shared content). */
const BabyGrowthView: React.FC<BabyGrowthViewProps> = ({ week }) => {
  const info = babyWeek(week);
  const tokens = useWellnessTokens();

  // Shared BABY_DEVELOPMENT content starts at week 4, so the earliest weeks
  // have no entry. Show an intentional placeholder instead of vanishing.
  if (!info) {
    return (
      <View className="bg-surface rounded-2xl p-5 border border-border-subtle shadow-sm gap-2">
        <Text className="text-text-primary text-sm font-semibold">Baby this week</Text>
        <Text className="text-text-secondary text-xs leading-5">
          Week-by-week baby development starts around week 4. Check back soon!
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-2xl p-5 border border-border-subtle shadow-sm gap-3">
      <View className="flex-row items-center gap-4">
        <WombScene scene={info.wombScene} size={96} />
        <View className="flex-1 gap-1">
          <Text className="text-text-primary text-sm font-semibold">Baby this week</Text>
          <Text className="text-sm font-semibold" style={{ color: tokens.accent }}>
            Size of {info.comparison}
          </Text>
          <View className="flex-row gap-4 mt-1">
            {info.lengthCm != null && (
              <View>
                <Text className="text-text-secondary text-xs">Length</Text>
                <Text className="text-text-primary text-base font-bold">{info.lengthCm} cm</Text>
              </View>
            )}
            {info.weightG != null && (
              <View>
                <Text className="text-text-secondary text-xs">Weight</Text>
                <Text className="text-text-primary text-base font-bold">{info.weightG} g</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {!!info.babyBlurb && (
        <Text className="text-text-secondary text-xs leading-5">{info.babyBlurb}</Text>
      )}
      {!!info.momBlurb && (
        <View className="rounded-xl bg-raised p-3">
          <Text className="text-text-primary text-xs font-semibold mb-0.5">For you</Text>
          <Text className="text-text-secondary text-xs leading-5">{info.momBlurb}</Text>
        </View>
      )}
    </View>
  );
};

export default BabyGrowthView;
