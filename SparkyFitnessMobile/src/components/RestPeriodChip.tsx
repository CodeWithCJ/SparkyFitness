import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import { DEFAULT_REST_SEC } from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useTranslation } from 'react-i18next';

/** Format a rest duration as `m:ss` when ≥ 60s, otherwise `Ns`. */
export function formatRest(seconds: number | null | undefined): string {
  const value = seconds ?? DEFAULT_REST_SEC;
  if (value < 60) return `${value}s`;
  const mins = Math.floor(value / 60);
  const secs = value % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Label a configured rest setting: 0 means no rest ("Off"), else the duration. */
export function formatRestLabel(seconds: number | null | undefined, offLabel: string): string {
  return seconds === 0 ? offLabel : formatRest(seconds);
}

interface RestPeriodChipProps {
  value: number | null | undefined;
  onPress?: () => void;
  readOnly?: boolean;
}

function RestPeriodChip({ value, onPress, readOnly = false }: RestPeriodChipProps) {
  const [textMuted, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];
  const defaultRestSec = useAppPreferencesStore((s) => s.defaultRestSec);
  const { t } = useTranslation();
  const label = formatRestLabel(value ?? defaultRestSec, t('mobileComponents.rest.off'));

  if (readOnly) {
    return (
      <View className="flex-row items-center" accessibilityLabel={t('mobileComponents.rest.label', { value: label })}>
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
        {t('mobileComponents.rest.label', { value: label })}
      </Text>
      <Icon name="chevron-down" size={10} color={accentPrimary} />
    </Pressable>
  );
}

export default React.memo(RestPeriodChip);
