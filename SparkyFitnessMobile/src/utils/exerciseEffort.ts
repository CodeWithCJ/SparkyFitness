import {
  effortAdjustedOneRepMaxKg,
  epleyOneRepMaxKg,
  type ExerciseSessionResponse,
} from '@workspace/shared';
import { isWarmupSetType } from './workoutSession';

/** How many of the most recent sessions with an RPE the trend shows. */
export const EFFORT_TREND_SESSIONS = 10;

export interface EffortTrendPoint {
  /** The session it came from, qualified by type, so a list can key on it. */
  id: string;
  date: string;
  /** Average RPE of the session's working sets that have one. */
  avgRpe: number;
}

export interface EffortOneRepMax {
  /** Best Epley estimate over the sets that have an RPE, ignoring the RPE. */
  plainKg: number;
  /** The same sets, counting the reps their RPE says were left. */
  effortKg: number;
}

export interface ExerciseEffortSummary {
  /** Oldest first, at most `EFFORT_TREND_SESSIONS`. */
  trend: EffortTrendPoint[];
  /** Null when no working set with a weight, reps and RPE has been logged. */
  oneRepMax: EffortOneRepMax | null;
}

/**
 * The effort side of an exercise's history: average RPE per session, and the
 * best 1RM estimate with and without counting the reps left. `sessions` is the
 * history endpoint's output; a preset session carries every exercise it held,
 * so only `exerciseId`'s entries are read. Warm-ups never count. The 1RM is
 * only worked out for `includeOneRepMax` (a plain weight × reps lift): a
 * bodyweight set's load is not its weight.
 */
export function buildExerciseEffortSummary(
  sessions: readonly ExerciseSessionResponse[],
  exerciseId: string,
  includeOneRepMax: boolean
): ExerciseEffortSummary {
  // `order` is the position in the history, which lists same-day sessions
  // newest first; `completedAt` is the earliest set completion time of the
  // exercise in the session, when its sets carry one.
  const points: (EffortTrendPoint & {
    order: number;
    completedAt: number | null;
  })[] = [];
  let plainKg = 0;
  let effortKg = 0;

  for (const [order, session] of sessions.entries()) {
    const entries =
      session.type === 'preset'
        ? session.exercises.filter((entry) => entry.exercise_id === exerciseId)
        : [session];
    let rpeSum = 0;
    let rpeCount = 0;
    let completedAt: number | null = null;
    for (const entry of entries) {
      for (const set of entry.sets) {
        const completed = set.completed_at ? Date.parse(set.completed_at) : NaN;
        if (Number.isFinite(completed)) {
          completedAt =
            completedAt === null ? completed : Math.min(completedAt, completed);
        }
        if (isWarmupSetType(set.set_type)) continue;
        if (set.rpe == null || !Number.isFinite(set.rpe)) continue;
        rpeSum += set.rpe;
        rpeCount++;
        if (includeOneRepMax) {
          plainKg = Math.max(plainKg, epleyOneRepMaxKg(set.weight, set.reps));
          effortKg = Math.max(
            effortKg,
            effortAdjustedOneRepMaxKg(set.weight, set.reps, set.rpe)
          );
        }
      }
    }
    if (rpeCount > 0 && session.entry_date) {
      points.push({
        id: `${session.type}:${session.id}`,
        date: session.entry_date,
        avgRpe: rpeSum / rpeCount,
        order,
        completedAt,
      });
    }
  }

  // Oldest first. A day is ordered by completion time only when every session
  // on it has one; if any lacks it, the whole day follows the history order
  // (newest first, so the later entry is the older session). Mixing the two
  // rules inside one day would not be a consistent ordering.
  const untimedDays = new Set(
    points.filter((point) => point.completedAt === null).map((p) => p.date)
  );
  points.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (
      !untimedDays.has(a.date) &&
      a.completedAt !== null &&
      b.completedAt !== null &&
      a.completedAt !== b.completedAt
    ) {
      return a.completedAt - b.completedAt;
    }
    return b.order - a.order;
  });
  return {
    trend: points
      .slice(-EFFORT_TREND_SESSIONS)
      .map(({ id, date, avgRpe }) => ({ id, date, avgRpe })),
    oneRepMax: effortKg > 0 ? { plainKg, effortKg } : null,
  };
}
