import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { babyWeek } from '@workspace/shared';
import { useWellnessTokens } from '../theme/wellnessTokens';
import WombScene from './WombScene';
import { formatLocalizedNumber } from '../../../localization';

import { useDiscreetMode } from '../../../hooks/useDiscreetMode';

interface BabyGrowthViewProps {
  week: number;
}

/** Fetal size/development for the current gestational week (shared content). */
const BabyGrowthView: React.FC<BabyGrowthViewProps> = ({ week }) => {
  const info = babyWeek(week);
  const tokens = useWellnessTokens();
  const { discreetMode } = useDiscreetMode();
  const { t } = useTranslation();

  if (discreetMode) {
    return (
      <View className="bg-surface rounded-xl p-5 shadow-sm border-0 gap-2">
         <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.wellness.pregnancy.weeklyMilestone')}</Text>
        <Text className="text-text-secondary text-xs leading-5">
           {t('mobileComponents.wellness.pregnancy.weekActive', { week })}
        </Text>
      </View>
    );
  }

  // Shared BABY_DEVELOPMENT content starts at week 4, so the earliest weeks
  // have no entry. Show an intentional placeholder instead of vanishing.
  if (!info) {
    return (
      <View className="bg-surface rounded-xl p-5 shadow-sm border-0 gap-2">
         <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.wellness.pregnancy.babyThisWeek')}</Text>
        <Text className="text-text-secondary text-xs leading-5">
           {t('mobileComponents.wellness.pregnancy.checkBack')}
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <Text className="text-base font-bold text-text-secondary">{t('mobileComponents.wellness.pregnancy.babyThisWeek')}</Text>
      <View className="flex-row items-center justify-evenly gap-4">
        <WombScene scene={info.wombScene} size={96} />
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold" style={{ color: tokens.phasePregnant }}>
             {t('mobileComponents.wellness.pregnancy.sizeOf', { value: info.comparison })}
          </Text>
          <View className="flex-row gap-4 mt-1">
            {info.lengthCm != null && (
              <View>
                 <Text className="text-text-secondary text-xs">{t('mobileComponents.wellness.pregnancy.length')}</Text>
                <Text className="text-text-primary text-base font-bold">
                  {t('cycleCard.pregnancy.length', { value: formatLocalizedNumber(info.lengthCm) })}
                </Text>
              </View>
            )}
            {info.weightG != null && (
              <View>
                 <Text className="text-text-secondary text-xs">{t('mobileComponents.wellness.pregnancy.weight')}</Text>
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
        <View className="rounded-xl bg-raised p-3">
           <Text className="text-text-primary text-xs font-semibold mb-0.5">{t('mobileComponents.wellness.pregnancy.forYou')}</Text>
          <Text className="text-text-secondary text-xs leading-5">{info.momBlurb}</Text>
        </View>
      )}
    </View>
  );
};

export default BabyGrowthView;
