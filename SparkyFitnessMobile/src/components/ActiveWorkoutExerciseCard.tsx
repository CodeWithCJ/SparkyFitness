import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import SafeImage from './SafeImage';
import RestPeriodChip from './RestPeriodChip';
import ActiveWorkoutSetRow from './ActiveWorkoutSetRow';
import { measureAnchoredMenuTrigger, type AnchorRect } from './AnchoredMenu';
import { useExerciseStats } from '../hooks/useExerciseStats';
import type { GetImageSource } from '../hooks/useExerciseImageSource';
import { weightFromKg } from '../utils/unitConversions';
import {
  CATEGORY_ICON_MAP,
  compareSetRecords,
  formatVolume,
  getExerciseVolumeKg,
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

/** Options and labels for the metric-column picker menu the header opens. */
export const METRIC_OPTIONS: ActiveWorkoutMetricColumn[] = ['rpe', 'volume', 'e1rm', 'tenrm'];

export const METRIC_MENU_LABELS: Record<ActiveWorkoutMetricColumn, string> = {
  rpe: 'RPE',
  volume: 'Volume',
  e1rm: 'Est. 1RM',
  tenrm: 'Est. 10RM',
};

/** Working-set numbers per set index; warmups repeat the previous number (they render the `W` pill instead). */
function buildWorkingSetNumbers(sets: WorkoutCardSet[]): number[] {
  let workingNumber = 0;
  return sets.map((set) => {
    if (set.set_type !== 'warmup') workingNumber += 1;
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
  getImageSource: GetImageSource;
  /**
   * 'view' renders the read-only variant (workout detail): no logging,
   * editing, overflow menu, add-set, or "Last time" stats fetch. The metric
   * column and its picker stay live in all modes. 'edit' renders form-draft
   * rows (see ActiveWorkoutSetRow) with the overflow menu, add-set, rest chip,
   * and stats line active; completion state is display-only (completedBadge)
   * so completed sets stay editable.
   */
  mode?: 'live' | 'view' | 'edit';
  /**
   * Live only: the active session's preset-entry id, forwarded to the stats
   * query so today's in-progress/planned sets are excluded from the historical
   * best/last baseline. View/edit modes pass nothing.
   */
  excludePresetEntryId?: string;
  /**
   * Live only: the store's PR stamps. When any of this exercise's set ids is
   * stamped, the Best line goes gold and shows the new record (the server
   * best stays historical by design).
   */
  prSetIds?: PrSetMap;
  /** Hide the rest chip entirely (e.g. imported workouts without rest data). */
  showRestChip?: boolean;
  onToggleExpanded: (entryId: string) => void;
  onPressRestChip?: (entryId: string, currentSec: number | null) => void;
  onPressMetricHeader: (anchor: AnchorRect) => void;
  onPressOverflow?: (entryId: string, anchor: AnchorRect) => void;
  onCompleteActive?: () => void;
  onUncomplete?: (setId: string) => void;
  onRecomplete?: (setId: string) => void;
  onCommitField?: (setId: string, patch: ActiveSetPatch) => void;
  onDeleteSet?: (setId: string) => void;
  onLongPressSet?: (setId: string) => void;
  onAddSet?: (entryId: string) => void;
  // --- edit-mode props ---
  /** Active row's focused field (form-owned state). */
  activeField?: 'weight' | 'reps';
  /** False hides the RPE input on active rows (preset sets store no RPE). */
  rpeEditable?: boolean;
  /** Prefill the first empty set from "last time" once stats arrive. */
  eligibleForPrefill?: boolean;
  onActivateSet?: (setId: string, field: 'weight' | 'reps') => void;
  onDeactivateSet?: () => void;
  onEditFieldChange?: (setId: string, field: 'weight' | 'reps', text: string) => void;
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
  getImageSource,
  mode = 'live',
  excludePresetEntryId,
  prSetIds,
  showRestChip = true,
  onToggleExpanded,
  onPressRestChip,
  onPressMetricHeader,
  onPressOverflow,
  onCompleteActive,
  onUncomplete,
  onRecomplete,
  onCommitField,
  onDeleteSet,
  onLongPressSet,
  onAddSet,
  activeField,
  rpeEditable,
  eligibleForPrefill = false,
  onActivateSet,
  onDeactivateSet,
  onEditFieldChange,
}: ActiveWorkoutExerciseCardProps) {
  const readOnly = mode === 'view';
  const isEdit = mode === 'edit';
  const isLive = mode === 'live';
  const [textMuted, successColor, accentPrimary, textSecondary, prColor] = useCSSVariable([
    '--color-text-muted',
    '--color-icon-success',
    '--color-accent-primary',
    '--color-text-secondary',
    '--color-pr',
  ]) as [string, string, string, string, string];

  const name = exercise.exercise_snapshot?.name ?? 'Exercise';
  // "Last time" / "Best" only make sense while performing or planning — skip
  // the fetch in view mode (the hook gates on a null id). In live mode the
  // active session is excluded so today's sets don't pollute the baseline.
  const { data: stats } = useExerciseStats(
    readOnly ? null : exercise.exercise_id,
    isLive ? excludePresetEntryId : undefined,
  );
  const lastSet = stats?.lastSet ?? null;
  const bestSet = stats?.bestSet ?? null;

  // Capture the historical PR baseline once per exercise. The store no-ops
  // unless a live workout is active and the key is absent, so view/edit renders
  // can't clobber it and a re-resolved query is harmless.
  const capturePrBaseline = useActiveWorkoutStore((s) => s.capturePrBaseline);
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
  }, [isLive, stats, exercise.exercise_id, capturePrBaseline]);

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

  // Edit-only: seed the first still-empty set from "last time" once, when
  // stats arrive. Weight and reps fill independently — a null lastSet field
  // must not clobber a value the user already typed (a typed character makes
  // the mapped field non-null and skips that side).
  const didPrefillRef = useRef(false);
  const firstSet = exercise.sets[0];
  const firstSetId = firstSet != null ? String(firstSet.id) : null;
  const firstSetWeightEmpty = firstSet != null && firstSet.weight == null;
  const firstSetRepsEmpty = firstSet != null && firstSet.reps == null;
  useEffect(() => {
    if (!isEdit || didPrefillRef.current) return;
    if (!eligibleForPrefill || !lastSet || firstSetId == null) return;

    didPrefillRef.current = true;
    const patch: ActiveSetPatch = {};
    if (firstSetWeightEmpty && lastSet.weight != null) patch.weight = lastSet.weight;
    if (firstSetRepsEmpty && lastSet.reps != null) patch.reps = lastSet.reps;
    if (Object.keys(patch).length > 0) onCommitField?.(firstSetId, patch);
  }, [
    isEdit,
    eligibleForPrefill,
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

  const metricAnchorRef = useRef<View>(null);
  const openMetricMenu = () => {
    measureAnchoredMenuTrigger(metricAnchorRef.current, onPressMetricHeader);
  };

  const overflowAnchorRef = useRef<View>(null);
  const openOverflowMenu = () => {
    measureAnchoredMenuTrigger(overflowAnchorRef.current, (anchor) =>
      onPressOverflow?.(exercise.id, anchor),
    );
  };

  if (!expanded) {
    const volumeKg = getExerciseVolumeKg(exercise);
    // "planned" describes a live workout that hasn't reached the exercise yet;
    // historical/imported workouts (view mode) and form drafts (edit mode)
    // never show it.
    const subtitle =
      readOnly || isEdit || anyComplete
        ? `${exercise.sets.length} sets${volumeKg > 0 ? ` · ${formatVolume(volumeKg, weightUnit)}` : ''}`
        : `${exercise.sets.length} sets planned`;

    return (
      <Pressable
        onPress={() => onToggleExpanded(exercise.id)}
        accessibilityRole="button"
        accessibilityLabel={`Expand ${name}`}
        className="flex-row items-center gap-3 px-4 py-3.5 border-b border-border-subtle"
      >
        {isDone ? (
          <Icon name="checkmark" size={16} color={successColor} weight="bold" />
        ) : (
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: textMuted, opacity: 0.6 }}
          />
        )}
        <Text
          numberOfLines={1}
          className={`flex-1 text-base ${isDone ? 'text-text-secondary' : 'text-text-primary'}`}
        >
          {name}
        </Text>
        <Text className="text-sm text-text-muted" style={{ fontVariant: ['tabular-nums'] }}>
          {subtitle}
        </Text>
        <Icon name="chevron-forward" size={16} color={textMuted} />
      </Pressable>
    );
  }

  const workingSetNumbers = buildWorkingSetNumbers(exercise.sets);

  return (
    <View className="bg-surface rounded-2xl px-3 pt-3 pb-2 mb-2">
      <View className="flex-row items-center gap-3">
        <ExerciseThumb exercise={exercise} getImageSource={getImageSource} size={34} />
        <Text numberOfLines={1} className="flex-1 text-base font-semibold text-text-primary">
          {name}
        </Text>
        {!readOnly && (
          <View ref={overflowAnchorRef} collapsable={false}>
            <Pressable
              onPress={openOverflowMenu}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`More options for ${name}`}
              className="p-1"
            >
              <Icon name="ellipsis-horizontal" size={18} color={textMuted} />
            </Pressable>
          </View>
        )}
        <Pressable
          onPress={() => onToggleExpanded(exercise.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Collapse ${name}`}
          className="p-1"
        >
          <Animated.View style={chevronStyle}>
            <Icon name="chevron-down" size={18} color={textMuted} />
          </Animated.View>
        </Pressable>
      </View>

      {(showRestChip || lastSet != null || bestDisplay != null) && (
        // flex-wrap + gap-y so the rest chip, "Last time", and "Best" stack
        // gracefully on narrow screens instead of shifting off the edge.
        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mt-2 mb-1 px-1">
          {showRestChip && (
            <RestPeriodChip
              value={exercise.sets[0]?.rest_time}
              readOnly={readOnly}
              onPress={
                readOnly
                  ? undefined
                  : () => onPressRestChip?.(exercise.id, exercise.sets[0]?.rest_time ?? null)
              }
            />
          )}
          {lastSet && lastSet.weight != null && lastSet.reps != null && (
            <View className="flex-row items-baseline gap-1.5">
              <Text className="text-xs uppercase tracking-wide text-text-muted">Last time</Text>
              <Text
                className="text-sm text-text-secondary"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {parseFloat(weightFromKg(lastSet.weight, weightUnit).toFixed(1))} × {lastSet.reps}
              </Text>
            </View>
          )}
          {bestDisplay != null && (
            <View className="flex-row items-baseline gap-1.5">
              <Text className="text-xs uppercase tracking-wide text-text-muted">Best</Text>
              <Text
                className="text-sm"
                style={{
                  color: bestIsPr ? prColor : textSecondary,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {parseFloat(weightFromKg(bestDisplay.weight, weightUnit).toFixed(1))}
                {bestDisplay.reps != null ? ` × ${bestDisplay.reps}` : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {exercise.sets.length > 0 && (
        <View className="flex-row items-center px-3 py-1.5">
          <Text className="w-9 text-center text-xs font-semibold uppercase text-text-muted">
            Set
          </Text>
          <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
            {weightUnit === 'kg' ? 'KG' : 'LB'}
          </Text>
          <Text className="flex-1 text-center text-xs font-semibold uppercase text-text-muted">
            Reps
          </Text>
          <View ref={metricAnchorRef} collapsable={false} className="w-14 items-center">
            <Pressable
              onPress={openMetricMenu}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Change metric column"
              className="flex-row items-center gap-0.5"
            >
              <Text
                className="text-xs font-semibold uppercase"
                style={{ color: accentPrimary }}
              >
                {METRIC_COLUMN_LABELS[metricColumn]}
              </Text>
              <Icon name="chevron-down" size={10} color={accentPrimary} />
            </Pressable>
          </View>
          <View className="w-10" />
        </View>
      )}

      {exercise.sets.map((set, index) => {
        const setId = String(set.id);
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
          <ActiveWorkoutSetRow
            key={setId}
            set={set}
            displayNumber={workingSetNumbers[index]}
            state={state}
            metricColumn={metricColumn}
            weightUnit={weightUnit}
            mode={mode}
            onCompleteActive={onCompleteActive}
            onUncomplete={onUncomplete}
            onRecomplete={onRecomplete}
            onCommitField={onCommitField}
            onDelete={onDeleteSet}
            onLongPress={onLongPressSet}
            activeField={activeField}
            nextSetId={nextSet != null ? String(nextSet.id) : null}
            entryId={exercise.id}
            rpeEditable={rpeEditable}
            completedBadge={isEdit && !!completedSetIds[setId]}
            onActivateSet={onActivateSet}
            onDeactivate={onDeactivateSet}
            onEditFieldChange={onEditFieldChange}
            onAddSet={onAddSet}
          />
        );
      })}

      {!readOnly && (
        <Pressable
          onPress={() => onAddSet?.(exercise.id)}
          accessibilityRole="button"
          accessibilityLabel={`Add set to ${name}`}
          className="flex-row items-center justify-center gap-1.5 py-2.5 mt-1"
        >
          <Icon name="add" size={15} color={accentPrimary} />
          <Text className="text-sm font-medium" style={{ color: accentPrimary }}>
            Add set
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default React.memo(ActiveWorkoutExerciseCard);
