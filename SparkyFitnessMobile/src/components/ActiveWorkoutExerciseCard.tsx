import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import SafeImage from './SafeImage';
import CompletionCheck from './CompletionCheck';
import FormInput from './FormInput';
import RestPeriodChip from './RestPeriodChip';
import ActiveWorkoutSetRow, {
  type SetRowAccessoryHandle,
  type SetRowState,
} from './ActiveWorkoutSetRow';
import type { SetInputField } from './SetRowChrome';
import ActiveWorkoutSetDetail from './ActiveWorkoutSetDetail';
import CardioEffortForm from './CardioEffortForm';
import WorkoutNotesField from './WorkoutNotesField';
import { measureAnchoredMenuTrigger, type AnchorRect } from './AnchoredMenu';
import { useExerciseStats } from '../hooks/useExerciseStats';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { distanceFromKm, weightFromKg } from '../utils/unitConversions';
import { formatLocalizedNumber } from '../localization';
import {
  CATEGORY_ICON_MAP,
  compareSetRecords,
  effectiveSetDurationSec,
  formatDurationSeconds,
  formatVolume,
  getExerciseVolumeKg,
  isDurationModality,
  rendersCardioEffortForm,
  resolveAssumedSetValues,
  resolveSnapshotModality,
  setTypeLetter,
  type WorkoutCardExercise,
  type WorkoutCardSet,
} from '../utils/workoutSession';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import type { ActiveSetPatch, CompletedSetMap, PrSetMap } from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';

export const METRIC_COLUMN_LABELS: Record<ActiveWorkoutMetricColumn, string> = {
  rpe: 'RPE',
  volume: 'Vol',
  e1rm: '1RM',
  tenrm: '10RM',
};


/** Working-set numbers per set index; warmup/drop/failure rows repeat the previous number (they render a letter instead). */
function buildWorkingSetNumbers(sets: WorkoutCardSet[]): number[] {
  let workingNumber = 0;
  return sets.map((set) => {
    if (setTypeLetter(set.set_type) == null) workingNumber += 1;
    return workingNumber;
  });
}

interface ActiveWorkoutExerciseCardProps {
  exercise: WorkoutCardExercise;
  expanded: boolean;
  completedSetIds: CompletedSetMap;
  activeSetId: string | null;
  metricColumn: ActiveWorkoutMetricColumn;
  weightUnit: 'kg' | 'lbs';
  distanceUnit?: 'km' | 'miles';
  /**
   * False keeps cardio (`duration_distance`) exercises on the duration-style
   * set table. When true (default), a cardio exercise with at most one set
   * renders the Duration+Distance form instead of a set table; multi-set
   * cardio entries (imports, future intervals) still fall back to the table
   * so no rows are hidden.
   */
  cardioFormEnabled?: boolean;
  getImageSource: GetImageSource;
  /**
   * 'view' renders the read-only variant (workout detail): no logging,
   * editing, overflow menu, add-set, or PREV column; the Best line renders
   * when `excludePresetEntryId` is supplied; saved exercise/set notes render
   * as plain text. The metric column and its picker
   * stay live in all modes. 'edit' renders form-draft
   * rows (see ActiveWorkoutSetRow) with the overflow menu, add-set, rest chip,
   * and stats line active; completion state is display-only (completedBadge)
   * so completed sets stay editable.
   */
  mode?: 'live' | 'view' | 'edit';
  /**
   * The active/edited/viewed session's preset-entry id, forwarded to the
   * stats query so that session's own sets are excluded from the historical
   * best/last/recent-sessions baseline. In view mode it also gates the fetch:
   * when absent (e.g. preset detail) stats are skipped and no Best line
   * renders.
   */
  excludePresetEntryId?: string;
  /**
   * Live only: the preset this workout was started from, forwarded to the
   * stats query so recentSessions (the PREVIOUS column / placeholder source)
   * reflects this preset's own history instead of this exercise's history
   * from a different preset. Omitted for freeform (non-preset) workouts,
   * which keeps the exercise-global fallback unchanged.
   */
  sourcePresetId?: number;
  /**
   * Live only: the store's PR stamps. When any of this exercise's set ids is
   * stamped, the Best line goes gold and shows the new record (the server
   * best stays historical by design).
   */
  prSetIds?: PrSetMap;
  /** Hide the rest chip entirely (e.g. imported workouts without rest data). */
  showRestChip?: boolean;
  /**
   * Edit only: enables the inline calories field in the chip row. The text
   * comes from `exercise.editCaloriesText`; view mode instead shows
   * `calories_burned` read-only when present.
   */
  onChangeCalories?: (entryId: string, text: string) => void;
  /** Tapping the exercise thumbnail opens its library detail. */
  onPressThumb?: (entryId: string) => void;
  onToggleExpanded: (entryId: string) => void;
  onPressRestChip?: (entryId: string, currentSec: number | null) => void;
  /**
   * `clampedToRpe` is true when this card's metric column is display-clamped
   * to RPE (duration-like tables, where the weight metrics are always empty);
   * owners restrict the shared MetricColumnMenu accordingly.
   */
  onPressMetricHeader: (anchor: AnchorRect, clampedToRpe: boolean) => void;
  onPressOverflow?: (entryId: string) => void;
  onComplete?: (setId: string) => void;
  onUncomplete?: (setId: string) => void;
  onCommitField?: (setId: string, patch: ActiveSetPatch) => void;
  onDeleteSet?: (setId: string) => void;
  onLongPressSet?: (setId: string) => void;
  /** Live/edit only: tap a set number (or long-press the row) to change its type. */
  onPressSetType?: (setId: string, anchor: AnchorRect) => void;
  onAddSet?: (entryId: string) => void;
  // --- per-set expand + notes (live and edit; view renders notes as plain text) ---
  /**
   * Live/edit: the render key whose inline note panel is expanded (toggled by
   * long-pressing the set row). A stale key that matches no row renders nothing,
   * so it's harmless after a delete/reconcile.
   */
  expandedSetKey?: string | null;
  /**
   * Live only: the store's set id → stable render key map. Absent in view/edit
   * (those key rows by set id). Drives the row's React key, the focus/expand
   * compares, and the id→key translation of activate/long-press callbacks so
   * set-keyed screen state survives an autosave that churns set ids.
   */
  setRenderKeys?: Record<string, string>;
  /**
   * Live/edit: the per-exercise note editor is open (card ⋮ → Notes). The note
   * field also shows whenever `exercise.notes` is already non-empty.
   */
  noteEditorOpen?: boolean;
  /**
   * Live/edit: commit the per-exercise note (raw text; the owner trims/clears).
   * The editable note field only renders when this is wired.
   */
  onCommitExerciseNote?: (entryId: string, text: string) => void;
  // --- edit + live editing props ---
  /**
   * Focused row's field. Edit: form-owned. Live: the screen-owned focused-cell
   * field, seeding the tapped row before its Next chain takes over (`'rpe'` is
   * live-only, set by tapping the RPE column).
   */
  activeField?: SetInputField;
  /**
   * Live only: the tap-focused render key (distinct from `activeSetId`, the
   * cursor). Marks which row renders inputs; the cursor still owns the log ring.
   */
  focusedSetKey?: string | null;
  /** False hides the RPE input on active rows (preset sets store no RPE). */
  rpeEditable?: boolean;
  /** Prefill the first empty set from "last time" once stats arrive. */
  eligibleForPrefill?: boolean;
  onActivateSet?: (setId: string, field: Exclude<SetInputField, 'rpe'>) => void;
  /** Live only: tap the RPE column to focus the RPE input on that row. */
  onActivateRpe?: (setId: string) => void;
  /** Edit only: tap the last-column check to toggle a set's completion. */
  onToggleComplete?: (setId: string) => void;
  onEditFieldChange?: (
    setId: string,
    field: Exclude<SetInputField, 'rpe'>,
    text: string,
  ) => void;
  /** Live/edit: rows register their sticky-bar handles here (keyed by render key). */
  onRegisterAccessoryHandle?: (key: string, handle: SetRowAccessoryHandle | null) => void;
}

/**
 * Exercise image with a category-icon fallback. Exported so the reorder list
 * can reuse the exact thumbnail treatment.
 */
export function ExerciseThumb({
  exercise,
  getImageSource,
  size,
}: {
  exercise: WorkoutCardExercise;
  getImageSource: GetImageSource;
  size: number;
}) {
  const textMuted = String(useCSSVariable('--color-text-muted'));
  const snapshot = exercise.exercise_snapshot;
  const image = snapshot?.images?.[0] ?? null;
  const fallbackIcon =
    (snapshot?.category && CATEGORY_ICON_MAP[snapshot.category]) || 'exercise-weights';

  return (
    <SafeImage
      source={image ? getImageSource(image) : null}
      style={{ width: size, height: size, borderRadius: 8 }}
      fallback={
        <View
          className="bg-raised items-center justify-center"
          style={{ width: size, height: size, borderRadius: 8 }}
        >
          <Icon name={fallbackIcon} size={size * 0.55} color={textMuted} />
        </View>
      }
    />
  );
}

function ActiveWorkoutExerciseCard({
  exercise,
  expanded,
  completedSetIds,
  activeSetId,
  metricColumn,
  weightUnit,
  distanceUnit = 'km',
  cardioFormEnabled = true,
  getImageSource,
  mode = 'live',
  excludePresetEntryId,
  sourcePresetId,
  prSetIds,
  showRestChip = true,
  onChangeCalories,
  onPressThumb,
  onToggleExpanded,
  onPressRestChip,
  onPressMetricHeader,
  onPressOverflow,
  onComplete,
  onUncomplete,
  onCommitField,
  onDeleteSet,
  onLongPressSet,
  onPressSetType,
  onAddSet,
  expandedSetKey,
  setRenderKeys,
  noteEditorOpen = false,
  onCommitExerciseNote,
  activeField,
  focusedSetKey,
  rpeEditable,
  eligibleForPrefill = false,
  onActivateSet,
  onActivateRpe,
  onToggleComplete,
  onEditFieldChange,
  onRegisterAccessoryHandle,
}: ActiveWorkoutExerciseCardProps) {
  const { t } = useTranslation();
  const readOnly = mode === 'view';
  const isEdit = mode === 'edit';
  const isLive = mode === 'live';
  const [textMuted, accentPrimary, textSecondary, prColor] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
    '--color-text-secondary',
    '--color-pr',
  ]) as [string, string, string, string];

  const name = exercise.exercise_snapshot?.name ?? t('workout.exercise', { defaultValue: 'Exercise' });
  const metricColumnLabel = (column: ActiveWorkoutMetricColumn): string => {
    switch (column) {
      case 'rpe': return t('workout.metricRpe', { defaultValue: 'RPE' });
      case 'volume': return t('workout.metricVolumeShort', { defaultValue: 'Vol' });
      case 'e1rm': return t('workout.metricE1rmShort', { defaultValue: '1RM' });
      case 'tenrm': return t('workout.metricTenrmShort', { defaultValue: '10RM' });
    }
  };
  const unitLabel = weightUnit === 'kg' ? t('workout.kg', { defaultValue: 'kg' }) : t('workout.lbs', { defaultValue: 'lbs' });
  // Resolved once per exercise; every row and the column header derive from it.
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  const durationLike = isDurationModality(modality);
  const cardioForm =
    cardioFormEnabled &&
    rendersCardioEffortForm(exercise.exercise_snapshot, exercise.sets.length);
  // Vol/1RM/10RM are weight-derived and always empty on duration-like and
  // reps-only tables (both keep weight null); clamp the display to RPE.
  // Never written back to the shared preference.
  const clampedToRpe = durationLike || modality === 'reps_only';
  const effectiveMetricColumn = clampedToRpe ? 'rpe' : metricColumn;
  // Live and edit fetch the stats baseline with the active/edited session
  // excluded so its own sets don't pollute it. View mode fetches only when the
  // owner supplies the viewed session's id to exclude — without it (e.g. the
  // preset detail view) Best could show the very workout being viewed, so the
  // fetch is skipped (the hook gates on a null id).
  const { data: stats } = useExerciseStats(
    readOnly && excludePresetEntryId == null ? null : exercise.exercise_id,
    excludePresetEntryId,
    sourcePresetId,
  );
  const lastSet = stats?.lastSet ?? null;
  const bestSet = stats?.bestSet ?? null;

  // PREVIOUS column source: the most recent prior session's sets, matched to
  // the current rows by position (Hevy-style). Older servers omit
  // recentSessions; `?? []` covers deploy skew (mobile never Zod-parses), so
  // the column just shows dashes there.
  const previousSessionSets = (stats?.recentSessions ?? [])[0]?.sets;

  // Assumed (placeholder) weight/reps per row — live only. Resolved from the
  // same sources completion adoption uses in the store, so the gray value a
  // row shows is exactly what logging it would record.
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);
  const assumedSetValues = useMemo(
    () =>
      isLive
        ? resolveAssumedSetValues(exercise.sets, previousSessionSets, plannedSetValues)
        : null,
    [isLive, exercise.sets, previousSessionSets, plannedSetValues],
  );

  // Capture the historical PR baseline once per exercise. The store no-ops
  // unless a live workout is active and the key is absent, so view/edit renders
  // can't clobber it and a re-resolved query is harmless.
  const capturePrBaseline = useActiveWorkoutStore((s) => s.capturePrBaseline);
  const capturePreviousSessionSets = useActiveWorkoutStore(
    (s) => s.capturePreviousSessionSets,
  );
  useEffect(() => {
    // Wait for the query to resolve (data is null/undefined while loading). A
    // resolved stats object with a null `bestSet` still captures — that's the
    // "no history" baseline.
    if (!isLive || stats == null) return;
    capturePrBaseline(
      exercise.exercise_id,
      stats.bestSet
        ? { weight: stats.bestSet.weight, reps: stats.bestSet.reps }
        : null,
    );
    // The store-side copy placeholder adoption resolves against on complete —
    // captured from the same query the PREVIOUS column renders, so a
    // lock-screen complete adopts exactly what the row shows.
    capturePreviousSessionSets(
      exercise.exercise_id,
      stats.recentSessions?.[0]?.sets ?? [],
    );
  }, [isLive, stats, exercise.exercise_id, capturePrBaseline, capturePreviousSessionSets]);

  // The best set to show on the "Best" line: the historical best, or — once a
  // set this session earns a PR — the better of that and the stamped session
  // set. The server number stays historical (the stats query excludes this
  // session), so the stamped set is what surfaces the new record.
  const stampedBest = useMemo(() => {
    if (!isLive || !prSetIds) return null;
    let best: { weight: number; reps: number | null } | null = null;
    for (const s of exercise.sets) {
      if (prSetIds[String(s.id)] !== true || s.weight == null) continue;
      const contender = { weight: s.weight, reps: s.reps };
      if (best == null || compareSetRecords(contender, best) > 0) best = contender;
    }
    return best;
  }, [isLive, prSetIds, exercise.sets]);

  const bestDisplay =
    bestSet != null && bestSet.weight != null
      ? stampedBest != null &&
        compareSetRecords(stampedBest, { weight: bestSet.weight, reps: bestSet.reps }) > 0
        ? stampedBest
        : { weight: bestSet.weight, reps: bestSet.reps }
      : null;
  const bestIsPr = stampedBest != null && bestDisplay === stampedBest;
  const bestText =
    bestDisplay != null
      ? `${formatLocalizedNumber(weightFromKg(bestDisplay.weight, weightUnit), { maximumFractionDigits: 1 })}${
          bestDisplay.reps != null ? ` × ${bestDisplay.reps}` : ''
        }`
      : null;

  // Chip-row calories: an editable field in edit mode (when the form wires a
  // handler), a read-only value in view mode. Live mode shows neither — the
  // value churns with every autosave recompute. The edit field renders as a
  // tappable accent chip until activated, matching the screen's other cells.
  const caloriesField = isEdit && onChangeCalories != null;
  const [caloriesEditing, setCaloriesEditing] = useState(false);
  const caloriesText =
    readOnly && exercise.calories_burned != null && exercise.calories_burned > 0
      ? String(Math.round(exercise.calories_burned))
      : null;

  // Edit-only: seed the first still-empty set from "last time" once, when
  // stats arrive. Weight and reps fill independently — a null lastSet field
  // must not clobber a value the user already typed (a typed character makes
  // the mapped field non-null and skips that side). The guard is keyed by
  // exercise identity, not once-per-mount: a replaced exercise reuses the
  // card instance and must be able to seed from its own history.
  const prefilledExerciseIdRef = useRef<string | null>(null);
  const firstSet = exercise.sets[0];
  const firstSetId = firstSet != null ? String(firstSet.id) : null;
  const firstSetWeightEmpty = firstSet != null && firstSet.weight == null;
  const firstSetRepsEmpty = firstSet != null && firstSet.reps == null;
  useEffect(() => {
    if (!isEdit || prefilledExerciseIdRef.current === exercise.exercise_id) return;
    if (!eligibleForPrefill || !lastSet || firstSetId == null) return;

    prefilledExerciseIdRef.current = exercise.exercise_id;
    const patch: ActiveSetPatch = {};
    if (firstSetWeightEmpty && lastSet.weight != null) patch.weight = lastSet.weight;
    if (firstSetRepsEmpty && lastSet.reps != null) patch.reps = lastSet.reps;
    if (Object.keys(patch).length > 0) onCommitField?.(firstSetId, patch);
  }, [
    isEdit,
    eligibleForPrefill,
    exercise.exercise_id,
    lastSet,
    firstSetId,
    firstSetWeightEmpty,
    firstSetRepsEmpty,
    onCommitField,
  ]);

  const isDone =
    exercise.sets.length > 0 &&
    exercise.sets.every((s) => completedSetIds[String(s.id)]);
  const anyComplete = exercise.sets.some((s) => completedSetIds[String(s.id)]);

  const rotation = useSharedValue(expanded ? 0 : -90);
  useEffect(() => {
    rotation.value = withTiming(expanded ? 0 : -90, { duration: 200 });
  }, [expanded, rotation]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // The body's slide-in should fire only on user-driven expands: a card that
  // mounts already expanded (forms default expanded; the live screen mounts
  // the cursor's card open) renders its body statically. Render-time state
  // adjust (not an effect) so the flip lands in the same commit as the collapse.
  const [hasRenderedCollapsed, setHasRenderedCollapsed] = useState(!expanded);
  if (!expanded && !hasRenderedCollapsed) setHasRenderedCollapsed(true);

  const metricAnchorRef = useRef<View>(null);
  const openMetricMenu = () => {
    measureAnchoredMenuTrigger(metricAnchorRef.current, (anchor) =>
      onPressMetricHeader(anchor, clampedToRpe),
    );
  };

  const openOverflowMenu = () => onPressOverflow?.(exercise.id);
  // Live-only long-press opens the same overflow menu (the collapsed row has
  // no ⋮ of its own, so this is its only entry point).
  const longPressMenu = isLive && onPressOverflow ? openOverflowMenu : undefined;

  // Row callbacks that feed set-keyed SCREEN state (focus, note expand) must
  // hand back render keys, not raw set ids — the screen stores and compares
  // keys. The row passes raw ids (tap, within-row Next, long-press), so
  // translate here, once, in stable memoized wrappers: per-row memoization
  // survives because a wrapper only changes identity when the map or its
  // handler does (not while typing). When `setRenderKeys` is absent (view/edit)
  // the translation is identity. Commit/complete/delete callbacks are NOT
  // wrapped — they must keep passing ids to the store.
  const translateSetKey = useCallback(
    (id: string) => setRenderKeys?.[id] ?? id,
    [setRenderKeys],
  );
  const onActivateSetKeyed = useMemo(
    () =>
      onActivateSet
        ? (id: string, field: Exclude<SetInputField, 'rpe'>) =>
            onActivateSet(translateSetKey(id), field)
        : undefined,
    [onActivateSet, translateSetKey],
  );
  const onActivateRpeKeyed = useMemo(
    () => (onActivateRpe ? (id: string) => onActivateRpe(translateSetKey(id)) : undefined),
    [onActivateRpe, translateSetKey],
  );
  const onLongPressSetKeyed = useMemo(
    () => (onLongPressSet ? (id: string) => onLongPressSet(translateSetKey(id)) : undefined),
    [onLongPressSet, translateSetKey],
  );

  // Exercise thumbnail with a completion badge, shared by the collapsed and
  // expanded rows so the image stays visible when the card is collapsed. The
  // done-badge is suppressed in edit mode, where per-set badges convey state.
  const thumb = (
    <View>
      <ExerciseThumb exercise={exercise} getImageSource={getImageSource} size={42} />
      {isDone && !isEdit && (
        <View className="absolute" style={{ right: -3, top: -3 }}>
          <CompletionCheck size={15} iconSize={9} />
        </View>
      )}
    </View>
  );

  if (!expanded) {
    const volumeKg = getExerciseVolumeKg(exercise);
    // "planned" describes a live workout that hasn't reached the exercise yet;
    // historical/imported workouts (view mode) and form drafts (edit mode)
    // never show it. A cardio form card summarizes its effort instead of a
    // set count.
    const cardioParts: string[] = [];
    if (cardioForm) {
      const firstCardioSet = exercise.sets[0];
      if (firstCardioSet?.duration != null) {
        cardioParts.push(`${formatLocalizedNumber(firstCardioSet.duration / 60, { maximumFractionDigits: 1 })} min`);
      }
      if (firstCardioSet?.distance != null) {
        const dist = formatLocalizedNumber(distanceFromKm(firstCardioSet.distance, distanceUnit), { maximumFractionDigits: 2 });
        cardioParts.push(`${dist} ${distanceUnit === 'miles' ? 'mi' : 'km'}`);
      }
    }
    // Duration tables have no volume, so their collapsed line carries the
    // summed set duration instead (legacy-aware via effectiveSetDurationSec).
    const totalDurationSec = durationLike
      ? exercise.sets.reduce(
          (sum, s) =>
            sum +
            (effectiveSetDurationSec(
              { duration: s.duration ?? null, reps: s.reps },
              modality,
            ) ?? 0),
          0,
        )
      : 0;
    const detail = durationLike
      ? totalDurationSec > 0
        ? ` · ${formatDurationSeconds(totalDurationSec)}`
        : ''
      : volumeKg > 0
        ? ` · ${formatVolume(volumeKg, weightUnit)}`
        : '';
    const subtitle = cardioForm
      ? cardioParts.join(' · ')
      : readOnly || isEdit || anyComplete
        ? `${exercise.sets.length} sets${detail}`
        : `${exercise.sets.length} sets`;

    // The root → header row → thumb <Pressable> wrappers mirror the expanded
    // card exactly so the thumbnail <Image> keeps its position in the tree
    // across expand/collapse. A divergent structure would remount the image
    // (a fresh network fetch) and flash it on every toggle. The thumb press
    // target expands here; the labeled "Expand" affordance is the row body.
    return (
      <View className="border-b border-border-subtle">
        <View className="flex-row items-center gap-3 px-2 py-3">
          <Pressable
            onPress={() => onToggleExpanded(exercise.id)}
            onLongPress={longPressMenu}
            accessible={false}
          >
            {thumb}
          </Pressable>
          {/* self-stretch fills the row's content height and hitSlop reaches
              into the row's py-3 padding, so the expand target spans the whole
              row height instead of just the text box. The horizontal slop
              covers the row's own padding/gaps: right reaches through the px-2
              to the card edge — the 16px chevron sits flush against it, and
              taps aimed at the icon often land in that strip (the expanded
              chevron's slopped target trains exactly that spot) — and left
              covers the gap-3 next to the thumb. */}
          <Pressable
            onPress={() => onToggleExpanded(exercise.id)}
            onLongPress={longPressMenu}
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.exercise.expand', { defaultValue: 'Expand {{name}}', name })}
            className="flex-1 self-stretch flex-row items-center gap-3"
          >
            <Text
              numberOfLines={2}
              className={`flex-1 text-base ${isDone ? 'text-text-secondary' : 'text-text-primary'}`}
            >
              {name}
            </Text>
            <Text className="text-sm text-text-muted" style={{ fontVariant: ['tabular-nums'] }}>
              {subtitle}
            </Text>
            <Icon name="chevron-forward" size={16} color={textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  const workingSetNumbers = buildWorkingSetNumbers(exercise.sets);

  return (
    <View className="border-b border-border-subtle px-2 pt-3 pb-2">
      <View className="flex-row items-center gap-3">
        {/* Always a <Pressable> so the thumb subtree matches the collapsed
            render and the <Image> is preserved rather than remounted. Inert
            (no press, hidden from a11y) when no detail handler is wired. */}
        <Pressable
          onPress={onPressThumb ? () => onPressThumb(exercise.id) : undefined}
          accessible={onPressThumb != null}
          accessibilityRole={onPressThumb != null ? 'button' : undefined}
          accessibilityLabel={onPressThumb != null ? t('activeWorkout.exercise.viewDetails', { defaultValue: 'View {{name}} details', name }) : undefined}
        >
          {thumb}
        </Pressable>
        {/* self-stretch + justify-center make the whole header-row height
            tappable (not just the text box), so the collapse target around the
            name matches the chevron's generous hit area. */}
        <Pressable
          onPress={() => onToggleExpanded(exercise.id)}
          onLongPress={longPressMenu}
          hitSlop={{ top: 10, bottom: 4 }}
          className="flex-1 self-stretch justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.collapse', { defaultValue: 'Collapse {{name}}', name })}
        >
          <Text numberOfLines={2} className="text-base font-semibold text-text-primary">
            {name}
          </Text>
        </Pressable>
        {!readOnly && (
          <Pressable
            onPress={openOverflowMenu}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.exercise.moreOptions', { defaultValue: 'More options for {{name}}', name })}
            className="p-1"
          >
            <Icon name="ellipsis-horizontal" size={18} color={textMuted} />
          </Pressable>
        )}
        <Pressable
          onPress={() => onToggleExpanded(exercise.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.collapse', { defaultValue: 'Collapse {{name}}', name })}
          className="p-1"
        >
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={18} color={textMuted} />
          </Animated.View>
        </Pressable>
      </View>

      {/* The revealed body slides down from the header on expand and folds
          back up on collapse, in step with the host screens' LinearTransition
          card wrappers. */}
      <Animated.View
        entering={hasRenderedCollapsed ? FadeInDown.duration(200) : undefined}
        exiting={FadeOutUp.duration(150)}
      >
        {/* Per-exercise note: a subtle line under the name, shown when a note
            already exists or the card ⋮ "Notes" editor was opened. Editable
            wherever a commit handler is wired (live + workout forms); view mode
            shows the saved note as plain text. */}
        {!readOnly && onCommitExerciseNote != null && (!!exercise.notes || noteEditorOpen) && (
          <View className="mt-2 px-1">
            <WorkoutNotesField
              value={exercise.notes}
              onCommit={(text) => onCommitExerciseNote(exercise.id, text)}
              label=""
              placeholder={t('activeWorkout.exercise.notePlaceholder', { defaultValue: 'Add a note for this exercise…' })}
              accessibilityLabel={t('activeWorkout.exercise.notesFor', { defaultValue: 'Notes for {{name}}', name })}
            />
          </View>
        )}
        {readOnly && !!exercise.notes && (
          <View className="mt-2 px-1">
            <Text className="text-sm text-text-secondary" accessibilityLabel={t('activeWorkout.exercise.notesFor', { defaultValue: 'Notes for {{name}}', name })}>
              {exercise.notes}
            </Text>
          </View>
        )}

        {((showRestChip && !cardioForm) ||
          bestDisplay != null ||
          caloriesField ||
          caloriesText != null) && (
          // flex-wrap + gap-y so the rest chip and "Best" stack gracefully on
          // narrow screens instead of shifting off the edge. "Last" lives in the
          // per-set PREVIOUS column, not here.
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mt-2 mb-1 px-1">
            {showRestChip && !cardioForm && (
              <RestPeriodChip
                value={exercise.sets[0]?.rest_time}
                values={exercise.sets.map((set) => set.rest_time)}
                readOnly={readOnly}
                onPress={
                  readOnly
                    ? undefined
                    : () => onPressRestChip?.(exercise.id, exercise.sets[0]?.rest_time ?? null)
                }
              />
            )}
            {caloriesField && (caloriesEditing ? (
              <View className="flex-row items-center gap-1">
                <Icon name="flame" size={14} color={accentPrimary} />
                <FormInput
                  value={exercise.editCaloriesText ?? ''}
                  onChangeText={(text) => onChangeCalories?.(exercise.id, text)}
                  onBlur={() => setCaloriesEditing(false)}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  placeholder="–"
                  accessibilityLabel={t('activeWorkout.exercise.caloriesFor', { defaultValue: 'Calories burned for {{name}}', name })}
                  className="text-center"
                  style={{
                    paddingTop: 4,
                    paddingBottom: 4,
                    paddingLeft: 6,
                    paddingRight: 6,
                    fontSize: 14,
                    lineHeight: 18,
                    minWidth: 52,
                  }}
                />
                <Text className="text-sm text-text-secondary">{t('activeWorkout.exercise.caloriesUnit', { defaultValue: 'kcal' })}</Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setCaloriesEditing(true)}
                className="flex-row items-center gap-1"
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel={t('activeWorkout.exercise.editCaloriesFor', { defaultValue: 'Edit calories burned for {{name}}', name })}
              >
                <Icon name="flame" size={14} color={accentPrimary} />
                <Text className="text-sm" style={{ color: accentPrimary }}>
                  {(exercise.editCaloriesText ?? '') !== '' ? exercise.editCaloriesText : '–'} {t('activeWorkout.exercise.caloriesUnit', { defaultValue: 'kcal' })}
                </Text>
                <Icon name="chevron-down" size={10} color={accentPrimary} />
              </Pressable>
            ))}
            {caloriesText != null && (
              <View className="flex-row items-center">
                <Icon name="flame" size={14} color={textMuted} />
                <Text className="text-sm text-text-secondary ml-1">{caloriesText} {t('activeWorkout.exercise.caloriesUnit', { defaultValue: 'kcal' })}</Text>
              </View>
            )}
            {bestDisplay != null && (
              <View
                className="flex-row items-center"
                accessibilityLabel={t('activeWorkout.exercise.best', { defaultValue: 'Best {{value}}', value: bestText })}
              >
                <Icon
                  name="trophy-outline"
                  size={14}
                  color={bestIsPr ? prColor : textMuted}
                />
                <Text
                  className="text-sm ml-1"
                  style={{
                    color: bestIsPr ? prColor : textSecondary,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {bestText}
                </Text>
              </View>
            )}
          </View>
        )}

        {cardioForm && (
          <CardioEffortForm
            set={exercise.sets[0] ?? null}
            exerciseName={name}
            mode={mode}
            distanceUnit={distanceUnit}
            assumed={assumedSetValues?.[0] ?? null}
            state={((): SetRowState => {
              // Same state derivation as the table rows, so the form's log
              // affordance matches: done check, pulsing cursor ring, or muted
              // upcoming ring.
              const set = exercise.sets[0];
              if (set == null) return 'upcoming';
              if (completedSetIds[String(set.id)]) return 'done';
              return String(set.id) === activeSetId ? 'current' : 'upcoming';
            })()}
            renderKey={
              exercise.sets[0] != null
                ? translateSetKey(String(exercise.sets[0].id))
                : undefined
            }
            onCommitField={onCommitField}
            onComplete={isLive ? onComplete : undefined}
            onUncomplete={isLive ? onUncomplete : undefined}
            onActivateSet={onActivateSetKeyed}
            onRegisterAccessoryHandle={onRegisterAccessoryHandle}
          />
        )}

        {!cardioForm && exercise.sets.length > 0 && (
          <View className="flex-row items-center px-1 py-1.5">
            {/* Duration tables have a single value column; against it the
                5-column fixed Set/Prev widths read squished, so their content
                columns share the width equally instead of aligning with
                neighboring cards. Keep in sync with ActiveWorkoutSetRow. */}
            <Text
              className={`${durationLike ? 'flex-1' : 'w-9'} text-center text-xs font-semibold uppercase text-text-muted`}
            >
              {t('workout.set', { defaultValue: 'Set' })}
            </Text>
            {!readOnly && (
              <Text
                className={`${durationLike ? 'flex-1' : 'w-20'} text-center text-xs font-semibold uppercase text-text-muted`}
              >
                {t('workout.prev', { defaultValue: 'Prev' })}
              </Text>
            )}
            {durationLike ? (
              <>
                <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
                  {t('workout.sec', { defaultValue: 'Sec' })}
                </Text>
                {/* Read-only cardio tables surface per-set distance (imports,
                    intervals); live/edit tables keep the single editable Sec
                    cell, so the column only exists in view mode. */}
                {readOnly && modality === 'duration_distance' && (
                  <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
                    {distanceUnit === 'miles' ? t('workout.mi', { defaultValue: 'mi' }) : t('workout.km', { defaultValue: 'km' })}
                  </Text>
                )}
              </>
            ) : (
              <>
                {modality !== 'reps_only' && (
                  <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
                    {unitLabel}
                  </Text>
                )}
                <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
                  {t('workout.reps', { defaultValue: 'Reps' })}
                </Text>
              </>
            )}
            <View ref={metricAnchorRef} collapsable={false} className="w-14 items-center">
              <Pressable
                onPress={openMetricMenu}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('activeWorkout.exercise.changeMetric', { defaultValue: 'Change metric column' })}
                className="flex-row items-center gap-0.5"
              >
                <Text
                  className="text-xs font-semibold uppercase"
                  style={{ color: accentPrimary }}
                >
                  {metricColumnLabel(effectiveMetricColumn)}
                </Text>
                <Icon name="chevron-down" size={10} color={accentPrimary} />
              </Pressable>
            </View>
            <View className="w-10" />
          </View>
        )}

        {!cardioForm && exercise.sets.map((set, index) => {
          const setId = String(set.id);
          // Stable across an autosave id churn (view/edit: keyed by id). Used for
          // the React key + focus/expand compares so the row instance — and its
          // keyboard/draft — survives the set's id being reassigned.
          const renderKey = setRenderKeys?.[setId] ?? setId;
          // Edit mode never surfaces 'done' — completed sets stay editable and
          // show the static completedBadge instead.
          const state = isEdit
            ? setId === activeSetId
              ? 'current'
              : 'upcoming'
            : completedSetIds[setId]
              ? 'done'
              : setId === activeSetId
                ? 'current'
                : 'upcoming';
          const nextSet = exercise.sets[index + 1];
          return (
            <React.Fragment key={renderKey}>
              <ActiveWorkoutSetRow
                set={set}
                modality={modality}
                distanceUnit={distanceUnit}
                renderKey={renderKey}
                displayNumber={workingSetNumbers[index]}
                state={state}
                metricColumn={effectiveMetricColumn}
                weightUnit={weightUnit}
                previousSet={readOnly ? undefined : (previousSessionSets?.[index] ?? null)}
                assumed={assumedSetValues?.[index] ?? null}
                mode={mode}
                onComplete={onComplete}
                onUncomplete={onUncomplete}
                onCommitField={onCommitField}
                onDelete={onDeleteSet}
                onLongPress={onLongPressSetKeyed}
                onPressSetType={onPressSetType}
                activeField={activeField}
                isFocused={isLive && focusedSetKey === renderKey}
                nextSetId={nextSet != null ? String(nextSet.id) : null}
                entryId={exercise.id}
                rpeEditable={rpeEditable}
                completedBadge={isEdit && !!completedSetIds[setId]}
                onToggleComplete={onToggleComplete}
                onActivateSet={onActivateSetKeyed}
                onActivateRpe={onActivateRpeKeyed}
                onEditFieldChange={onEditFieldChange}
                onAddSet={onAddSet}
                onRegisterAccessoryHandle={onRegisterAccessoryHandle}
              />
              {/* Per-set note expand — live and edit, toggled by long-pressing
                  the set row. View mode shows a saved note as plain text. */}
              {!readOnly && expandedSetKey === renderKey && onCommitField != null && (
                <ActiveWorkoutSetDetail set={set} onCommitField={onCommitField} />
              )}
              {readOnly && !!set.notes && (
                <View className="px-1 pb-2">
                  <Text
                    className="text-xs text-text-secondary"
                    accessibilityLabel={t('activeWorkout.exercise.notesForSet', { defaultValue: 'Notes for set {{number}}', number: set.set_number })}
                  >
                    {set.notes}
                  </Text>
                </View>
              )}
            </React.Fragment>
          );
        })}

        {!readOnly && !cardioForm && (
          <Pressable
            onPress={() => onAddSet?.(exercise.id)}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.exercise.addSet', { defaultValue: 'Add set to {{name}}', name })}
            className="flex-row items-center justify-center gap-1.5 py-2.5 mt-1"
          >
            <Icon name="add" size={15} color={accentPrimary} />
            <Text className="text-sm font-medium" style={{ color: accentPrimary }}>
              {t('activeWorkout.exercise.addSetLabel', { defaultValue: 'Add set' })}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

export default React.memo(ActiveWorkoutExerciseCard);
