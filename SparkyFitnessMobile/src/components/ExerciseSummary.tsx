import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ExerciseSessionResponse } from '@workspace/shared';
import Icon from './Icon';
import SwipeableExerciseRow from './SwipeableExerciseRow';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { mobileT } from '../localization';

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

  if (exerciseEntries.length === 0) {
    const emptyContent = (
      <Text className="text-text-muted text-base">
        {mobileT('diary.tapToAddExercise')}
      </Text>
    );
    if (onAddExercise) {
      return (
        <Pressable
          onPress={onAddExercise}
          accessibilityRole="button"
          accessibilityLabel={mobileT('diary.addExercise')}
          className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6"
        >
          {emptyContent}
        </Pressable>
      );
    }
    return (
      <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center py-6">
        {emptyContent}
      </View>
    );
  }

  return (
    <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm overflow-hidden">
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name="exercise" size={18} color={accentPrimary} />
        <Text className="text-base font-bold text-text-secondary">
          {mobileT('diary.exercise')}
        </Text>
      </View>
      {exerciseEntries.map((session, index) => (
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
