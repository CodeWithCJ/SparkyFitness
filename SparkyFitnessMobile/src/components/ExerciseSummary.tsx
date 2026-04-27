import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SwipeableExerciseRow from './SwipeableExerciseRow';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface ExerciseSummaryProps {
  exerciseEntries: ExerciseSessionResponse[];
  entryDate: string;
  onPressWorkout?: (session: ExerciseSessionResponse) => void;
  onAddExercise?: () => void;
  getImageSource?: GetImageSource;
  weightUnit?: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
}

const ExerciseSummary: React.FC<ExerciseSummaryProps> = ({
  exerciseEntries,
  entryDate,
  onPressWorkout,
  onAddExercise,
  getImageSource,
  weightUnit = 'kg',
  distanceUnit = 'km',
}) => {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  const filtered = exerciseEntries.filter((session) => {
    if (session.type === 'preset') return true;
    return session.exercise_snapshot?.name !== 'Active Calories';
  });

  if (filtered.length === 0) {
    const emptyContent = (
      <Text className="text-text-muted text-base">Tap to add exercise</Text>
    );
    if (onAddExercise) {
      return (
        <Pressable
          onPress={onAddExercise}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
          className="bg-surface rounded-xl p-4 my-2 shadow-sm items-center py-6"
        >
          {emptyContent}
        </Pressable>
      );
    }
    return (
      <View className="bg-surface rounded-xl p-4 my-2 shadow-sm items-center py-6">
        {emptyContent}
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm overflow-hidden">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name="exercise" size={18} color={accentPrimary} />
        <Text className="text-base font-bold text-text-secondary">Exercise</Text>
      </View>
      {filtered.map((session, index) => (
        <SwipeableExerciseRow
          key={session.id || index}
          session={session}
          entryDate={entryDate}
          onPress={() => onPressWorkout?.(session)}
          getImageSource={getImageSource}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
        />
      ))}
    </View>
  );
};

export default ExerciseSummary;
