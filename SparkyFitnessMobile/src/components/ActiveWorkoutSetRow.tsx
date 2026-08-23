import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useCSSVariable } from 'uniwind';
import { measureAnchoredMenuTrigger, type AnchorRect } from './AnchoredMenu';
import CompletionCheck, { LogCircle } from './CompletionCheck';
import {
  SetCellInput,
  SetSwipeDeleteAction,
  type SetInputField,
  type SetRowAccessoryHandle,
} from './SetRowChrome';
import { focusWithAndroidImeRetry } from '../utils/keyboardFocus';
import { withAlpha } from '../utils/colors';
import { parseDecimalInput } from '../utils/numericInput';
import { distanceFromKm, weightFromKg, weightToKg } from '../utils/unitConversions';
import { formatLocalizedNumber } from '../localization';
import {
  effectiveSetDurationSec,
  epley1RmKg,
  estimateRepMaxKg,
  formatRecentSessionSet,
  getRpeTone,
  isDurationModality,
  quantizeSetWeightKg,
  setTypeLetter,
  setVolumeKg,
  type AssumedSetValues,
  type RpeTone,
  type WorkoutCardSet,
} from '../utils/workoutSession';
import type { ActiveSetPatch } from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';
import type { ExerciseModality, ExerciseRecentSessionSet } from '@workspace/shared';

export type SetRowState = 'done' | 'current' | 'upcoming';

export const RPE_TONE_VARS: Record<RpeTone, string> = {
  easy: '--color-icon-success',
  moderate: '--color-cat-amber',
  hard: '--color-cat-orange',
  max: '--color-icon-danger',
};

function formatDisplayWeight(weightKg: number | null, unit: 'kg' | 'lbs'): string {
  if (weightKg == null) return '';
  return formatLocalizedNumber(weightFromKg(weightKg, unit), { maximumFractionDigits: 1 });
}

function formatMetricWeight(valueKg: number, unit: 'kg' | 'lbs'): string {
  if (valueKg <= 0) return '–';
  return formatLocalizedNumber(Math.round(weightFromKg(valueKg, unit)));
}

function formatRpe(rpe: number | null): string {
  if (rpe == null) return '–';
  return Number.isInteger(rpe) ? String(rpe) : formatLocalizedNumber(rpe, { maximumFractionDigits: 1 });
}

/** Clamp a typed RPE to 1–10 in 0.5 steps; empty/invalid → null. */
export function parseRpeInput(text: string): number | null {
  const value = parseDecimalInput(text);
  if (Number.isNaN(value)) return null;
  const snapped = Math.round(value * 2) / 2;
  return Math.min(10, Math.max(1, snapped));
}

export type SetRowMode = 'live' | 'view' | 'edit';

export type { SetRowAccessoryHandle } from './SetRowChrome';

interface ActiveWorkoutSetRowProps {
  set: WorkoutCardSet;
  /**
   * The owning exercise's resolved modality (see `resolveSnapshotModality`):
   * it decides which value cells the row renders — weight+reps, reps only, or
   * a duration-in-seconds cell (plus a read-only distance cell on
   * `duration_distance` view rows).
   */
  modality?: ExerciseModality;
  /** Display unit for the `duration_distance` view-mode distance cell. */
  distanceUnit?: 'km' | 'miles';
  /**
   * Stable React render key for this row (from the store's `setRenderKeys`
   * map). Defaults to the set id. The accessory-handle registration is keyed
   * by it, so the screen bar keeps dispatching to this row across an id churn
   * on autosave.
   */
  renderKey?: string;
  /** Working-set number. Warmup/drop/failure rows show a `W`/`D`/`F` letter instead. */
  displayNumber: number;
  state: SetRowState;
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  /**
   * Hevy-style PREVIOUS column: this set's counterpart (by position) in the
   * exercise's most recent prior session. `null` renders a dash (no history
   * or fewer sets last time); leave it `undefined` to omit the column
   * entirely (view mode). Tapping the value copies its weight/reps into the
   * row, replacing anything already entered.
   */
  previousSet?: ExerciseRecentSessionSet | null;
  /**
   * Live only: assumed weight/reps for this set's still-empty fields
   * (Hevy-style placeholders, resolved by the card from the same sources the
   * store's completion adoption uses). An empty cell renders the assumed value
   * grayed — as the input's placeholder while editing, muted text otherwise —
   * and logging the set records it.
   */
  assumed?: AssumedSetValues | null;
  /**
   * 'view' renders without logging affordances: static check on done rows, no
   * un-complete control, no swipe-delete, no done-row dim.
   * 'edit' renders form-draft rows: always-mounted inputs controlled by the
   * form reducer (committed per keystroke), delete instead of log.
   * 'live' renders store-backed rows whose weight/reps inputs stay mounted on
   * every row — taps move keyboard focus natively (no input remount, so the
   * keyboard never dips) — while the cursor (next-unlogged) row carries the
   * pulsing log ring. The accessory bar is screen-owned (see
   * {@link SetRowAccessoryHandle}).
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
  activeField?: SetInputField;
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
  onActivateSet?: (setId: string, field: Exclude<SetInputField, 'rpe'>) => void;
  /** Live only: tap the RPE column to focus the RPE input on that row. */
  onActivateRpe?: (setId: string) => void;
  onEditFieldChange?: (
    setId: string,
    field: Exclude<SetInputField, 'rpe'>,
    text: string,
  ) => void;
  onAddSet?: (entryId: string) => void;
  /**
   * Live and edit: register this row's {@link SetRowAccessoryHandle} (keyed by
   * its render key) so the screen's sticky accessory bar can dispatch
   * Next/Log/advance to the focused row. Called with `null` on unmount.
   */
  onRegisterAccessoryHandle?: (key: string, handle: SetRowAccessoryHandle | null) => void;
}

function ActiveWorkoutSetRow({
  set,
  modality = 'weight_reps',
  distanceUnit = 'km',
  renderKey,
  displayNumber,
  state: stateProp,
  metricColumn,
  weightUnit,
  previousSet,
  assumed,
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
  onEditFieldChange,
  onAddSet,
  onRegisterAccessoryHandle,
}: ActiveWorkoutSetRowProps) {
  const { t } = useTranslation();
  const readOnly = mode === 'view';
  const isEdit = mode === 'edit';
  const isLive = mode === 'live';
  // Read-only surfaces pass activeSetId={null}, so 'current' is unreachable
  // there — coerce anyway so the editing chrome can never render.
  const state = readOnly && stateProp === 'current' ? 'upcoming' : stateProp;

  // The row whose inputs currently own the keyboard. Every live and edit row
  // keeps its inputs mounted; in `edit` the cursor row (state === 'current')
  // is the focused cell, while in `live` this marks the row the user is
  // editing (drafts win over store re-seeds, deactivation flushes commits) —
  // distinct from the cursor, which can stay on the next set.
  const isFocusedRow = isEdit ? state === 'current' : isLive ? isFocused : false;

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
  const durationLike = isDurationModality(modality);
  // Legacy-aware display seconds: `duration` modality falls back to
  // reps-as-seconds for pre-modality isometric rows (see
  // effectiveSetDurationSec). Editing writes `duration`; reps stay untouched.
  const effectiveDurationSec = effectiveSetDurationSec(
    { duration: set.duration ?? null, reps: set.reps },
    modality,
  );
  const durationSeedText = effectiveDurationSec != null ? String(effectiveDurationSec) : '';

  // Local drafts while the row is current — committed on blur/step/log so the
  // store (kg) isn't rewritten on every keystroke of a decimal in progress.
  const [weightDraft, setWeightDraft] = useState(() =>
    formatDisplayWeight(set.weight, weightUnit),
  );
  const [repsDraft, setRepsDraft] = useState(() => (set.reps != null ? String(set.reps) : ''));
  const [durationDraft, setDurationDraft] = useState(durationSeedText);
  const [rpeDraft, setRpeDraft] = useState(() => (set.rpe != null ? formatRpe(set.rpe) : ''));

  // Re-seed drafts when the underlying set's VALUES change (unit change or an
  // external edit) — but deliberately NOT on `set.id`. A stable render key keeps
  // this row's instance alive across an autosave that only reassigns the id, so
  // keying the re-seed on the id would wipe in-progress text under a still-open
  // keyboard.
  const signature = `${set.weight}|${set.reps}|${set.duration}|${set.rpe}|${weightUnit}`;
  const [prevSignature, setPrevSignature] = useState(signature);
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    // While this row is the focused cell its drafts are the source of
    // truth: a store change landing under the open keyboard (e.g. an autosave
    // echo normalizing a value) must not rewrite in-progress text. The
    // deactivation-commit effect below flushes the drafts, and that store
    // write re-enters this block to snap them to their committed forms.
    if (!isFocusedRow) {
      setWeightDraft(formatDisplayWeight(set.weight, weightUnit));
      setRepsDraft(set.reps != null ? String(set.reps) : '');
      setDurationDraft(durationSeedText);
      // RPE alone commits per keystroke in edit mode, so a re-seed can arrive
      // mid-typing: leave the draft alone while its parse already matches the
      // committed value (e.g. "0" clamps to 1 — rewriting would jump the text
      // under the user's cursor). Blur still snaps the text via commitRpe.
      if (parseRpeInput(rpeDraft) !== (set.rpe ?? null)) {
        setRpeDraft(set.rpe != null ? formatRpe(set.rpe) : '');
      }
    }
  }

  const weightInputRef = useRef<TextInput>(null);
  const repsInputRef = useRef<TextInput>(null);
  const durationInputRef = useRef<TextInput>(null);
  const rpeInputRef = useRef<TextInput>(null);

  // Move the keyboard to the commanded input when this row is the focused
  // cell. All rows keep their inputs mounted, so a user tap focuses natively
  // and this is a no-op backstop; it does the real work for programmatic
  // moves (the accessory bar's Next Set landing on this row, live's
  // tap-on-RPE-cell) — a native input-to-input move, so the keyboard never
  // dips.
  useEffect(() => {
    if (!isFocusedRow) return;
    const ref =
      activeField === 'reps'
        ? repsInputRef
        : activeField === 'duration'
          ? durationInputRef
          : activeField === 'rpe'
            ? rpeInputRef
            : weightInputRef;
    return focusWithAndroidImeRetry(ref);
  }, [isFocusedRow, activeField]);

  // Edit-mode inputs are CONTROLLED by the form reducer (raw draft strings),
  // so the reducer is always current when Save reads it — no flush step, and
  // raw keystrokes like "102.55" survive to save without a kg round-trip.
  const editWeightText = set.editWeightText ?? '';
  const editRepsText = set.editRepsText ?? '';

  // Assumed-value display text for a still-empty field (live only): the gray
  // placeholder in the cell, and what logging the set will record.
  const assumedWeightText =
    isLive && set.weight == null && assumed?.weight != null
      ? formatDisplayWeight(assumed.weight, weightUnit)
      : null;
  const assumedRepsText =
    isLive && set.reps == null && assumed?.reps != null ? String(assumed.reps) : null;
  const assumedDurationText =
    isLive && effectiveDurationSec == null && assumed?.duration != null
      ? String(assumed.duration)
      : null;

  // Fill-from-previous replaces whatever the row holds with last time's
  // values. A field the previous set lacks (e.g. a weight-only set) is left
  // alone rather than cleared.
  const canFillFromPrevious = previousSet != null;
  const handleFillFromPrevious = useCallback(() => {
    if (previousSet == null) return;
    if (durationLike) {
      const seconds = effectiveSetDurationSec(
        { duration: previousSet.duration ?? null, reps: previousSet.reps },
        modality,
      );
      if (seconds == null) return;
      onCommitField?.(setId, { duration: seconds });
      setDurationDraft(String(seconds));
      return;
    }
    const patch: ActiveSetPatch = {};
    if (previousSet.weight != null) patch.weight = previousSet.weight;
    if (previousSet.reps != null) patch.reps = previousSet.reps;
    if (Object.keys(patch).length === 0) return;
    onCommitField?.(setId, patch);
    // A focused row skips the store-driven re-seed (drafts win under the
    // keyboard), so mirror the fill into the drafts here; on an unfocused row
    // the re-seed writes the same values.
    if (previousSet.weight != null) {
      setWeightDraft(formatDisplayWeight(previousSet.weight, weightUnit));
    }
    if (previousSet.reps != null) setRepsDraft(String(previousSet.reps));
  }, [previousSet, durationLike, modality, onCommitField, setId, weightUnit]);

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

  // Advance past this row: activate the next set's first value cell, or add a
  // set when this is the last row. All rows of one exercise share a modality,
  // so the next row's first cell is this row's. In-row hops (weight → reps →
  // RPE) are native focusField moves the screen's accessory bar makes through
  // the handle.
  const firstField: Exclude<SetInputField, 'rpe'> = durationLike
    ? 'duration'
    : modality === 'reps_only'
      ? 'reps'
      : 'weight';
  const handleAdvance = useCallback(() => {
    if (nextSetId) {
      onActivateSet?.(nextSetId, firstField);
      return;
    }
    if (entryId) onAddSet?.(entryId);
  }, [entryId, nextSetId, firstField, onActivateSet, onAddSet]);

  const commitWeight = useCallback(
    (text: string) => {
      // Skip an unchanged value: the draft is seeded from the stored weight's
      // display form, so re-committing it would round-trip through the unit
      // conversion and drift the stored kg (e.g. 60 kg → 60.01 kg for a lbs
      // user). Only a real edit — a draft that no longer matches — reaches the
      // store. This also spares an unedited log a spurious revision bump.
      if (text === formatDisplayWeight(set.weight, weightUnit)) return;
      const value = parseDecimalInput(text);
      // Quantized so the stored kg matches what the server will echo back —
      // an unrounded lbs conversion would differ post-save and re-seed the
      // row's drafts (see quantizeSetWeightKg).
      const weightKg = Number.isNaN(value)
        ? null
        : quantizeSetWeightKg(weightToKg(value, weightUnit));
      // A draft that parses back to the stored kg (e.g. more display decimals
      // than the seeded form) is also unchanged — skip the spurious write.
      if (weightKg === (set.weight ?? null)) return;
      onCommitField?.(setId, { weight: weightKg });
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

  const commitDuration = useCallback(
    (text: string) => {
      // The draft is seeded from the legacy-aware effective seconds, so an
      // untouched legacy reps-as-seconds row commits nothing — only a real
      // edit writes `duration` (reps are never migrated silently).
      if (text === durationSeedText) return;
      const value = parseInt(text, 10);
      const seconds = Number.isNaN(value) ? null : value;
      if (seconds === (set.duration ?? null)) return;
      onCommitField?.(setId, { duration: seconds });
    },
    [onCommitField, setId, set.duration, durationSeedText],
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

  // Live only: commit any in-progress drafts when this row stops being the
  // focused cell. Blur alone can't be trusted to land the commit — the
  // accessory Done button and a tap on another row's cell both deactivate
  // this row first. The unchanged-value guards inside each commit helper make
  // this idempotent with any blur that did fire. Edit rows don't flush:
  // they're controlled by the form reducer per keystroke, and this row's
  // local drafts can hold stale values there.
  useEffect(() => {
    if (!isLive || isFocusedRow) return;
    if (durationLike) {
      commitDuration(durationDraft);
    } else {
      commitWeight(weightDraft);
      commitReps(repsDraft);
    }
    if (metricColumn === 'rpe') commitRpeValue(rpeDraft);
  }, [
    isLive,
    isFocusedRow,
    durationLike,
    commitWeight,
    commitReps,
    commitDuration,
    commitRpeValue,
    metricColumn,
    weightDraft,
    repsDraft,
    durationDraft,
    rpeDraft,
  ]);

  // Log the set: flush any in-progress edits first so the values the user
  // sees are exactly what gets completed (and autosaved). The completion
  // haptic fires in the store (selection tick, or the stronger success buzz on
  // a PR), so it stays mutually exclusive.
  const handleLog = useCallback(() => {
    if (durationLike) {
      commitDuration(durationDraft);
    } else {
      commitWeight(weightDraft);
      commitReps(repsDraft);
    }
    if (metricColumn === 'rpe') commitRpe(rpeDraft);
    onComplete?.(setId);
  }, [
    durationLike,
    commitWeight,
    commitReps,
    commitDuration,
    commitRpe,
    metricColumn,
    onComplete,
    setId,
    weightDraft,
    repsDraft,
    durationDraft,
    rpeDraft,
  ]);

  // Register this row's accessory handle for the screen's sticky bar (live
  // and edit — view rows have nothing to dispatch to). The handle is
  // registered once per key with stable closures — `log`/`advance` read the
  // latest handlers through refs so the registration doesn't churn on every
  // draft keystroke, and `focusField` moves focus via refs (a native
  // input-to-input move, so the keyboard stays attached).
  const handleLogRef = useRef(handleLog);
  const handleAdvanceRef = useRef(handleAdvance);
  useEffect(() => {
    handleLogRef.current = handleLog;
    handleAdvanceRef.current = handleAdvance;
  });
  useEffect(() => {
    if (readOnly || !onRegisterAccessoryHandle) return;
    const key = renderKey ?? setId;
    onRegisterAccessoryHandle(key, {
      log: () => handleLogRef.current(),
      focusField: (field) => {
        const ref =
          field === 'reps'
            ? repsInputRef
            : field === 'duration'
              ? durationInputRef
              : field === 'rpe'
                ? rpeInputRef
                : weightInputRef;
        ref.current?.focus();
      },
      advance: () => handleAdvanceRef.current(),
    });
    return () => onRegisterAccessoryHandle(key, null);
  }, [readOnly, renderKey, setId, onRegisterAccessoryHandle]);

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

  const setLabel = setTypeLetter(set.set_type) ?? String(displayNumber);

  const setIndicator = (
    <Text
      className="text-sm text-text-muted"
      style={[
        { fontVariant: ['tabular-nums'] },
        state === 'current' ? { color: accentPrimary, fontWeight: '700' } : null,
      ]}
    >
      {setLabel}
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

  // A wired long-press wins (live/edit: expand the row's note panel; view:
  // "Start workout here"); the set-type menu is otherwise the long-press
  // fallback for surfaces that only offer the type picker (the preset form).
  // The set-number tap always opens the type menu independently of this.
  const longPress = onLongPress
    ? () => onLongPress(setId)
    : onPressSetType
      ? openSetTypeMenu
      : undefined;

  const setNumberAnchor = (
    <View ref={setNumberRef} collapsable={false} className="w-9 items-center">
      {onPressSetType ? (
        <Pressable
          onPress={openSetTypeMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.setRow.changeType', { defaultValue: 'Change type for set {{setNumber}}', setNumber: set.set_number })}
        >
          {setIndicator}
        </Pressable>
      ) : (
        setIndicator
      )}
    </View>
  );
  // Duration tables spread their content columns equally (see the card's
  // header row); the anchor view stays w-9 so the set-type menu anchors to
  // the number itself, not the whole column.
  const setNumberControl = durationLike ? (
    <View className="flex-1 items-center">{setNumberAnchor}</View>
  ) : (
    setNumberAnchor
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
          accessibilityLabel={t('activeWorkout.setRow.incomplete', { defaultValue: 'Un-complete set {{setNumber}}', setNumber: set.set_number })}
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
          accessibilityLabel={t('activeWorkout.setRow.log', { defaultValue: 'Log set {{setNumber}}', setNumber: set.set_number })}
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
        accessibilityLabel={t('activeWorkout.setRow.log', { defaultValue: 'Log set {{setNumber}}', setNumber: set.set_number })}
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
        completedBadge ? t('activeWorkout.setRow.incomplete', { defaultValue: 'Un-complete set {{setNumber}}', setNumber: set.set_number }) : t('activeWorkout.setRow.complete', { defaultValue: 'Mark set {{setNumber}} complete', setNumber: set.set_number })
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

  // PREVIOUS column (only when the consumer passes the prop). The value is a
  // tap target while it can still fill something; otherwise inert gray text.
  const previousCell =
    previousSet !== undefined ? (
      <Pressable
        className={`${durationLike ? 'flex-1' : 'w-20'} items-center py-1`}
        onPress={handleFillFromPrevious}
        onLongPress={longPress}
        disabled={!canFillFromPrevious}
        accessibilityRole={canFillFromPrevious ? 'button' : undefined}
        accessibilityLabel={
          canFillFromPrevious ? t('activeWorkout.setRow.fillFromPrevious', { defaultValue: 'Fill set {{setNumber}} from previous', setNumber: set.set_number }) : undefined
        }
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          className="text-center text-xs text-text-secondary"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {previousSet != null ? formatRecentSessionSet(previousSet, weightUnit, t, modality) : '-'}
        </Text>
      </Pressable>
    ) : null;

  const displayWeight = set.weight != null ? formatDisplayWeight(set.weight, weightUnit) : '–';
  const displayReps = set.reps != null ? String(set.reps) : '–';

  // View cells: flat text.
  const weightCellText = (
    <Text
      className="flex-1 text-center text-sm text-text-primary"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {displayWeight}
    </Text>
  );
  const repsCellText = (
    <Text
      className="flex-1 text-center text-sm text-text-primary"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {displayReps}
    </Text>
  );
  const durationCellText = (
    <Text
      className="flex-1 text-center text-sm text-text-primary"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {effectiveDurationSec != null ? String(effectiveDurationSec) : '–'}
    </Text>
  );
  const distanceCellText = (
    <Text
      className="flex-1 text-center text-sm text-text-primary"
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {set.distance != null
        ? String(parseFloat(distanceFromKm(set.distance, distanceUnit).toFixed(2)))
        : '–'}
    </Text>
  );

  // Live and edit cells: always-mounted inputs. Focus lands natively on tap
  // and is reported up through onActivateSet/onActivateRpe so the screen can
  // mark the focused row and target its sticky accessory bar; because the
  // inputs never unmount, moving between cells — same row or another — never
  // leaves the keyboard without a responder, so it stays up. Live cells are
  // backed by this row's drafts (committed on blur/log) with the assumed
  // values as gray placeholders; edit cells are controlled by the form
  // reducer (weight/reps per keystroke; RPE snapped per keystroke) so a
  // header Save reads the draft synchronously with no flush step.
  const weightInputCell = (
    <View className="flex-1 items-center">
      <SetCellInput
        inputRef={weightInputRef}
        value={isEdit ? editWeightText : weightDraft}
        onChangeText={
          isEdit ? (text) => onEditFieldChange?.(setId, 'weight', text) : setWeightDraft
        }
        onBlur={isEdit ? undefined : () => commitWeight(weightDraft)}
        onFocus={() => onActivateSet?.(setId, 'weight')}
        keyboardType="decimal-pad"
        accessibilityLabel={t('activeWorkout.setRow.weight', { defaultValue: 'Weight' })}
        className="w-16"
        placeholder={isEdit ? '–' : (assumedWeightText ?? '–')}
        flat
      />
    </View>
  );
  const repsInputCell = (
    <View className="flex-1 items-center">
      <SetCellInput
        inputRef={repsInputRef}
        value={isEdit ? editRepsText : repsDraft}
        onChangeText={
          isEdit ? (text) => onEditFieldChange?.(setId, 'reps', text) : setRepsDraft
        }
        onBlur={isEdit ? undefined : () => commitReps(repsDraft)}
        onFocus={() => onActivateSet?.(setId, 'reps')}
        keyboardType="number-pad"
        accessibilityLabel={t('activeWorkout.setRow.reps', { defaultValue: 'Reps' })}
        className="w-16"
        placeholder={isEdit ? '–' : (assumedRepsText ?? '–')}
        flat
      />
    </View>
  );
  // Duration cell (duration-modality rows): raw integer seconds under the SEC
  // header. Edit mode is reducer-controlled like weight/reps; the legacy
  // reps-as-seconds value surfaces as the placeholder there so the row still
  // reads correctly without silently writing a duration.
  const durationInputCell = (
    <View className="flex-1 items-center">
      <SetCellInput
        inputRef={durationInputRef}
        value={isEdit ? (set.duration != null ? String(set.duration) : '') : durationDraft}
        onChangeText={
          isEdit ? (text) => onEditFieldChange?.(setId, 'duration', text) : setDurationDraft
        }
        onBlur={isEdit ? undefined : () => commitDuration(durationDraft)}
        onFocus={() => onActivateSet?.(setId, 'duration')}
        keyboardType="number-pad"
        accessibilityLabel={t('activeWorkout.setRow.duration', { defaultValue: 'Duration' })}
        className="w-16"
        placeholder={
          isEdit
            ? (effectiveDurationSec != null ? String(effectiveDurationSec) : '–')
            : (assumedDurationText ?? '–')
        }
        flat
      />
    </View>
  );
  // RPE stays a mounted input on every row like weight/reps; the committed
  // value's effort tone carries into the input text so the tint survives the
  // cell being an input.
  const rpeInputCell = showRpeInput ? (
    <View className="w-14 items-center">
      <SetCellInput
        inputRef={rpeInputRef}
        value={rpeDraft}
        onChangeText={isEdit ? handleEditRpeChange : setRpeDraft}
        onBlur={() => commitRpe(rpeDraft)}
        onFocus={() => onActivateRpe?.(setId)}
        keyboardType="decimal-pad"
        accessibilityLabel={t('activeWorkout.setRow.rpe', { defaultValue: 'RPE' })}
        className="w-11"
        flat
        textColor={metricValue.color}
      />
    </View>
  ) : null;

  // Read-only surfaces don't dim done rows: a finished workout is all done
  // rows, and dimming everything would read as disabled. The cursor row is a
  // rounded accent pill (matching its focused input variant); done rows dim.
  const isCursor = state === 'current';
  const doneDim = !readOnly && state === 'done';
  const row = (
    <Pressable
      testID="set-row"
      onLongPress={longPress}
      className={`flex-row items-center ${isLive ? 'py-2' : 'py-2.5'} px-1 ${isCursor ? 'rounded-xl' : 'bg-background'}`}
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
        {previousCell}
        {durationLike ? (
          readOnly ? (
            <>
              {durationCellText}
              {modality === 'duration_distance' && distanceCellText}
            </>
          ) : (
            durationInputCell
          )
        ) : (
          <>
            {modality !== 'reps_only' && (readOnly ? weightCellText : weightInputCell)}
            {readOnly ? repsCellText : repsInputCell}
          </>
        )}
        {!readOnly && rpeInputCell != null ? (
          rpeInputCell
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
          accessibilityLabel={t('activeWorkout.setRow.delete', { defaultValue: 'Delete set {{setNumber}}', setNumber: set.set_number })}
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
