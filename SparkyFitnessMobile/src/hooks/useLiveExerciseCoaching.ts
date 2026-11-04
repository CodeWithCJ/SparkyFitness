import { useEffect, useMemo } from 'react';
import {
  NO_ADAPTIVE_ADJUSTMENT,
  isBodyweightModality,
  shouldSuggestVariation,
  type ExerciseRecentSessionSet,
  type ExerciseStatsResponse,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import type { PrSetMap } from '../stores/activeWorkoutStore';
import { weightFromKg } from '../utils/unitConversions';
import {
  compareSetRecords,
  evaluateExerciseProgression,
  liveAdaptiveAdjustment,
  resolveLiveAssumedSetValues,
  resolveSnapshotModality,
  type LiveExerciseConfig,
  type WorkoutCardExercise,
} from '../utils/workoutSession';

/**
 * The live-workout coaching state of one exercise (progression, adaptive
 * suggestion, assumed set values, PR-aware best set), shared by the list's
 * exercise card and the focus view so both explain and prefill identically.
 * Every hook takes `enabled` (the card's `isLive`) and idles otherwise.
 */

/** Between-session progression result against last time's sets. */
export function useLiveProgression(
  exercise: WorkoutCardExercise,
  previousSessionSets: readonly ExerciseRecentSessionSet[] | undefined,
  weightUnit: 'kg' | 'lbs',
  enabled: boolean
) {
  // Live sessions carry no progression/ramp settings on the server entry;
  // they come from the preset, captured into the store at live start.
  const liveConfig = useActiveWorkoutStore((s) =>
    enabled ? s.exerciseConfigs[String(exercise.id)] : undefined
  );
  return useMemo(() => {
    const config: LiveExerciseConfig = enabled ? (liveConfig ?? {}) : exercise;
    return evaluateExerciseProgression(
      config,
      exercise.sets,
      previousSessionSets,
      weightUnit
    );
  }, [enabled, liveConfig, exercise, previousSessionSets, weightUnit]);
}

/** Adaptive coaching (#1560) for this exercise, from the store's signals. */
export function useLiveAdaptive(
  exercise: WorkoutCardExercise,
  enabled: boolean
) {
  const coachingSignals = useActiveWorkoutStore((s) => s.coachingSignals);
  const declinedAdaptive = useActiveWorkoutStore((s) => s.declinedAdaptive);
  const workoutFormat = useActiveWorkoutStore((s) => s.workoutFormat);
  const adaptiveDeclined = declinedAdaptive[String(exercise.id)] === true;
  const adaptiveAdjustment = useMemo(
    () =>
      enabled
        ? liveAdaptiveAdjustment(exercise, { coachingSignals, workoutFormat })
        : NO_ADAPTIVE_ADJUSTMENT,
    [enabled, exercise, coachingSignals, workoutFormat]
  );
  const suggestVariation =
    enabled &&
    (workoutFormat ?? 'standard') === 'standard' &&
    exercise.exercise_id != null &&
    shouldSuggestVariation(
      coachingSignals[exercise.exercise_id],
      exercise.exercise_snapshot?.mechanic
    );
  // Feedback that cancelled or changed the increase the progression banner
  // describes replaces that banner.
  const adaptiveOverridesProgression =
    !adaptiveDeclined &&
    (adaptiveAdjustment.blockIncrease || adaptiveAdjustment.addIncrement);
  return {
    adaptiveAdjustment,
    adaptiveDeclined,
    suggestVariation,
    adaptiveOverridesProgression,
  };
}

/**
 * Assumed (placeholder) weight/reps per row. Resolved from the same sources
 * completion adoption uses in the store, so the gray value a row shows is
 * exactly what logging it would record.
 */
export function useLiveAssumedSetValues(
  exercise: WorkoutCardExercise,
  previousSessionSets: readonly ExerciseRecentSessionSet[] | undefined,
  weightUnit: 'kg' | 'lbs',
  enabled: boolean
) {
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);
  const exerciseConfigs = useActiveWorkoutStore((s) => s.exerciseConfigs);
  const coachingSignals = useActiveWorkoutStore((s) => s.coachingSignals);
  const declinedAdaptive = useActiveWorkoutStore((s) => s.declinedAdaptive);
  const workoutFormat = useActiveWorkoutStore((s) => s.workoutFormat);
  return useMemo(
    () =>
      enabled
        ? resolveLiveAssumedSetValues(exercise, previousSessionSets, {
            plannedSetValues,
            exerciseConfigs,
            weightUnit,
            workoutFormat,
            coachingSignals,
            declinedAdaptive,
          })
        : null,
    [
      enabled,
      exercise,
      previousSessionSets,
      plannedSetValues,
      exerciseConfigs,
      weightUnit,
      workoutFormat,
      coachingSignals,
      declinedAdaptive,
    ]
  );
}

/**
 * Capture the historical PR baseline and last session's sets once per
 * exercise. The store no-ops unless a live workout is active and the key is
 * absent, so a re-resolved query is harmless.
 */
export function useCaptureLiveHistory(
  exerciseId: string | null,
  stats: ExerciseStatsResponse | null | undefined,
  historyScopeSettled: boolean,
  enabled: boolean
) {
  const capturePrBaseline = useActiveWorkoutStore((s) => s.capturePrBaseline);
  const capturePreviousSessionSets = useActiveWorkoutStore(
    (s) => s.capturePreviousSessionSets
  );
  useEffect(() => {
    // Wait for the query to resolve (data is null/undefined while loading). A
    // resolved stats object with a null `bestSet` still captures — that's the
    // "no history" baseline.
    if (!enabled || stats == null || !historyScopeSettled) return;
    capturePrBaseline(
      exerciseId,
      stats.bestSet
        ? { weight: stats.bestSet.weight, reps: stats.bestSet.reps }
        : null
    );
    // The store-side copy placeholder adoption resolves against on complete —
    // captured from the same query the PREVIOUS column renders, so a
    // lock-screen complete adopts exactly what the row shows.
    capturePreviousSessionSets(
      exerciseId,
      stats.recentSessions?.[0]?.sets ?? []
    );
  }, [
    enabled,
    stats,
    historyScopeSettled,
    exerciseId,
    capturePrBaseline,
    capturePreviousSessionSets,
  ]);
}

/** Added weight a set is ranked on. An unweighted bodyweight set is +0. */
function rankedAddedWeight(
  weight: number | null | undefined,
  bodyweight: boolean
): number | null {
  if (weight != null) return weight;
  return bodyweight ? 0 : null;
}

/**
 * The best set to show on the "Best" line: the historical best, or — once a
 * set this session earns a PR — the better of that and the stamped session
 * set. The server number stays historical (the stats query excludes this
 * session), so the stamped set is what surfaces the new record.
 */
export function useExerciseBest(
  exercise: WorkoutCardExercise,
  bestSet: ExerciseStatsResponse['bestSet'] | null,
  prSetIds: PrSetMap | undefined,
  weightUnit: 'kg' | 'lbs',
  enabled: boolean
) {
  const modality = resolveSnapshotModality(exercise.exercise_snapshot);
  const stampedBest = useMemo(() => {
    if (!enabled || !prSetIds) return null;
    const bodyweight = isBodyweightModality(modality);
    let best: { weight: number; reps: number | null } | null = null;
    for (const s of exercise.sets) {
      if (prSetIds[String(s.id)] !== true) continue;
      const weight = rankedAddedWeight(s.weight, bodyweight);
      if (weight == null) continue;
      const contender = { weight, reps: s.reps };
      if (best == null || compareSetRecords(contender, best) > 0)
        best = contender;
    }
    return best;
  }, [enabled, prSetIds, exercise.sets, modality]);

  const historicalWeight =
    bestSet == null
      ? null
      : rankedAddedWeight(bestSet.weight, isBodyweightModality(modality));
  const historicalBest =
    historicalWeight == null || bestSet == null
      ? null
      : { weight: historicalWeight, reps: bestSet.reps };
  const bestDisplay =
    historicalBest != null
      ? stampedBest != null &&
        compareSetRecords(stampedBest, historicalBest) > 0
        ? stampedBest
        : historicalBest
      : null;
  const bestIsPr = stampedBest != null && bestDisplay === stampedBest;
  const bestText =
    bestDisplay != null
      ? `${formatLocalizedNumber(weightFromKg(bestDisplay.weight, weightUnit), { maximumFractionDigits: 1 })}${
          bestDisplay.reps != null ? ` × ${bestDisplay.reps}` : ''
        }`
      : null;
  return { bestDisplay, bestIsPr, bestText };
}
