import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View, type TextInput } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  DEFAULT_WARMUP_PLATE_ROUNDING,
  isBodyweightModality,
} from '@workspace/shared';
import { useBodyWeightKg } from '../hooks/useBodyWeightKg';
import { measureAnchoredMenuTrigger, type AnchorRect } from './AnchoredMenu';
import ActiveWorkoutSetDetail from './ActiveWorkoutSetDetail';
import ActiveWorkoutSetRow, {
  RPE_TONE_VARS,
  formatRpe,
  parseRirInput,
  parseRpeInput,
  weightMetricText,
} from './ActiveWorkoutSetRow';
import CompletionCheck, { LogCircle } from './CompletionCheck';
import Icon from './Icon';
import StepperInput from './StepperInput';
import {
  SetCellInput,
  type SetInputField,
  type SetRowAccessoryHandle,
} from './SetRowChrome';
import { withAlpha } from '../utils/colors';
import { focusWithAndroidImeRetry } from '../utils/keyboardFocus';
import {
  parseDecimalInput,
  parseSignedDecimalInput,
} from '../utils/numericInput';
import { storedWeightInUnit, weightToKg } from '../utils/unitConversions';
import {
  buildWorkingSetNumbers,
  getRpeTone,
  isDurationModality,
  isMetricClampedToRpe,
  isWeightDistanceModality,
  isWeightDurationModality,
  quantizeSetWeightKg,
  resolveSnapshotModality,
  setDistanceUnitLabel,
  setTypeLetter,
  type AssumedSetValues,
  type WorkoutCardExercise,
  type WorkoutCardSet,
} from '../utils/workoutSession';
import type {
  ActiveSetPatch,
  CompletedSetMap,
} from '../stores/activeWorkoutStore';
import {
  useAppPreferencesStore,
  type ActiveWorkoutMetricColumn,
} from '../stores/appPreferencesStore';
import { formatFocusWeight } from '../utils/focusView';
import { resolveWarmupOptions } from '../utils/warmupSettings';

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
  /** Deletes a set: from the detail panel, or by long-press without `onToggleSetDetail`. */
  onDeleteSet?: (setId: string) => void;
  /** Change the shared effort / metric column; anchored to the header. */
  onPressMetricHeader: (anchor: AnchorRect, clampedToRpe: boolean) => void;
  /** Opens the set-type menu from a set's number. */
  onPressSetType?: (setId: string, anchor: AnchorRect) => void;
  /** Long-press expands a set's detail panel (per-set note); keyed by render key. */
  onToggleSetDetail?: (setKey: string) => void;
  expandedSetKey?: string | null;
  /** The screen's keyboard focus (render key and field), as in the list. */
  focusedSetKey: string | null;
  focusedField: SetInputField;
  /** Receives the set's render key. */
  onActivateSet: (setKey: string, field: Exclude<SetInputField, 'rpe'>) => void;
  /** Lets the screen's sticky accessory bar act on the focused row. */
  onRegisterAccessoryHandle: (
    key: string,
    handle: SetRowAccessoryHandle | null
  ) => void;
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
  /**
   * Flushes the draft when this changes (besides on unmount), while the commit
   * closure still targets what the draft was typed for.
   */
  commitKey?: string;
}

/**
 * Typing-friendly state for one stepper cell: keystrokes stay in a local draft
 * and commit on blur, unmount (a blur on an unmounting input is never
 * delivered), or flush; +/- commit immediately from the visible value
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
  commitKey,
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

  // Navigating away unmounts the row with the keyboard still up; commit what
  // was typed. Synced in an effect so no ref is written during render.
  const latestFlushRef = useRef(flush);
  useEffect(() => {
    latestFlushRef.current = flush;
  });
  // Runs the previous render's flush when `commitKey` changes too, so a draft
  // typed for RPE is never routed to RIR after a metric switch.
  useEffect(() => () => latestFlushRef.current(), [commitKey]);

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
  /** +/- step for weight, in the display unit. */
  weightStep: number;
  onCompleteSet: (setId: string) => void;
  onUncomplete: (setId: string) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onActivateRpe: (setKey: string) => void;
  onDeleteSet?: (setId: string) => void;
  onPressSetType?: (setId: string, anchor: AnchorRect) => void;
  /** Long-press toggles the set's detail panel; without it, deletes the set. */
  onToggleSetDetail?: (setKey: string) => void;
  /** Read-only weight-derived column (Vol / 1RM / 10RM) in place of the effort input. */
  bodyWeightKg: number | null;
  /** This row holds the keyboard; `activeField` names the input. */
  isFocused: boolean;
  activeField: SetInputField;
  /** Render key of the following set, for Next Set; null on the last set. */
  nextSetKey: string | null;
  entryId: string;
  onActivateSet: (setKey: string, field: Exclude<SetInputField, 'rpe'>) => void;
  onAddSet: (entryId: string) => void;
  onRegisterAccessoryHandle: (
    key: string,
    handle: SetRowAccessoryHandle | null
  ) => void;
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
  weightStep,
  onCompleteSet,
  onUncomplete,
  onCommitField,
  onActivateRpe,
  onDeleteSet,
  onPressSetType,
  onToggleSetDetail,
  bodyWeightKg,
  isFocused,
  activeField,
  nextSetKey,
  entryId,
  onActivateSet,
  onAddSet,
  onRegisterAccessoryHandle,
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
    step: weightStep,
    // An assisted bodyweight set carries a negative weight.
    min: bodyweight ? -Infinity : 0,
    format: (value) => formatFocusWeight(value, weightUnit),
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

  const isEffortColumn = metricColumn === 'rpe' || metricColumn === 'rir';
  const effortField = metricColumn === 'rir' ? 'rir' : 'rpe';
  const effort = (effortField === 'rir' ? set.rir : set.rpe) ?? null;
  const parseEffort = effortField === 'rir' ? parseRirInput : parseRpeInput;
  const effortInput = useStepperField({
    value: effort,
    assumed: null,
    step: 1,
    min: 0,
    format: formatRpe,
    parse: (text) => parseEffort(text) ?? NaN,
    commitKey: effortField,
    onCommit: (next) =>
      onCommitField(
        setId,
        effortField === 'rir' ? { rir: next } : { rpe: next }
      ),
  });

  const handleComplete = () => {
    if (showWeight) weight.flush();
    reps.flush();
    effortInput.flush();
    onCompleteSet(setId);
  };

  const firstField = showWeight ? 'weight' : 'reps';
  const handleAdvance = () => {
    if (nextSetKey != null) onActivateSet(nextSetKey, firstField);
    else onAddSet(entryId);
  };

  // The screen's sticky accessory bar (Next, Log, Next Set, plate calculator)
  // acts on the focused row through this handle, as with the list's rows. The
  // handle reads the latest closures through a ref so it registers once.
  const weightInputRef = useRef<TextInput>(null);
  const repsInputRef = useRef<TextInput>(null);
  const effortInputRef = useRef<TextInput>(null);
  const inputRefFor = useCallback(
    (field: SetInputField) =>
      field === 'reps'
        ? repsInputRef
        : field === 'rpe'
          ? effortInputRef
          : weightInputRef,
    []
  );
  const latestRef = useRef({
    handleComplete,
    handleAdvance,
    flushWeight: weight.flush,
  });
  useEffect(() => {
    latestRef.current = {
      handleComplete,
      handleAdvance,
      flushWeight: weight.flush,
    };
  });
  useEffect(() => {
    onRegisterAccessoryHandle(renderKey, {
      log: () => latestRef.current.handleComplete(),
      focusField: (field) => inputRefFor(field).current?.focus(),
      advance: () => latestRef.current.handleAdvance(),
      flushWeight: () => latestRef.current.flushWeight(),
    });
    return () => onRegisterAccessoryHandle(renderKey, null);
  }, [renderKey, onRegisterAccessoryHandle, inputRefFor]);

  // Move the keyboard here when the screen focuses this row on its own (Next
  // Set, or a rest running out); a tap has already focused the input.
  useEffect(() => {
    if (!isFocused) return;
    const ref = inputRefFor(activeField);
    if (ref.current?.isFocused()) return;
    return focusWithAndroidImeRetry(ref);
  }, [isFocused, activeField, inputRefFor]);
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
  const setIndicator = (
    <Text
      className="text-sm text-text-muted"
      style={[
        { fontVariant: ['tabular-nums'] },
        isCurrent ? { color: accentPrimary, fontWeight: '700' } : null,
      ]}
    >
      {letter ?? displayNumber}
    </Text>
  );
  // Tap the set number to change this set's type; the menu anchors to it.
  const setNumberRef = useRef<View>(null);
  const openSetTypeMenu = () => {
    if (!onPressSetType) return;
    measureAnchoredMenuTrigger(setNumberRef.current, (anchor) =>
      onPressSetType(setId, anchor)
    );
  };
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
      onLongPress={
        onToggleSetDetail
          ? () => onToggleSetDetail(renderKey)
          : onDeleteSet
            ? () => onDeleteSet(setId)
            : undefined
      }
      accessibilityLabel={
        onDeleteSet && !onToggleSetDetail
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
      <View ref={setNumberRef} collapsable={false} className="w-9 items-center">
        {onPressSetType ? (
          <Pressable
            onPress={openSetTypeMenu}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.setRow.changeType', {
              defaultValue: 'Change type for set {{setNumber}}',
              setNumber,
            })}
            className="h-11 w-9 items-center justify-center"
          >
            {setIndicator}
          </Pressable>
        ) : (
          setIndicator
        )}
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
              inputRef={weightInputRef}
              inputProps={{ onFocus: () => onActivateSet(renderKey, 'weight') }}
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
            inputRef={repsInputRef}
            inputProps={{ onFocus: () => onActivateSet(renderKey, 'reps') }}
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
        <View className="w-10">
          {!isEffortColumn ? (
            <Text
              className="text-center text-sm text-text-muted"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {weightMetricText(
                metricColumn,
                set,
                modality,
                bodyWeightKg,
                weightUnit
              )}
            </Text>
          ) : (
            <SetCellInput
              inputRef={effortInputRef}
              value={effortInput.inputProps.value}
              onChangeText={effortInput.inputProps.onChangeText}
              onBlur={effortInput.flush}
              onFocus={() => onActivateRpe(renderKey)}
              keyboardType="decimal-pad"
              accessibilityLabel={t('activeWorkout.focus.sets.effortInput', {
                defaultValue: '{{metric}} for set {{setNumber}}',
                metric: effortLabel,
                setNumber,
              })}
              textColor={effortColor}
            />
          )}
        </View>
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
  onPressMetricHeader,
  onPressSetType,
  onToggleSetDetail,
  expandedSetKey = null,
  focusedSetKey,
  focusedField,
  onActivateSet,
  onRegisterAccessoryHandle,
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
  // The list's set rows report set ids; the screen keys focus by render key.
  const activateSetById = useCallback(
    (id: string, field: Exclude<SetInputField, 'rpe'>) =>
      onActivateSet(setRenderKeys[id] ?? id, field),
    [onActivateSet, setRenderKeys]
  );
  const activateRpeById = useCallback(
    (id: string) => onActivateRpe(setRenderKeys[id] ?? id),
    [onActivateRpe, setRenderKeys]
  );
  // Same clamp as the list card: weight-derived columns mean nothing for
  // reps-only tables, so they show RPE there (never written back).
  const clampedToRpe = isMetricClampedToRpe(modality);
  const effectiveMetricColumn: ActiveWorkoutMetricColumn =
    clampedToRpe && metricColumn !== 'rir' ? 'rpe' : metricColumn;
  // The +/- step is the lifter's own warm-up rounding for this equipment
  // (dumbbell step for dumbbells, plate step for everything else).
  const warmupMethod = useAppPreferencesStore((s) => s.warmupMethod);
  const warmupPlateRounding = useAppPreferencesStore(
    (s) => s.warmupPlateRounding
  );
  const warmupDumbbellRounding = useAppPreferencesStore(
    (s) => s.warmupDumbbellRounding
  );
  const weightStep =
    resolveWarmupOptions(
      { warmupMethod, warmupPlateRounding, warmupDumbbellRounding },
      weightUnit,
      exercise.exercise_snapshot?.equipment
    ).increment ?? DEFAULT_WARMUP_PLATE_ROUNDING[weightUnit];
  const bodyWeightKg = useBodyWeightKg(
    undefined,
    stepperRows && isBodyweightModality(modality)
  );
  const effortHeader = (() => {
    switch (effectiveMetricColumn) {
      case 'rir':
        return t('workout.metricRir', { defaultValue: 'RIR' });
      case 'volume':
        return t('workout.metricVolumeShort', { defaultValue: 'Vol' });
      case 'e1rm':
        return t('workout.metricE1rmShort', { defaultValue: '1RM' });
      case 'tenrm':
        return t('workout.metricTenrmShort', { defaultValue: '10RM' });
      default:
        return t('workout.metricRpe', { defaultValue: 'RPE' });
    }
  })();
  const metricAnchorRef = useRef<View>(null);
  const openMetricMenu = () =>
    measureAnchoredMenuTrigger(metricAnchorRef.current, (anchor) =>
      onPressMetricHeader(anchor, clampedToRpe)
    );
  const metricTrigger = (
    <View
      ref={metricAnchorRef}
      collapsable={false}
      className={`${stepperRows ? 'w-10' : 'w-14'} items-center`}
    >
      <Pressable
        onPress={openMetricMenu}
        hitSlop={{ left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={t('activeWorkout.exercise.changeMetric', {
          defaultValue: 'Change metric column',
        })}
        className="-my-3.5 min-h-11 flex-row items-center justify-center gap-0.5"
      >
        <Text
          className="text-xs font-medium uppercase"
          style={{ color: accentPrimary }}
        >
          {effortHeader}
        </Text>
        <Icon name="chevron-down" size={10} color={accentPrimary} />
      </Pressable>
    </View>
  );
  const headerClass =
    'text-center text-xs font-medium uppercase text-text-muted';

  return (
    <View className="rounded-2xl bg-surface p-2">
      {stepperRows && (
        <View className="flex-row items-center gap-2 px-2 pb-1">
          <View className="w-9" />
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
            {metricTrigger}
          </View>
          <View className="w-9" />
        </View>
      )}
      {!stepperRows && exercise.sets.length > 0 && (
        // Same columns as the list card's header for these tables.
        <View className="flex-row items-center px-1 py-1.5">
          <Text className={`w-9 ${headerClass}`}>
            {t('workout.set', { defaultValue: 'Set' })}
          </Text>
          {isDurationModality(modality) ? (
            <Text className={`flex-1 ${headerClass}`}>
              {t('workout.sec', { defaultValue: 'Sec' })}
            </Text>
          ) : (
            <>
              <Text className={`flex-1 ${headerClass}`}>
                {weightUnit === 'kg'
                  ? t('workout.kg', { defaultValue: 'kg' })
                  : t('workout.lbs', { defaultValue: 'lbs' })}
              </Text>
              <Text className={`flex-1 ${headerClass}`}>
                {isWeightDurationModality(modality)
                  ? t('workout.sec', { defaultValue: 'Sec' })
                  : setDistanceUnitLabel(distanceUnit, modality)}
              </Text>
            </>
          )}
          {metricTrigger}
          <View className="w-10" />
        </View>
      )}
      {exercise.sets.map((set, index) => {
        const setId = String(set.id);
        const renderKey = setRenderKeys[setId] ?? setId;
        const nextSet = exercise.sets[index + 1];
        const nextSetId = nextSet != null ? String(nextSet.id) : null;
        const isFocused = focusedSetKey === renderKey;
        const state = completedSetIds[setId]
          ? 'done'
          : setId === activeSetId
            ? 'current'
            : 'upcoming';
        const assumed = assumedSetValues?.[index] ?? null;
        const row = stepperRows ? (
          <FocusSetRow
            key={renderKey}
            set={set}
            displayNumber={workingSetNumbers[index]}
            renderKey={renderKey}
            modality={modality}
            assumed={assumed}
            state={state}
            metricColumn={effectiveMetricColumn}
            weightUnit={weightUnit}
            weightStep={weightStep}
            bodyWeightKg={bodyWeightKg}
            onPressSetType={onPressSetType}
            onToggleSetDetail={onToggleSetDetail}
            onCompleteSet={onCompleteSet}
            onUncomplete={onUncomplete}
            onCommitField={onCommitField}
            onActivateRpe={onActivateRpe}
            onDeleteSet={onDeleteSet}
            isFocused={isFocused}
            activeField={focusedField}
            nextSetKey={
              nextSetId != null ? (setRenderKeys[nextSetId] ?? nextSetId) : null
            }
            entryId={exercise.id}
            onActivateSet={onActivateSet}
            onAddSet={onAddSet}
            onRegisterAccessoryHandle={onRegisterAccessoryHandle}
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
            disableSwipeDelete
            onPressSetType={onPressSetType}
            onLongPress={
              onToggleSetDetail
                ? (id) => onToggleSetDetail(setRenderKeys[id] ?? id)
                : undefined
            }
            activeField={isFocused ? focusedField : undefined}
            isFocused={isFocused}
            nextSetId={nextSetId}
            entryId={exercise.id}
            onAddSet={onAddSet}
            onActivateSet={activateSetById}
            onActivateRpe={activateRpeById}
            onRegisterAccessoryHandle={onRegisterAccessoryHandle}
          />
        );
        return (
          <React.Fragment key={renderKey}>
            {row}
            {expandedSetKey === renderKey && (
              <ActiveWorkoutSetDetail
                set={set}
                onCommitField={onCommitField}
                onDelete={onDeleteSet}
              />
            )}
          </React.Fragment>
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
