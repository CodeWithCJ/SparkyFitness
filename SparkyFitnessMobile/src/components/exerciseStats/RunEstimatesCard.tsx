import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { RunningEstimatesResponse } from '@workspace/shared';
import StatusView from '../StatusView';
import { formatLocalizedNumber } from '../../localization';

interface RunEstimatesCardProps {
  data: RunningEstimatesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * VO2 max and average running power worked out from logged runs. Both are
 * estimates from a model (pace, heart rate, weight and climb), so they are
 * labelled as such and never presented as a measurement. Nothing shows until
 * there is at least one of them.
 */
const RunEstimatesCard: React.FC<RunEstimatesCardProps> = ({
  data,
  isLoading,
  isError,
}) => {
  const { t } = useTranslation();

  if (!isLoading && !isError && (!data || (!data.vo2Max && !data.power))) {
    return null;
  }

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (!data) {
      return (
        <Text className="text-text-secondary text-sm">
          {t('exerciseStatistics.runEstimates.loadFailed', {
            defaultValue: 'Could not load your running estimates.',
          })}
        </Text>
      );
    }
    return (
      <View className="flex-row justify-between">
        {data.vo2Max ? (
          <View className="flex-1" testID="run-estimate-vo2">
            <Text className="text-text-primary text-2xl font-bold">
              {t('exerciseStatistics.runEstimates.about', {
                value: formatLocalizedNumber(data.vo2Max.value, {
                  maximumFractionDigits: 1,
                }),
                defaultValue: '≈ {{value}}',
              })}
            </Text>
            <Text className="text-text-secondary text-xs">
              {t('exerciseStatistics.runEstimates.vo2Unit', {
                defaultValue: 'VO₂ max (ml/kg/min)',
              })}
            </Text>
            <Text className="text-text-muted text-xs mt-1">
              {t('exerciseStatistics.runEstimates.vo2Basis', {
                count: data.vo2Max.runs,
                defaultValue: 'From {{count}} runs in the last 6 weeks',
                defaultValue_one: 'From {{count}} run in the last 6 weeks',
                defaultValue_other: 'From {{count}} runs in the last 6 weeks',
              })}
            </Text>
          </View>
        ) : null}
        {data.power ? (
          <View className="flex-1" testID="run-estimate-power">
            <Text className="text-text-primary text-2xl font-bold">
              {t('exerciseStatistics.runEstimates.watts', {
                value: formatLocalizedNumber(data.power.averageWatts),
                defaultValue: '≈ {{value}} W',
              })}
            </Text>
            <Text className="text-text-secondary text-xs">
              {t('exerciseStatistics.runEstimates.powerUnit', {
                perKg: formatLocalizedNumber(data.power.wattsPerKg, {
                  maximumFractionDigits: 1,
                }),
                defaultValue: 'Running power ({{perKg}} W/kg)',
              })}
            </Text>
            <Text className="text-text-muted text-xs mt-1">
              {t('exerciseStatistics.runEstimates.powerBasis', {
                count: data.power.runs.length,
                defaultValue: 'Average of {{count}} runs in the last 4 weeks',
                defaultValue_one:
                  'Average of {{count}} run in the last 4 weeks',
                defaultValue_other:
                  'Average of {{count}} runs in the last 4 weeks',
              })}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.runEstimates.title', {
          defaultValue: 'Running Estimates',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.runEstimates.subtitle', {
          defaultValue:
            'Estimated from your pace, heart rate, weight and climb. Not a measurement, so expect it to be off by several percent.',
        })}
      </Text>
      {renderBody()}
    </View>
  );
};

export default RunEstimatesCard;
