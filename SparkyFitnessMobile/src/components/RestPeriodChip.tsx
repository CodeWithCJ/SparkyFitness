import React from 'react';
import { useTranslation } from 'react-i18next';
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
export function formatRestLabel(
  seconds: number | null | undefined,
  offLabel = 'Off',
): string {
  return seconds === 0 ? offLabel : formatRest(seconds);
}

/** Label a rest range as `min-max`, collapsing to a single value when equal. */
export function formatRestRangeLabel(
  values: (number | null | undefined)[],
  defaultRestSec: number,
  offLabel = 'Off',
): string {
  const normalized = values.map((v) => (v ?? defaultRestSec));
  if (normalized.length === 0) return formatRestLabel(defaultRestSec, offLabel);
  let min = normalized[0];
  let max = normalized[0];
  for (const value of normalized) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (min === max) return formatRestLabel(min, offLabel);
  return `${formatRestLabel(min, offLabel)}-${formatRestLabel(max, offLabel)}`;
}

interface RestPeriodChipProps {
  value: number | null | undefined;
  values?: (number | null | undefined)[];
  onPress?: () => void;
  readOnly?: boolean;
}

function RestPeriodChip({ value, values, onPress, readOnly = false }: RestPeriodChipProps) {
  const [textMuted, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];
  const defaultRestSec = useAppPreferencesStore((s) => s.defaultRestSec);
  const { t } = useTranslation();
  const label =
    values != null && values.length > 0
      ? formatRestRangeLabel(values, defaultRestSec, t('restPeriod.off', { defaultValue: 'Off' }))
      : formatRestLabel(value ?? defaultRestSec, t('restPeriod.off', { defaultValue: 'Off' }));

  if (readOnly) {
    return (
      <View
        className="flex-row items-center"
        accessibilityLabel={t('restPeriod.accessibilityLabel', {
          defaultValue: 'Rest {{duration}}',
          duration: label,
        })}
      >
        <Icon name="timer" size={14} color={textMuted} />
        <Text className="text-sm text-text-secondary ml-1">{t('restPeriod.rest', { defaultValue: 'Rest {{duration}}', duration: label })}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={t('restPeriod.buttonLabel', {
        defaultValue: 'Rest {{duration}}',
        duration: label,
      })}
      accessibilityHint={t('restPeriod.buttonHint', {
        defaultValue: 'Opens rest period selection',
      })}
    >
      <Icon name="timer" size={14} color={accentPrimary} />
      <Text className="text-sm" style={{ color: accentPrimary }}>
        {t('restPeriod.rest', { defaultValue: 'Rest {{duration}}', duration: label })}
      </Text>
      <Icon name="chevron-down" size={10} color={accentPrimary} />
    </Pressable>
  );
}

export default React.memo(RestPeriodChip);
