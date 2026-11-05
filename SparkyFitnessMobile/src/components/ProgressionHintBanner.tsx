import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { ProgressionEvaluationResult } from '@workspace/shared';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import type { evaluateExerciseProgression } from '../utils/workoutSession';

interface Props {
  result: NonNullable<ReturnType<typeof evaluateExerciseProgression>>;
  unitLabel: string;
}

/** Why the target is what it is, translated; the engine's English otherwise. */
export function progressionReasonText(
  t: TFunction,
  result: ProgressionEvaluationResult
): string {
  const reason = result.reason;
  if (!reason) return result.message;
  const values = {
    setsAtTop: reason.setsAtTop ?? 0,
    sets: reason.sets ?? 0,
    repMin: reason.repMin ?? 0,
    repMax: reason.repMax ?? 0,
    nextSets: result.suggestedSets ?? 0,
    stalledSessions: reason.stalledSessions ?? 0,
    deloadPercent: reason.deloadPercent ?? 0,
  };
  switch (reason.code) {
    case 'range_climbing':
      return t('activeWorkout.progression.reason.rangeClimbing', {
        defaultValue:
          '{{setsAtTop}}/{{sets}} sets at {{repMax}} reps. Hold the weight and add reps.',
        ...values,
      });
    case 'range_top_reached':
      return t('activeWorkout.progression.reason.rangeTopReached', {
        defaultValue:
          'All sets hit {{repMax}} reps. Add weight and start again at {{repMin}} reps.',
        ...values,
      });
    case 'range_add_set':
      return t('activeWorkout.progression.reason.rangeAddSet', {
        defaultValue:
          'All sets hit {{repMax}} reps. Add a set: {{nextSets}} sets of {{repMin}}.',
        ...values,
      });
    case 'stall_deload':
      return t('activeWorkout.progression.reason.stallDeload', {
        defaultValue:
          'Missed the goal {{stalledSessions}} sessions in a row at this weight. Deload about {{deloadPercent}}% and build back up.',
        ...values,
      });
  }
}

/** Live progression-overload hint: the goal message and the suggested weight. */
function ProgressionHintBanner({ result, unitLabel }: Props) {
  const { t } = useTranslation();
  const [accentPrimary, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];
  return (
    <View className="mt-2.5 mb-1 px-2.5 py-1.5 rounded-lg bg-raised flex-row items-center justify-between border border-border-subtle">
      <View className="flex-row items-center gap-1.5 flex-1 mr-2">
        <Icon
          name={
            result.goalAchieved
              ? 'trophy-outline'
              : result.status === 'DELOAD'
                ? 'arrow-down'
                : 'exercise-weights'
          }
          size={16}
          color={result.goalAchieved ? accentPrimary : textSecondary}
        />
        <Text
          className="text-xs font-medium text-text-primary flex-1"
          numberOfLines={2}
        >
          {progressionReasonText(t, result)}
        </Text>
      </View>
      {result.suggestedWeight > 0 && (
        <View className="px-2 py-0.5 rounded bg-surface">
          <Text className="text-xs font-bold" style={{ color: accentPrimary }}>
            {result.suggestedWeight} {unitLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

export default React.memo(ProgressionHintBanner);
