import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import {
  evaluateProgression,
  type ExerciseProgressionConfig,
  type LastExercisePerformance,
} from '@workspace/shared';
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
import {
  distanceFromKm,
  weightFromKg,
  weightToKg,
} from '../utils/unitConversions';
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
import type {
  ActiveSetPatch,
  CompletedSetMap,
  PrSetMap,
} from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';

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
    text: string
  ) => void;
  /** Live/edit: rows register their sticky-bar handles here (keyed by render key). */
  onRegisterAccessoryHandle?: (
    key: string,
    handle: SetRowAccessoryHandle | null
  ) => void;
  onUpdateProgression?: (exerciseId: string, patch: any) => void;
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
    (snapshot?.category && CATEGORY_ICON_MAP[snapshot.category]) ||
    'exercise-weights';

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
  onUpdateProgression,
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

  const name =
    exercise.exercise_snapshot?.name ??
    t('workout.exercise', { defaultValue: 'Exercise' });
  const metricColumnLabel = (column: ActiveWorkoutMetricColumn): string => {
    switch (column) {
      case 'rpe':
        return t('workout.metricRpe', { defaultValue: 'RPE' });
      case 'volume':
        return t('workout.metricVolumeShort', { defaultValue: 'Vol' });
      case 'e1rm':
        return t('workout.metricE1rmShort', { defaultValue: '1RM' });
      case 'tenrm':
        return t('workout.metricTenrmShort', { defaultValue: '10RM' });
    }
  };
  const unitLabel =
    weightUnit === 'kg'
      ? t('workout.kg', { defaultValue: 'kg' })
      : t('workout.lbs', { defaultValue: 'lbs' });
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
  // Live, edit, and preview fetch the stats baseline so progression overload evaluates
  const { data: stats } = useExerciseStats(
    exercise.exercise_id,
    excludePresetEntryId,
    sourcePresetId
  );
  const lastSet = stats?.lastSet ?? null;
  const bestSet = stats?.bestSet ?? null;

  // PREVIOUS column source: the most recent prior session's sets, matched to
  // the current rows by position (Hevy-style).
  const previousSessionSets = (stats?.recentSessions ?? [])[0]?.sets;

  // Progression Engine Evaluation
  const progressionResult = useMemo(() => {
    if (!exercise.rep_goal && exercise.progression_mode !== 'fixed')
      return null;
    // Count only working sets (exclude warmups)
    const workingSets = exercise.sets.filter((s) => s.set_type !== 'warmup');
    const targetSets = workingSets.length || 3;

    const config: ExerciseProgressionConfig = {
      progressionMode: (exercise.progression_mode as any) ?? 'rep_goal',
      targetSets,
      repGoal: exercise.rep_goal,
      incrementType: exercise.increment_type ?? 'weight',
      incrementValue: exercise.increment_value ?? 2.5,
      equipmentBrand: exercise.equipment_brand ?? null,
    };

    // Filter out warmup sets from previous session history
    const workingPreviousSets = (previousSessionSets || []).filter(
      (s: any) => s.setType !== 'warmup'
    );
    const firstWorking = workingPreviousSets[0];

    const lastPerformance: LastExercisePerformance | null =
      workingPreviousSets.length > 0
        ? {
            baseWeight: firstWorking?.weight
              ? weightFromKg(firstWorking.weight, weightUnit)
              : 0,
            sets: workingPreviousSets.map((s, idx) => ({
              setNumber: idx + 1,
              reps: s.reps ?? 0,
              weight: s.weight ? weightFromKg(s.weight, weightUnit) : 0,
            })),
          }
        : null;

    return evaluateProgression(config, lastPerformance);
  }, [
    exercise.rep_goal,
    exercise.progression_mode,
    exercise.sets.length,
    exercise.increment_type,
    exercise.increment_value,
    exercise.equipment_brand,
    previousSessionSets,
    weightUnit,
  ]);

  // Apple-style collapsible progression settings (Preset Edit Mode)
  const [progressionEditorOpen, setProgressionEditorOpen] = useState(false);
  const [editMode, setEditMode] = useState<
    'rep_goal' | 'fixed' | 'step_load' | 'manual'
  >((exercise.progression_mode as any) ?? 'rep_goal');
  const [editRepGoal, setEditRepGoal] = useState<string>(
    exercise.rep_goal != null ? String(exercise.rep_goal) : ''
  );
  const [editIncrementValue, setEditIncrementValue] = useState<string>(
    exercise.increment_value != null ? String(exercise.increment_value) : '2.5'
  );
  const [editIncrementType, setEditIncrementType] = useState<'weight' | 'reps'>(
    exercise.increment_type ?? 'weight'
  );
  const [editEquipmentBrand, setEditEquipmentBrand] = useState<string>(
    exercise.equipment_brand ?? ''
  );

  const handleCommitProgression = useCallback(
    (patch: any) => {
      onUpdateProgression?.(exercise.id, patch);
    },
    [exercise.id, onUpdateProgression]
  );

  // Assumed (placeholder) weight/reps per row — live only. Resolved from the
  // same sources completion adoption uses in the store, so the gray value a
  // row shows is exactly what logging it would record.
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);
  const assumedSetValues = useMemo(
    () =>
      isLive
        ? resolveAssumedSetValues(
            exercise.sets,
            previousSessionSets,
            plannedSetValues,
            progressionResult?.goalAchieved &&
              progressionResult.status === 'PROGRESSION_WEIGHT_INCREASE'
              ? weightToKg(progressionResult.suggestedWeight, weightUnit)
              : null
          )
        : null,
    [
      isLive,
      exercise.sets,
      previousSessionSets,
      plannedSetValues,
      progressionResult,
      weightUnit,
    ]
  );

  // Capture the historical PR baseline once per exercise. The store no-ops
  // unless a live workout is active and the key is absent, so view/edit renders
  // can't clobber it and a re-resolved query is harmless.
  const capturePrBaseline = useActiveWorkoutStore((s) => s.capturePrBaseline);
  const capturePreviousSessionSets = useActiveWorkoutStore(
    (s) => s.capturePreviousSessionSets
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
        : null
    );
    // The store-side copy placeholder adoption resolves against on complete —
    // captured from the same query the PREVIOUS column renders, so a
    // lock-screen complete adopts exactly what the row shows.
    capturePreviousSessionSets(
      exercise.exercise_id,
      stats.recentSessions?.[0]?.sets ?? []
    );
  }, [
    isLive,
    stats,
    exercise.exercise_id,
    capturePrBaseline,
    capturePreviousSessionSets,
  ]);

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
      if (best == null || compareSetRecords(contender, best) > 0)
        best = contender;
    }
    return best;
  }, [isLive, prSetIds, exercise.sets]);

  const bestDisplay =
    bestSet != null && bestSet.weight != null
      ? stampedBest != null &&
        compareSetRecords(stampedBest, {
          weight: bestSet.weight,
          reps: bestSet.reps,
        }) > 0
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
  // value churns with every autosave recompute.
  const caloriesField = isEdit && onChangeCalories != null;
  const [caloriesEditing, setCaloriesEditing] = useState(false);
  const caloriesText =
    readOnly && exercise.calories_burned != null && exercise.calories_burned > 0
      ? String(Math.round(exercise.calories_burned))
      : null;

  // Edit-only: seed the first still-empty set from "last time" once, when
  // stats arrive. Weight and reps fill independently — a null lastSet field
  // must not clobber a value the user already typed.
  const prefilledExerciseIdRef = useRef<string | null>(null);
  const firstSet = exercise.sets[0];
  const firstSetId = firstSet != null ? String(firstSet.id) : null;
  const firstSetWeightEmpty = firstSet != null && firstSet.weight == null;
  const firstSetRepsEmpty = firstSet != null && firstSet.reps == null;
  useEffect(() => {
    if (!isEdit || prefilledExerciseIdRef.current === exercise.exercise_id)
      return;
    if (!eligibleForPrefill || !lastSet || firstSetId == null) return;

    prefilledExerciseIdRef.current = exercise.exercise_id;
    const patch: ActiveSetPatch = {};
    if (firstSetWeightEmpty && lastSet.weight != null)
      patch.weight = lastSet.weight;
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

  const [hasRenderedCollapsed, setHasRenderedCollapsed] = useState(!expanded);
  if (!expanded && !hasRenderedCollapsed) setHasRenderedCollapsed(true);

  const metricAnchorRef = useRef<View>(null);
  const openMetricMenu = () => {
    measureAnchoredMenuTrigger(metricAnchorRef.current, (anchor) =>
      onPressMetricHeader(anchor, clampedToRpe)
    );
  };

  const openOverflowMenu = () => onPressOverflow?.(exercise.id);
  const longPressMenu =
    isLive && onPressOverflow ? openOverflowMenu : undefined;

  const translateSetKey = useCallback(
    (id: string) => setRenderKeys?.[id] ?? id,
    [setRenderKeys]
  );
  const onActivateSetKeyed = useMemo(
    () =>
      onActivateSet
        ? (id: string, field: Exclude<SetInputField, 'rpe'>) =>
            onActivateSet(translateSetKey(id), field)
        : undefined,
    [onActivateSet, translateSetKey]
  );
  const onActivateRpeKeyed = useMemo(
    () =>
      onActivateRpe
        ? (id: string) => onActivateRpe(translateSetKey(id))
        : undefined,
    [onActivateRpe, translateSetKey]
  );
  const onLongPressSetKeyed = useMemo(
    () =>
      onLongPressSet
        ? (id: string) => onLongPressSet(translateSetKey(id))
        : undefined,
    [onLongPressSet, translateSetKey]
  );

  const thumb = (
    <View>
      <ExerciseThumb
        exercise={exercise}
        getImageSource={getImageSource}
        size={42}
      />
      {isDone && !isEdit && (
        <View className="absolute" style={{ right: -3, top: -3 }}>
          <CompletionCheck size={15} iconSize={9} />
        </View>
      )}
    </View>
  );

  if (!expanded) {
    const volumeKg = getExerciseVolumeKg(exercise);
    const cardioParts: string[] = [];
    if (cardioForm) {
      const firstCardioSet = exercise.sets[0];
      if (firstCardioSet?.duration != null) {
        cardioParts.push(
          `${formatLocalizedNumber(firstCardioSet.duration / 60, { maximumFractionDigits: 1 })} min`
        );
      }
      if (firstCardioSet?.distance != null) {
        const dist = formatLocalizedNumber(
          distanceFromKm(firstCardioSet.distance, distanceUnit),
          { maximumFractionDigits: 2 }
        );
        cardioParts.push(`${dist} ${distanceUnit === 'miles' ? 'mi' : 'km'}`);
      }
    }
    const totalDurationSec = durationLike
      ? exercise.sets.reduce(
          (sum, s) =>
            sum +
            (effectiveSetDurationSec(
              { duration: s.duration ?? null, reps: s.reps },
              modality
            ) ?? 0),
          0
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
          <Pressable
            onPress={() => onToggleExpanded(exercise.id)}
            onLongPress={longPressMenu}
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.exercise.expand', {
              defaultValue: 'Expand {{name}}',
              name,
            })}
            className="flex-1 self-stretch flex-row items-center gap-3"
          >
            <View className="flex-1">
              <Text
                numberOfLines={2}
                className={`text-base ${isDone ? 'text-text-secondary' : 'text-text-primary'}`}
              >
                {name}
              </Text>
              {exercise.equipment_brand ? (
                <Text className="text-xs text-text-muted mt-0.5">
                  {exercise.equipment_brand}
                </Text>
              ) : null}
            </View>
            <Text
              className="text-sm text-text-muted"
              style={{ fontVariant: ['tabular-nums'] }}
            >
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
        <Pressable
          onPress={onPressThumb ? () => onPressThumb(exercise.id) : undefined}
          accessible={onPressThumb != null}
          accessibilityRole={onPressThumb != null ? 'button' : undefined}
          accessibilityLabel={
            onPressThumb != null
              ? t('activeWorkout.exercise.viewDetails', {
                  defaultValue: 'View {{name}} details',
                  name,
                })
              : undefined
          }
        >
          {thumb}
        </Pressable>
        <Pressable
          onPress={() => onToggleExpanded(exercise.id)}
          onLongPress={longPressMenu}
          hitSlop={{ top: 10, bottom: 4 }}
          className="flex-1 self-stretch justify-center"
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.collapse', {
            defaultValue: 'Collapse {{name}}',
            name,
          })}
        >
          <Text
            numberOfLines={2}
            className="text-base font-semibold text-text-primary"
          >
            {name}
          </Text>
          {exercise.equipment_brand ? (
            <Text className="text-xs text-text-muted mt-0.5">
              {exercise.equipment_brand}
            </Text>
          ) : null}
        </Pressable>
        {!readOnly && (
          <Pressable
            onPress={openOverflowMenu}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={t('activeWorkout.exercise.moreOptions', {
              defaultValue: 'More options for {{name}}',
              name,
            })}
            className="p-1"
          >
            <Icon name="ellipsis-horizontal" size={18} color={textMuted} />
          </Pressable>
        )}
        <Pressable
          onPress={() => onToggleExpanded(exercise.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('activeWorkout.exercise.collapse', {
            defaultValue: 'Collapse {{name}}',
            name,
          })}
          className="p-1"
        >
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={18} color={textMuted} />
          </Animated.View>
        </Pressable>
      </View>

      <Animated.View
        entering={hasRenderedCollapsed ? FadeInDown.duration(200) : undefined}
        exiting={FadeOutUp.duration(150)}
      >
        {/* Apple-Style Modern Progression Configuration (Preset Edit Mode) */}
        {isEdit && (
          <View className="mt-2 mb-1 px-1">
            <Pressable
              onPress={() => setProgressionEditorOpen(!progressionEditorOpen)}
              className="flex-row items-center justify-between px-3 py-2 rounded-lg bg-surface border border-border-subtle"
            >
              <View className="flex-row items-center gap-2 flex-1 mr-2">
                <Text className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  Progression
                </Text>
                <Text
                  numberOfLines={1}
                  className="text-xs font-medium text-text-primary flex-1"
                >
                  {editMode === 'manual'
                    ? 'Manual (Off)'
                    : editMode === 'fixed'
                      ? `Fixed Target · +${editIncrementValue} ${weightUnit}`
                      : editMode === 'step_load'
                        ? `Step-Load · ${editRepGoal || '–'} reps · +${editIncrementValue} reps`
                        : `Rep Goal · ${editRepGoal || '–'} reps · +${editIncrementValue} ${weightUnit}`}
                </Text>
              </View>
              <Icon
                name={progressionEditorOpen ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={textMuted}
              />
            </Pressable>

            {progressionEditorOpen && (
              <View className="mt-2 p-3 rounded-xl bg-surface border border-border-subtle gap-3">
                <View>
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                    Overload Mode
                  </Text>
                  <View className="flex-row bg-raised rounded-lg p-0.5 border border-border-subtle">
                    {(
                      [
                        { key: 'rep_goal', label: 'Rep Goal' },
                        { key: 'fixed', label: 'Fixed' },
                        { key: 'step_load', label: 'Step-Load' },
                        { key: 'manual', label: 'Off' },
                      ] as const
                    ).map((tab) => {
                      const isActive = editMode === tab.key;
                      return (
                        <Pressable
                          key={tab.key}
                          onPress={() => {
                            setEditMode(tab.key);
                            const newIncType =
                              tab.key === 'step_load'
                                ? 'reps'
                                : editIncrementType;
                            if (tab.key === 'step_load')
                              setEditIncrementType('reps');
                            handleCommitProgression({
                              progression_mode: tab.key,
                              increment_type: newIncType,
                            });
                          }}
                          className={`flex-1 py-1.5 items-center justify-center rounded-md ${
                            isActive ? 'bg-surface shadow-sm' : ''
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium ${
                              isActive
                                ? 'text-text-primary font-semibold'
                                : 'text-text-muted'
                            }`}
                          >
                            {tab.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {editMode !== 'manual' && (
                  <View className="flex-row items-center gap-3">
                    <View className="flex-1">
                      <Text className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                        {editMode === 'fixed'
                          ? 'Target Reps / Set'
                          : 'Target Reps (Total)'}
                      </Text>
                      <FormInput
                        value={editRepGoal}
                        onChangeText={(val) => {
                          setEditRepGoal(val);
                          const num = parseInt(val, 10);
                          handleCommitProgression({
                            rep_goal: isNaN(num) ? null : num,
                          });
                        }}
                        keyboardType="number-pad"
                        placeholder={editMode === 'fixed' ? '8' : '75'}
                        style={{
                          height: 38,
                          fontSize: 14,
                          paddingHorizontal: 10,
                        }}
                      />
                    </View>

                    <View className="flex-1">
                      <Text className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                        {editMode === 'step_load' ||
                        editIncrementType === 'reps'
                          ? 'Increment (Reps)'
                          : `Increment (${weightUnit})`}
                      </Text>
                      <FormInput
                        value={editIncrementValue}
                        onChangeText={(val) => {
                          setEditIncrementValue(val);
                          const num = parseFloat(val);
                          handleCommitProgression({
                            increment_value: isNaN(num) ? 2.5 : num,
                          });
                        }}
                        keyboardType="decimal-pad"
                        placeholder="2.5"
                        style={{
                          height: 38,
                          fontSize: 14,
                          paddingHorizontal: 10,
                        }}
                      />
                    </View>
                  </View>
                )}

                <View>
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                    Equipment / Machine Brand
                  </Text>
                  <FormInput
                    value={editEquipmentBrand}
                    onChangeText={(val) => {
                      setEditEquipmentBrand(val);
                      handleCommitProgression({
                        equipment_brand: val.trim() || null,
                      });
                    }}
                    autoCapitalize="words"
                    placeholder="e.g. Hammer Strength, Cable Stack"
                    style={{ height: 38, fontSize: 14, paddingHorizontal: 10 }}
                  />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Live Progression Overload Banner */}
        {isLive && progressionResult && (
          <View className="mt-2.5 mb-1 px-2.5 py-1.5 rounded-lg bg-raised flex-row items-center justify-between border border-border-subtle">
            <View className="flex-row items-center gap-1.5 flex-1 mr-2">
              <Icon
                name={
                  progressionResult.goalAchieved
                    ? 'trophy-outline'
                    : 'exercise-weights'
                }
                size={16}
                color={
                  progressionResult.goalAchieved ? accentPrimary : textSecondary
                }
              />
              <Text
                className="text-xs font-medium text-text-primary flex-1"
                numberOfLines={2}
              >
                {progressionResult.message}
              </Text>
            </View>
            {progressionResult.suggestedWeight > 0 && (
              <View className="px-2 py-0.5 rounded bg-surface">
                <Text
                  className="text-xs font-bold"
                  style={{ color: accentPrimary }}
                >
                  {progressionResult.suggestedWeight} {unitLabel}
                </Text>
              </View>
            )}
          </View>
        )}

        {!readOnly &&
          onCommitExerciseNote != null &&
          (!!exercise.notes || noteEditorOpen) && (
            <View className="mt-2 px-1">
              <WorkoutNotesField
                value={exercise.notes}
                onCommit={(text) => onCommitExerciseNote(exercise.id, text)}
                label=""
                placeholder={t('activeWorkout.exercise.notePlaceholder', {
                  defaultValue: 'Add a note for this exercise…',
                })}
                accessibilityLabel={t('activeWorkout.exercise.notesFor', {
                  defaultValue: 'Notes for {{name}}',
                  name,
                })}
              />
            </View>
          )}
        {readOnly && !!exercise.notes && (
          <View className="mt-2 px-1">
            <Text
              className="text-sm text-text-secondary"
              accessibilityLabel={t('activeWorkout.exercise.notesFor', {
                defaultValue: 'Notes for {{name}}',
                name,
              })}
            >
              {exercise.notes}
            </Text>
          </View>
        )}

        {((showRestChip && !cardioForm) ||
          bestDisplay != null ||
          caloriesField ||
          caloriesText != null) && (
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mt-2 mb-1 px-1">
            {showRestChip && !cardioForm && (
              <RestPeriodChip
                value={exercise.sets[0]?.rest_time}
                values={exercise.sets.map((set) => set.rest_time)}
                readOnly={readOnly}
                onPress={
                  readOnly
                    ? undefined
                    : () =>
                        onPressRestChip?.(
                          exercise.id,
                          exercise.sets[0]?.rest_time ?? null
                        )
                }
              />
            )}
            {caloriesField &&
              (caloriesEditing ? (
                <View className="flex-row items-center gap-1">
                  <Icon name="flame" size={14} color={accentPrimary} />
                  <FormInput
                    value={exercise.editCaloriesText ?? ''}
                    onChangeText={(text) =>
                      onChangeCalories?.(exercise.id, text)
                    }
                    onBlur={() => setCaloriesEditing(false)}
                    keyboardType="decimal-pad"
                    autoFocus
                    selectTextOnFocus
                    placeholder="–"
                    accessibilityLabel={t(
                      'activeWorkout.exercise.caloriesFor',
                      { defaultValue: 'Calories burned for {{name}}', name }
                    )}
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
                  <Text className="text-sm text-text-secondary">
                    {t('activeWorkout.exercise.caloriesUnit', {
                      defaultValue: 'kcal',
                    })}
                  </Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => setCaloriesEditing(true)}
                  className="flex-row items-center gap-1"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    'activeWorkout.exercise.editCaloriesFor',
                    { defaultValue: 'Edit calories burned for {{name}}', name }
                  )}
                >
                  <Icon name="flame" size={14} color={accentPrimary} />
                  <Text className="text-sm" style={{ color: accentPrimary }}>
                    {(exercise.editCaloriesText ?? '') !== ''
                      ? exercise.editCaloriesText
                      : '–'}{' '}
                    {t('activeWorkout.exercise.caloriesUnit', {
                      defaultValue: 'kcal',
                    })}
                  </Text>
                  <Icon name="chevron-down" size={10} color={accentPrimary} />
                </Pressable>
              ))}
            {caloriesText != null && (
              <View className="flex-row items-center">
                <Icon name="flame" size={14} color={textMuted} />
                <Text className="text-sm text-text-secondary ml-1">
                  {caloriesText}{' '}
                  {t('activeWorkout.exercise.caloriesUnit', {
                    defaultValue: 'kcal',
                  })}
                </Text>
              </View>
            )}
            {bestDisplay != null && (
              <View
                className="flex-row items-center"
                accessibilityLabel={t('activeWorkout.exercise.best', {
                  defaultValue: 'Best {{value}}',
                  value: bestText,
                })}
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
                {readOnly && modality === 'duration_distance' && (
                  <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
                    {distanceUnit === 'miles'
                      ? t('workout.mi', { defaultValue: 'mi' })
                      : t('workout.km', { defaultValue: 'km' })}
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
            <View
              ref={metricAnchorRef}
              collapsable={false}
              className="w-14 items-center"
            >
              <Pressable
                onPress={openMetricMenu}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('activeWorkout.exercise.changeMetric', {
                  defaultValue: 'Change metric column',
                })}
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

        {!cardioForm &&
          exercise.sets.map((set, index) => {
            const setId = String(set.id);
            const renderKey = setRenderKeys?.[setId] ?? setId;
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

            // In preview mode ('view'), display the calculated progression weight if goal was hit
            const effectiveSet = set;

            return (
              <React.Fragment key={renderKey}>
                <ActiveWorkoutSetRow
                  set={effectiveSet}
                  modality={modality}
                  distanceUnit={distanceUnit}
                  renderKey={renderKey}
                  displayNumber={workingSetNumbers[index]}
                  state={state}
                  metricColumn={effectiveMetricColumn}
                  weightUnit={weightUnit}
                  previousSet={
                    readOnly
                      ? undefined
                      : (previousSessionSets?.[index] ?? null)
                  }
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
                {!readOnly &&
                  expandedSetKey === renderKey &&
                  onCommitField != null && (
                    <ActiveWorkoutSetDetail
                      set={set}
                      onCommitField={onCommitField}
                    />
                  )}
                {readOnly && !!set.notes && (
                  <View className="px-1 pb-2">
                    <Text
                      className="text-xs text-text-secondary"
                      accessibilityLabel={t(
                        'activeWorkout.exercise.notesForSet',
                        {
                          defaultValue: 'Notes for set {{number}}',
                          number: set.set_number,
                        }
                      )}
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
            accessibilityLabel={t('activeWorkout.exercise.addSet', {
              defaultValue: 'Add set to {{name}}',
              name,
            })}
            className="flex-row items-center justify-center gap-1.5 py-2.5 mt-1"
          >
            <Icon name="add" size={15} color={accentPrimary} />
            <Text
              className="text-sm font-medium"
              style={{ color: accentPrimary }}
            >
              {t('activeWorkout.exercise.addSetLabel', {
                defaultValue: 'Add set',
              })}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

export default React.memo(ActiveWorkoutExerciseCard);
