import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InputAccessoryView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import { measureAnchoredMenuTrigger, type AnchorRect } from './AnchoredMenu';
import FormInput from './FormInput';
import CompletionCheck from './CompletionCheck';
import {
  SetInputAccessoryBar,
  SetSwipeDeleteAction,
  type SetAccessoryAction,
} from './SetRowChrome';
import { formatRest } from './RestPeriodChip';
import { withAlpha } from '../utils/colors';
import { parseDecimalInput } from '../utils/numericInput';
import { weightFromKg, weightToKg } from '../utils/unitConversions';
import {
  epley1RmKg,
  estimateRepMaxKg,
  getRpeTone,
  setVolumeKg,
  type RpeTone,
  type WorkoutCardSet,
} from '../utils/workoutSession';
import type { ActiveSetPatch } from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';

export type SetRowState = 'done' | 'current' | 'upcoming';

const RPE_TONE_VARS: Record<RpeTone, string> = {
  easy: '--color-icon-success',
  moderate: '--color-cat-amber',
  hard: '--color-cat-orange',
  max: '--color-icon-danger',
};

function formatDisplayWeight(weightKg: number | null, unit: 'kg' | 'lbs'): string {
  if (weightKg == null) return '';
  return String(parseFloat(weightFromKg(weightKg, unit).toFixed(1)));
}

function formatMetricWeight(valueKg: number, unit: 'kg' | 'lbs'): string {
  if (valueKg <= 0) return '–';
  return Math.round(weightFromKg(valueKg, unit)).toLocaleString();
}

function formatRpe(rpe: number | null): string {
  if (rpe == null) return '–';
  return Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1);
}

/** Clamp a typed RPE to 1–10 in 0.5 steps; empty/invalid → null. */
export function parseRpeInput(text: string): number | null {
  const value = parseDecimalInput(text);
  if (Number.isNaN(value)) return null;
  const snapped = Math.round(value * 2) / 2;
  return Math.min(10, Math.max(1, snapped));
}

export type SetRowMode = 'live' | 'view' | 'edit';

interface ActiveWorkoutSetRowProps {
  set: WorkoutCardSet;
  /** Working-set number. Warmup rows show the `W` pill instead. */
  displayNumber: number;
  state: SetRowState;
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  /**
   * 'view' renders without logging affordances: static check on done rows, no
   * un-complete control, no swipe-delete, no done-row dim.
   * 'edit' renders form-draft rows: controlled inputs on the active row,
   * tap-to-activate display cells, delete instead of log, Done/Next accessory.
   * 'live' renders store-backed rows: every row is tap-to-edit, the cursor
   * (next-unlogged) row carries the pulsing log ring, and logging is sequential.
   */
  mode?: SetRowMode;
  /** Log a set (live). Receives the set id so any row can complete out of order. */
  onComplete?: (setId: string) => void;
  onUncomplete?: (setId: string) => void;
  onCommitField?: (setId: string, patch: ActiveSetPatch) => void;
  onDelete?: (setId: string) => void;
  onLongPress?: (setId: string) => void;
  /**
   * Live/edit only: change this set's type. Tapping the set number (or
   * long-pressing the row) opens a set-type menu anchored to the number. When
   * provided it takes over the row's long-press from `onLongPress`, so a
   * consumer wires exactly one of the two.
   */
  onPressSetType?: (setId: string, anchor: AnchorRect) => void;
  // --- edit-mode props (values come from the form reducer; see WorkoutCardSet) ---
  /**
   * Which field of the active row holds focus; drives the Next accessory. In
   * `live` this seeds the focused field when a cell is tapped; within-row Next
   * then advances a row-local field (which can reach RPE). `'rpe'` is only ever
   * set on the live path (tapping the RPE column).
   */
  activeField?: 'weight' | 'reps' | 'rpe';
  /**
   * Live only: this row is the tap-focused editing cell (distinct from the
   * cursor, which `state === 'current'` still marks). Non-null activates the
   * input variant so the keyboard edits it.
   */
  isFocused?: boolean;
  /** Id of the following set, for Next-to-next-row advance. Null on the last set. */
  nextSetId?: string | null;
  /** Owning entry id so the last row's Next can add a set. */
  entryId?: string;
  /** False hides the RPE input (preset sets store no RPE). */
  rpeEditable?: boolean;
  /** Whether this set is completed (draft `completedAt`) — drives the check. */
  completedBadge?: boolean;
  /**
   * Edit only: tap the last-column check to toggle this set's completion. When
   * omitted the check is static (no completion UI, e.g. preset forms).
   */
  onToggleComplete?: (setId: string) => void;
  onActivateSet?: (setId: string, field: 'weight' | 'reps') => void;
  /** Live only: tap the RPE column to focus the RPE input on that row. */
  onActivateRpe?: (setId: string) => void;
  onDeactivate?: () => void;
  onEditFieldChange?: (setId: string, field: 'weight' | 'reps', text: string) => void;
  onAddSet?: (entryId: string) => void;
}

/** Pulsing accent ring — the tap-to-log target on the current row. */
function LogCircle({ color }: { color: string }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(0.45, { duration: 800 }), -1, true);
    return () => {
      pulse.value = 1;
    };
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      style={[style, { borderColor: color }]}
      className="h-7 w-7 rounded-full border-2 items-center justify-center"
    >
      <View className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
    </Animated.View>
  );
}

/**
 * Plain number cell used for the weight/reps/RPE inputs on an active editing
 * row (both `live` and `edit`). Replaces the `−/number/+` stepper: tap to type,
 * with an accent focus ring. Delegates to {@link FormInput} so it inherits the
 * iOS fontSize/lineHeight alignment fix and the themed subtle→accent focus
 * border; only the compact grid padding is overridden. The parent owns the
 * value + commit semantics.
 */
interface SetCellInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  keyboardType: 'decimal-pad' | 'number-pad';
  accessibilityLabel: string;
  inputRef: React.Ref<TextInput>;
  accessoryId?: string;
  className?: string;
}

function SetCellInput({
  value,
  onChangeText,
  onFocus,
  onBlur,
  keyboardType,
  accessibilityLabel,
  inputRef,
  accessoryId,
  className,
}: SetCellInputProps) {
  const iosProps = accessoryId != null ? { inputAccessoryViewID: accessoryId } : {};
  return (
    <FormInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      keyboardType={keyboardType}
      selectTextOnFocus
      placeholder="–"
      accessibilityLabel={accessibilityLabel}
      className={`text-center ${className ?? ''}`}
      // Tighter than FormInput's default 10/12 so the cell fits the 5-column row.
      style={{ paddingTop: 6, paddingBottom: 6, paddingLeft: 4, paddingRight: 4 }}
      {...iosProps}
    />
  );
}

function ActiveWorkoutSetRow({
  set,
  displayNumber,
  state: stateProp,
  metricColumn,
  weightUnit,
  mode = 'live',
  onComplete,
  onUncomplete,
  onCommitField,
  onDelete,
  onLongPress,
  onPressSetType,
  activeField = 'weight',
  isFocused = false,
  nextSetId,
  entryId,
  rpeEditable = true,
  completedBadge = false,
  onToggleComplete,
  onActivateSet,
  onActivateRpe,
  onDeactivate,
  onEditFieldChange,
  onAddSet,
}: ActiveWorkoutSetRowProps) {
  const readOnly = mode === 'view';
  const isEdit = mode === 'edit';
  const isLive = mode === 'live';
  // Read-only surfaces pass activeSetId={null}, so 'current' is unreachable
  // there — coerce anyway so the editing chrome can never render.
  const state = readOnly && stateProp === 'current' ? 'upcoming' : stateProp;

  // The tap-focused editing row that renders inputs. In `edit` the cursor row
  // (state === 'current') is always the focused cell; in `live` the focus is a
  // separate tap target (any row) so the cursor can stay on the next set.
  const isActiveEditRow = isEdit ? state === 'current' : isLive ? isFocused : false;

  const [
    accentPrimary,
    textMuted,
    rpeEasy,
    rpeModerate,
    rpeHard,
    rpeMax,
  ] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
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
  ];

  const rpeToneColors: Record<RpeTone, string> = useMemo(
    () => ({ easy: rpeEasy, moderate: rpeModerate, hard: rpeHard, max: rpeMax }),
    [rpeEasy, rpeModerate, rpeHard, rpeMax],
  );

  const setId = String(set.id);
  const isWarmup = set.set_type === 'warmup';

  // Local drafts while the row is current — committed on blur/step/log so the
  // store (kg) isn't rewritten on every keystroke of a decimal in progress.
  const [weightDraft, setWeightDraft] = useState(() =>
    formatDisplayWeight(set.weight, weightUnit),
  );
  const [repsDraft, setRepsDraft] = useState(() => (set.reps != null ? String(set.reps) : ''));
  const [rpeDraft, setRpeDraft] = useState(() => (set.rpe != null ? formatRpe(set.rpe) : ''));

  // Re-seed drafts when the underlying set changes (id churn after a recreate
  // save, unit change, or an external edit). Commits only happen on blur/step,
  // so a mid-typing clobber can't occur — the store doesn't move under a
  // focused row.
  const signature = `${set.id}|${set.weight}|${set.reps}|${set.rpe}|${weightUnit}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    setWeightDraft(formatDisplayWeight(set.weight, weightUnit));
    setRepsDraft(set.reps != null ? String(set.reps) : '');
    // RPE alone commits per keystroke in edit mode, so a re-seed can arrive
    // mid-typing: leave the draft alone while its parse already matches the
    // committed value (e.g. "0" clamps to 1 — rewriting would jump the text
    // under the user's cursor). Blur still snaps the text via commitRpe.
    if (parseRpeInput(rpeDraft) !== (set.rpe ?? null)) {
      setRpeDraft(set.rpe != null ? formatRpe(set.rpe) : '');
    }
  }

  const weightInputRef = useRef<TextInput>(null);
  const repsInputRef = useRef<TextInput>(null);
  const rpeInputRef = useRef<TextInput>(null);

  // Which field of a focused `live` row holds the keyboard; it drives the
  // Next/Log accessory. Kept in sync purely by the inputs' onFocus (the effect
  // below and within-row Next both move focus, which fires onFocus), so it's
  // never written from an effect. Edit reads activeField from the form reducer.
  const [liveField, setLiveField] = useState<'weight' | 'reps' | 'rpe'>('weight');

  // Move the keyboard to the right input when a row becomes the active editing
  // cell — tapping a display cell (live or edit) or Next moving weight → reps
  // (edit). The focused input's onFocus then records the field.
  useEffect(() => {
    if (!isActiveEditRow) return;
    const ref =
      activeField === 'reps'
        ? repsInputRef
        : activeField === 'rpe'
          ? rpeInputRef
          : weightInputRef;
    ref.current?.focus();
  }, [isActiveEditRow, activeField]);

  // Edit-mode inputs are CONTROLLED by the form reducer (raw draft strings),
  // so the reducer is always current when Save reads it — no flush step, and
  // raw keystrokes like "102.55" survive to save without a kg round-trip.
  const editWeightText = set.editWeightText ?? '';
  const editRepsText = set.editRepsText ?? '';

  // Commit the parsed+clamped value on every keystroke — including empty → null
  // — so WorkoutDetailScreen's header Save, which reads the reducer synchronously
  // without waiting for blur, can never persist a stale or out-of-range RPE (e.g.
  // a cleared field keeping the old value, or an unclamped "11"). Raw text stays
  // in rpeDraft for display; blur still echoes the snapped value via commitRpe.
  const handleEditRpeChange = useCallback(
    (text: string) => {
      setRpeDraft(text);
      onCommitField?.(setId, { rpe: parseRpeInput(text) });
    },
    [onCommitField, setId],
  );

  // For within-row advance, move focus directly via ref so iOS keeps the
  // keyboard + InputAccessoryView attached. Going through parent state would
  // briefly leave no TextInput focused, which drops the accessory. Next skips
  // the RPE input (reachable by tap).
  const handleAdvance = useCallback(() => {
    if (activeField === 'weight') {
      repsInputRef.current?.focus();
      return;
    }
    if (nextSetId) {
      onActivateSet?.(nextSetId, 'weight');
      return;
    }
    if (entryId) onAddSet?.(entryId);
  }, [activeField, entryId, nextSetId, onActivateSet, onAddSet]);

  const commitWeight = useCallback(
    (text: string) => {
      // Skip an unchanged value: the draft is seeded from the stored weight's
      // display form, so re-committing it would round-trip through the unit
      // conversion and drift the stored kg (e.g. 60 kg → 60.01 kg for a lbs
      // user). Only a real edit — a draft that no longer matches — reaches the
      // store. This also spares an unedited log a spurious revision bump.
      if (text === formatDisplayWeight(set.weight, weightUnit)) return;
      const value = parseDecimalInput(text);
      onCommitField?.(setId, {
        weight: Number.isNaN(value) ? null : weightToKg(value, weightUnit),
      });
    },
    [onCommitField, setId, weightUnit, set.weight],
  );

  const commitReps = useCallback(
    (text: string) => {
      // Unchanged reps need no re-commit — skip the spurious store write.
      if (text === (set.reps != null ? String(set.reps) : '')) return;
      const value = parseInt(text, 10);
      onCommitField?.(setId, { reps: Number.isNaN(value) ? null : value });
    },
    [onCommitField, setId, set.reps],
  );

  // Store-commit only, no draft echo — the deactivation effect below may call
  // this, and setting state from an effect is forbidden. Unchanged RPE needs
  // no re-commit; the draft already holds its snapped display form.
  const commitRpeValue = useCallback(
    (text: string) => {
      if (text === (set.rpe != null ? formatRpe(set.rpe) : '')) return;
      onCommitField?.(setId, { rpe: parseRpeInput(text) });
    },
    [onCommitField, setId, set.rpe],
  );

  // Blur handler: commit, then snap the visible text to the committed form
  // (e.g. "8.3" → "8.5"). Event-handler only.
  const commitRpe = useCallback(
    (text: string) => {
      commitRpeValue(text);
      const value = parseRpeInput(text);
      setRpeDraft(value != null ? formatRpe(value) : '');
    },
    [commitRpeValue],
  );

  // Commit any in-progress drafts when this row stops being the active edit
  // cell. Blur alone can't be trusted to land the commit: the accessory Done
  // button and a tap on another row's cell both deactivate this row first, and
  // the input can unmount before its native blur event reaches JS — dropping
  // the onBlur commit entirely (RPE was the visible casualty; weight/reps are
  // usually rescued by Log). The unchanged-value guards inside each commit
  // helper make this idempotent with any blur that did fire.
  useEffect(() => {
    if (isActiveEditRow) return;
    commitWeight(weightDraft);
    commitReps(repsDraft);
    if (metricColumn === 'rpe') commitRpeValue(rpeDraft);
  }, [
    isActiveEditRow,
    commitWeight,
    commitReps,
    commitRpeValue,
    metricColumn,
    weightDraft,
    repsDraft,
    rpeDraft,
  ]);

  // Log the set: flush any in-progress edits first so the values the user
  // sees are exactly what gets completed (and autosaved). The completion
  // haptic fires in the store (selection tick, or the stronger success buzz on
  // a PR), so it stays mutually exclusive.
  const handleLog = useCallback(() => {
    commitWeight(weightDraft);
    commitReps(repsDraft);
    if (metricColumn === 'rpe') commitRpe(rpeDraft);
    onComplete?.(setId);
  }, [
    commitWeight,
    commitReps,
    commitRpe,
    metricColumn,
    onComplete,
    setId,
    weightDraft,
    repsDraft,
    rpeDraft,
  ]);

  // Live keyboard walk: weight → reps → RPE (when the RPE column is shown) →
  // Log. Focus moves via refs so iOS keeps the accessory attached; each input's
  // onFocus advances liveField. On the last field Next hands off to Log.
  const liveHasNextField =
    liveField === 'weight' || (liveField === 'reps' && metricColumn === 'rpe');
  const handleLiveNext = useCallback(() => {
    if (liveField === 'weight') {
      repsInputRef.current?.focus();
      return;
    }
    if (liveField === 'reps' && metricColumn === 'rpe') {
      rpeInputRef.current?.focus();
      return;
    }
    handleLog();
  }, [liveField, metricColumn, handleLog]);

  const metricValue = ((): { text: string; color?: string } => {
    switch (metricColumn) {
      case 'rpe': {
        if (set.rpe == null) return { text: '–' };
        return { text: formatRpe(set.rpe), color: rpeToneColors[getRpeTone(set.rpe)] };
      }
      case 'volume':
        return { text: formatMetricWeight(setVolumeKg(set), weightUnit) };
      case 'e1rm':
        return { text: formatMetricWeight(epley1RmKg(set.weight, set.reps), weightUnit) };
      case 'tenrm':
        return {
          text: formatMetricWeight(estimateRepMaxKg(set.weight, set.reps, 10), weightUnit),
        };
    }
  })();

  const setIndicator = isWarmup ? (
    <View className="h-5 w-5 rounded-md bg-raised items-center justify-center">
      <Text className="text-[11px] font-bold text-text-muted">W</Text>
    </View>
  ) : (
    <Text
      className="text-sm text-text-muted"
      style={[
        { fontVariant: ['tabular-nums'] },
        state === 'current' ? { color: accentPrimary, fontWeight: '700' } : null,
      ]}
    >
      {displayNumber}
    </Text>
  );

  // Tap the set number (or long-press the row) to change this set's type. The
  // menu anchors to the number cell, measured on demand.
  const setNumberRef = useRef<View>(null);
  const openSetTypeMenu = useCallback(() => {
    if (!onPressSetType) return;
    measureAnchoredMenuTrigger(setNumberRef.current, (anchor) =>
      onPressSetType(setId, anchor),
    );
  }, [onPressSetType, setId]);

  // A set-type handler takes over the long-press; otherwise fall back to the
  // consumer's plain long-press (view mode's "Start workout here").
  const longPress = onPressSetType
    ? openSetTypeMenu
    : onLongPress
      ? () => onLongPress(setId)
      : undefined;

  const setNumberControl = (
    <View ref={setNumberRef} collapsable={false} className="w-9 items-center">
      {onPressSetType ? (
        <Pressable
          onPress={openSetTypeMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Change type for set ${set.set_number}`}
        >
          {setIndicator}
        </Pressable>
      ) : (
        setIndicator
      )}
    </View>
  );

  const checkControl = (() => {
    if (state === 'done') {
      if (readOnly) {
        return <CompletionCheck size={28} />;
      }
      return (
        <Pressable
          onPress={() => onUncomplete?.(setId)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Un-complete set ${set.set_number}`}
        >
          <CompletionCheck size={28} />
        </Pressable>
      );
    }
    if (state === 'current') {
      return (
        <Pressable
          onPress={handleLog}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Log set ${set.set_number}`}
        >
          <LogCircle color={accentPrimary} />
        </Pressable>
      );
    }
    // Every upcoming set is independently loggable (tap its ring) so the user
    // can skip ahead — complete a later set without finishing the earlier ones,
    // which stay as re-loggable holes. Read-only surfaces have no logging, so
    // their upcoming rows keep a blank column (the w-10 wrapper aligns it).
    if (!isLive) return null;
    return (
      <Pressable
        onPress={handleLog}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Log set ${set.set_number}`}
      >
        <View
          className="h-7 w-7 rounded-full border-2 items-center justify-center"
          style={{ borderColor: textMuted }}
        />
      </Pressable>
    );
  })();

  // Edit mode's last-column control. With a toggle handler it's a tappable
  // completion checkbox (green check when done, empty ring otherwise); without
  // one it's a static check (e.g. preset forms, which have no completion). Set
  // deletion in edit mode lives on swipe + the long-press menu, not here.
  const completedCheck = <CompletionCheck size={28} testID="completed-badge" />;
  const editLastCell = onToggleComplete ? (
    <Pressable
      onPress={() => onToggleComplete(setId)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={
        completedBadge ? `Un-complete set ${set.set_number}` : `Mark set ${set.set_number} complete`
      }
    >
      {completedBadge ? (
        completedCheck
      ) : (
        <View
          className="h-7 w-7 rounded-full border-2 items-center justify-center"
          style={{ borderColor: textMuted }}
        />
      )}
    </Pressable>
  ) : completedBadge ? (
    completedCheck
  ) : null;

  const showRpeInput = metricColumn === 'rpe' && (!isEdit || rpeEditable);

  // Each input gets its OWN InputAccessoryView (unique nativeID). iOS attaches a
  // shared accessory to only the first-registered input, so reps/RPE would come
  // up with a bare keyboard if all three pointed at one id.
  const isIOS = Platform.OS === 'ios';
  const weightAccessoryId = isIOS ? `active-set-${setId}-weight` : undefined;
  const repsAccessoryId = isIOS ? `active-set-${setId}-reps` : undefined;
  const rpeAccessoryId = isIOS ? `active-set-${setId}-rpe` : undefined;

  if (isActiveEditRow) {
    // One bar description, rendered into each input's accessory (only the
    // focused input's is on screen). Fresh elements per call so the three
    // InputAccessoryViews don't share a subtree.
    const accessoryActions: SetAccessoryAction[] = [
      ...(isEdit
        ? [
            {
              key: 'advance',
              label: activeField === 'weight' ? 'Next' : 'Next Set',
              onPress: handleAdvance,
            },
          ]
        : []),
      ...(isLive && liveHasNextField
        ? [{ key: 'next', label: 'Next', onPress: handleLiveNext }]
        : []),
      ...(isLive && state === 'current'
        ? [{ key: 'log', label: 'Log', onPress: handleLog, bold: true }]
        : []),
    ];
    const renderAccessoryBar = () => (
      <SetInputAccessoryBar
        onDone={() => {
          onDeactivate?.();
          weightInputRef.current?.blur();
          repsInputRef.current?.blur();
          rpeInputRef.current?.blur();
        }}
        actions={accessoryActions}
      />
    );
    return (
      <>
        <Pressable
          testID="set-row"
          onLongPress={longPress}
          className={`flex-row items-center py-2 px-3 rounded-xl ${state === 'current' ? '' : 'bg-background'}`}
          style={state === 'current' ? { backgroundColor: withAlpha(accentPrimary, 0.12) } : undefined}
        >
          {setNumberControl}
          <View className="flex-1 items-center">
            <SetCellInput
              inputRef={weightInputRef}
              value={isEdit ? editWeightText : weightDraft}
              onChangeText={
                isEdit ? (text) => onEditFieldChange?.(setId, 'weight', text) : setWeightDraft
              }
              onBlur={isEdit ? undefined : () => commitWeight(weightDraft)}
              onFocus={
                isEdit ? () => onActivateSet?.(setId, 'weight') : () => setLiveField('weight')
              }
              keyboardType="decimal-pad"
              accessibilityLabel="Weight"
              accessoryId={weightAccessoryId}
              className="w-16"
            />
          </View>
          <View className="flex-1 items-center">
            <SetCellInput
              inputRef={repsInputRef}
              value={isEdit ? editRepsText : repsDraft}
              onChangeText={
                isEdit ? (text) => onEditFieldChange?.(setId, 'reps', text) : setRepsDraft
              }
              onBlur={isEdit ? undefined : () => commitReps(repsDraft)}
              onFocus={
                isEdit ? () => onActivateSet?.(setId, 'reps') : () => setLiveField('reps')
              }
              keyboardType="number-pad"
              accessibilityLabel="Reps"
              accessoryId={repsAccessoryId}
              className="w-16"
            />
          </View>
          <View className="w-14 items-center">
            {showRpeInput ? (
              <SetCellInput
                inputRef={rpeInputRef}
                value={rpeDraft}
                onChangeText={isEdit ? handleEditRpeChange : setRpeDraft}
                onBlur={() => commitRpe(rpeDraft)}
                onFocus={isLive ? () => setLiveField('rpe') : undefined}
                keyboardType="decimal-pad"
                accessibilityLabel="RPE"
                accessoryId={rpeAccessoryId}
                className="w-11"
              />
            ) : (
              <Text
                className="text-sm text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {metricValue.text}
              </Text>
            )}
          </View>
          <View className="w-10 items-center">{isEdit ? editLastCell : checkControl}</View>
        </Pressable>
        {isIOS && (
          <>
            <InputAccessoryView nativeID={weightAccessoryId}>
              {renderAccessoryBar()}
            </InputAccessoryView>
            <InputAccessoryView nativeID={repsAccessoryId}>
              {renderAccessoryBar()}
            </InputAccessoryView>
            {showRpeInput && (
              <InputAccessoryView nativeID={rpeAccessoryId}>
                {renderAccessoryBar()}
              </InputAccessoryView>
            )}
          </>
        )}
      </>
    );
  }

  // Time-based sets (e.g. plank in a preset) have no weight/reps to show —
  // surface the duration in the weight cell on the non-live surfaces.
  const showDurationFallback =
    (readOnly || isEdit) && set.weight == null && set.reps == null && set.duration != null;
  const displayWeight = showDurationFallback
    ? formatRest(set.duration)
    : isEdit
      ? editWeightText || '–'
      : set.weight != null
        ? formatDisplayWeight(set.weight, weightUnit)
        : '–';
  const displayReps = isEdit ? editRepsText || '–' : set.reps != null ? String(set.reps) : '–';

  // live + edit render tap-to-activate display cells (tap → the input variant
  // above focuses that field); view keeps flat text.
  const editable = isEdit || isLive;

  const weightCellText = (
    <Text
      className={`text-center text-sm text-text-primary ${editable ? '' : 'flex-1'}`}
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {displayWeight}
    </Text>
  );
  const repsCellText = (
    <Text
      className={`text-center text-sm text-text-primary ${editable ? '' : 'flex-1'}`}
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {displayReps}
    </Text>
  );

  // Read-only surfaces don't dim done rows: a finished workout is all done
  // rows, and dimming everything would read as disabled. The cursor row is a
  // rounded accent pill (matching its focused input variant); done rows dim.
  const isCursor = state === 'current';
  const doneDim = !readOnly && state === 'done';
  const row = (
    <Pressable
      testID="set-row"
      onLongPress={longPress}
      className={`flex-row items-center py-2.5 px-3 ${isCursor ? 'rounded-xl' : 'bg-background'}`}
      style={isCursor ? { backgroundColor: withAlpha(accentPrimary, 0.12) } : undefined}
    >
      {/* Done rows recede (opacity 0.62), but the completion check lives outside
          this wrapper so its green stays vivid and matches the card/rail badges. */}
      <View
        testID="set-row-content"
        className="flex-1 flex-row items-center"
        style={doneDim ? { opacity: 0.62 } : undefined}
      >
        {setNumberControl}
        {editable ? (
          <Pressable
            className="flex-1 py-1"
            onPress={() => onActivateSet?.(setId, 'weight')}
            onLongPress={longPress}
            accessibilityRole="button"
            accessibilityLabel={`Edit weight for set ${set.set_number}`}
          >
            {weightCellText}
          </Pressable>
        ) : (
          weightCellText
        )}
        {editable ? (
          <Pressable
            className="flex-1 py-1"
            onPress={() => onActivateSet?.(setId, 'reps')}
            onLongPress={longPress}
            accessibilityRole="button"
            accessibilityLabel={`Edit reps for set ${set.set_number}`}
          >
            {repsCellText}
          </Pressable>
        ) : (
          repsCellText
        )}
        {(isLive || isEdit) && showRpeInput ? (
          <Pressable
            className="w-14 items-center py-1"
            onPress={() => onActivateRpe?.(setId)}
            onLongPress={longPress}
            accessibilityRole="button"
            accessibilityLabel={`Edit RPE for set ${set.set_number}`}
          >
            <Text
              className="text-center text-sm"
              style={[
                { fontVariant: ['tabular-nums'] },
                { color: metricValue.color ?? textMuted },
              ]}
            >
              {metricValue.text}
            </Text>
          </Pressable>
        ) : (
          <Text
            className="w-14 text-center text-sm"
            style={[
              { fontVariant: ['tabular-nums'] },
              { color: metricValue.color ?? textMuted },
            ]}
          >
            {metricValue.text}
          </Text>
        )}
      </View>
      <View className="w-10 items-center">{isEdit ? editLastCell : checkControl}</View>
    </Pressable>
  );

  if (readOnly) return row;

  return (
    <ReanimatedSwipeable
      renderRightActions={() => (
        <SetSwipeDeleteAction
          onPress={() => onDelete?.(setId)}
          accessibilityLabel={`Delete set ${set.set_number}`}
        />
      )}
      overshootRight={false}
      rightThreshold={40}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

export default React.memo(ActiveWorkoutSetRow);
