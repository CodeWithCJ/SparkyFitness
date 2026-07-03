import React, { useEffect, useMemo, useRef } from 'react';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import Button from './ui/Button';
import SafeImage from './SafeImage';
import EditableSetList from './EditableSetList';
import RestPeriodChip from './RestPeriodChip';
import ExerciseStatsChip from './ExerciseStatsChip';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';
import { useExerciseStats } from '../hooks/useExerciseStats';
import { weightFromKg } from '../utils/unitConversions';
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
  eligibleForPrefill?: boolean;
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
  eligibleForPrefill = false,
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
  const firstSet = exercise.sets[0];
  const firstSetRest = firstSet?.restTime;

  const { data: stats } = useExerciseStats(exercise.exerciseId);
  const didPrefillRef = useRef(false);

  useEffect(() => {
    if (didPrefillRef.current) return;
    if (!eligibleForPrefill || !stats?.lastSet || !firstSet) return;

    didPrefillRef.current = true;
    if (firstSet.weight === '' && stats.lastSet.weight != null) {
      const w = weightFromKg(stats.lastSet.weight, weightUnit as 'kg' | 'lbs');
      onUpdateSetField(
        exercise.clientId,
        firstSet.clientId,
        'weight',
        String(parseFloat(w.toFixed(1))),
      );
    }
    if (firstSet.reps === '' && stats.lastSet.reps != null) {
      onUpdateSetField(
        exercise.clientId,
        firstSet.clientId,
        'reps',
        String(stats.lastSet.reps),
      );
    }
    // Deps reference the stable identifiers + `stats?.lastSet` so typing into
    // the row (which mutates firstSet.weight/reps) doesn't re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.lastSet, eligibleForPrefill, exercise.clientId, firstSet?.clientId, weightUnit, onUpdateSetField]);

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
              className="py-0 px-0 shrink-0"
            >
              <Icon name="close" size={20} color={textMuted} />
            </Button>
          </View>

          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-2">
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
            {stats?.bestSet ? (
              <ExerciseStatsChip
                bestSet={stats.bestSet}
                weightUnit={weightUnit as 'kg' | 'lbs'}
              />
            ) : null}
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
