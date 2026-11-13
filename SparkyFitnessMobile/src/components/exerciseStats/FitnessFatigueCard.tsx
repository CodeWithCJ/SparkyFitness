import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type {
  FormStatus,
  ReadinessFactor,
  ReadinessLevel,
  FitnessFatigueResponse,
} from '@workspace/shared';
import StatusView from '../StatusView';
import { formatLocalizedNumber } from '../../localization';

interface FitnessFatigueCardProps {
  data: FitnessFatigueResponse | undefined;
  isLoading: boolean;
  isError: boolean;
}

const BAR_AREA_HEIGHT = 64;
/** Days of form shown as bars. */
const FORM_DAYS = 28;

const LEVEL_COLOR: Record<ReadinessLevel, string> = {
  noData: 'text-text-secondary',
  low: 'text-text-danger-subtle',
  moderate: 'text-text-warning',
  high: 'text-text-success',
};

/**
 * Today's readiness to train hard and the fitness / fatigue / form numbers
 * behind it, with the last four weeks of form. Built from workout load, sleep
 * and, when a watch recorded them, resting heart rate and HRV, so it is a guide
 * from your own history, not a measurement.
 */
const FitnessFatigueCard: React.FC<FitnessFatigueCardProps> = ({
  data,
  isLoading,
  isError,
}) => {
  const { t } = useTranslation();

  const levelText = (level: ReadinessLevel): string => {
    switch (level) {
      case 'high':
        return t('exerciseStatistics.fitness.level.high', {
          defaultValue: 'Ready for a hard session.',
        });
      case 'moderate':
        return t('exerciseStatistics.fitness.level.moderate', {
          defaultValue: 'Fine for a normal session, but not your hardest.',
        });
      case 'low':
        return t('exerciseStatistics.fitness.level.low', {
          defaultValue:
            'Not recovered. An easy day or rest is the better call.',
        });
      default:
        return t('exerciseStatistics.fitness.level.noData', {
          defaultValue:
            'Not enough to go on yet. Log workouts and sleep to see your readiness.',
        });
    }
  };

  const statusText = (status: FormStatus): string | null => {
    switch (status) {
      case 'fresh':
        return t('exerciseStatistics.fitness.form.fresh', {
          defaultValue:
            'Fresh: recent training is light against what you have built.',
        });
      case 'tired':
        return t('exerciseStatistics.fitness.form.tired', {
          defaultValue:
            'Tired: recent training is heavy against what you have built.',
        });
      case 'neutral':
        return t('exerciseStatistics.fitness.form.neutral', {
          defaultValue:
            'Balanced: recent training matches what you have built.',
        });
      case 'learning':
        return t('exerciseStatistics.fitness.form.learning', {
          defaultValue: 'Still learning your normal. Keep logging.',
        });
      default:
        return null;
    }
  };

  const factorLabel = (factor: ReadinessFactor): string => {
    switch (factor) {
      case 'form':
        return t('exerciseStatistics.fitness.factor.form', {
          defaultValue: 'Training form',
        });
      case 'sleep':
        return t('exerciseStatistics.fitness.factor.sleep', {
          defaultValue: 'Sleep',
        });
      case 'restingHeartRate':
        return t('exerciseStatistics.fitness.factor.restingHeartRate', {
          defaultValue: 'Resting heart rate',
        });
      default:
        return t('exerciseStatistics.fitness.factor.hrv', {
          defaultValue: 'HRV',
        });
    }
  };

  /** "41 ms against your usual 68 ms (median of 9 nights)" under a watch factor. */
  const vitalText = (
    factor: ReadinessFactor,
    readiness: FitnessFatigueResponse['readiness']
  ): string | null => {
    if (factor !== 'hrv' && factor !== 'restingHeartRate') return null;
    const vital = readiness.vitals?.[factor];
    if (!vital) return null;
    const values = {
      current: formatLocalizedNumber(vital.current, {
        maximumFractionDigits: 1,
      }),
      baseline: formatLocalizedNumber(vital.baseline, {
        maximumFractionDigits: 1,
      }),
      count: vital.nights,
    };
    const hasNights = vital.nights !== undefined;
    if (factor === 'hrv') {
      return hasNights
        ? t('exerciseStatistics.fitness.vital.hrvNights', {
            ...values,
            defaultValue:
              '{{current}} ms against your usual {{baseline}} ms (median of {{count}} nights)',
          })
        : t('exerciseStatistics.fitness.vital.hrv', {
            ...values,
            defaultValue: '{{current}} ms against your usual {{baseline}} ms',
          });
    }
    return hasNights
      ? t('exerciseStatistics.fitness.vital.restingHeartRateNights', {
          ...values,
          defaultValue:
            '{{current}} bpm against your usual {{baseline}} bpm (median of {{count}} nights)',
        })
      : t('exerciseStatistics.fitness.vital.restingHeartRate', {
          ...values,
          defaultValue: '{{current}} bpm against your usual {{baseline}} bpm',
        });
  };

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (!data) {
      return isError ? (
        <Text className="text-text-secondary text-sm">
          {t('exerciseStatistics.fitness.loadFailed', {
            defaultValue: 'Could not load your readiness.',
          })}
        </Text>
      ) : null;
    }
    const { readiness, fitnessFatigue } = data;
    const today = fitnessFatigue.today;
    const factors = Object.entries(readiness.factors) as [
      ReadinessFactor,
      number,
    ][];
    const recent = fitnessFatigue.points.slice(-FORM_DAYS);
    const peak = Math.max(1, ...recent.map((point) => Math.abs(point.form)));
    const half = BAR_AREA_HEIGHT / 2;
    const formText = statusText(fitnessFatigue.status);
    return (
      <>
        <View className="flex-row items-end mb-1">
          <Text className="text-text-primary text-3xl font-bold">
            {readiness.score === null
              ? '–'
              : formatLocalizedNumber(readiness.score)}
          </Text>
          <Text className="text-text-secondary text-sm ml-1 mb-1">
            {t('exerciseStatistics.fitness.outOf', {
              defaultValue: 'readiness out of 100',
            })}
          </Text>
        </View>
        <Text className={`text-sm mb-3 ${LEVEL_COLOR[readiness.level]}`}>
          {levelText(readiness.level)}
        </Text>
        {factors.map(([factor, score]) => {
          const detail = vitalText(factor, readiness);
          return (
            <View key={factor} className="mb-1">
              <View className="flex-row justify-between">
                <Text
                  className={`text-sm ${
                    factor === readiness.weakest
                      ? 'text-text-primary font-semibold'
                      : 'text-text-secondary'
                  }`}
                >
                  {factorLabel(factor)}
                </Text>
                <Text className="text-text-secondary text-sm">
                  {formatLocalizedNumber(score)}
                </Text>
              </View>
              {detail ? (
                <Text className="text-text-muted text-xs">{detail}</Text>
              ) : null}
            </View>
          );
        })}
        {today ? (
          <>
            <View className="flex-row justify-between mt-3 mb-2">
              {(
                [
                  ['fitness', today.fitness],
                  ['fatigue', today.fatigue],
                  ['form', today.form],
                ] as const
              ).map(([key, value]) => (
                <View key={key} className="items-center flex-1">
                  <Text className="text-text-primary text-lg font-bold">
                    {formatLocalizedNumber(Math.round(value))}
                  </Text>
                  <Text className="text-text-muted text-xs">
                    {key === 'fitness'
                      ? t('exerciseStatistics.fitness.fitness', {
                          defaultValue: 'Fitness',
                        })
                      : key === 'fatigue'
                        ? t('exerciseStatistics.fitness.fatigue', {
                            defaultValue: 'Fatigue',
                          })
                        : t('exerciseStatistics.fitness.formLabel', {
                            defaultValue: 'Form',
                          })}
                  </Text>
                </View>
              ))}
            </View>
            <View
              className="flex-row items-center"
              style={{ height: BAR_AREA_HEIGHT, gap: 2 }}
            >
              {recent.map((point) => {
                const size = Math.max(
                  2,
                  Math.round((Math.abs(point.form) / peak) * half)
                );
                return (
                  <View
                    key={point.day}
                    testID="form-bar"
                    className="flex-1 justify-center"
                    style={{ height: BAR_AREA_HEIGHT }}
                  >
                    <View
                      className={
                        point.form >= 0 ? 'bg-progress-track' : 'bg-exercise'
                      }
                      style={{
                        height: size,
                        marginTop: point.form >= 0 ? half - size : half,
                        marginBottom: 0,
                        position: 'absolute',
                        left: 0,
                        right: 0,
                      }}
                    />
                  </View>
                );
              })}
            </View>
            {formText ? (
              <Text className="text-text-secondary text-xs mt-2">
                {formText}
              </Text>
            ) : null}
          </>
        ) : null}
      </>
    );
  };

  return (
    <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
      <Text className="text-text-primary text-base font-bold">
        {t('exerciseStatistics.fitness.title', {
          defaultValue: 'Readiness and Form',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-0.5 mb-3">
        {t('exerciseStatistics.fitness.subtitle', {
          defaultValue:
            'How ready you are today, from training form, sleep and resting heart rate.',
        })}
      </Text>
      {renderBody()}
    </View>
  );
};

export default FitnessFatigueCard;
