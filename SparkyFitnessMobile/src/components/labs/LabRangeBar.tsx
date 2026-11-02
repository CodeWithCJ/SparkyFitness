import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import type { LabRangeStatus } from '@workspace/shared';
import { formatLabRange, formatLabValue } from '../../utils/labResults';

interface LabRangeBarProps {
  value: number;
  low: number;
  high: number;
  unit: string;
  status: LabRangeStatus;
}

/** A single result placed on its reference range, shown instead of a one-point chart. */
const LabRangeBar: React.FC<LabRangeBarProps> = ({
  value,
  low,
  high,
  unit,
  status,
}) => {
  const { t } = useTranslation();
  const [success, warning, danger, textSecondary, accent] = useCSSVariable([
    '--color-text-success',
    '--color-text-warning',
    '--color-text-danger-subtle',
    '--color-text-secondary',
    '--color-accent-primary',
  ]) as [string, string, string, string, string];
  const markerColor =
    status === 'low'
      ? warning
      : status === 'high'
        ? danger
        : status === 'in_range'
          ? success
          : accent;

  const span = high - low || Math.abs(high) || 1;
  const min = Math.max(0, low - span * 0.5);
  const max = high + span * 0.5;
  const pct = (n: number) =>
    Math.min(100, Math.max(0, ((n - min) / (max - min)) * 100));

  return (
    <View
      className="pt-3 pb-1"
      accessible
      accessibilityLabel={t('labs.referenceRange', {
        defaultValue: 'Reference range: {{range}}',
        range: formatLabRange(low, high, unit),
      })}
    >
      <View className="h-6 justify-center">
        <View className="h-2 rounded-full bg-border-subtle" />
        <View
          className="absolute h-2 rounded-full"
          style={{
            left: `${pct(low)}%`,
            right: `${100 - pct(high)}%`,
            backgroundColor: success,
            opacity: 0.45,
          }}
        />
        {[low, high].map((edge) => (
          <View
            key={edge}
            className="absolute w-0.5 h-5 rounded-full"
            style={{
              left: `${pct(edge)}%`,
              backgroundColor: textSecondary,
            }}
          />
        ))}
        <View
          className="absolute w-5 h-5 rounded-full border-2 border-surface"
          style={{
            left: `${pct(value)}%`,
            marginLeft: -10,
            backgroundColor: markerColor,
          }}
        />
      </View>
      <View className="h-5 mt-1">
        <Text
          className="absolute text-text-secondary text-sm font-medium"
          style={{ left: `${pct(low)}%` }}
        >
          {formatLabValue(low, unit)}
        </Text>
        <Text
          className="absolute text-text-secondary text-sm font-medium"
          style={{ right: `${100 - pct(high)}%` }}
        >
          {formatLabValue(high, unit)}
        </Text>
      </View>
    </View>
  );
};

export default LabRangeBar;
