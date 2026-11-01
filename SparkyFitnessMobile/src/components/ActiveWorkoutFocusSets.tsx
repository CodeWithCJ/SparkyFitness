import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { isBodyweightModality } from '@workspace/shared';
import ActiveWorkoutSetRow, {
  RPE_TONE_VARS,
  formatRpe,
} from './ActiveWorkoutSetRow';
import CompletionCheck, { LogCircle } from './CompletionCheck';
import Icon from './Icon';
import StepperInput from './StepperInput';
import { withAlpha } from '../utils/colors';
import {
  parseDecimalInput,
  parseSignedDecimalInput,
} from '../utils/numericInput';
import { formatLocalizedNumber } from '../localization';
import { storedWeightInUnit, weightToKg } from '../utils/unitConversions';
import {
  buildWorkingSetNumbers,
  getRpeTone,
  isDurationModality,
  isWeightDistanceModality,
  isWeightDurationModality,
  quantizeSetWeightKg,
  resolveSnapshotModality,
  setTypeLetter,
  type AssumedSetValues,
  type WorkoutCardExercise,
  type WorkoutCardSet,
} from '../utils/workoutSession';
import type {
  ActiveSetPatch,
  CompletedSetMap,
} from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';

const formatWeight = (value: number) =>
  formatLocalizedNumber(value, { maximumFractionDigits: 1 });

const WEIGHT_STEP: Record<'kg' | 'lbs', number> = { kg: 2.5, lbs: 5 };

interface Props {
  exercise: WorkoutCardExercise;
  completedSetIds: CompletedSetMap;
  activeSetId: string | null;
  setRenderKeys: Record<string, string>;
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
  /**
   * Per-set assumed values (grey placeholders), index-aligned with
   * `exercise.sets`; from `resolveLiveAssumedSetValues`, as in the list.
   */
  assumedSetValues?: (AssumedSetValues | null)[] | null;
  onCompleteSet: (setId: string) => void;
  onUncomplete: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onAddSet: (entryId: string) => void;
  /** Receives the set's render key, like the list's `onActivateRpe`. */
  onActivateRpe: (setKey: string) => void;
  /** Long-pressing a row deletes it; omit to disable. */
  onDeleteSet?: (setId: string) => void;
}

interface StepperFieldOptions {
  /** Committed value in display units; null when empty. */
  value: number | null;
  /** Assumed value in display units, shown grey and stepped from while empty. */
  assumed: number | null;
  step: number;
  min: number;
  format: (value: number) => string;
  parse: (text: string) => number;
  onCommit: (value: number | null) => void;
}

/**
 * Typing-friendly state for one stepper cell: keystrokes stay in a local draft
 * and commit on blur (or flush), +/- commit immediately from the visible value
 * (typed, committed, or assumed).
 */
function useStepperField({
  value,
  assumed,
  step,
  min,
  format,
  parse,
  onCommit,
}: StepperFieldOptions) {
  const [draft, setDraft] = useState<string | null>(null);

  const flush = useCallback(() => {
    if (draft === null) return;
    setDraft(null);
    const parsed = parse(draft);
    const next = Number.isNaN(parsed) ? null : parsed;
    const unchanged =
      next === null || value === null
        ? next === value
        : format(next) === format(value);
    if (!unchanged) onCommit(next);
  }, [draft, parse, value, format, onCommit]);

  const adjust = (direction: 1 | -1) => {
    const typed = draft === null ? NaN : parse(draft);
    const base = Number.isNaN(typed) ? (value ?? assumed ?? 0) : typed;
    setDraft(null);
    // Round to cents so 0.1 + 0.2 style float residue never reaches the store.
    onCommit(Math.max(min, Math.round((base + direction * step) * 100) / 100));
  };

  return {
    flush,
    inputProps: {
      value: draft ?? (value != null ? format(value) : ''),
      onChangeText: setDraft,
      onBlur: flush,
      onIncrement: () => adjust(1),
      onDecrement: () => adjust(-1),
      placeholder: assumed != null ? format(assumed) : '–',
    },
  };
}

interface FocusSetRowProps {
  set: WorkoutCardSet;
  displayNumber: number;
  renderKey: string;
  modality: ReturnType<typeof resolveSnapshotModality>;
  assumed: AssumedSetValues | null;
  state: 'done' | 'current' | 'upcoming';
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  onCompleteSet: (setId: string) => void;
  onUncomplete: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onActivateRpe: (setKey: string) => void;
  onDeleteSet?: (setId: string) => void;
}

const FocusSetRow = React.memo(function FocusSetRow({
  set,
  displayNumber,
  renderKey,
  modality,
  assumed,
  state,
  metricColumn,
  weightUnit,
  onCompleteSet,
  onUncomplete,
  onCommitField,
  onActivateRpe,
  onDeleteSet,
}: FocusSetRowProps) {
  const { t } = useTranslation();
  const [accentPrimary, textMuted, rpeEasy, rpeModerate, rpeHard, rpeMax] =
    useCSSVariable([
      '--color-accent-primary',
      '--color-text-muted',
      RPE_TONE_VARS.easy,
      RPE_TONE_VARS.moderate,
      RPE_TONE_VARS.hard,
      RPE_TONE_VARS.max,
    ]) as [string, string, string, string, string, string];
  const rpeToneColors = {
    easy: rpeEasy,
    moderate: rpeModerate,
    hard: rpeHard,
    max: rpeMax,
  };

  const setId = String(set.id);
  const setNumber = set.set_number;
  const isDone = state === 'done';
  const showWeight = modality !== 'reps_only';
  const bodyweight = isBodyweightModality(modality);

  const weight = useStepperField({
    value:
      set.weight != null ? storedWeightInUnit(set.weight, weightUnit) : null,
    assumed:
      assumed?.weight != null
        ? storedWeightInUnit(assumed.weight, weightUnit)
        : null,
    step: WEIGHT_STEP[weightUnit],
    // An assisted bodyweight set carries a negative weight.
    min: bodyweight ? -Infinity : 0,
    format: formatWeight,
    parse: bodyweight ? parseSignedDecimalInput : parseDecimalInput,
    onCommit: (next) =>
      onCommitField(setId, {
        weight:
          next === null
            ? null
            : quantizeSetWeightKg(weightToKg(next, weightUnit)),
      }),
  });
  const reps = useStepperField({
    value: set.reps ?? null,
    assumed: assumed?.reps ?? null,
    step: 1,
    min: 0,
    format: String,
    parse: (text) => parseInt(text, 10),
    onCommit: (next) => onCommitField(setId, { reps: next }),
  });

  const handleComplete = () => {
    if (showWeight) weight.flush();
    reps.flush();
    onCompleteSet(setId);
  };

  const effortField = metricColumn === 'rir' ? 'rir' : 'rpe';
  const effort = (effortField === 'rir' ? set.rir : set.rpe) ?? null;
  const effortLabel =
    effortField === 'rir'
      ? t('activeWorkout.setRow.rir', { defaultValue: 'RIR' })
      : t('activeWorkout.setRow.rpe', { defaultValue: 'RPE' });
  const effortColor =
    effortField === 'rpe' && effort != null
      ? rpeToneColors[getRpeTone(effort)]
      : undefined;

  const letter = setTypeLetter(set.set_type);
  const isCurrent = state === 'current';
  const checkLabel = isDone
    ? t('activeWorkout.setRow.incomplete', {
        defaultValue: 'Un-complete set {{setNumber}}',
        setNumber,
      })
    : t('activeWorkout.setRow.complete', {
        defaultValue: 'Mark set {{setNumber}} complete',
        setNumber,
      });

  return (
    <Pressable
      testID="focus-set-row"
      onLongPress={onDeleteSet ? () => onDeleteSet(setId) : undefined}
      accessibilityLabel={
        onDeleteSet
          ? t('activeWorkout.setRow.delete', {
              defaultValue: 'Delete set {{setNumber}}',
              setNumber,
            })
          : undefined
      }
      className={`flex-row items-center gap-2 rounded-xl px-2 py-1.5 ${isCurrent ? '' : 'bg-transparent'}`}
      style={
        isCurrent
          ? { backgroundColor: withAlpha(accentPrimary, 0.12) }
          : undefined
      }
    >
      <View className="w-6 items-center">
        <Text
          className="text-sm text-text-muted"
          style={[
            { fontVariant: ['tabular-nums'] },
            isCurrent ? { color: accentPrimary, fontWeight: '700' } : null,
          ]}
        >
          {letter ?? displayNumber}
        </Text>
      </View>
      {/* Done rows recede; the completion check sits outside this wrapper so
          its green stays vivid. */}
      <View
        testID="focus-set-values"
        className="flex-1 flex-row items-center gap-2"
        style={isDone ? { opacity: 0.62 } : undefined}
      >
        {showWeight && (
          <View className="flex-[3] flex-row">
            <StepperInput
              fill
              {...weight.inputProps}
              keyboardType={
                !bodyweight
                  ? 'decimal-pad'
                  : Platform.OS === 'ios'
                    ? 'numbers-and-punctuation'
                    : 'numeric'
              }
              accessibilityLabels={{
                decrement: t('activeWorkout.focus.sets.decreaseWeight', {
                  defaultValue: 'Decrease weight for set {{setNumber}}',
                  setNumber,
                }),
                input: t('activeWorkout.focus.sets.weightInput', {
                  defaultValue: 'Weight for set {{setNumber}}',
                  setNumber,
                }),
                increment: t('activeWorkout.focus.sets.increaseWeight', {
                  defaultValue: 'Increase weight for set {{setNumber}}',
                  setNumber,
                }),
              }}
            />
          </View>
        )}
        <View className="flex-[2] flex-row">
          <StepperInput
            fill
            {...reps.inputProps}
            keyboardType="number-pad"
            accessibilityLabels={{
              decrement: t('activeWorkout.focus.sets.decreaseReps', {
                defaultValue: 'Decrease reps for set {{setNumber}}',
                setNumber,
              }),
              input: t('activeWorkout.focus.sets.repsInput', {
                defaultValue: 'Reps for set {{setNumber}}',
                setNumber,
              }),
              increment: t('activeWorkout.focus.sets.increaseReps', {
                defaultValue: 'Increase reps for set {{setNumber}}',
                setNumber,
              }),
            }}
          />
        </View>
        <Pressable
          onPress={() => onActivateRpe(renderKey)}
          hitSlop={{ top: 6, bottom: 6 }}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.focus.sets.effortInput', {
            defaultValue: '{{metric}} for set {{setNumber}}',
            metric: effortLabel,
            setNumber,
          })}
          className="h-8 w-10 items-center justify-center rounded-lg bg-raised"
        >
          <Text
            className="text-sm text-text-muted"
            style={[
              { fontVariant: ['tabular-nums'] },
              effortColor != null ? { color: effortColor } : null,
            ]}
          >
            {effort != null ? formatRpe(effort) : '–'}
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={isDone ? () => onUncomplete(setId) : handleComplete}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={checkLabel}
        className="h-11 w-9 items-center justify-center"
      >
        {isDone ? (
          <CompletionCheck size={28} />
        ) : isCurrent ? (
          <LogCircle color={accentPrimary} />
        ) : (
          <View
            className="h-7 w-7 rounded-full border-2"
            style={{ borderColor: textMuted }}
          />
        )}
      </Pressable>
    </Pressable>
  );
});

/**
 * Focus view set editor: one row per set with weight and reps steppers, an
 * effort cell and a completion circle. Modalities without a weight/reps pair
 * (timed, distance, loaded holds and carries) keep the list's set row.
 */
function ActiveWorkoutFocusSets({
  exercise,
  completedSetIds,
  activeSetId,
  setRenderKeys,
  metricColumn,
  weightUnit,
  distanceUnit,
  assumedSetValues,
  onCompleteSet,
  onUncomplete,
  onCommitField,
  onAddSet,
  onActivateRpe,
  onDeleteSet,
}: Props) {
  const { t } = useTranslation();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  const stepperRows =
    !isDurationModality(modality) &&
    !isWeightDurationModality(modality) &&
    !isWeightDistanceModality(modality);
  const workingSetNumbers = useMemo(
    () => buildWorkingSetNumbers(exercise.sets),
    [exercise.sets]
  );
  const effortHeader =
    metricColumn === 'rir'
      ? t('activeWorkout.setRow.rir', { defaultValue: 'RIR' })
      : t('activeWorkout.setRow.rpe', { defaultValue: 'RPE' });
  const headerClass =
    'text-center text-xs font-medium uppercase text-text-muted';

  return (
    <View className="rounded-2xl bg-surface p-2">
      {stepperRows && (
        <View className="flex-row items-center gap-2 px-2 pb-1">
          <View className="w-6" />
          <View className="flex-1 flex-row items-center gap-2">
            {modality !== 'reps_only' && (
              <Text className={`flex-[3] ${headerClass}`}>
                {t('activeWorkout.focus.sets.weightHeader', {
                  defaultValue: 'Weight ({{unit}})',
                  unit:
                    weightUnit === 'kg'
                      ? t('workout.kg', { defaultValue: 'kg' })
                      : t('workout.lbs', { defaultValue: 'lbs' }),
                })}
              </Text>
            )}
            <Text className={`flex-[2] ${headerClass}`}>
              {t('activeWorkout.setRow.reps', { defaultValue: 'Reps' })}
            </Text>
            <Text className={`w-10 ${headerClass}`}>{effortHeader}</Text>
          </View>
          <View className="w-9" />
        </View>
      )}
      {exercise.sets.map((set, index) => {
        const setId = String(set.id);
        const renderKey = setRenderKeys[setId] ?? setId;
        const state = completedSetIds[setId]
          ? 'done'
          : setId === activeSetId
            ? 'current'
            : 'upcoming';
        const assumed = assumedSetValues?.[index] ?? null;
        return stepperRows ? (
          <FocusSetRow
            key={renderKey}
            set={set}
            displayNumber={workingSetNumbers[index]}
            renderKey={renderKey}
            modality={modality}
            assumed={assumed}
            state={state}
            metricColumn={metricColumn}
            weightUnit={weightUnit}
            onCompleteSet={onCompleteSet}
            onUncomplete={onUncomplete}
            onCommitField={onCommitField}
            onActivateRpe={onActivateRpe}
            onDeleteSet={onDeleteSet}
          />
        ) : (
          <ActiveWorkoutSetRow
            key={renderKey}
            set={set}
            modality={modality}
            distanceUnit={distanceUnit}
            renderKey={renderKey}
            displayNumber={workingSetNumbers[index]}
            state={state}
            metricColumn={metricColumn === 'rir' ? 'rir' : 'rpe'}
            weightUnit={weightUnit}
            assumed={assumed}
            onComplete={onCompleteSet}
            onUncomplete={onUncomplete}
            onCommitField={onCommitField}
            onDelete={onDeleteSet}
            onActivateRpe={onActivateRpe}
            entryId={exercise.id}
            onAddSet={onAddSet}
          />
        );
      })}
      <Pressable
        onPress={() => onAddSet(exercise.id)}
        accessibilityRole="button"
        accessibilityLabel={t('activeWorkout.exercise.addSet', {
          defaultValue: 'Add set to {{name}}',
          name:
            exercise.exercise_snapshot?.name ??
            t('workout.exercise', { defaultValue: 'Exercise' }),
        })}
        className="mt-1 min-h-11 flex-row items-center justify-center gap-1.5"
      >
        <Icon name="add" size={15} color={accentPrimary} />
        <Text className="text-sm font-medium" style={{ color: accentPrimary }}>
          {t('activeWorkout.exercise.addSetLabel', {
            defaultValue: 'Add set',
          })}
        </Text>
      </Pressable>
    </View>
  );
}

export default React.memo(ActiveWorkoutFocusSets);
