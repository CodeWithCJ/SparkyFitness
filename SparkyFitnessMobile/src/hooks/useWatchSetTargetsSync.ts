import { useEffect } from 'react';
import type { PresetSessionResponse } from '@workspace/shared';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import WatchConnectivity, {
  type WatchSetTargetPayload,
} from '../../modules/watch-connectivity';
import {
  effectiveSetDurationSec,
  historyForExercise,
  isDurationModality,
  isWeightDistanceModality,
  isWeightDurationModality,
  resolveLiveAssumedSetValues,
  resolveSnapshotModality,
} from '../utils/workoutSession';

type ActiveWorkoutState = ReturnType<typeof useActiveWorkoutStore.getState>;

/** The store fields a set's target resolves from. */
type TargetSources = Pick<
  ActiveWorkoutState,
  | 'previousSessionSets'
  | 'plannedSetValues'
  | 'exerciseConfigs'
  | 'coachingSignals'
  | 'declinedAdaptive'
  | 'weightUnit'
  | 'workoutFormat'
>;

/**
 * Weight/reps the watch should show for every set: what was entered on the
 * phone, else the value the phone's own row shows in gray — the preset's
 * planned value with the progression bump, ramp and adaptive adjustment
 * applied. Keyed by set id.
 */
export function resolveWatchSetTargets(
  session: PresetSessionResponse,
  sources: TargetSources
): Map<
  string,
  {
    weightKg: number | null;
    reps: number | null;
    durationSec: number | null;
    previousDurationSec: number | null;
    /** A carry's distance in km; null on every other exercise. */
    distanceKm: number | null;
  }
> {
  const targets = new Map<
    string,
    {
      weightKg: number | null;
      reps: number | null;
      durationSec: number | null;
      previousDurationSec: number | null;
      distanceKm: number | null;
    }
  >();
  for (const exercise of session.exercises) {
    const modality = resolveSnapshotModality(exercise.exercise_snapshot);
    // A loaded hold keeps its weight but is timed like any hold; a carry has
    // weight and distance and no reps.
    const durationLike =
      isDurationModality(modality) || isWeightDurationModality(modality);
    const carry = isWeightDistanceModality(modality);
    const assumed = resolveLiveAssumedSetValues(
      exercise,
      historyForExercise(sources.previousSessionSets, exercise.exercise_id),
      sources
    );
    exercise.sets.forEach((set, index) => {
      const assumedSet = assumed[index];
      const ownDuration = durationLike
        ? effectiveSetDurationSec(
            {
              duration: set.duration ?? null,
              reps: set.reps ?? null,
            },
            modality
          )
        : null;
      // Only a length typed on the phone makes the watch count down. The gray
      // value from last time is a hint, not a target: the phone runs a
      // stopwatch from zero for it, so the watch must too.
      const durationSec =
        ownDuration != null && ownDuration > 0 ? ownDuration : null;
      // Last time's length, shown in gray on the idle stopwatch like the
      // phone's gray value. Only when no length was typed for this set.
      const previousDurationSec =
        durationSec == null &&
        durationLike &&
        assumedSet?.duration != null &&
        assumedSet.duration > 0
          ? assumedSet.duration
          : null;
      targets.set(String(set.id), {
        weightKg: set.weight ?? assumedSet?.weight ?? null,
        // A duration set's legacy seconds live in `reps`. Sending those as
        // reps would put "45 REPS" next to a 0:45 countdown.
        reps:
          durationLike || carry ? null : (set.reps ?? assumedSet?.reps ?? null),
        durationSec,
        previousDurationSec,
        distanceKm: carry
          ? (set.distance ?? assumedSet?.distance ?? null)
          : null,
      });
    });
  }
  return targets;
}

/**
 * Keeps a paired watch's set targets, completions and rest in step with the
 * phone, including a rest changed after it started (+15s, pause, Skip).
 * The plan the watch is armed with is built at live start, before each
 * exercise's history has loaded, so it only carries the preset's planned
 * values — without this a progression bump shown on the phone never reaches
 * the wrist, and a set logged on the phone stays open on the watch. Each
 * change sends the full target list and completed set ids; the watch keeps
 * the newest revision and still prefers anything the wearer typed there.
 */
export function useWatchSetTargetsSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !WatchConnectivity?.isSupported()) return;
    const watch = WatchConnectivity;
    let lastSent: { sessionId: string; key: string } | null = null;
    let lastRevision = 0;

    const sync = (state: ActiveWorkoutState): void => {
      const { session, watchArmedAt } = state;
      if (session == null || session.type !== 'preset') return;
      // Nothing until this session has been armed on the watch: an update
      // queued ahead of its `workoutStart` has no plan to land on.
      if (watchArmedAt == null) return;
      const targets: WatchSetTargetPayload[] = [];
      for (const [setId, value] of resolveWatchSetTargets(session, state)) {
        targets.push({
          setId,
          ...(value.weightKg != null ? { targetWeightKg: value.weightKg } : {}),
          ...(value.reps != null ? { targetReps: value.reps } : {}),
          ...(value.durationSec != null
            ? { targetDurationSec: value.durationSec }
            : {}),
          ...(value.previousDurationSec != null
            ? { previousDurationSec: value.previousDurationSec }
            : {}),
          ...(value.distanceKm != null
            ? { targetDistanceKm: value.distanceKm }
            : {}),
        });
      }
      const completedSetIds = Object.keys(state.completedSetIds).sort();
      // The newest timer running for a set not yet logged, so the watch can
      // show the same clock. The watch shows one set at a time and holds one
      // timer, so older ones are not sent: a second would replace the first
      // there.
      const setTimers: Record<string, number> = {};
      let newest: [string, number] | null = null;
      for (const setId of Object.keys(state.setTimerStartedAt).sort()) {
        const startedAt = state.setTimerStartedAt[setId];
        if (state.completedSetIds[setId] != null) continue;
        if (newest == null || startedAt > newest[1])
          newest = [setId, startedAt];
      }
      if (newest != null) setTimers[newest[0]] = newest[1];
      // Only PRs among the logged sets: a PR flag outlives an un-log.
      const prSetIds = Object.keys(state.prSetIds)
        .filter((id) => state.completedSetIds[id] != null)
        .sort();
      const rest =
        state.rest.state === 'resting' && state.rest.endsAt != null
          ? {
              restState: 'resting' as const,
              restEndsAt: state.rest.endsAt,
              restDurationSeconds: state.rest.durationSec,
            }
          : {
              restState:
                state.rest.state === 'paused'
                  ? ('paused' as const)
                  : ('ready' as const),
            };
      const key = JSON.stringify([
        watchArmedAt,
        targets,
        completedSetIds,
        setTimers,
        prSetIds,
        rest,
      ]);
      if (lastSent?.sessionId === session.id && lastSent.key === key) return;
      lastSent = { sessionId: session.id, key };
      // Wall-clock based so a JS restart cannot send a revision the watch
      // already has; bumped past the last one for sends in the same ms.
      lastRevision = Math.max(lastRevision + 1, Date.now());
      void watch.updateSetTargets({
        sessionId: session.id,
        armedAt: watchArmedAt,
        revision: lastRevision,
        targets,
        completedSetIds,
        setTimers,
        prSetIds,
        ...rest,
      });
    };

    sync(useActiveWorkoutStore.getState());
    return useActiveWorkoutStore.subscribe((state, prev) => {
      if (
        state.session === prev.session &&
        state.completedSetIds === prev.completedSetIds &&
        state.setTimerStartedAt === prev.setTimerStartedAt &&
        state.prSetIds === prev.prSetIds &&
        state.watchArmedAt === prev.watchArmedAt &&
        state.rest === prev.rest &&
        state.previousSessionSets === prev.previousSessionSets &&
        state.plannedSetValues === prev.plannedSetValues &&
        state.exerciseConfigs === prev.exerciseConfigs &&
        state.coachingSignals === prev.coachingSignals &&
        state.declinedAdaptive === prev.declinedAdaptive &&
        state.weightUnit === prev.weightUnit &&
        state.workoutFormat === prev.workoutFormat
      ) {
        return;
      }
      sync(state);
    });
  }, [enabled]);
}
