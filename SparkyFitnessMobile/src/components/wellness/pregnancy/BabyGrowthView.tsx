import React from 'react';
import { View, Text } from 'react-native';
import { babyWeek } from '@workspace/shared';
import { useWellnessTokens } from '../theme/wellnessTokens';
import WombScene from './WombScene';

import { useDiscreetMode } from '../../../hooks/useDiscreetMode';

interface BabyGrowthViewProps {
  week: number;
}

/** Fetal size/development for the current gestational week (shared content). */
const BabyGrowthView: React.FC<BabyGrowthViewProps> = ({ week }) => {
  const info = babyWeek(week);
  const tokens = useWellnessTokens();
  const { discreetMode } = useDiscreetMode();

  if (discreetMode) {
    return (
      <View className="bg-surface rounded-xl p-4 shadow-sm gap-2">
        <Text className="text-base font-bold text-text-secondary">Weekly Milestone</Text>
        <Text className="text-text-secondary text-xs leading-5">
          Week {week} active tracking.
        </Text>
      </View>
    );
  }

  // Shared BABY_DEVELOPMENT content starts at week 4, so the earliest weeks
  // have no entry. Show an intentional placeholder instead of vanishing.
  if (!info) {
    return (
      <View className="bg-surface rounded-xl p-4 shadow-sm gap-2">
        <Text className="text-base font-bold text-text-secondary">Baby this week</Text>
        <Text className="text-text-secondary text-xs leading-5">
          Week-by-week baby development starts around week 4. Check back soon!
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <Text className="text-base font-bold text-text-secondary">Baby this week</Text>
      <View className="flex-row items-center justify-evenly gap-4">
        <WombScene scene={info.wombScene} size={96} />
        <View className="shrink gap-1">
          <Text className="text-sm font-semibold" style={{ color: tokens.phasePregnant }}>
            Size of {info.comparison.toLowerCase()}
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
        <Text className="text-text-primary text-sm">{info.babyBlurb}</Text>
      )}
      {!!info.momBlurb && (
        <View className="gap-0.5">
          <Text className="text-text-secondary text-sm font-semibold">For you</Text>
          <Text className="text-text-primary text-sm leading-5">{info.momBlurb}</Text>
        </View>
      )}
    </View>
  );
};

export default BabyGrowthView;
