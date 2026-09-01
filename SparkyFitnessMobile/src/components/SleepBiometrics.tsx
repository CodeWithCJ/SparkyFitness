import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { formatLocalizedNumber } from '../localization';
import type { SleepEntry } from '../types/sleep';
import Icon, { type IconName } from './Icon';

interface BiometricRow {
  key: string;
  icon: IconName;
  label: string;
  value: number;
  unit: string;
}

interface SleepBiometricsProps {
  entry: SleepEntry;
}

/**
 * Overnight SpO2 and resting heart rate.
 */
const SleepBiometrics: React.FC<SleepBiometricsProps> = ({ entry }) => {
  const { t } = useTranslation();
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const percentUnit = t('sleep.percentUnit', { defaultValue: '%' });
  const bpmUnit = t('sleep.bpmUnit', { defaultValue: 'bpm' });

  const rows: BiometricRow[] = [
    {
      key: 'averageSpo2',
      icon: 'spo2',
      label: t('sleep.averageSpo2', { defaultValue: 'Average SpO2' }),
      value: entry.average_spo2_value,
      unit: percentUnit,
    },
    {
      key: 'lowestSpo2',
      icon: 'spo2',
      label: t('sleep.lowestSpo2', { defaultValue: 'Lowest SpO2' }),
      value: entry.lowest_spo2_value,
      unit: percentUnit,
    },
    {
      key: 'highestSpo2',
      icon: 'spo2',
      label: t('sleep.highestSpo2', { defaultValue: 'Highest SpO2' }),
      value: entry.highest_spo2_value,
      unit: percentUnit,
    },
    {
      key: 'restingHeartRate',
      icon: 'heart-rate',
      label: t('sleep.restingHeartRate', {
        defaultValue: 'Resting heart rate',
      }),
      value: entry.resting_heart_rate,
      unit: bpmUnit,
    },
  ].filter((row): row is BiometricRow => row.value != null);

  if (rows.length === 0) return null;

  return (
    <View
      testID="sleep-biometrics"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <Text className="text-base font-semibold text-text-primary mb-2">
        {t('sleep.biometrics', { defaultValue: 'Overnight Biometrics' })}
      </Text>

      {rows.map((row) => (
        <View
          key={row.key}
          testID={`sleep-biometric-${row.key}`}
          className="flex-row items-center justify-between py-1.5"
        >
          <View className="flex-row items-center">
            <Icon
              name={row.icon}
              size={16}
              color={row.icon === 'heart-rate' ? accentPrimary : textMuted}
              style={{ marginRight: 8 }}
            />
            <Text className="text-base text-text-primary">{row.label}</Text>
          </View>
          <Text className="text-base font-semibold text-text-primary">
            {formatLocalizedNumber(row.value)} {row.unit}
          </Text>
        </View>
      ))}
    </View>
  );
};

export default SleepBiometrics;
