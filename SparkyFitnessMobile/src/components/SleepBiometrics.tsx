import {
  convertTemperature,
  convertTemperatureDelta,
  type TemperatureUnit,
} from '@workspace/shared';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import { useSleepBiometricTrend } from '../hooks/useSleepBiometricTrend';
import { formatLocalizedNumber } from '../localization';
import type { SleepEntry } from '../types/sleep';
import type { NightSkinTemperature } from '../utils/skinTemperature';
import {
  biometricTrendStart,
  SLEEP_ENTRY_BIOMETRICS,
  type BiometricTrendPoint,
  type SleepBiometricKey,
  type SleepEntryBiometricKey,
} from '../utils/sleepBiometricTrend';
import Icon, { type IconName } from './Icon';
import SleepBiometricTrendChart from './SleepBiometricTrendChart';

interface BiometricRow {
  key: SleepBiometricKey;
  icon: IconName;
  label: string;
  value: number | null | undefined;
  unit: string;
  format?: Intl.NumberFormatOptions;
  /** Turns a stored value into the unit shown, for the row and its chart. */
  convert?: (value: number) => number;
}

interface SleepBiometricsProps {
  entry: SleepEntry;
  /** The night's skin temperature, from a source that reports one. */
  skinTemperature?: NightSkinTemperature | null;
  /** Unit temperatures are shown in; stored values are always °C. */
  temperatureUnit?: TemperatureUnit;
  /**
   * Whether tapping a row opens its 30-night trend. Off for a nap: the trend
   * follows each night's main sleep, so it would not match the nap's values.
   */
  showTrends?: boolean;
}

const TEMPERATURE_FORMAT: Intl.NumberFormatOptions = {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
};
const TEMPERATURE_DEVIATION_FORMAT: Intl.NumberFormatOptions = {
  ...TEMPERATURE_FORMAT,
  signDisplay: 'exceptZero',
};

const convertPoints = (
  points: BiometricTrendPoint[],
  convert?: (value: number) => number
): BiometricTrendPoint[] =>
  convert
    ? points.map((point) => ({ ...point, value: convert(point.value) }))
    : points;

/**
 * Overnight SpO2, resting heart rate, HRV and skin temperature. Tapping a row opens
 * the trend of that biometric over the last nights.
 */
const SleepBiometrics: React.FC<SleepBiometricsProps> = ({
  entry,
  skinTemperature,
  temperatureUnit = 'celsius',
  showTrends = true,
}) => {
  const { t } = useTranslation();
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const [expandedKey, setExpandedKey] = useState<SleepBiometricKey | null>(
    null
  );
  const trend = useSleepBiometricTrend(
    entry.entry_date,
    showTrends ? expandedKey : null
  );

  const percentUnit = t('sleep.percentUnit', { defaultValue: '%' });
  const bpmUnit = t('sleep.bpmUnit', { defaultValue: 'bpm' });
  const msUnit = t('sleep.msUnit', { defaultValue: 'ms' });
  const temperatureUnitLabel =
    temperatureUnit === 'fahrenheit'
      ? t('sleep.fahrenheitUnit', { defaultValue: '°F' })
      : t('sleep.celsiusUnit', { defaultValue: '°C' });

  const entryValue = (key: SleepEntryBiometricKey) =>
    entry[SLEEP_ENTRY_BIOMETRICS[key]];

  const rows: BiometricRow[] = [
    {
      key: 'averageSpo2' as const,
      icon: 'spo2' as const,
      label: t('sleep.averageSpo2', { defaultValue: 'Average SpO2' }),
      value: entryValue('averageSpo2'),
      unit: percentUnit,
    },
    {
      key: 'lowestSpo2' as const,
      icon: 'spo2' as const,
      label: t('sleep.lowestSpo2', { defaultValue: 'Lowest SpO2' }),
      value: entryValue('lowestSpo2'),
      unit: percentUnit,
    },
    {
      key: 'highestSpo2' as const,
      icon: 'spo2' as const,
      label: t('sleep.highestSpo2', { defaultValue: 'Highest SpO2' }),
      value: entryValue('highestSpo2'),
      unit: percentUnit,
    },
    {
      key: 'restingHeartRate' as const,
      icon: 'heart-rate' as const,
      label: t('sleep.restingHeartRate', {
        defaultValue: 'Resting heart rate',
      }),
      value: entryValue('restingHeartRate'),
      unit: bpmUnit,
    },
    {
      key: 'overnightHrv' as const,
      icon: 'heart-rate' as const,
      label: t('sleep.overnightHrv', { defaultValue: 'Overnight HRV' }),
      value: entryValue('overnightHrv'),
      unit: msUnit,
    },
    {
      key: 'skinTemperature' as const,
      icon: 'skin-temperature' as const,
      label: t('sleep.skinTemperature', { defaultValue: 'Skin temperature' }),
      value: skinTemperature?.celsius,
      unit: temperatureUnitLabel,
      format: TEMPERATURE_FORMAT,
      convert: (value: number) => convertTemperature(value, temperatureUnit),
    },
    {
      key: 'skinTemperatureDeviation' as const,
      icon: 'skin-temperature' as const,
      label: t('sleep.skinTemperatureDeviation', {
        defaultValue: 'Skin temp. vs usual',
      }),
      value: skinTemperature?.deviation,
      unit: temperatureUnitLabel,
      format: TEMPERATURE_DEVIATION_FORMAT,
      convert: (value: number) =>
        convertTemperatureDelta(value, temperatureUnit),
    },
  ].filter((row) => row.value != null);

  if (rows.length === 0) return null;

  return (
    <View
      testID="sleep-biometrics"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
    >
      <Text className="text-base font-semibold text-text-primary mb-2">
        {t('sleep.biometrics', { defaultValue: 'Overnight Biometrics' })}
      </Text>

      {rows.map((row) => {
        const value = row.value as number;
        const shown = row.convert ? row.convert(value) : value;
        const expanded = showTrends && expandedKey === row.key;
        return (
          <View key={row.key}>
            <Pressable
              testID={`sleep-biometric-${row.key}`}
              disabled={!showTrends}
              accessibilityRole={showTrends ? 'button' : undefined}
              accessibilityState={showTrends ? { expanded } : undefined}
              accessibilityHint={
                showTrends
                  ? t('sleep.showTrendHint', {
                      defaultValue: 'Shows this value over the last 30 nights',
                    })
                  : undefined
              }
              onPress={() => setExpandedKey(expanded ? null : row.key)}
              className="flex-row items-center justify-between py-1.5"
            >
              <View className="flex-row items-center flex-1">
                <Icon
                  name={row.icon}
                  size={16}
                  color={row.icon === 'heart-rate' ? accentPrimary : textMuted}
                  style={{ marginRight: 8 }}
                />
                <Text className="text-base text-text-primary">{row.label}</Text>
              </View>
              <Text className="text-base font-semibold text-text-primary">
                {formatLocalizedNumber(shown, row.format)} {row.unit}
              </Text>
              {showTrends ? (
                <Icon
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={textMuted}
                  style={{ marginLeft: 6 }}
                />
              ) : null}
            </Pressable>
            {expanded ? (
              <SleepBiometricTrendChart
                testID={`sleep-biometric-trend-${row.key}`}
                points={convertPoints(trend.points, row.convert)}
                startDay={biometricTrendStart(entry.entry_date)}
                unit={row.unit}
                format={row.format}
                isLoading={trend.isLoading}
                isError={trend.isError}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
};

export default SleepBiometrics;
