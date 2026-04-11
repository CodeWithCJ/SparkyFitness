import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import Button from './ui/Button';
import SafeImage from './SafeImage';
import EditableSetList from './EditableSetList';
import RestPeriodChip from './RestPeriodChip';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';
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
  onOpenRestSheet: (exerciseClientId: string, currentRest: number | null | undefined) => void;
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
  onOpenRestSheet,
}: EditableExerciseCardProps) {
  const [accentPrimary, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const imageSource = useMemo(
    () => (imagePath ? getImageSource(imagePath) : null),
    [getImageSource, imagePath],
  );
  const exerciseIcon = (exercise.exerciseCategory && CATEGORY_ICON_MAP[exercise.exerciseCategory]) || 'exercise-weights';
  const firstSetRest = exercise.sets[0]?.restTime;

  return (
    <View className="py-4">
      <View className="flex-row items-start">
        <View className="mr-3 items-center justify-center" style={{ width: 48, height: 48, marginTop: 2 }}>
          <SafeImage
            source={imageSource}
            style={{ width: 48, height: 48, borderRadius: 8, opacity: 0.8 }}
            fallback={<Icon name={exerciseIcon} size={28} color={accentPrimary} />}
          />
        </View>
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

          <View className="flex-row self-start mt-1.5">
            <RestPeriodChip
              value={firstSetRest}
              onPress={() => onOpenRestSheet(exercise.clientId, firstSetRest)}
            />
          </View>
        </View>
      </View>

      <EditableSetList
        exerciseClientId={exercise.clientId}
        sets={exercise.sets}
        activeSetKey={activeSetKey}
        activeSetField={activeSetField}
        weightUnit={weightUnit}
        onActivateSet={onActivateSet}
        onDeactivateSet={onDeactivateSet}
        onUpdateSetField={onUpdateSetField}
        onRemoveSet={onRemoveSet}
        onAddSet={onAddSet}
      />
    </View>
  );
}

export default React.memo(EditableExerciseCard);
