import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import { getSourceLabel, formatDuration, getWorkoutSummary } from './WorkoutCard';

interface ExerciseSummaryProps {
  exerciseEntries: ExerciseSessionResponse[];
  onPressWorkout?: (session: ExerciseSessionResponse) => void;
}

const ExerciseSummary: React.FC<ExerciseSummaryProps> = ({ exerciseEntries, onPressWorkout }) => {
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const filtered = exerciseEntries.filter((session) => {
    if (session.type === 'preset') return true;
    return session.exercise_snapshot?.name !== 'Active Calories';
  });

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
        <Icon name="exercise" size={18} color={accentPrimary} />
      <Text className="text-base font-bold text-text-muted">Exercise</Text>
      </View>
      {filtered.map((session, index) => {
        const { name, duration, calories } = getWorkoutSummary(session);
        const { label: sourceLabel, isSparky } = getSourceLabel(session.source);

        return (
          <Pressable
            key={session.id || index}
            className="py-2.5"
            onPress={() => onPressWorkout?.(session)}
          >
            <View className="flex-row justify-between items-center">
              <View className="flex-1 mr-2">
                <Text className="text-base text-text-primary" numberOfLines={1}>
                  {name}
                  {duration > 0 && (
                    <Text className="text-sm text-text-secondary">
                      {' · '}{formatDuration(duration)}
                    </Text>
                  )}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Text className="text-sm text-text-secondary">
                  {Math.round(calories)} Cal
                </Text>
                <View
                  className="rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: isSparky ? `${accentPrimary}20` : `${textMuted}20` }}
                >
                  <Text
                    className="text-[10px] font-medium"
                    style={{ color: isSparky ? accentPrimary : textMuted }}
                  >
                    {sourceLabel}
                  </Text>
                </View>
                <Icon name="chevron-forward" size={14} color={textMuted} />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

export default ExerciseSummary;
