import React from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSetStats } from '@workspace/shared';
import { weightFromKg } from '../utils/unitConversions';

interface ExerciseStatsChipProps {
  bestSet: ExerciseSetStats | null | undefined;
  weightUnit: 'kg' | 'lbs';
}

function formatLabel(bestSet: ExerciseSetStats, weightUnit: 'kg' | 'lbs'): string | null {
  if (bestSet.weight == null) return null;
  const weight = parseFloat(weightFromKg(bestSet.weight, weightUnit).toFixed(1));
  if (bestSet.reps != null) {
    return `PB ${weight} × ${bestSet.reps}`;
  }
  return `PB ${weight} ${weightUnit}`;
}

function ExerciseStatsChip({ bestSet, weightUnit }: ExerciseStatsChipProps) {
  const [textSecondary] = useCSSVariable(['--color-text-secondary']) as [string];

  if (!bestSet) return null;
  const label = formatLabel(bestSet, weightUnit);
  if (!label) return null;

  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: `${textSecondary}1A` }}
    >
      <Text
        className="text-xs font-medium"
        style={{ color: textSecondary, maxWidth: 96 }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export default React.memo(ExerciseStatsChip);
