import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { DEFAULT_REST_SEC } from '../utils/workoutSession';
import { formatMobileNumber, mobileT } from '../localization';

/** Format a rest duration as localized `m:ss` when ≥ 60s, otherwise seconds. */
export function formatRest(seconds: number | null | undefined): string {
  const value = seconds ?? DEFAULT_REST_SEC;
  if (value < 60) {
    return `${formatMobileNumber(value, {
      maximumFractionDigits: 0,
    })} ${mobileT('units.secondShort')}`;
  }
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return `${formatMobileNumber(mins, {
    maximumFractionDigits: 0,
  })}:${formatMobileNumber(secs, {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
    useGrouping: false,
  })}`;
}

interface RestPeriodChipProps {
  value: number | null | undefined;
  onPress?: () => void;
  readOnly?: boolean;
}

function RestPeriodChip({ value, onPress, readOnly = false }: RestPeriodChipProps) {
  const [textSecondary, accentPrimary] = useCSSVariable([
    '--color-text-secondary',
    '--color-accent-primary',
  ]) as [string, string];

  if (readOnly) {
    return (
      <View className="flex-row items-center">
        <Icon name="timer" size={14} color={textSecondary} />
        <Text className="text-sm text-text-secondary ms-1">
          {mobileT('workoutCard.rest')} · {formatRest(value)}
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Icon name="timer" size={14} color={accentPrimary} />
      <Text className="text-sm ms-1" style={{ color: accentPrimary }}>
        {mobileT('workoutCard.rest')} · {formatRest(value)}
      </Text>
    </Pressable>
  );
}

export default React.memo(RestPeriodChip);
