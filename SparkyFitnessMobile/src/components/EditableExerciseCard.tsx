import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import Button from './ui/Button';
import SafeImage from './SafeImage';
import EditableSetRow from './EditableSetRow';
import type { WorkoutDraftExercise } from '../types/drafts';
import type { GetImageSource } from '../hooks/useExerciseImageSource';

interface EditableExerciseCardProps {
  exercise: WorkoutDraftExercise;
  imagePath: string | null;
  getImageSource: GetImageSource;
  subtitle?: string;
  activeSetKey: string | null;
  activeSetField: 'weight' | 'reps';
  weightUnit: string;
  onActivateSet: (setKey: string, field: 'weight' | 'reps') => void;
  onDeactivateSet: () => void;
  onUpdateSetField: (exerciseClientId: string, setClientId: string, field: 'weight' | 'reps', value: string) => void;
  onRemoveSet: (exerciseClientId: string, setClientId: string) => void;
  onAddSet: (exerciseClientId: string) => void;
  onRemove: (exercise: WorkoutDraftExercise) => void;
}

function EditableExerciseCard({
  exercise,
  imagePath,
  getImageSource,
  subtitle,
  activeSetKey,
  activeSetField,
  weightUnit,
  onActivateSet,
  onDeactivateSet,
  onUpdateSetField,
  onRemoveSet,
  onAddSet,
  onRemove,
}: EditableExerciseCardProps) {
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const imageSource = useMemo(
    () => (imagePath ? getImageSource(imagePath) : null),
    [getImageSource, imagePath],
  );

  return (
    <View className="flex-row items-start py-4">
      <SafeImage
        source={imageSource}
        style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12, marginTop: 2, opacity: 0.8 }}
      />
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-semibold text-text-primary flex-1 mr-2" numberOfLines={1}>
            {exercise.exerciseName}
          </Text>
          <Button
            variant="ghost"
            onPress={() => onRemove(exercise)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="py-0 px-0"
          >
            <Icon name="close" size={20} color={textMuted} />
          </Button>
        </View>

        {subtitle ? (
          <Text className="text-xs text-text-muted mt-0.5">
            {subtitle}
          </Text>
        ) : null}

        {exercise.sets.length > 0 && (
          <View className="mt-2">
            <View className="flex-row items-center py-1 mb-1">
              <Text className="text-xs font-semibold text-text-muted w-10 text-center">Set</Text>
              <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Weight</Text>
              <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Reps</Text>
              <View style={{ width: 18 }} />
            </View>
            {exercise.sets.map((set, index) => {
              const setKey = `${exercise.clientId}:${set.clientId}`;
              const isLastSet = index === exercise.sets.length - 1;
              const nextSet = exercise.sets[index + 1];
              return (
                <EditableSetRow
                  key={set.clientId}
                  exerciseClientId={exercise.clientId}
                  setClientId={set.clientId}
                  weight={set.weight}
                  reps={set.reps}
                  setNumber={index + 1}
                  isActive={activeSetKey === setKey}
                  initialFocusField={activeSetKey === setKey ? activeSetField : undefined}
                  weightUnit={weightUnit}
                  nextSetKey={nextSet ? `${exercise.clientId}:${nextSet.clientId}` : null}
                  onActivateSet={onActivateSet}
                  onDeactivate={onDeactivateSet}
                  onUpdateSetField={onUpdateSetField}
                  onRemoveSet={onRemoveSet}
                  onAddSet={onAddSet}
                  isLastSet={isLastSet}
                />
              );
            })}
          </View>
        )}

        <TouchableOpacity
          className="flex-row items-center self-start py-2 mt-1 rounded-lg"
          onPress={() => onAddSet(exercise.clientId)}
          activeOpacity={0.6}
        >
          <Icon name="add-circle" size={18} color={accentPrimary} />
          <Text className="text-sm font-medium ml-1" style={{ color: accentPrimary }}>
            Add Set
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(EditableExerciseCard);
