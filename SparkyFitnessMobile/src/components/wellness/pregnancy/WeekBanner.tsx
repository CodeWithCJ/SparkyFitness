import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { GestationalAge, Trimester } from '@workspace/shared';
import { formatDate } from '../../../utils/dateUtils';
import { useWellnessTokens } from '../theme/wellnessTokens';
import Icon from '../../Icon';

import { useDiscreetMode } from '../../../hooks/useDiscreetMode';

interface WeekBannerProps {
  ga: GestationalAge;
  dueDate: string;
  onEdit?: () => void;
}

const TRIMESTER_LABEL: Record<Trimester, string> = {
  1: 'First trimester',
  2: 'Second trimester',
  3: 'Third trimester',
};

/** Gestational-age header: current week/day, trimester, term progress, due date. */
const WeekBanner: React.FC<WeekBannerProps> = ({ ga, dueDate, onEdit }) => {
  const tokens = useWellnessTokens();
  const [accentPrimary] = useCSSVariable(['--color-accent-primary']) as [string];
  const { discreetMode } = useDiscreetMode();
  const pct = Math.max(0, Math.min(1, ga.progress));

  const dueLabel = !discreetMode && (
    <Text className="text-text-secondary text-sm">
      Due <Text className="text-accent-primary font-semibold">{formatDate(dueDate)}</Text>
    </Text>
  );

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="text-text-secondary text-base">
            {discreetMode ? 'Wellness Progress' : TRIMESTER_LABEL[ga.trimester]}
          </Text>
          <Text className="text-text-primary text-2xl font-bold">
            {discreetMode ? `Week ${ga.week}` : `${ga.week}w ${ga.day}d`}
          </Text>
        </View>
        {onEdit ? (
          <TouchableOpacity
            onPress={onEdit}
            hitSlop={8}
            testID="week-banner-edit"
            accessibilityRole="button"
            accessibilityLabel="Edit pregnancy details"
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
          {ga.daysRemaining > 0 ? `${ga.daysRemaining} days to go` : 'Any day now'}
        </Text>
      )}
    </View>
  );
};

export default WeekBanner;
