import React from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import type { evaluateExerciseProgression } from '../utils/workoutSession';

interface Props {
  result: NonNullable<ReturnType<typeof evaluateExerciseProgression>>;
  unitLabel: string;
}

/** Live progression-overload hint: the goal message and the suggested weight. */
function ProgressionHintBanner({ result, unitLabel }: Props) {
  const [accentPrimary, textSecondary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];
  return (
    <View className="mt-2.5 mb-1 px-2.5 py-1.5 rounded-lg bg-raised flex-row items-center justify-between border border-border-subtle">
      <View className="flex-row items-center gap-1.5 flex-1 mr-2">
        <Icon
          name={result.goalAchieved ? 'trophy-outline' : 'exercise-weights'}
          size={16}
          color={result.goalAchieved ? accentPrimary : textSecondary}
        />
        <Text
          className="text-xs font-medium text-text-primary flex-1"
          numberOfLines={2}
        >
          {result.message}
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
