import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEffortSummary } from '../utils/exerciseEffort';
import { RPE_TONE_VARS } from './ActiveWorkoutSetRow';
import { getRpeTone } from '../utils/workoutSession';
import { formatLocalizedNumber } from '../localization';
import { storedWeightInUnit } from '../utils/unitConversions';

/** Bars span RPE 5 (shortest) to 10 (tallest); an easier session still shows. */
const BAR_MIN_RPE = 5;
const BAR_MAX_HEIGHT = 48;
const BAR_MIN_HEIGHT = 8;

interface ExerciseEffortCardProps {
  summary: ExerciseEffortSummary;
  weightUnit: 'kg' | 'lbs';
}

const barHeight = (rpe: number): number => {
  const share = Math.min(
    Math.max((rpe - BAR_MIN_RPE) / (10 - BAR_MIN_RPE), 0),
    1
  );
  return BAR_MIN_HEIGHT + share * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT);
};

const formatRpe = (rpe: number): string =>
  formatLocalizedNumber(rpe, { maximumFractionDigits: 1 });

/**
 * Effort at the top of an exercise's History tab: the average RPE of each
 * recent session as bars, and the best 1RM estimate counting the reps the
 * lifter said were left. Only the sets that have an RPE are used, so it says
 * nothing until some have been logged.
 */
const ExerciseEffortCard: React.FC<ExerciseEffortCardProps> = ({
  summary,
  weightUnit,
}) => {
  const { t } = useTranslation();
  const toneVars = useCSSVariable([
    RPE_TONE_VARS.easy,
    RPE_TONE_VARS.moderate,
    RPE_TONE_VARS.hard,
    RPE_TONE_VARS.max,
  ]) as string[];
  const toneColor = {
    easy: toneVars[0],
    moderate: toneVars[1],
    hard: toneVars[2],
    max: toneVars[3],
  };
  const { trend, oneRepMax } = summary;
  if (trend.length === 0) return null;

  const latest = trend[trend.length - 1];
  const unitLabel = weightUnit === 'lbs' ? 'lbs' : 'kg';
  const fmtWeight = (kg: number) =>
    `${formatLocalizedNumber(storedWeightInUnit(kg, weightUnit), {
      maximumFractionDigits: 1,
    })} ${unitLabel}`;

  return (
    <View testID="exercise-effort-card" className="bg-surface rounded-xl p-4">
      <Text className="text-text-primary text-base font-semibold">
        {t('exerciseEffort.title', { defaultValue: 'Effort' })}
      </Text>
      <View className="flex-row items-end justify-between mt-3">
        <View>
          <Text
            className="text-2xl font-bold"
            style={{
              color: toneColor[getRpeTone(latest.avgRpe)],
              fontVariant: ['tabular-nums'],
            }}
          >
            {formatRpe(latest.avgRpe)}
          </Text>
          <Text className="text-text-muted text-xs mt-0.5">
            {t('exerciseEffort.lastAvg', {
              defaultValue: 'Avg RPE, last session',
            })}
          </Text>
        </View>
        {trend.length > 1 ? (
          <View
            testID="exercise-effort-bars"
            className="flex-row items-end gap-1.5"
            accessibilityLabel={t('exerciseEffort.trendLabel', {
              defaultValue: 'Average RPE of your last {{count}} sessions',
              defaultValue_one: 'Average RPE of your last {{count}} session',
              defaultValue_other: 'Average RPE of your last {{count}} sessions',
              count: trend.length,
            })}
          >
            {trend.map((point) => (
              <View
                key={point.id}
                style={{
                  width: 10,
                  height: barHeight(point.avgRpe),
                  borderRadius: 3,
                  backgroundColor: toneColor[getRpeTone(point.avgRpe)],
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
      {oneRepMax ? (
        <View className="mt-4 pt-3 border-t border-border-subtle">
          <View className="flex-row justify-between">
            <View>
              <Text className="text-text-muted text-xs">
                {t('exerciseEffort.oneRmEffort', {
                  defaultValue: 'Est. 1RM with effort',
                })}
              </Text>
              <Text
                className="text-text-primary text-lg font-semibold mt-0.5"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {fmtWeight(oneRepMax.effortKg)}
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-text-muted text-xs">
                {t('exerciseEffort.oneRmPlain', {
                  defaultValue: 'From reps alone',
                })}
              </Text>
              <Text
                className="text-text-secondary text-lg mt-0.5"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {fmtWeight(oneRepMax.plainKg)}
              </Text>
            </View>
          </View>
          <Text className="text-text-muted text-xs mt-2">
            {t('exerciseEffort.oneRmNote', {
              defaultValue:
                'Counts the reps you had left: RPE 8 is two more reps. Only sets with an RPE are used.',
            })}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default ExerciseEffortCard;
