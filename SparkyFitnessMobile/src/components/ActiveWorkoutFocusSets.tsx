import { LOG_LOCKED_OPACITY, useFocusLogLocked } from './focusLogLock';
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  Text,
  View,
  type TextInputInstance,
  type ViewInstance,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import { FocusScrollTargetContext } from './focusScrollTarget';
import {
  DEFAULT_WARMUP_PLATE_ROUNDING,
  isBodyweightModality,
  type ExerciseRecentSessionSet,
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
import BodyweightBanner from './BodyweightBanner';
import CardioEffortForm from './CardioEffortForm';
import Icon from './Icon';
import { HeroLabel, HeroStepper, TableCellInput } from './FocusSetCells';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import {
  SetSwipeDeleteAction,
  SwipeRevealedDelete,
  type SetInputField,
  type SetRowAccessoryHandle,
} from './SetRowChrome';
import { focusWithAndroidImeRetry } from '../utils/keyboardFocus';
import {
  parseDecimalInput,
  parseSignedDecimalInput,
} from '../utils/numericInput';
import { storedWeightInUnit, weightToKg } from '../utils/unitConversions';
import {
  buildWorkingSetNumbers,
  formatRecentSessionSet,
  getRpeTone,
  isDurationModality,
  isMetricClampedToRpe,
  isWeightDistanceModality,
  isWeightDurationModality,
  previousSetFillPatch,
  quantizeSetWeightKg,
  rendersCardioEffortForm,
  resolveSnapshotModality,
  setDistanceUnitLabel,
  setTypeLetter,
  type AssumedSetValues,
  type WorkoutCardExercise,
  type WorkoutCardSet,
} from '../utils/workoutSession';
import {
  type ActiveSetPatch,
  type CompletedSetMap,
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
  /**
   * Last session's sets paired with `exercise.sets` by position (see
   * `alignPreviousSets`): the Previous column, and what tapping it fills.
   * Omit to hide the column.
   */
  previousSets?: (ExerciseRecentSessionSet | undefined)[];
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
  /** The set being held, and the hold card drawn in its place. */
  holdSetId?: string | null;
  holdCard?: React.ReactNode;
  /** The card for the held set before it starts, drawn in the row's place (not while a rest runs). */
  holdReadyCard?: React.ReactNode;
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
  /** Upper bound for +/- (RPE and RIR stop at 10). */
  max?: number;
  format: (value: number) => string;
  parse: (text: string) => number;
  onCommit: (value: number | null) => void;
  /**
   * Flushes the draft when this changes (besides on unmount), while the commit
   * closure still targets what the draft was typed for.
   */
  commitKey?: string;
}

/** Previous cell width weight (the kg and reps cells weigh 82 and 68). */
const PREV_FLEX = 74;

/**
 * Font size for the Previous cell: 15 normally, a little smaller for long
 * values ("102.5 × 12", "BW+20 × 8"). A fixed ladder, never auto-shrink,
 * which renders some rows tiny on iOS and never below 12.
 */
/** Distance from the cardio card's top to its cell row's top (card p-2, label row, gap). */
const CARDIO_DELETE_TOP_OFFSET = 35;

function prevFontSize(text: string): number {
  if (text.length <= 7) return 15;
  if (text.length <= 9) return 14;
  return 12.5;
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
  max = Infinity,
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
    onCommit(
      Math.min(
        max,
        Math.max(min, Math.round((base + direction * step) * 100) / 100)
      )
    );
  };

  return {
    flush,
    /** Drops the typed draft, e.g. when a fill has just committed the field. */
    reset: () => setDraft(null),
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
  /** This set's counterpart last session; null shows a dash, undefined hides the column. */
  previousSet?: ExerciseRecentSessionSet | null;
  state: 'done' | 'current' | 'upcoming';
  /** An earlier set that is open again: its tick still works during a rest. */
  reLogAllowed: boolean;
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
  /** Sets in the exercise, for the active-set card's "Set 2 of 4". */
  setCount: number;
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
  previousSet,
  state,
  reLogAllowed,
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
  setCount,
  onActivateSet,
  onAddSet,
  onRegisterAccessoryHandle,
}: FocusSetRowProps) {
  const { t } = useTranslation();
  const scrollTargetRef = useContext(FocusScrollTargetContext)?.card;
  const [
    accentPrimary,
    textSecondary,
    warmupColor,
    dangerColor,
    dropColor,
    rpeEasy,
    rpeModerate,
    rpeHard,
    rpeMax,
  ] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
    '--color-cat-amber',
    '--color-icon-danger',
    '--color-cat-violet',
    RPE_TONE_VARS.easy,
    RPE_TONE_VARS.moderate,
    RPE_TONE_VARS.hard,
    RPE_TONE_VARS.max,
  ]) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
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
    max: 10,
    format: formatRpe,
    parse: (text) => parseEffort(text) ?? NaN,
    commitKey: effortField,
    onCommit: (next) =>
      onCommitField(
        setId,
        effortField === 'rir' ? { rir: next } : { rpe: next }
      ),
  });

  const flushDrafts = () => {
    if (showWeight) weight.flush();
    reps.flush();
    effortInput.flush();
  };
  const logLocked = useFocusLogLocked() && !reLogAllowed;
  const handleComplete = () => {
    flushDrafts();
    onCompleteSet(setId);
  };

  // Tapping Previous writes last session's values, replacing what the row
  // holds; a typed draft for a filled field is dropped so it cannot overwrite
  // the fill on blur.
  const canFillFromPrevious = previousSet != null;
  const handleFillFromPrevious = () => {
    if (previousSet == null) return;
    const patch = previousSetFillPatch(previousSet, modality);
    if (Object.keys(patch).length === 0) return;
    if (patch.weight != null) weight.reset();
    if (patch.reps != null) reps.reset();
    onCommitField(setId, patch);
  };

  const firstField = showWeight ? 'weight' : 'reps';
  const handleAdvance = () => {
    if (nextSetKey != null) onActivateSet(nextSetKey, firstField);
    else onAddSet(entryId);
  };

  // The screen's sticky accessory bar (Next, Log, Next Set, plate calculator)
  // acts on the focused row through this handle, as with the list's rows. The
  // handle reads the latest closures through a ref so it registers once.
  const weightInputRef = useRef<TextInputInstance>(null);
  const repsInputRef = useRef<TextInputInstance>(null);
  const effortInputRef = useRef<TextInputInstance>(null);
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
    flushDrafts,
  });
  useEffect(() => {
    latestRef.current = {
      handleComplete,
      handleAdvance,
      flushWeight: weight.flush,
      flushDrafts,
    };
  });
  useEffect(() => {
    onRegisterAccessoryHandle(renderKey, {
      log: () => latestRef.current.handleComplete(),
      focusField: (field) => inputRefFor(field).current?.focus(),
      advance: () => latestRef.current.handleAdvance(),
      flushWeight: () => latestRef.current.flushWeight(),
      flushDrafts: () => latestRef.current.flushDrafts(),
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
  const unitLabel =
    weightUnit === 'kg'
      ? t('workout.kg', { defaultValue: 'kg' })
      : t('workout.lbs', { defaultValue: 'lbs' });
  const weightKeyboard = !bodyweight
    ? 'decimal-pad'
    : Platform.OS === 'ios'
      ? 'numbers-and-punctuation'
      : 'numeric';
  // Tap the set number to change this set's type; the menu anchors to it.
  const setNumberRef = useRef<ViewInstance>(null);
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
  const weightLabels = {
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
  };
  const repsLabels = {
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
  };
  const effortInputLabel = t('activeWorkout.focus.sets.effortInput', {
    defaultValue: '{{metric}} for set {{setNumber}}',
    metric: effortLabel,
    setNumber,
  });

  const longPress = onToggleSetDetail
    ? () => onToggleSetDetail(renderKey)
    : onDeleteSet
      ? () => onDeleteSet(setId)
      : undefined;

  // The set currently being done opens into a card with big steppers; every
  // other set is one compact line of the table.
  if (isCurrent) {
    const fillText =
      previousSet != null
        ? formatRecentSessionSet(previousSet, weightUnit, t, modality)
        : null;
    const plannedReps = assumed?.reps ?? null;
    return (
      <View
        ref={scrollTargetRef}
        collapsable={false}
        testID="focus-active-set-card"
        accessibilityLabel={t('activeWorkout.focus.hero.label', {
          defaultValue: 'Set {{setNumber}} of {{total}}',
          setNumber: displayNumber,
          total: setCount,
        })}
        className="-mx-1 my-0.5 gap-2 rounded-[14px] bg-accent-primary/10 p-2"
      >
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={openSetTypeMenu}
            disabled={!onPressSetType}
            accessibilityRole={onPressSetType ? 'button' : undefined}
            accessibilityLabel={t('activeWorkout.setRow.changeType', {
              defaultValue: 'Change type for set {{setNumber}}',
              setNumber,
            })}
            className="min-h-9 justify-center"
          >
            <View ref={setNumberRef} collapsable={false}>
              <HeroLabel accent>
                {letter != null
                  ? t('activeWorkout.focus.hero.typedSet', {
                      defaultValue: 'Set {{letter}}',
                      letter,
                    })
                  : t('activeWorkout.focus.hero.setNumber', {
                      defaultValue: 'Set {{setNumber}}',
                      setNumber: displayNumber,
                    })}
              </HeroLabel>
            </View>
          </Pressable>
          {fillText != null && canFillFromPrevious && (
            <Pressable
              onPress={handleFillFromPrevious}
              accessibilityRole="button"
              accessibilityLabel={t('activeWorkout.focus.hero.fillLabel', {
                defaultValue: 'Fill set {{setNumber}} with {{value}}',
                setNumber,
                value: fillText,
              })}
              className="h-[26px] justify-center rounded-full bg-control px-2.5 active:opacity-70"
            >
              <Text
                className="text-xs font-semibold text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {t('activeWorkout.focus.hero.fill', {
                  defaultValue: 'Prev {{value}}',
                  value: fillText,
                })}
              </Text>
            </Pressable>
          )}
          {plannedReps != null && (
            <Text
              className="ml-auto text-xs text-text-secondary"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {t('activeWorkout.focus.hero.planReps', {
                defaultValue_one: 'Plan {{count}} rep',
                defaultValue_other: 'Plan {{count}} reps',
                defaultValue: 'Plan {{count}} reps',
                count: plannedReps,
              })}
            </Text>
          )}
        </View>
        <View className="flex-row gap-2">
          {showWeight && (
            <View className="flex-1 gap-1">
              <HeroLabel>{unitLabel}</HeroLabel>
              <HeroStepper
                {...weight.inputProps}
                inputRef={weightInputRef}
                onFocus={() => onActivateSet(renderKey, 'weight')}
                keyboardType={weightKeyboard}
                accessibilityLabel={weightLabels.input}
                decrementLabel={weightLabels.decrement}
                incrementLabel={weightLabels.increment}
              />
            </View>
          )}
          <View className="flex-1 gap-1">
            <HeroLabel>
              {t('activeWorkout.setRow.reps', { defaultValue: 'Reps' })}
            </HeroLabel>
            <HeroStepper
              {...reps.inputProps}
              inputRef={repsInputRef}
              onFocus={() => onActivateSet(renderKey, 'reps')}
              keyboardType="number-pad"
              accessibilityLabel={repsLabels.input}
              decrementLabel={repsLabels.decrement}
              incrementLabel={repsLabels.increment}
            />
          </View>
        </View>
        <Pressable
          onPress={handleComplete}
          disabled={logLocked}
          accessibilityRole="button"
          accessibilityState={{ disabled: logLocked }}
          accessibilityLabel={t('activeWorkout.focus.hero.logSet', {
            defaultValue: 'Log set',
          })}
          className="h-11 items-center justify-center rounded-full bg-accent-primary active:opacity-80"
          style={logLocked ? { opacity: LOG_LOCKED_OPACITY } : undefined}
        >
          <Text className="text-lg font-bold text-on-accent">
            {t('activeWorkout.focus.hero.logSet', { defaultValue: 'Log set' })}
          </Text>
        </Pressable>
      </View>
    );
  }

  const letterColor =
    letter === 'W'
      ? warmupColor
      : letter === 'F'
        ? dangerColor
        : letter === 'D'
          ? dropColor
          : textSecondary;
  const setIndicator = (
    <Text
      className="text-[15px] font-bold"
      style={{ color: letterColor, fontVariant: ['tabular-nums'] }}
    >
      {letter ?? displayNumber}
    </Text>
  );

  const prevText =
    previousSet != null
      ? formatRecentSessionSet(previousSet, weightUnit, t, modality)
      : '-';

  const rowElement = (
    <Pressable
      testID="focus-set-row"
      onLongPress={longPress}
      accessibilityLabel={
        onDeleteSet && !onToggleSetDetail
          ? t('activeWorkout.setRow.delete', {
              defaultValue: 'Delete set {{setNumber}}',
              setNumber,
            })
          : undefined
      }
      className="flex-row items-center gap-1"
    >
      <View ref={setNumberRef} collapsable={false} style={{ width: 30 }}>
        {onPressSetType ? (
          <Pressable
            onPress={openSetTypeMenu}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.setRow.changeType', {
              defaultValue: 'Change type for set {{setNumber}}',
              setNumber,
            })}
            hitSlop={{ top: 5, bottom: 5 }}
            className="h-[34px] items-center justify-center"
          >
            {setIndicator}
          </Pressable>
        ) : (
          <View className="h-[34px] items-center justify-center">
            {setIndicator}
          </View>
        )}
      </View>
      {previousSet !== undefined && (
        <Pressable
          onPress={handleFillFromPrevious}
          onLongPress={longPress}
          disabled={!canFillFromPrevious}
          accessibilityRole={canFillFromPrevious ? 'button' : undefined}
          accessibilityLabel={
            canFillFromPrevious
              ? t('activeWorkout.setRow.fillFromPrevious', {
                  defaultValue: 'Fill set {{setNumber}} from previous',
                  setNumber,
                })
              : undefined
          }
          hitSlop={{ top: 5, bottom: 5 }}
          className="h-[34px] items-center justify-center rounded-[12px] border border-dashed border-border-strong"
          style={{ flex: PREV_FLEX }}
        >
          <Text
            numberOfLines={1}
            className="text-center font-semibold text-text-secondary"
            style={{
              fontVariant: ['tabular-nums'],
              fontSize: prevFontSize(prevText),
            }}
          >
            {prevText}
          </Text>
        </Pressable>
      )}
      <View
        testID="focus-set-values"
        className="flex-row gap-1"
        style={{ flex: 198 }}
      >
        {showWeight && (
          <View style={{ flex: 82 }}>
            <TableCellInput
              {...weight.inputProps}
              inputRef={weightInputRef}
              onFocus={() => onActivateSet(renderKey, 'weight')}
              keyboardType={weightKeyboard}
              accessibilityLabel={weightLabels.input}
            />
          </View>
        )}
        <View style={{ flex: showWeight ? 68 : 150 }}>
          <TableCellInput
            {...reps.inputProps}
            inputRef={repsInputRef}
            onFocus={() => onActivateSet(renderKey, 'reps')}
            keyboardType="number-pad"
            accessibilityLabel={repsLabels.input}
          />
        </View>
        <View style={{ flex: 48 }}>
          {!isEffortColumn ? (
            <View className="h-[34px] items-center justify-center rounded-[12px] bg-raised">
              <Text
                className="text-center text-[15px] text-text-secondary"
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
            </View>
          ) : (
            <TableCellInput
              {...effortInput.inputProps}
              placeholder=""
              inputRef={effortInputRef}
              onFocus={() => onActivateRpe(renderKey)}
              keyboardType="decimal-pad"
              accessibilityLabel={effortInputLabel}
              textColor={effortColor}
            />
          )}
        </View>
      </View>
      <Pressable
        onPress={isDone ? () => onUncomplete(setId) : handleComplete}
        disabled={logLocked && !isDone ? true : undefined}
        accessibilityRole="checkbox"
        accessibilityState={
          logLocked && !isDone
            ? { checked: isDone, disabled: true }
            : { checked: isDone }
        }
        accessibilityLabel={checkLabel}
        hitSlop={5}
        className={`h-[34px] w-[34px] items-center justify-center rounded-[12px] active:opacity-70 ${
          isDone ? '' : 'bg-raised'
        }`}
        style={{
          ...(isDone ? { backgroundColor: accentPrimary } : null),
          ...(logLocked && !isDone ? { opacity: LOG_LOCKED_OPACITY } : null),
        }}
      >
        <Icon
          name="checkmark"
          size={17}
          color={isDone ? '#ffffff' : textSecondary}
          weight="bold"
        />
      </Pressable>
    </Pressable>
  );
  // A horizontal swipe on a row reveals Delete (the row's own pan outranks the
  // exercise pager's, so it never turns the page).
  if (onDeleteSet == null) return rowElement;
  return (
    <ReanimatedSwipeable
      renderRightActions={(progress) => (
        <SwipeRevealedDelete progress={progress}>
          <SetSwipeDeleteAction
            onPress={() => onDeleteSet(setId)}
            height={34}
            accessibilityLabel={t('activeWorkout.setRow.delete', {
              defaultValue: 'Delete set {{setNumber}}',
              setNumber,
            })}
          />
        </SwipeRevealedDelete>
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      {rowElement}
    </ReanimatedSwipeable>
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
  previousSets,
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
  holdSetId = null,
  holdCard,
  holdReadyCard,
  focusedSetKey,
  focusedField,
  onActivateSet,
  onRegisterAccessoryHandle,
}: Props) {
  const scrollTargets = useContext(FocusScrollTargetContext);
  const { t } = useTranslation();
  const [accentPrimary, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
  ]) as [string, string];
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
  const bodyweightExercise = isBodyweightModality(modality);
  const bodyWeightKg = useBodyWeightKg(undefined, bodyweightExercise);
  const activeSetIndex = exercise.sets.findIndex(
    (set) => String(set.id) === activeSetId
  );
  // The card opens on this exercise's current set: the cursor's when it is
  // here, else the first set still to do, so every exercise (and its first
  // set, before anything is logged) gets the big steppers, not just the one
  // the cursor sits in.
  const firstToDo = exercise.sets.find(
    (set) => !completedSetIds[String(set.id)]
  );
  const currentSetId =
    activeSetIndex >= 0
      ? activeSetId
      : firstToDo != null
        ? String(firstToDo.id)
        : null;
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
  const metricAnchorRef = useRef<ViewInstance>(null);
  const openMetricMenu = () =>
    measureAnchoredMenuTrigger(metricAnchorRef.current, (anchor) =>
      onPressMetricHeader(anchor, clampedToRpe)
    );
  const metricTrigger = (
    <View
      ref={metricAnchorRef}
      collapsable={false}
      className={stepperRows ? 'items-center' : 'w-14 items-center'}
      style={stepperRows ? { flex: 48 } : undefined}
    >
      <Pressable
        onPress={openMetricMenu}
        hitSlop={{ left: 4, right: 4, top: 10, bottom: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('activeWorkout.exercise.changeMetric', {
          defaultValue: 'Change metric column',
        })}
        className="min-h-6 flex-row items-center justify-center gap-0.5"
      >
        <Text
          className="text-xs font-bold uppercase"
          style={{ color: accentPrimary }}
        >
          {effortHeader}
        </Text>
        <Icon name="chevron-down" size={10} color={accentPrimary} />
      </Pressable>
    </View>
  );
  const headerClass =
    'text-center text-xs font-bold uppercase text-text-secondary';

  // A cardio exercise with one set logs duration and distance in the form the
  // list card shows, in place of a set table.
  if (
    rendersCardioEffortForm(exercise.exercise_snapshot, exercise.sets.length)
  ) {
    const cardioSet = exercise.sets[0] ?? null;
    const cardioSetId = cardioSet != null ? String(cardioSet.id) : null;
    const cardioElement = (
      <View className="rounded-2xl bg-transparent p-2">
        <CardioEffortForm
          set={cardioSet}
          exerciseName={
            exercise.exercise_snapshot?.name ??
            t('workout.exercise', { defaultValue: 'Exercise' })
          }
          mode="live"
          distanceUnit={distanceUnit}
          assumed={assumedSetValues?.[0] ?? null}
          state={
            cardioSetId == null
              ? 'upcoming'
              : completedSetIds[cardioSetId]
                ? 'done'
                : cardioSetId === currentSetId
                  ? 'current'
                  : 'upcoming'
          }
          renderKey={
            cardioSetId != null
              ? (setRenderKeys[cardioSetId] ?? cardioSetId)
              : undefined
          }
          onCommitField={onCommitField}
          onComplete={onCompleteSet}
          onUncomplete={onUncomplete}
          onActivateSet={activateSetById}
          onRegisterAccessoryHandle={onRegisterAccessoryHandle}
        />
      </View>
    );
    // A horizontal swipe reveals Delete, like the strength rows; the only set
    // going removes the exercise (the screen confirms).
    if (cardioSetId == null || onDeleteSet == null) return cardioElement;
    return (
      <ReanimatedSwipeable
        renderRightActions={(progress) => (
          <SwipeRevealedDelete progress={progress}>
            {/* The swipe's action area only wraps the pill, so it sits at the
                top of the row; drop it onto the cells under the labels. */}
            <View
              testID="cardio-swipe-delete-slot"
              style={{ marginTop: CARDIO_DELETE_TOP_OFFSET }}
            >
              <SetSwipeDeleteAction
                onPress={() => onDeleteSet(cardioSetId)}
                height={34}
                accessibilityLabel={t('activeWorkout.setRow.delete', {
                  defaultValue: 'Delete set {{setNumber}}',
                  setNumber: cardioSet?.set_number ?? 1,
                })}
              />
            </View>
          </SwipeRevealedDelete>
        )}
        overshootRight={false}
        rightThreshold={40}
      >
        {cardioElement}
      </ReanimatedSwipeable>
    );
  }

  return (
    <View className="gap-1.5">
      {stepperRows && (
        <View
          ref={scrollTargets?.header}
          collapsable={false}
          className="-mb-1.5 flex-row items-center gap-1"
        >
          <Text className={headerClass} style={{ width: 30 }}>
            {t('workout.set', { defaultValue: 'Set' })}
          </Text>
          {previousSets != null && (
            <Text className={headerClass} style={{ flex: PREV_FLEX }}>
              {t('workout.prev', { defaultValue: 'Prev' })}
            </Text>
          )}
          <View className="flex-row items-center gap-1" style={{ flex: 198 }}>
            {modality !== 'reps_only' && (
              <Text className={headerClass} style={{ flex: 82 }}>
                {weightUnit === 'kg'
                  ? t('workout.kg', { defaultValue: 'kg' })
                  : t('workout.lbs', { defaultValue: 'lbs' })}
              </Text>
            )}
            <Text
              className={headerClass}
              style={{ flex: modality !== 'reps_only' ? 68 : 150 }}
            >
              {t('activeWorkout.setRow.reps', { defaultValue: 'Reps' })}
            </Text>
            {metricTrigger}
          </View>
          <View className="w-[34px]" />
        </View>
      )}
      {!stepperRows && exercise.sets.length > 0 && (
        // Same columns as the list card's header for these tables.
        <View
          ref={scrollTargets?.header}
          collapsable={false}
          className="-mb-2 flex-row items-center px-1"
        >
          <Text className={`w-9 ${headerClass}`}>
            {t('workout.set', { defaultValue: 'Set' })}
          </Text>
          {previousSets != null && (
            <Text
              className={`${isDurationModality(modality) ? 'flex-1' : 'w-20'} ${headerClass}`}
            >
              {t('workout.prev', { defaultValue: 'Prev' })}
            </Text>
          )}
          {isDurationModality(modality) ? (
            <>
              <Text className={`flex-1 ${headerClass}`}>
                {t('workout.sec', { defaultValue: 'Sec' })}
              </Text>
              {modality === 'duration_distance' && (
                <Text className={`flex-1 ${headerClass}`}>
                  {setDistanceUnitLabel(distanceUnit, modality)}
                </Text>
              )}
            </>
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
          : setId === currentSetId
            ? 'current'
            : 'upcoming';
        // During a rest only the current set and the ones after it wait; an
        // earlier set that is open again can be re-marked.
        const reLogAllowed = activeSetIndex >= 0 && index < activeSetIndex;
        const assumed = assumedSetValues?.[index] ?? null;
        // null shows a dash for a set with no counterpart; undefined (no
        // `previousSets`) hides the column.
        const previousSet =
          previousSets != null ? (previousSets[index] ?? null) : undefined;
        const row = stepperRows ? (
          <FocusSetRow
            key={renderKey}
            set={set}
            displayNumber={workingSetNumbers[index]}
            renderKey={renderKey}
            modality={modality}
            assumed={assumed}
            previousSet={previousSet}
            state={state}
            reLogAllowed={reLogAllowed}
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
            setCount={exercise.sets.length}
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
            reLogAllowed={reLogAllowed}
            metricColumn={metricColumn === 'rir' ? 'rir' : 'rpe'}
            weightUnit={weightUnit}
            assumed={assumed}
            previousSet={previousSet}
            onComplete={onCompleteSet}
            onUncomplete={onUncomplete}
            onCommitField={onCommitField}
            onDelete={onDeleteSet}
            focusLook
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
            {holdSetId === setId ? (holdCard ?? holdReadyCard ?? row) : row}
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
        className="mt-1 min-h-12 flex-row items-center justify-center gap-2 rounded-full bg-raised active:opacity-70"
      >
        <Icon name="add" size={18} color={textPrimary} weight="bold" />
        <Text className="text-base font-bold text-text-primary">
          {t('activeWorkout.exercise.addSetLabel', {
            defaultValue: 'Add set',
          })}
        </Text>
      </Pressable>
      {/* Below the table so the current-set card stays near the top. */}
      {bodyweightExercise && (
        <BodyweightBanner bodyWeightKg={bodyWeightKg} weightUnit={weightUnit} />
      )}
    </View>
  );
}

export default React.memo(ActiveWorkoutFocusSets);
