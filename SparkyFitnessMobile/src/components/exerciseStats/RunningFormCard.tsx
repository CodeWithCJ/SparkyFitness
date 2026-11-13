import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { formatLocalizedNumber } from '../../localization';
import { spmText, strideText } from '../../utils/cardioSessionStats';
import type { FormSeriesSummary, RunFormTrend } from '../../utils/runningForm';

interface RunningFormCardProps {
  trend: RunFormTrend;
  distanceUnit: 'km' | 'miles';
}

/** The newest runs shown as bars; older ones fall off the left. */
const MAX_BARS = 12;
const BAR_AREA_HEIGHT = 36;

const Bars: React.FC<{ values: number[] }> = ({ values }) => {
  const shown = values.slice(-MAX_BARS);
  const top = Math.max(...shown);
  return (
    <View
      className="flex-row items-end mt-2"
      style={{ height: BAR_AREA_HEIGHT, gap: 3 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {shown.map((value, index) => (
        <View
          key={index}
          className={`flex-1 rounded-sm ${
            index === shown.length - 1 ? 'bg-exercise' : 'bg-progress-track'
          }`}
          style={{ height: Math.max(4, (value / top) * BAR_AREA_HEIGHT) }}
        />
      ))}
    </View>
  );
};

const FormRow: React.FC<{
  label: string;
  latest: string;
  average: string;
  change: string | null;
  summary: FormSeriesSummary;
  testID: string;
}> = ({ label, latest, average, change, summary, testID }) => {
  const { t } = useTranslation();
  return (
    <View className="mb-3" testID={testID}>
      <View className="flex-row justify-between items-baseline">
        <Text className="text-text-primary text-sm">{label}</Text>
        <Text className="text-text-primary text-lg font-bold">{latest}</Text>
      </View>
      <Text className="text-text-secondary text-xs">
        {t('exerciseStatistics.runningForm.average', {
          defaultValue: 'Average {{value}}',
          value: average,
        })}
        {change
          ? ` · ${t('exerciseStatistics.runningForm.change', {
              defaultValue: '{{value}} vs earlier runs',
              value: change,
            })}`
          : ''}
      </Text>
      <Bars values={summary.values} />
    </View>
  );
};

const signed = (value: number, digits: number) =>
  formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: 'exceptZero',
  });

/** Cadence and stride across the range's runs, treadmill included. */
const RunningFormCard: React.FC<RunningFormCardProps> = ({
  trend,
  distanceUnit,
}) => {
  const { t } = useTranslation();
  const { cadence, stride } = trend;
  if (!cadence && !stride) return null;
  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.runningForm.title', {
          defaultValue: 'Running form',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.runningForm.subtitle', {
          defaultValue: 'Steps per minute and stride length on your runs',
        })}
      </Text>
      {cadence ? (
        <FormRow
          testID="running-form-cadence"
          label={t('exerciseStatistics.cardio.cadence', {
            defaultValue: 'Avg cadence',
          })}
          latest={spmText(t, cadence.latest)}
          average={spmText(t, cadence.average)}
          change={
            cadence.change != null && Math.abs(cadence.change) >= 1
              ? t('exerciseStatistics.cardio.spm', {
                  defaultValue: '{{value}} spm',
                  value: signed(cadence.change, 0),
                })
              : null
          }
          summary={cadence}
        />
      ) : null}
      {stride ? (
        <FormRow
          testID="running-form-stride"
          label={t('exerciseStatistics.cardio.strideLength', {
            defaultValue: 'Stride length',
          })}
          latest={strideText(t, stride.latest, distanceUnit)}
          average={strideText(t, stride.average, distanceUnit)}
          change={
            stride.change != null && Math.abs(stride.change) >= 1
              ? `${stride.change < 0 ? '−' : '+'}${strideText(
                  t,
                  Math.abs(stride.change),
                  distanceUnit
                )}`
              : null
          }
          summary={stride}
        />
      ) : null}
      <Text className="text-text-muted text-xs">
        {t('exerciseStatistics.runningForm.hint', {
          defaultValue: 'A treadmill run counts once its steps were measured.',
        })}
      </Text>
    </View>
  );
};

export default RunningFormCard;
