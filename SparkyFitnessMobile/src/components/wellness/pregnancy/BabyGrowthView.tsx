import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { babyWeek } from '@workspace/shared';
import { useWellnessTokens } from '../theme/wellnessTokens';
import WombScene from './WombScene';
import {
  localizeBabyWeek,
  formatBabyLength,
  formatBabyWeight,
} from '../../../utils/pregnancyContentLocalization';

import { useDiscreetMode } from '../../../hooks/useDiscreetMode';

interface BabyGrowthViewProps {
  week: number;
}

/** Fetal size/development for the current gestational week (shared content). */
const BabyGrowthView: React.FC<BabyGrowthViewProps> = ({ week }) => {
  const { t } = useTranslation();
  const info = babyWeek(week);
  const localized = localizeBabyWeek(week, t);
  const tokens = useWellnessTokens();
  const { discreetMode } = useDiscreetMode();

  if (discreetMode) {
    return (
      <View className="bg-surface rounded-xl p-4 shadow-sm gap-2">
        <Text className="text-base font-bold text-text-secondary">{t('babyGrowth.weeklyMilestone', { defaultValue: 'Weekly Milestone' })}</Text>
        <Text className="text-text-secondary text-xs leading-5">
          {t('babyGrowth.weekActive', { defaultValue: 'Week {{week}} active tracking.', week })}
        </Text>
      </View>
    );
  }

  // Shared BABY_DEVELOPMENT content starts at week 4, so the earliest weeks
  // have no entry. Show an intentional placeholder instead of vanishing.
  if (!info) {
    return (
      <View className="bg-surface rounded-xl p-4 shadow-sm gap-2">
        <Text className="text-base font-bold text-text-secondary">{t('babyGrowth.title', { defaultValue: 'Baby this week' })}</Text>
        <Text className="text-text-secondary text-xs leading-5">
          {t('babyGrowth.noData', { defaultValue: 'Week-by-week baby development starts around week 4. Check back soon!' })}
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <Text className="text-base font-bold text-text-secondary">{t('babyGrowth.title', { defaultValue: 'Baby this week' })}</Text>
      <View className="flex-row items-center justify-evenly gap-4">
        <WombScene scene={info.wombScene} size={96} />
        <View className="shrink gap-1">
          <Text className="text-sm font-semibold" style={{ color: tokens.phasePregnant }}>
            {t('babyGrowth.sizeOf', { defaultValue: 'Size of {{comparison}}', comparison: (localized?.comparison ?? info.comparison).toLowerCase() })}
          </Text>
          <View className="flex-row gap-4 mt-1">
            {info.lengthCm != null && (
              <View>
                <Text className="text-text-secondary text-xs">{t('babyGrowth.length', { defaultValue: 'Length' })}</Text>
                <Text className="text-text-primary text-base font-bold">{formatBabyLength(info.lengthCm)}</Text>
              </View>
            )}
            {info.weightG != null && (
              <View>
                <Text className="text-text-secondary text-xs">{t('babyGrowth.weight', { defaultValue: 'Weight' })}</Text>
                <Text className="text-text-primary text-base font-bold">{formatBabyWeight(info.weightG)}</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {localized?.baby && (
        <Text className="text-text-primary text-sm">{localized.baby}</Text>
      )}
      {localized?.mom && (
        <View className="gap-0.5">
          <Text className="text-text-secondary text-sm font-semibold">{t('babyGrowth.forYou', { defaultValue: 'For you' })}</Text>
          <Text className="text-text-primary text-sm leading-5">{localized.mom}</Text>
        </View>
      )}
    </View>
  );
};

export default BabyGrowthView;
