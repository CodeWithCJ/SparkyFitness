import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { GestationalAge } from '@workspace/shared';
import { formatDate } from '../../../utils/dateUtils';
import { useWellnessTokens } from '../theme/wellnessTokens';
import Icon from '../../Icon';

import { useDiscreetMode } from '../../../hooks/useDiscreetMode';

interface WeekBannerProps {
  ga: GestationalAge;
  dueDate: string;
  onEdit?: () => void;
}


/** Gestational-age header: current week/day, trimester, term progress, due date. */
const WeekBanner: React.FC<WeekBannerProps> = ({ ga, dueDate, onEdit }) => {
  const { t , i18n: translationI18n } = useTranslation();
  const dateLocale = translationI18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const tokens = useWellnessTokens();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [string];
  const { discreetMode } = useDiscreetMode();
  const pct = Math.max(0, Math.min(1, ga.progress));
  const trimesterLabel = ga.trimester === 1
    ? t('pregnancy.trimester.first', { defaultValue: 'First trimester' })
    : ga.trimester === 2
      ? t('pregnancy.trimester.second', { defaultValue: 'Second trimester' })
      : t('pregnancy.trimester.third', { defaultValue: 'Third trimester' });

  const dueLabel = !discreetMode && (
    <Text className="text-text-secondary text-sm">
      {t('pregnancy.weekBanner.due', { defaultValue: 'Due' })} <Text className="text-accent-primary font-semibold">{formatDate(dueDate, dateLocale)}</Text>
    </Text>
  );

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-text-secondary text-base">
            {discreetMode ? t('pregnancy.weekBanner.wellnessProgress', { defaultValue: 'Wellness Progress' }) : trimesterLabel}
          </Text>
          <Text className="text-text-primary text-2xl font-bold">
            {discreetMode ? t('pregnancy.weekBanner.week', { defaultValue: 'Week {{week}}', week: ga.week }) : t('pregnancy.weekBanner.weekDay', { defaultValue: '{{week}}w {{day}}d', week: ga.week, day: ga.day })}
          </Text>
        </View>
        {onEdit ? (
          <TouchableOpacity
            onPress={onEdit}
            hitSlop={8}
            testID="week-banner-edit"
            accessibilityRole="button"
            accessibilityLabel={t('pregnancy.weekBanner.edit', { defaultValue: 'Edit pregnancy details' })}
            className="flex-row items-center gap-1"
          >
            {dueLabel}
            <Icon name="chevron-forward" size={16} color={accentPrimary} />
          </TouchableOpacity>
        ) : (
          dueLabel
        )}
      </View>

      {/* Progress bar across the 280-day term */}
      <View className="h-2 rounded-full bg-progress-track overflow-hidden">
        <View
          className="h-full rounded-full"
          style={{ width: `${pct * 100}%`, backgroundColor: tokens.phasePregnant }}
        />
      </View>

      {!discreetMode && (
        <Text className="text-text-secondary text-base">
          {ga.daysRemaining > 0 ? t('pregnancy.weekBanner.daysToGo', { defaultValue: '{{days}} days to go', days: ga.daysRemaining, count: ga.daysRemaining }) : t('pregnancy.weekBanner.anyDayNow', { defaultValue: 'Any day now' })}
        </Text>
      )}
    </View>
  );
};

export default WeekBanner;
