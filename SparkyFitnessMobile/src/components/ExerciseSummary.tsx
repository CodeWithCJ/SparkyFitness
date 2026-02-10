import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseEntry } from '../types/exercise';
import Icon, { type IconName } from './Icon';

// Ordered from most-specific to least-specific to avoid false positives
// (e.g., "stair" before "run" so "Stair Running" matches stair icon)
const EXERCISE_ICON_RULES: [RegExp, IconName][] = [
  [/stair/i, 'exercise-stair'],
  [/elliptical/i, 'exercise-elliptical'],
  [/basketball/i, 'exercise-basketball'],
  [/kickbox/i, 'exercise-boxing'],
  [/pilates/i, 'exercise-pilates'],
  [/soccer|football/i, 'exercise-soccer'],
  [/tennis/i, 'exercise-tennis'],
  [/row/i, 'exercise-rowing'],
  [/box/i, 'exercise-boxing'],
  [/danc/i, 'exercise-dance'],
  [/yoga/i, 'exercise-yoga'],
  [/weight|strength|barbell|dumbbell|lifting/i, 'exercise-weights'],
  [/swim/i, 'exercise-swimming'],
  [/hik/i, 'exercise-hiking'],
  [/cycl|bik/i, 'exercise-cycling'],
  [/run|jog/i, 'exercise-running'],
  [/walk/i, 'exercise-walking'],
];

function getExerciseIcon(name: string): IconName {
  const match = EXERCISE_ICON_RULES.find(([re]) => re.test(name));
  return match ? match[1] : 'exercise-default';
}

interface ExerciseSummaryProps {
  exerciseEntries: ExerciseEntry[];
}

const ExerciseSummary: React.FC<ExerciseSummaryProps> = ({ exerciseEntries }) => {
  const textSecondary = useCSSVariable('--color-text-secondary') as string;
  const textPrimary = useCSSVariable('--color-text-primary') as string;

  const filtered = exerciseEntries.filter(
    (entry) => entry.exercise_snapshot?.name !== 'Active Calories'
  );

  if (filtered.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-4 my-2 shadow-sm items-center py-6">
        <Text className="text-text-muted text-base">No exercise entries yet</Text>
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name="exercise" size={18} color={textSecondary} />
      <Text className="text-base font-bold text-text-primary">Exercise</Text>
      </View>
      {filtered.map((entry, index) => {
        const name = entry.exercise_snapshot?.name || 'Unknown exercise';
        const calories = Math.round(entry.calories_burned);
        const duration = entry.duration_minutes;

        return (
          <View key={entry.id || index} className="py-2.5">
            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center flex-1 mr-2 gap-1.5">
                <Icon name={getExerciseIcon(name)} size={18} color={textSecondary} />
                <Text className="text-base text-text-primary flex-1" numberOfLines={1}>
                  {name}
                  {duration != null && duration > 0 && (
                    <Text className="text-sm text-text-secondary">
                      {' · '}{Math.round(duration)} min
                    </Text>
                  )}
                </Text>
              </View>
              <Text className="text-sm text-text-secondary">
                {calories} Cal
              </Text>
            </View>
          </View>
        );
      })}
      </View>
  );
};

export default ExerciseSummary;
