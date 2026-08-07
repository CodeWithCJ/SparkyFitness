import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { DEFAULT_REST_SEC } from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

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

/** Label a rest range as `min-max`, collapsing to a single value when equal. */
export function formatRestRangeLabel(
  values: Array<number | null | undefined>,
  defaultRestSec: number,
): string {
  const normalized = values.map((v) => (v ?? defaultRestSec));
  if (normalized.length === 0) return formatRestLabel(defaultRestSec);
  let min = normalized[0];
  let max = normalized[0];
  for (const value of normalized) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) return formatRestLabel(min);
  return `${formatRestLabel(min)}-${formatRestLabel(max)}`;
}

interface RestPeriodChipProps {
  value: number | null | undefined;
  values?: Array<number | null | undefined>;
  onPress?: () => void;
  readOnly?: boolean;
}

function RestPeriodChip({ value, values, onPress, readOnly = false }: RestPeriodChipProps) {
  const [textMuted, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];
  const defaultRestSec = useAppPreferencesStore((s) => s.defaultRestSec);
  const label =
    values != null && values.length > 0
      ? formatRestRangeLabel(values, defaultRestSec)
      : formatRestLabel(value ?? defaultRestSec);

  if (readOnly) {
    return (
      <View className="flex-row items-center" accessibilityLabel={`Rest ${label}`}>
        <Icon name="timer" size={14} color={textMuted} />
        <Text className="text-sm text-text-secondary ml-1">{label}</Text>
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
        Rest {label}
      </Text>
      <Icon name="chevron-down" size={10} color={accentPrimary} />
    </Pressable>
  );
}

export default React.memo(RestPeriodChip);
