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
import FocusRestCard from './FocusRestCard';
import Icon from './Icon';
import { HeroLabel, HeroStepper, TableCellInput } from './FocusSetCells';
import { type SetInputField, type SetRowAccessoryHandle } from './SetRowChrome';
import { focusWithAndroidImeRetry } from '../utils/keyboardFocus';
import {
  parseDecimalInput,
  parseSignedDecimalInput,
} from '../utils/numericInput';
import { storedWeightInUnit, weightToKg } from '../utils/unitConversions';
import {
  buildWorkingSetNumbers,
  effectiveSetDurationSec,
  formatRecentSessionSet,
  formatSetLoad,
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
  useActiveWorkoutStore,
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
  /** The rest card is up: the current set stays a table line, ringed in the rest color. */
  resting?: boolean;
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
  resting = false,
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
    restColor,
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
    '--color-rest',
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
    string,
  ];
  const ringColor = resting && state === 'current' ? restColor : undefined;
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

  const handleComplete = () => {
    if (showWeight) weight.flush();
    reps.flush();
    effortInput.flush();
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
  if (isCurrent && !resting) {
    const fillText =
      previousSet != null
        ? formatRecentSessionSet(previousSet, weightUnit, t, modality)
        : null;
    const repsLeft =
      effortField === 'rpe' && effort != null && effort >= 5 && effort <= 10
        ? Math.round(10 - effort)
        : null;
    return (
      <View
        testID="focus-active-set-card"
        accessibilityLabel={t('activeWorkout.focus.hero.label', {
          defaultValue: 'Set {{setNumber}} of {{total}}',
          setNumber: displayNumber,
          total: setCount,
        })}
        className="my-1 gap-2 rounded-[20px] bg-raised p-2.5"
        style={{ borderWidth: 2, borderColor: accentPrimary }}
      >
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={openSetTypeMenu}
            disabled={!onPressSetType}
            accessibilityRole={onPressSetType ? 'button' : undefined}
            accessibilityLabel={t('activeWorkout.setRow.changeType', {
              defaultValue: 'Change type for set {{setNumber}}',
              setNumber,
            })}
            className="min-h-11 justify-center"
          >
            <View ref={setNumberRef} collapsable={false}>
              <HeroLabel accent>
                {letter != null
                  ? t('activeWorkout.focus.hero.typedSet', {
                      defaultValue: 'Set {{letter}}',
                      letter,
                    })
                  : t('activeWorkout.focus.hero.setOf', {
                      defaultValue: 'Set {{setNumber}} of {{total}}',
                      setNumber: displayNumber,
                      total: setCount,
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
              className="h-11 justify-center rounded-full bg-control px-3.5 active:opacity-70"
            >
              <Text
                className="text-[13px] font-semibold text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {t('activeWorkout.focus.hero.fill', {
                  defaultValue: 'Fill {{value}}',
                  value: fillText,
                })}
              </Text>
            </Pressable>
          )}
        </View>
        <View className="flex-row gap-2">
          {showWeight && (
            <View className="flex-1 gap-1">
              <HeroLabel>
                {t('activeWorkout.focus.sets.weightHeader', {
                  defaultValue: 'Weight ({{unit}})',
                  unit: unitLabel,
                })}
              </HeroLabel>
              <HeroStepper
                {...weight.inputProps}
                inputRef={weightInputRef}
                onFocus={() => onActivateSet(renderKey, 'weight')}
                keyboardType={weightKeyboard}
                accessibilityLabel={weightLabels.input}
                decrementLabel={weightLabels.decrement}
                incrementLabel={weightLabels.increment}
              />
              <Text
                className="text-center text-[13px] text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {t('activeWorkout.focus.hero.step', {
                  defaultValue: 'step {{step}} {{unit}}',
                  step: formatFocusWeight(weightStep, weightUnit),
                  unit: unitLabel,
                })}
              </Text>
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
            {previousSet?.reps != null && (
              <Text
                className="text-center text-[13px] text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {t('activeWorkout.focus.hero.lastReps', {
                  defaultValue: 'last {{reps}}',
                  reps: previousSet.reps,
                })}
              </Text>
            )}
          </View>
        </View>
        {isEffortColumn && (
          <View className="flex-row items-center gap-1.5 pl-3.5">
            <View className="min-w-0 flex-1">
              <HeroLabel accent>{effortLabel}</HeroLabel>
              <Text className="text-[13px] text-text-secondary">
                {repsLeft != null
                  ? t('activeWorkout.focus.hero.optionalRepsLeft', {
                      defaultValue: 'optional · {{count}} reps left',
                      count: repsLeft,
                    })
                  : t('activeWorkout.focus.hero.optional', {
                      defaultValue: 'optional',
                    })}
              </Text>
            </View>
            <View style={{ width: 150 }}>
              <HeroStepper
                {...effortInput.inputProps}
                inputRef={effortInputRef}
                onFocus={() => onActivateRpe(renderKey)}
                keyboardType="decimal-pad"
                accessibilityLabel={effortInputLabel}
                decrementLabel={t('activeWorkout.focus.hero.decreaseEffort', {
                  defaultValue: 'Decrease {{metric}} for set {{setNumber}}',
                  metric: effortLabel,
                  setNumber,
                })}
                incrementLabel={t('activeWorkout.focus.hero.increaseEffort', {
                  defaultValue: 'Increase {{metric}} for set {{setNumber}}',
                  metric: effortLabel,
                  setNumber,
                })}
                textColor={effortColor}
              />
            </View>
          </View>
        )}
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

  return (
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
            className="h-11 items-center justify-center"
          >
            {setIndicator}
          </Pressable>
        ) : (
          <View className="h-11 items-center justify-center">
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
          className="h-11 items-center justify-center rounded-[14px] border border-dashed border-border-strong"
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
              ringColor={ringColor}
            />
          </View>
        )}
        <View style={{ flex: showWeight ? 68 : 150 }}>
          <TableCellInput
            {...reps.inputProps}
            ringColor={ringColor}
            inputRef={repsInputRef}
            onFocus={() => onActivateSet(renderKey, 'reps')}
            keyboardType="number-pad"
            accessibilityLabel={repsLabels.input}
          />
        </View>
        <View style={{ flex: 48 }}>
          {!isEffortColumn ? (
            <View className="h-11 items-center justify-center rounded-[14px] bg-raised">
              <Text
                className="text-center text-base text-text-secondary"
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
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isDone }}
        accessibilityLabel={checkLabel}
        className={`h-11 w-11 items-center justify-center rounded-[14px] active:opacity-70 ${
          isDone ? '' : 'bg-raised'
        }`}
        style={isDone ? { backgroundColor: accentPrimary } : undefined}
      >
        <Icon
          name="checkmark"
          size={20}
          color={isDone ? '#ffffff' : textSecondary}
          weight="bold"
        />
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
  focusedSetKey,
  focusedField,
  onActivateSet,
  onRegisterAccessoryHandle,
}: Props) {
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
  // While a rest runs, its card takes the active-set card's place.
  const restActive = useActiveWorkoutStore((s) => s.rest.state !== 'ready');
  const activeSetIndex = exercise.sets.findIndex(
    (set) => String(set.id) === activeSetId
  );
  const resting = restActive && activeSetIndex >= 0;
  const restNextText = (() => {
    if (!resting) return null;
    const set = exercise.sets[activeSetIndex];
    const assumed = assumedSetValues?.[activeSetIndex] ?? null;
    const load = formatSetLoad(
      isDurationModality(modality) || isWeightDurationModality(modality)
        ? {
            weightKg: isWeightDurationModality(modality)
              ? (set.weight ?? assumed?.weight ?? null)
              : null,
            reps: null,
            durationSec:
              effectiveSetDurationSec(set, modality) ??
              assumed?.duration ??
              null,
          }
        : {
            weightKg: set.weight ?? assumed?.weight ?? null,
            reps: set.reps ?? assumed?.reps ?? null,
          },
      weightUnit,
      t
    );
    const label = t('workout.setNumber', {
      defaultValue: 'Set {{number}}',
      number: set.set_number,
    });
    return load != null ? `${label} · ${load}` : label;
  })();
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
      className={stepperRows ? 'items-center' : 'w-14 items-center'}
      style={stepperRows ? { flex: 48 } : undefined}
    >
      <Pressable
        onPress={openMetricMenu}
        hitSlop={{ left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={t('activeWorkout.exercise.changeMetric', {
          defaultValue: 'Change metric column',
        })}
        className="min-h-11 flex-row items-center justify-center gap-0.5"
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
    return (
      <View className="rounded-2xl bg-surface p-2">
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
                : cardioSetId === activeSetId
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
  }

  return (
    <View className={stepperRows ? 'gap-1.5' : 'rounded-2xl bg-surface p-2'}>
      {resting && <FocusRestCard nextText={restNextText} />}
      {bodyweightExercise && (
        <BodyweightBanner bodyWeightKg={bodyWeightKg} weightUnit={weightUnit} />
      )}
      {stepperRows && (
        <View className="flex-row items-center gap-1">
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
          <View className="w-11" />
        </View>
      )}
      {!stepperRows && exercise.sets.length > 0 && (
        // Same columns as the list card's header for these tables.
        <View className="flex-row items-center px-1 py-1.5">
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
          : setId === activeSetId
            ? 'current'
            : 'upcoming';
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
            resting={resting}
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
            metricColumn={metricColumn === 'rir' ? 'rir' : 'rpe'}
            weightUnit={weightUnit}
            assumed={assumed}
            previousSet={previousSet}
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
        className={`min-h-12 flex-row items-center justify-center gap-2 rounded-full active:opacity-70 ${
          stepperRows ? 'mt-1 bg-raised' : 'mt-1'
        }`}
      >
        <Icon
          name="add"
          size={stepperRows ? 18 : 15}
          color={stepperRows ? textPrimary : accentPrimary}
          weight="bold"
        />
        <Text
          className={
            stepperRows
              ? 'text-base font-bold text-text-primary'
              : 'text-sm font-medium'
          }
          style={stepperRows ? undefined : { color: accentPrimary }}
        >
          {t('activeWorkout.exercise.addSetLabel', {
            defaultValue: 'Add set',
          })}
        </Text>
      </Pressable>
    </View>
  );
}

export default React.memo(ActiveWorkoutFocusSets);
