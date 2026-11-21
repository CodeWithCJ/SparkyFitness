/**
 * Route, laps and heart-rate series of a ZeppBridge workout (`detail=full`).
 * Nothing here owns storage: the route and laps go through the same
 * `attachGpsTrackToExerciseEntry` / `attachLapsToExerciseEntry` the phone's own
 * recordings use, and the heart rate through `attachWatchTelemetryToExerciseEntry`
 * (which works out time in zone from the person's own heart rate settings).
 * All three replace by entry, so applying a workout twice stores it once.
 */
import type { AttachExerciseEntryGpsTrackRequest } from '@workspace/shared';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import { getGpsPointsForExerciseEntry } from '../../models/workoutTelemetryRepository.js';
import exerciseEntryService from '../../services/exerciseEntryService.js';
import {
  lapSchema,
  routePointSchema,
  workoutSampleSchema,
  type ZeppBridgeWorkout,
  type ZeppBridgeWorkoutSample,
} from './zeppBridgeTypes.js';

type TrackPoint = AttachExerciseEntryGpsTrackRequest['points'][number];

/** A sample counts for a route point when it is this close in time. */
const MAX_SAMPLE_GAP_MS = 5_000;
const MAX_TRACK_POINTS = 50_000;
const MIN_BPM = 30;
const MAX_BPM = 250;

export const ZEPPBRIDGE_SERIES_SOURCE = 'ZeppBridge';

export interface ZeppBridgeDetailCandidate {
  entryId: string;
  workoutId: string;
  /** The day ZeppBridge files the workout under (its own local day). */
  day: string;
}

interface Lap {
  lap_index: number;
  start_time: string;
  end_time: string;
  distance_meters?: number;
  avg_heart_rate?: number;
}

export interface ZeppBridgeWorkoutTrack {
  points: TrackPoint[];
  hrSamples: Array<{ t: string; bpm: number }>;
  laps: Lap[];
}

const isoOrNull = (value: string): string | null => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

const finite = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Points of a list that parse; a bad one is dropped, not fatal. */
function parseAll<T>(
  items: readonly unknown[] | null | undefined,
  parse: (item: unknown) => T | null
): T[] {
  return (items ?? []).flatMap((item) => {
    const parsed = parse(item);
    return parsed === null ? [] : [parsed];
  });
}

function parseSamples(workout: ZeppBridgeWorkout) {
  return parseAll(workout.samples, (item) => {
    const parsed = workoutSampleSchema.safeParse(item);
    const at = parsed.success ? isoOrNull(parsed.data.timestamp) : null;
    return parsed.success && at
      ? { ...parsed.data, at, ms: Date.parse(at) }
      : null;
  }).sort((a, b) => a.ms - b.ms);
}

/**
 * The route with each point's nearest reading (heart rate, cadence, power,
 * watch distance) merged in, the per-second heart rate series, and the laps
 * the watch marked. Speed is left out on purpose: the server derives it from
 * the coordinates, and ZeppBridge does not document its unit.
 */
export function buildWorkoutTrack(
  workout: ZeppBridgeWorkout
): ZeppBridgeWorkoutTrack {
  const samples = parseSamples(workout);

  const route = parseAll(workout.route, (item) => {
    const parsed = routePointSchema.safeParse(item);
    if (!parsed.success) return null;
    const { latitude, longitude } = parsed.data;
    const at = isoOrNull(parsed.data.timestamp);
    const valid =
      at !== null &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      // A fix of exactly 0,0 is "no fix", not a place.
      !(latitude === 0 && longitude === 0);
    return valid
      ? {
          at,
          ms: Date.parse(at),
          latitude,
          longitude,
          alt: parsed.data.altitude_m,
        }
      : null;
  }).sort((a, b) => a.ms - b.ms);

  // Thin an over-long route evenly rather than failing the workout.
  const stride = Math.max(1, Math.ceil(route.length / MAX_TRACK_POINTS));
  let next = 0;
  const points: TrackPoint[] = [];
  for (let i = 0; i < route.length; i += stride) {
    const point = route[i]!;
    // Samples are sorted, so the cursor only ever moves forward.
    while (
      next + 1 < samples.length &&
      Math.abs(samples[next + 1]!.ms - point.ms) <=
        Math.abs(samples[next]!.ms - point.ms)
    ) {
      next += 1;
    }
    const sample: (ZeppBridgeWorkoutSample & { ms: number }) | undefined =
      samples[next] &&
      Math.abs(samples[next]!.ms - point.ms) <= MAX_SAMPLE_GAP_MS
        ? samples[next]
        : undefined;
    const hr = finite(sample?.heart_rate);
    points.push({
      t: point.at,
      lat: point.latitude,
      lon: point.longitude,
      ...(finite(point.alt ?? sample?.altitude_m) !== undefined && {
        alt: finite(point.alt ?? sample?.altitude_m),
      }),
      ...(hr !== undefined &&
        hr >= MIN_BPM &&
        hr <= MAX_BPM && { hr: Math.round(hr) }),
      ...(finite(sample?.cadence) !== undefined && {
        cad: finite(sample?.cadence),
      }),
      ...(finite(sample?.power_watts) !== undefined && {
        power: finite(sample?.power_watts),
      }),
      ...(finite(sample?.distance_m) !== undefined && {
        dist: finite(sample?.distance_m),
      }),
    });
  }

  const hrSamples = samples.flatMap((sample) => {
    const bpm = finite(sample.heart_rate);
    return bpm !== undefined && bpm >= MIN_BPM && bpm <= MAX_BPM
      ? [{ t: sample.at, bpm: Math.round(bpm) }]
      : [];
  });

  const laps = parseAll(workout.laps, (item) => {
    const parsed = lapSchema.safeParse(item);
    if (!parsed.success) return null;
    const start = isoOrNull(parsed.data.start_time);
    const end = isoOrNull(parsed.data.end_time);
    if (!start || !end || Date.parse(end) <= Date.parse(start)) return null;
    return { start, end, lap: parsed.data };
  })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .map(({ start, end, lap }, index): Lap => {
      const distance = finite(lap.distance_m);
      const avgHr = finite(lap.avg_hr);
      return {
        lap_index: index + 1,
        start_time: start,
        end_time: end,
        ...(distance !== undefined &&
          distance >= 0 && { distance_meters: distance }),
        ...(avgHr !== undefined &&
          avgHr > 0 &&
          avgHr <= 300 && { avg_heart_rate: avgHr }),
      };
    });

  return { points, hrSamples, laps };
}

/**
 * Whether the summary pass left this workout without its route or heart rate
 * series, so a sync fetches the detail only once and not on every run. A
 * workout with neither a route nor samples never needs it.
 */
export async function needsWorkoutDetail(
  userId: string,
  entryId: string,
  workout: ZeppBridgeWorkout
): Promise<boolean> {
  const hasRoute = (workout.route_point_count ?? 0) >= 2;
  // Only the heart rate of the series is stored, so a workout whose summary has
  // no heart rate at all is not fetched again on every sync.
  const hasHeartRate = [workout.avg_hr, workout.max_hr, workout.min_hr].some(
    (bpm) => typeof bpm === 'number'
  );
  const hasSamples = (workout.sample_count ?? 0) > 0 && hasHeartRate;
  if (!hasRoute && !hasSamples) return false;
  if (hasRoute && !(await getGpsPointsForExerciseEntry(entryId, userId))) {
    return true;
  }
  if (hasSamples) {
    const entry = (await exerciseEntryRepository.getExerciseEntryById(
      entryId,
      userId
    )) as { watch_telemetry_observed_at?: unknown } | null;
    // Set when a heart rate series was attached.
    if (!entry?.watch_telemetry_observed_at) return true;
  }
  return false;
}

export interface AppliedWorkoutDetail {
  route: boolean;
  heartRate: boolean;
}

/** Stores a workout's route, laps and heart rate series on its entry. */
export async function applyWorkoutDetail(
  userId: string,
  createdByUserId: string,
  entryId: string,
  workout: ZeppBridgeWorkout
): Promise<AppliedWorkoutDetail> {
  const track = buildWorkoutTrack(workout);
  const applied: AppliedWorkoutDetail = { route: false, heartRate: false };

  if (track.points.length >= 2) {
    // The server derives each lap's distance, pace and elevation from the points.
    await exerciseEntryService.attachGpsTrackToExerciseEntry(
      userId,
      createdByUserId,
      entryId,
      {
        points: track.points,
        ...(track.laps.length > 0 && {
          laps: track.laps.map(({ lap_index, start_time, end_time }) => ({
            lap_index,
            start_time,
            end_time,
          })),
        }),
      }
    );
    applied.route = true;
  } else if (track.laps.length > 0) {
    // No route (an indoor session): the laps with the distance the watch gave.
    await exerciseEntryService.attachLapsToExerciseEntry(
      userId,
      createdByUserId,
      entryId,
      { laps: track.laps }
    );
  }

  if (track.hrSamples.length > 0) {
    await exerciseEntryService.attachWatchTelemetryToExerciseEntry(
      userId,
      createdByUserId,
      entryId,
      track.hrSamples,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ZEPPBRIDGE_SERIES_SOURCE
    );
    applied.heartRate = true;
  }
  return applied;
}
