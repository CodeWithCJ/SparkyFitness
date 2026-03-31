import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import EditableExerciseCard from './EditableExerciseCard';
import type { WorkoutDraftExercise } from '../types/drafts';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface WorkoutEditableExerciseListProps {
  exercises: WorkoutDraftExercise[];
  getImageSource: GetImageSource;
  weightUnit: 'kg' | 'lbs';
  activeSetKey: string | null;
  activeSetField: 'weight' | 'reps';
  onActivateSet: (setKey: string, field: 'weight' | 'reps') => void;
  onDeactivateSet: () => void;
  onUpdateSetField: (
    exerciseClientId: string,
    setClientId: string,
    field: 'weight' | 'reps',
    value: string,
  ) => void;
  onRemoveSet: (exerciseClientId: string, setClientId: string) => void;
  onAddSet: (exerciseClientId: string) => void;
  onRemoveExercise: (exercise: WorkoutDraftExercise) => void;
  onAddExercisePress: () => void;
  mode?: 'add' | 'detail';
}

function WorkoutEditableExerciseList({
  exercises,
  getImageSource,
  weightUnit,
  activeSetKey,
  activeSetField,
  onActivateSet,
  onDeactivateSet,
  onUpdateSetField,
  onRemoveSet,
  onAddSet,
  onRemoveExercise,
  onAddExercisePress,
  mode = 'add',
}: WorkoutEditableExerciseListProps) {
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;

  return (
    <View>
      {exercises.map(exercise => {
        const imagePath = exercise.images?.[0] ?? null;
        const metadataItems = [
          exercise.snapshot?.category,
          exercise.snapshot?.level,
          exercise.snapshot?.force,
          exercise.snapshot?.mechanic,
        ].filter(Boolean);
        const subtitle = mode === 'detail'
          ? (metadataItems.length > 0 ? metadataItems.join(' \u2022 ') : undefined)
          : ([exercise.exerciseCategory, weightUnit].filter(Boolean).join(' \u00b7 ') || undefined);
        const exerciseSetPrefix = `${exercise.clientId}:`;
        const exerciseActiveSetKey = activeSetKey?.startsWith(exerciseSetPrefix) ? activeSetKey : null;

        const card = (
          <EditableExerciseCard
            exercise={exercise}
            imagePath={imagePath}
            getImageSource={getImageSource}
            subtitle={subtitle}
            activeSetKey={exerciseActiveSetKey}
            activeSetField={exerciseActiveSetKey ? activeSetField : 'weight'}
            weightUnit={weightUnit}
            onActivateSet={onActivateSet}
            onDeactivateSet={onDeactivateSet}
            onUpdateSetField={onUpdateSetField}
            onRemoveSet={onRemoveSet}
            onAddSet={onAddSet}
            onRemove={onRemoveExercise}
          />
        );

        if (mode === 'detail') {
          return (
            <View key={exercise.clientId}>
              <View className="border-t border-border-subtle" />
              {card}
            </View>
          );
        }

        return (
          <View key={exercise.clientId} className="mb-4">
            {card}
          </View>
        );
      })}

      <View className={mode === 'detail' ? 'py-4' : 'py-4 mb-4'}>
        <TouchableOpacity
          className="flex-row items-center self-center py-2 px-3 rounded-lg"
          onPress={onAddExercisePress}
          activeOpacity={0.6}
        >
          <Icon name="add-circle" size={20} color={accentPrimary} />
          <Text className="text-base font-medium ml-2" style={{ color: accentPrimary }}>
            Add Exercise
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(WorkoutEditableExerciseList);
