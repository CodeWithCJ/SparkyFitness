import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { DEFAULT_REST_SEC } from '../utils/workoutSession';

/** Format a rest duration as `m:ss` when ≥ 60s, otherwise `Ns`. */
export function formatRest(seconds: number | null | undefined): string {
  const value = seconds ?? DEFAULT_REST_SEC;
  if (value < 60) return `${value}s`;
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Label a configured rest setting: 0 means no rest ("Off"), else the duration. */
export function formatRestLabel(seconds: number | null | undefined): string {
  return seconds === 0 ? 'Off' : formatRest(seconds);
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
        <Text className="text-sm text-text-secondary ml-1">Rest {formatRestLabel(value)}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <Icon name="timer" size={14} color={accentPrimary} />
      <Text className="text-sm" style={{ color: accentPrimary }}>
        Rest {formatRestLabel(value)}
      </Text>
      <Icon name="chevron-down" size={10} color={accentPrimary} />
    </Pressable>
  );
}

export default React.memo(RestPeriodChip);
