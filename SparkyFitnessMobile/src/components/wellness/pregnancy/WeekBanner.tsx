import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { GestationalAge } from '@workspace/shared';
import { formatDate } from '../../../utils/dateUtils';
import { useWellnessTokens } from '../theme/wellnessTokens';
import Icon from '../../Icon';

import { useDiscreetMode } from '../../../hooks/useDiscreetMode';
import { useTranslation } from 'react-i18next';
import { formatLocalizedNumber } from '../../../localization';

interface WeekBannerProps {
  ga: GestationalAge;
  dueDate: string;
  onEdit?: () => void;
}

function trimesterLabel(trimester: string | number, t: (key: string) => string): string {
  switch (String(trimester)) {
    case 'first': return t('mobileComponents.pregnancy.firstTrimester');
    case 'second': return t('mobileComponents.pregnancy.secondTrimester');
    case 'third': return t('mobileComponents.pregnancy.thirdTrimester');
    default: return t('cycleCard.title.pregnancy');
  }
}

/** Gestational-age header: current week/day, trimester, term progress, due date. */
const WeekBanner: React.FC<WeekBannerProps> = ({ ga, dueDate, onEdit }) => {
  const tokens = useWellnessTokens();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const { discreetMode } = useDiscreetMode();
  const { t } = useTranslation();
  const pct = Math.max(0, Math.min(1, ga.progress));

  const dueLabel = !discreetMode && (
    <Text className="text-text-secondary text-sm">
      {t('mobileComponents.pregnancy.due')} <Text className="text-accent-primary font-semibold">{formatDate(dueDate)}</Text>
    </Text>
  );

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-text-secondary text-xs">
            {discreetMode ? t('mobileComponents.pregnancy.wellnessProgress') : trimesterLabel(ga.trimester, t)}
          </Text>
          <Text className="text-text-primary text-2xl font-bold">
            {discreetMode ? t('mobileComponents.pregnancy.week', { week: formatLocalizedNumber(ga.week) }) : t('mobileComponents.pregnancy.weekDay', { week: formatLocalizedNumber(ga.week), day: formatLocalizedNumber(ga.day) })}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          {!discreetMode && dueLabel}
          {onEdit && (
            <TouchableOpacity onPress={onEdit} hitSlop={8} testID="week-banner-edit">
              <Icon name="pencil" size={16} color={textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress bar across the 280-day term */}
      <View className="h-2 rounded-full bg-progress-track overflow-hidden">
        <View
          className="h-full rounded-full"
          style={{ width: `${pct * 100}%`, backgroundColor: tokens.phasePregnant }}
        />
      </View>

      {!discreetMode && (
        <Text className="text-text-secondary text-xs">
          {ga.daysRemaining > 0 ? t('mobileComponents.pregnancy.daysToGo', { count: ga.daysRemaining, formattedCount: formatLocalizedNumber(ga.daysRemaining) }) : t('mobileComponents.pregnancy.anyDay')}
        </Text>
      )}
    </View>
  );
};

export default WeekBanner;
