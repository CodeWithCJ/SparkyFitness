import { queryQuantitySamples } from '@kingstinct/react-native-healthkit';
import { addLog } from '../LogService';
import { getErrorMessage } from '../../utils/errors';

/**
 * The 1 to 10 effort rating Apple Health keeps for a workout (set on the
 * watch after a workout, or in the Fitness app).
 *
 * It cannot be read with the per-workout `filter: { workout }` the rest of the
 * telemetry uses: that predicate matches samples saved *as part of* the
 * workout, while an effort rating is related to it afterwards. HealthKit stamps
 * a rating with the workout's own start and end, so it is read by time window
 * and matched back to the workout by those two instants.
 *
 * Only the person's own rating is read (`WorkoutEffortScore`), never Apple's
 * automatic estimate (`EstimatedWorkoutEffortScore`): an estimate on every
 * workout is not something they said.
 */
export const WORKOUT_EFFORT_IDENTIFIER =
  'HKQuantityTypeIdentifierWorkoutEffortScore';

/** How far a rating's start and end may sit from the workout's own. */
const MATCH_TOLERANCE_MS = 5000;

export interface WorkoutEffortSample {
  startMs: number;
  endMs: number;
  score: number;
}

/** Ratings saved between two instants, oldest first. Empty when unreadable. */
export async function readWorkoutEffortSamples(
  startDate: Date,
  endDate: Date
): Promise<WorkoutEffortSample[]> {
  try {
    const samples = await queryQuantitySamples(
      WORKOUT_EFFORT_IDENTIFIER as never,
      {
        limit: 0,
        ascending: true,
        unit: 'appleEffortScore',
        filter: { date: { startDate, endDate } },
      } as never
    );
    const out: WorkoutEffortSample[] = [];
    for (const sample of (samples ?? []) as readonly {
      startDate: Date | string;
      endDate: Date | string;
      quantity: number;
    }[]) {
      const startMs = new Date(sample.startDate).getTime();
      const endMs = new Date(sample.endDate).getTime();
      const score = Math.round(sample.quantity);
      if (
        Number.isFinite(startMs) &&
        Number.isFinite(endMs) &&
        score >= 1 &&
        score <= 10
      ) {
        out.push({ startMs, endMs, score });
      }
    }
    return out;
  } catch (error) {
    // Typically read access to the type was not granted (the rating is
    // optional) or this iOS predates it; the workout still syncs without it.
    addLog(
      `[HealthKitService] Could not read workout effort ratings: ${getErrorMessage(error)}`,
      'DEBUG'
    );
    return [];
  }
}

/**
 * The rating that belongs to a workout: the one whose start and end match its
 * own. When several do, the newest wins, as a rating changed in Fitness is
 * saved again.
 */
export function matchWorkoutEffort(
  samples: readonly WorkoutEffortSample[],
  workout: { startDate: Date | string; endDate: Date | string }
): number | null {
  const startMs = new Date(workout.startDate).getTime();
  const endMs = new Date(workout.endDate).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  let match: number | null = null;
  for (const sample of samples) {
    if (
      Math.abs(sample.startMs - startMs) <= MATCH_TOLERANCE_MS &&
      Math.abs(sample.endMs - endMs) <= MATCH_TOLERANCE_MS
    ) {
      match = sample.score;
    }
  }
  return match;
}
