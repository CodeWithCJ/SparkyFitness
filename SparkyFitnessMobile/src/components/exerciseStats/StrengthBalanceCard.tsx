import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { View, Text } from 'react-native';
import {
  summarizeStrengthBalance,
  type KeyLift,
  type StrengthRatioResult,
  type StrengthSummaryResponse,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import { weightFromKg } from '../../utils/unitConversions';

interface StrengthBalanceCardProps {
  summary: StrengthSummaryResponse;
  weightUnit: 'kg' | 'lbs';
}

function liftLabel(t: TFunction, lift: KeyLift): string {
  switch (lift) {
    case 'squat':
      return t('exerciseStatistics.strengthBalance.lifts.squat', {
        defaultValue: 'Squat',
      });
    case 'bench':
      return t('exerciseStatistics.strengthBalance.lifts.bench', {
        defaultValue: 'Bench press',
      });
    case 'deadlift':
      return t('exerciseStatistics.strengthBalance.lifts.deadlift', {
        defaultValue: 'Deadlift',
      });
    case 'overhead_press':
      return t('exerciseStatistics.strengthBalance.lifts.overheadPress', {
        defaultValue: 'Overhead press',
      });
    case 'row':
      return t('exerciseStatistics.strengthBalance.lifts.row', {
        defaultValue: 'Row',
      });
  }
}

function statusLabel(
  t: TFunction,
  status: StrengthRatioResult['status']
): string {
  switch (status) {
    case 'low':
      return t('exerciseStatistics.strengthBalance.status.low', {
        defaultValue: 'Below range',
      });
    case 'high':
      return t('exerciseStatistics.strengthBalance.status.high', {
        defaultValue: 'Above range',
      });
    case 'balanced':
      return t('exerciseStatistics.strengthBalance.status.balanced', {
        defaultValue: 'Balanced',
      });
  }
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View className="flex-1 items-center">
    <Text className="text-text-primary text-lg font-bold">{value}</Text>
    <Text className="text-text-secondary text-xs mt-0.5">{label}</Text>
  </View>
);

/** Lifetime totals, key lifts against body weight and balance ratios. */
const StrengthBalanceCard: React.FC<StrengthBalanceCardProps> = ({
  summary,
  weightUnit,
}) => {
  const { t } = useTranslation();
  const { keyLifts, ratios } = summarizeStrengthBalance(
    summary.lifts,
    summary.bodyweightKg
  );
  const weight = (kg: number) =>
    `${formatLocalizedNumber(Math.round(weightFromKg(kg, weightUnit)))} ${weightUnit}`;
  const fixed2 = (value: number) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.strengthBalance.title', {
          defaultValue: 'Strength balance',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.strengthBalance.subtitle', {
          defaultValue: 'All-time bests, estimated one-rep max',
        })}
      </Text>
      <View className="flex-row mb-3">
        <Stat
          label={t('exerciseStatistics.strengthBalance.lifetimeVolume', {
            defaultValue: 'Lifetime volume',
          })}
          value={weight(summary.lifetime.volumeKg)}
        />
        <Stat
          label={t('exerciseStatistics.strengthBalance.lifetimeSets', {
            defaultValue: 'Sets',
          })}
          value={formatLocalizedNumber(summary.lifetime.sets)}
        />
        <Stat
          label={t('exerciseStatistics.strengthBalance.lifetimeSessions', {
            defaultValue: 'Sessions',
          })}
          value={formatLocalizedNumber(summary.lifetime.sessions)}
        />
      </View>
      {keyLifts.length === 0 ? (
        <Text className="text-text-secondary text-sm">
          {t('exerciseStatistics.strengthBalance.noKeyLifts', {
            defaultValue:
              'Log a squat, bench press, deadlift, overhead press or row to see how they compare.',
          })}
        </Text>
      ) : (
        keyLifts.map((row) => (
          <View
            key={row.lift}
            className="flex-row justify-between py-2 border-b border-border-subtle"
          >
            <View className="flex-1 pr-2">
              <Text className="text-text-primary text-sm">
                {liftLabel(t, row.lift)}
              </Text>
              <Text className="text-text-muted text-xs" numberOfLines={1}>
                {row.exerciseName}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-text-primary text-sm font-semibold">
                {weight(row.estimatedOneRMKg)}
              </Text>
              {row.bodyweightMultiple != null ? (
                <Text className="text-text-secondary text-xs">
                  {t('exerciseStatistics.strengthBalance.bodyweightMultiple', {
                    defaultValue: '{{value}}× body weight',
                    value: fixed2(row.bodyweightMultiple),
                  })}
                </Text>
              ) : null}
            </View>
          </View>
        ))
      )}
      {ratios.length > 0 ? (
        <View className="mt-3">
          <Text className="text-xs uppercase text-text-muted mb-1">
            {t('exerciseStatistics.strengthBalance.ratios', {
              defaultValue: 'Ratios',
            })}
          </Text>
          {ratios.map((ratio) => (
            <View key={ratio.key} className="flex-row justify-between py-1.5">
              <Text className="text-text-primary text-sm flex-1 pr-2">
                {liftLabel(t, ratio.top)} / {liftLabel(t, ratio.bottom)}
              </Text>
              <Text className="text-text-secondary text-sm">
                <Text className="text-text-primary font-semibold">
                  {fixed2(ratio.value)}
                </Text>
                {` (${fixed2(ratio.low)}–${fixed2(ratio.high)}) `}
                <Text
                  className={
                    ratio.status === 'balanced'
                      ? 'text-accent-primary'
                      : 'text-text-primary font-semibold'
                  }
                >
                  {statusLabel(t, ratio.status)}
                </Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {summary.bodyweightKg == null && keyLifts.length > 0 ? (
        <Text className="text-text-muted text-xs mt-3">
          {t('exerciseStatistics.strengthBalance.noBodyweight', {
            defaultValue:
              'Log your body weight to see lifts as a multiple of it.',
          })}
        </Text>
      ) : null}
    </View>
  );
};

export default StrengthBalanceCard;
