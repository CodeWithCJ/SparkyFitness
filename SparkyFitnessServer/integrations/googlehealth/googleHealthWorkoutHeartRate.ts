import {
  workoutClockWindow,
  type HeartRateSampleRequest,
  type WorkoutClockWindow,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import { getWorkoutEntriesWithoutHeartRate } from '../../models/workoutTelemetryRepository.js';
import exerciseEntryService from '../../services/exerciseEntryService.js';
import { fetchHeartRateSamples } from './googleHealthService.js';

/**
 * Fills in heart rate for workouts logged in SparkyFitness (the live tracker,
 * the web player or by hand) from the readings a Fitbit or other Google Health
 * tracker took during them (#3285). Trackers that cannot run SparkyFitness's
 * watch app still record heart rate all day, so after the tracker syncs, each
 * workout gets the same average and max heart rate, time in zone and heart
 * rate series a paired Apple Watch writes, through the same
 * attachWatchTelemetryToExerciseEntry path. Calories are left alone.
 */

const SOURCE = 'Google Health';

/**
 * How far past a workout's end readings are requested, to see whether the
 * tracker has uploaded through its end. A tracker syncs in batches, so
 * readings that stop before the end mean the rest has not arrived yet; the
 * next sync retries.
 */
const SETTLE_MS = 5 * 60_000;

/** Workouts this close together share one request. */
const MERGE_GAP_MS = 60 * 60_000;

interface TimedWorkout {
  id: string;
  window: WorkoutClockWindow;
}

/** `{t, bpm}` samples from Google Health `heart-rate` data points, oldest first. */
export function parseHeartRateSamples(data: {
  dataPoints?: Record<string, unknown>[];
}): HeartRateSampleRequest[] {
  const samples: HeartRateSampleRequest[] = [];
  for (const point of data.dataPoints ?? []) {
    const heartRate = point.heartRate as
      | { sampleTime?: { physicalTime?: unknown }; beatsPerMinute?: unknown }
      | undefined;
    const t = heartRate?.sampleTime?.physicalTime;
    const bpm = Number(heartRate?.beatsPerMinute);
    if (typeof t !== 'string' || !Number.isFinite(Date.parse(t))) continue;
    if (!Number.isFinite(bpm) || bpm <= 0) continue;
    samples.push({ t: new Date(t).toISOString(), bpm });
  }
  return samples.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/** Groups workout windows into the fewest spans to request readings for. */
export function mergeWindows(
  workouts: readonly TimedWorkout[]
): WorkoutClockWindow[] {
  const sorted = [...workouts]
    .map((workout) => workout.window)
    .sort((a, b) => a.startMs - b.startMs);
  const spans: WorkoutClockWindow[] = [];
  for (const window of sorted) {
    const last = spans[spans.length - 1];
    if (last && window.startMs - last.endMs <= MERGE_GAP_MS) {
      last.endMs = Math.max(last.endMs, window.endMs);
    } else {
      spans.push({ ...window });
    }
  }
  return spans;
}

/**
 * Attaches Google Health heart rate to the user's logged workouts between two
 * calendar days that have none yet. Returns how many workouts were filled in.
 */
export async function attachHeartRateToLoggedWorkouts(
  userId: string,
  startDate: string,
  endDate: string,
  timezone: string,
  accessToken: string,
  pauseMs = 1500,
  nowMs = Date.now()
): Promise<number> {
  const entries = await getWorkoutEntriesWithoutHeartRate(
    userId,
    startDate,
    endDate
  );
  const workouts: TimedWorkout[] = [];
  for (const entry of entries) {
    const window = workoutClockWindow(entry, timezone);
    if (window && window.endMs > window.startMs && window.endMs <= nowMs) {
      workouts.push({ id: entry.id, window });
    }
  }
  if (workouts.length === 0) return 0;

  let attached = 0;
  for (const span of mergeWindows(workouts)) {
    // Same spacing as the rest of the sync: Google Health has per-minute quotas.
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs));
    const samples = parseHeartRateSamples(
      await fetchHeartRateSamples(
        userId,
        new Date(span.startMs).toISOString(),
        new Date(span.endMs + SETTLE_MS).toISOString(),
        accessToken
      )
    );
    const last = samples[samples.length - 1];
    const syncedThroughMs = last ? Date.parse(last.t) : -Infinity;

    for (const workout of workouts) {
      const { startMs, endMs } = workout.window;
      if (startMs < span.startMs || endMs > span.endMs) continue;
      if (syncedThroughMs < endMs) continue;
      const during = samples.filter((sample) => {
        const ms = Date.parse(sample.t);
        return ms >= startMs && ms <= endMs;
      });
      // Time in zone comes from the gaps between readings, so one is not enough.
      if (during.length < 2) continue;
      try {
        await exerciseEntryService.attachWatchTelemetryToExerciseEntry(
          userId,
          userId,
          workout.id,
          during,
          undefined,
          undefined,
          undefined,
          undefined,
          SOURCE
        );
        attached += 1;
      } catch (error) {
        log(
          'warn',
          `[googleHealthWorkoutHeartRate] Could not attach heart rate to exercise entry ${workout.id}: ${(error as Error).message}`
        );
      }
    }
  }

  log(
    'info',
    `[googleHealthWorkoutHeartRate] Attached heart rate to ${attached} of ${workouts.length} logged workouts for user ${userId}.`
  );
  return attached;
}

export default { attachHeartRateToLoggedWorkouts };
