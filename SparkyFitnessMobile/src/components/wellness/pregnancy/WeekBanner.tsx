import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { GestationalAge } from '@workspace/shared';
import { formatDate } from '../../../utils/dateUtils';
import { useWellnessTokens } from '../theme/wellnessTokens';
import Icon from '../../Icon';

interface WeekBannerProps {
  ga: GestationalAge;
  dueDate: string;
  onEdit?: () => void;
}

const TRIMESTER_LABEL: Record<string, string> = {
  first: 'First trimester',
  second: 'Second trimester',
  third: 'Third trimester',
};

/** Gestational-age header: current week/day, trimester, term progress, due date. */
const WeekBanner: React.FC<WeekBannerProps> = ({ ga, dueDate, onEdit }) => {
  const tokens = useWellnessTokens();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const pct = Math.max(0, Math.min(1, ga.progress));

  return (
    <View className="bg-surface rounded-2xl p-5 border border-border-subtle shadow-sm gap-3">
      <View className="flex-row items-start justify-between">
        <View>
          <Text className="text-text-secondary text-xs">
            {TRIMESTER_LABEL[ga.trimester] ?? 'Pregnancy'}
          </Text>
          <Text className="text-text-primary text-2xl font-bold">
            {ga.week}w {ga.day}d
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="items-end">
            <Text className="text-text-secondary text-xs">Due</Text>
            <Text className="text-text-primary text-sm font-semibold">{formatDate(dueDate)}</Text>
          </View>
          {onEdit && (
            <TouchableOpacity onPress={onEdit} hitSlop={8} testID="week-banner-edit">
              <Icon name="pencil" size={16} color={textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Progress bar across the 280-day term */}
      <View className="h-2 rounded-full bg-raised overflow-hidden">
        <View
          className="h-full rounded-full"
          style={{ width: `${pct * 100}%`, backgroundColor: tokens.phasePregnant }}
        />
      </View>

      <Text className="text-text-secondary text-xs">
        {ga.daysRemaining > 0 ? `${ga.daysRemaining} days to go` : 'Any day now'}
      </Text>
    </View>
  );
};

export default WeekBanner;
