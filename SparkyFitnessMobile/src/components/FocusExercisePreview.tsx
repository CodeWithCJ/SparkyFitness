import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { PresetSessionResponse } from '@workspace/shared';
import FocusAwayFrame from './FocusAwayFrame';
import Icon from './Icon';
import SafeImage from './SafeImage';
import { useExerciseStats } from '../hooks/useExerciseStats';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import {
  useExerciseBest,
  useLiveAssumedSetValues,
} from '../hooks/useLiveExerciseCoaching';
import type { CompletedSetMap, PrSetMap } from '../stores/activeWorkoutStore';
import { formatFocusWeight } from '../utils/focusView';
import { storedWeightInUnit } from '../utils/unitConversions';
import {
  alignPreviousSets,
  CATEGORY_ICON_MAP,
  resolveSnapshotModality,
} from '../utils/workoutSession';

type FocusExercise = PresetSessionResponse['exercises'][number];

interface Props {
  exercise: FocusExercise;
  prSetIds: PrSetMap;
  /** Logged sets by id; they show a check mark and count as done. */
  completedSetIds: CompletedSetMap;
  sessionId: string | null;
  verifiedSourcePresetId: number | undefined;
  weightUnit: 'kg' | 'lbs';
  getImageSource: GetImageSource;
  onAddSet: (entryId: string) => void;
  /** Moves the exercise in front of the current one and opens its page. */
  onDoNow: (entryId: string) => void;
  /** A hold is running or counting down: the cursor cannot move off it. */
  doNowDisabled?: boolean;
  onSwap: (entryId: string) => void;
  onPressOverflow: (entryId: string) => void;
}

/**
 * An exercise that is not the current one and has nothing logged yet, drawn as
 * a dashed card: its planned sets against last time, with Add set and Do it
 * now. The full page (hero card, steppers) is for the exercise being done.
 */
function FocusExercisePreview({
  exercise,
  prSetIds,
  completedSetIds,
  sessionId,
  verifiedSourcePresetId,
  weightUnit,
  getImageSource,
  onAddSet,
  onDoNow,
  doNowDisabled = false,
  onSwap,
  onPressOverflow,
}: Props) {
  const { t } = useTranslation();
  const [textPrimary, accent, textSecondary] = useCSSVariable([
    '--color-text-primary',
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string, string];
  const snapshot = exercise.exercise_snapshot;
  const name =
    snapshot?.name ?? t('workout.exercise', { defaultValue: 'Exercise' });
  const { data: stats } = useExerciseStats(
    exercise.exercise_id,
    sessionId ?? undefined,
    verifiedSourcePresetId
  );
  const previousSessionSets = (stats?.recentSessions ?? [])[0]?.sets;
  const previousSets = alignPreviousSets(exercise.sets, previousSessionSets);
  const assumed = useLiveAssumedSetValues(
    exercise,
    previousSessionSets,
    weightUnit,
    true
  );
  const { bestDisplay, bestText } = useExerciseBest(
    exercise,
    stats?.bestSet ?? null,
    prSetIds,
    weightUnit,
    true
  );
  const image = snapshot?.images?.[0] ?? null;
  const fallbackIcon =
    (snapshot?.category && CATEGORY_ICON_MAP[snapshot.category]) ||
    'exercise-weights';
  const doneCount = exercise.sets.filter(
    (set) => completedSetIds[String(set.id)] != null
  ).length;
  const showWeight = resolveSnapshotModality(snapshot) !== 'reps_only';

  const cell = (text: string | null) => (
    <View className="h-9 flex-1 items-center justify-center rounded-xl bg-raised">
      <Text
        className="text-[15px] font-semibold text-text-primary"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {text ?? '–'}
      </Text>
    </View>
  );

  return (
    <FocusAwayFrame testID="focus-exercise-preview" className="gap-3">
      <View className="flex-row items-center gap-2.5">
        <View
          className="h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-raised"
          accessible={false}
        >
          <SafeImage
            source={image ? getImageSource(image) : null}
            style={{ width: 40, height: 40 }}
            fallback={
              <Icon name={fallbackIcon} size={20} color={textSecondary} />
            }
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <Text
            numberOfLines={2}
            accessibilityRole="header"
            className="text-[19px] font-bold text-text-primary"
          >
            {name}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {bestDisplay != null && (
              <View className="h-6 flex-row items-center gap-1 rounded-full bg-raised px-2">
                <Text className="text-[12px] font-semibold text-text-secondary">
                  {t('activeWorkout.focus.bestLabel', { defaultValue: 'Best' })}
                </Text>
                <Text
                  className="text-[12px] font-bold"
                  style={{ color: accent, fontVariant: ['tabular-nums'] }}
                >
                  {bestText}
                </Text>
              </View>
            )}
            <View className="h-6 justify-center rounded-full bg-raised px-2">
              <Text className="text-[12px] font-semibold text-text-secondary">
                {t('activeWorkout.focus.exercises.setsProgress', {
                  defaultValue: '{{done}}/{{total}} sets',
                  done: doneCount,
                  total: exercise.sets.length,
                })}
              </Text>
            </View>
          </View>
        </View>
        <Pressable
          onPress={() => onSwap(exercise.id)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.now.swapLabel', {
            defaultValue: 'Swap {{name}}',
            name,
          })}
          hitSlop={4}
          className="h-9 w-9 items-center justify-center rounded-full bg-raised active:opacity-70"
        >
          <Icon name="swap-horizontal" size={18} color={textPrimary} />
        </Pressable>
        <Pressable
          onPress={() => onPressOverflow(exercise.id)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.moreOptions', {
            defaultValue: 'More options for {{name}}',
            name,
          })}
          hitSlop={4}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
        >
          <Icon name="ellipsis-horizontal" size={18} color={textPrimary} />
        </Pressable>
      </View>

      <View className="gap-1.5">
        <View className="flex-row items-center gap-1.5">
          <Text className="w-8 text-[12px] font-bold uppercase text-text-secondary">
            {t('activeWorkout.focus.preview.set', { defaultValue: 'Set' })}
          </Text>
          <Text className="flex-1 text-center text-[12px] font-bold uppercase text-text-secondary">
            {t('activeWorkout.focus.preview.prev', { defaultValue: 'Prev' })}
          </Text>
          {showWeight && (
            <Text className="flex-1 text-center text-[12px] font-bold uppercase text-text-secondary">
              {weightUnit === 'kg'
                ? t('workout.kg', { defaultValue: 'kg' })
                : t('workout.lbs', { defaultValue: 'lbs' })}
            </Text>
          )}
          <Text className="flex-1 text-center text-[12px] font-bold uppercase text-text-secondary">
            {t('activeWorkout.focus.preview.reps', { defaultValue: 'Reps' })}
          </Text>
        </View>
        {exercise.sets.map((set, index) => {
          const previous = previousSets[index];
          const weightKg = set.weight ?? assumed?.[index]?.weight ?? null;
          const reps = set.reps ?? assumed?.[index]?.reps ?? null;
          return (
            <View key={set.id} className="flex-row items-center gap-1.5">
              <View className="w-8 flex-row items-center">
                {completedSetIds[String(set.id)] != null ? (
                  <Icon
                    name="checkmark"
                    size={16}
                    color={accent}
                    weight="bold"
                  />
                ) : (
                  <Text
                    className="text-[15px] font-bold text-text-primary"
                    style={{ fontVariant: ['tabular-nums'] }}
                  >
                    {set.set_number}
                  </Text>
                )}
              </View>
              {cell(
                previous?.reps != null
                  ? `${
                      previous.weight != null
                        ? formatFocusWeight(
                            storedWeightInUnit(previous.weight, weightUnit),
                            weightUnit
                          )
                        : '–'
                    }×${previous.reps}`
                  : null
              )}
              {showWeight &&
                cell(
                  weightKg != null
                    ? formatFocusWeight(
                        storedWeightInUnit(weightKg, weightUnit),
                        weightUnit
                      )
                    : null
                )}
              {cell(reps != null ? String(reps) : null)}
            </View>
          );
        })}
      </View>

      <View className="flex-row gap-2">
        <Pressable
          testID="focus-preview-add-set"
          onPress={() => onAddSet(exercise.id)}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.addSet', {
            defaultValue: 'Add set to {{name}}',
            name,
          })}
          className="min-h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-raised active:opacity-70"
        >
          <Icon name="add" size={18} color={textPrimary} weight="bold" />
          <Text className="text-base font-bold text-text-primary">
            {t('activeWorkout.exercise.addSetLabel', {
              defaultValue: 'Add set',
            })}
          </Text>
        </Pressable>
        <Pressable
          testID="focus-preview-do-now"
          onPress={() => onDoNow(exercise.id)}
          disabled={doNowDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: doNowDisabled }}
          accessibilityLabel={t('activeWorkout.focus.preview.doNowLabel', {
            defaultValue: 'Do {{name}} now',
            name,
          })}
          className={`min-h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-full bg-raised active:opacity-70 ${
            doNowDisabled ? 'opacity-40' : ''
          }`}
        >
          <Icon name="play" size={14} color={textPrimary} />
          <Text className="text-base font-bold text-text-primary">
            {t('activeWorkout.focus.preview.doNow', {
              defaultValue: 'Do it now',
            })}
          </Text>
        </Pressable>
      </View>
      {doNowDisabled && (
        <Text
          testID="focus-preview-do-now-hint"
          className="text-center text-[13px] text-text-secondary"
        >
          {t('activeWorkout.focus.preview.doNowHeld', {
            defaultValue: 'Finish or cancel the hold first',
          })}
        </Text>
      )}
    </FocusAwayFrame>
  );
}

export default React.memo(FocusExercisePreview);
