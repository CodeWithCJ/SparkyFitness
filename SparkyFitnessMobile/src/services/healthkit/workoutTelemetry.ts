import { queryQuantitySamples } from '@kingstinct/react-native-healthkit';
import { isPermanentlyUnavailableError } from '../shared/quotaError';
import { addLog } from '../LogService';
import {
  downsampleGpsPoints,
  downsampleHrSamples,
  downsampleSeries,
  mergeSeriesIntoGpsPoints,
  seriesMax,
  seriesMean,
  type SeriesPoint,
} from '../shared/telemetryDownsample';
import type {
  WorkoutGpsPoint,
  WorkoutHrSample,
  WorkoutLapWindow,
  WorkoutTelemetry,
} from '../../types/healthRecords';

/**
 * Per-workout telemetry collection from HealthKit.
 *
 * Everything here needs the live WorkoutProxy: `filter: { workout }` is a
 * predicate over the proxy object, not a uuid lookup, which is what lets us ask
 * for exactly the samples belonging to one workout instead of guessing from a
 * time window (as Android has to). The proxy must therefore be used inside the
 * closure that produced it, and must never be attached to a returned record —
 * it is a native hybrid object and will not serialize.
 */

/** Minimal surface of the library's WorkoutProxy that this module needs. */
export interface WorkoutProxyLike {
  getWorkoutRoutes(): Promise<readonly { locations?: readonly RouteLocation[] }[]>;
}

interface RouteLocation {
  date: Date | string | number;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
  course?: number;
  distance?: number;
  horizontalAccuracy?: number;
  verticalAccuracy?: number;
}

/** Key a series is merged onto trackpoints under. */
type SeriesKey = 'hr' | 'speed' | 'cad' | 'power' | 'gct' | 'vo' | 'stride';

interface SeriesSpec {
  identifier: string;
  /**
   * Unit pinned explicitly on every query. HealthKit otherwise returns values
   * in the user's preferred unit (miles, kJ), which would be stored as if they
   * were metric — see the same warning on getStatistic in ./index.ts.
   */
  unit: string;
  key: SeriesKey;
}

const SERIES_SPECS: readonly SeriesSpec[] = [
  { identifier: 'HKQuantityTypeIdentifierHeartRate', unit: 'count/min', key: 'hr' },
  { identifier: 'HKQuantityTypeIdentifierRunningSpeed', unit: 'm/s', key: 'speed' },
  { identifier: 'HKQuantityTypeIdentifierCyclingSpeed', unit: 'm/s', key: 'speed' },
  { identifier: 'HKQuantityTypeIdentifierRunningPower', unit: 'W', key: 'power' },
  { identifier: 'HKQuantityTypeIdentifierCyclingPower', unit: 'W', key: 'power' },
  { identifier: 'HKQuantityTypeIdentifierCyclingCadence', unit: 'count/min', key: 'cad' },
  {
    identifier: 'HKQuantityTypeIdentifierRunningGroundContactTime',
    unit: 'ms',
    key: 'gct',
  },
  {
    identifier: 'HKQuantityTypeIdentifierRunningVerticalOscillation',
    unit: 'cm',
    key: 'vo',
  },
  {
    identifier: 'HKQuantityTypeIdentifierRunningStrideLength',
    unit: 'm',
    key: 'stride',
  },
];

/** HKWorkoutEventType values that denote a split rather than a pause. */
const LAP_EVENT_TYPES = new Set([3 /* lap */, 7 /* segment */]);

const toIso = (value: Date | string | number): string | null => {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  return Number.isFinite(ms) ? date.toISOString() : null;
};

/**
 * CoreLocation reports -1 for speed and course when it has no valid reading.
 * Passing that through renders as a real measurement.
 */
const validOrNull = (value: number | undefined): number | null =>
  typeof value === 'number' && value >= 0 ? value : null;

const finiteOrNull = (value: number | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Reads the workout's GPS route.
 *
 * A workout may carry several route objects (the watch splits them on long
 * activities), so they are flattened and re-sorted rather than assumed ordered.
 */
export async function collectWorkoutRoute(
  workout: WorkoutProxyLike
): Promise<WorkoutGpsPoint[]> {
  let routes: readonly { locations?: readonly RouteLocation[] }[];
  try {
    routes = await workout.getWorkoutRoutes();
  } catch {
    // No route for this workout, or route access was not authorized. Expected
    // for indoor activities — not an error worth surfacing.
    return [];
  }

  const points: WorkoutGpsPoint[] = [];
  for (const route of routes ?? []) {
    for (const location of route?.locations ?? []) {
      const t = toIso(location.date);
      if (
        t === null ||
        !Number.isFinite(location.latitude) ||
        !Number.isFinite(location.longitude)
      ) {
        continue;
      }
      points.push({
        t,
        lat: location.latitude,
        lon: location.longitude,
        alt: finiteOrNull(location.altitude),
        speed: validOrNull(location.speed),
        course: validOrNull(location.course),
        dist: finiteOrNull(location.distance),
        hacc: finiteOrNull(location.horizontalAccuracy),
        vacc: finiteOrNull(location.verticalAccuracy),
      });
    }
  }

  return points.sort((a, b) => a.t.localeCompare(b.t));
}

/**
 * Reads every supported quantity series scoped to this workout.
 *
 * Each type is queried independently and failures are swallowed per type:
 * running power needs a recent watch, cycling cadence needs a paired sensor,
 * and an unauthorized type throws. Any of those is a normal absence, and one
 * missing series must not cost us the rest.
 */
export interface WorkoutSeriesResult {
  series: Partial<Record<SeriesKey, SeriesPoint[]>>;
  /**
   * A series read failed for a reason that may not repeat. The caller must not
   * record the workout as collected: a rejection is not the same answer as
   * "no samples", and the reuse cache has no expiry.
   */
  incomplete: boolean;
}

export async function collectWorkoutSeries(
  workout: WorkoutProxyLike
): Promise<WorkoutSeriesResult> {
  const collected: Partial<Record<SeriesKey, SeriesPoint[]>> = {};
  let incomplete = false;

  for (const spec of SERIES_SPECS) {
    try {
      const samples = await queryQuantitySamples(spec.identifier as never, {
        limit: 0,
        ascending: true,
        unit: spec.unit,
        filter: { workout: workout as never },
      } as never);

      if (!samples?.length) continue;

      const points: SeriesPoint[] = [];
      for (const sample of samples as readonly {
        startDate: Date | string;
        quantity: number;
      }[]) {
        const t = toIso(sample.startDate);
        if (t === null || !Number.isFinite(sample.quantity)) continue;
        points.push({ t, v: sample.quantity });
      }
      if (points.length === 0) continue;

      // Running and cycling variants share an output key; whichever the
      // activity actually produced is the one that arrives.
      collected[spec.key] = (collected[spec.key] ?? []).concat(points);
    } catch (error) {
      // An explicitly unsupported or unauthorized type is a stable answer and
      // stays absent. Anything else is a rejection, not an empty result, and
      // HealthKit returns [] rather than throwing when there are simply no
      // samples — so treat it as worth retrying.
      if (!isPermanentlyUnavailableError(error)) incomplete = true;
    }
  }

  for (const key of Object.keys(collected) as SeriesKey[]) {
    collected[key]?.sort((a, b) => a.t.localeCompare(b.t));
  }

  return { series: collected, incomplete };
}

/**
 * Converts lap/segment workout events into the wire's lap windows.
 *
 * Pause and resume events are excluded: they mark interruptions, not splits.
 * Only the windows are sent — the server derives each lap's statistics.
 */
export function collectWorkoutLaps(
  events: readonly { type: number; startDate: Date | string; endDate: Date | string }[]
    | undefined
): WorkoutLapWindow[] {
  if (!events?.length) return [];

  return events
    .filter((event) => LAP_EVENT_TYPES.has(event.type))
    .map((event) => ({
      start_time: toIso(event.startDate),
      end_time: toIso(event.endDate),
    }))
    .filter(
      (lap): lap is { start_time: string; end_time: string } =>
        lap.start_time !== null && lap.end_time !== null
    )
    // .lap events are often instantaneous markers (start == end) rather than
    // spans; the server derives lap stats from the window, and a zero-width
    // window contains no samples, so marker-style laps are dropped.
    .filter((lap) => lap.start_time !== lap.end_time)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((lap, index) => ({ ...lap, lap_index: index + 1 }));
}

/** Everything collected for one workout, already downsampled for upload. */
export interface WorkoutTelemetryBundle {
  gps_points?: WorkoutGpsPoint[];
  hr_samples?: WorkoutHrSample[];
  laps?: WorkoutLapWindow[];
  telemetry?: WorkoutTelemetry;
  /**
   * Set when collection failed rather than finding nothing. Callers must not
   * cache such a workout as collected: the reuse cache has no expiry, so a
   * transient failure recorded there is permanent. Mirrors
   * `SessionTelemetryBundle.incomplete` on the Health Connect side.
   */
  incomplete?: boolean;
}

/**
 * Summary values derived from the series.
 *
 * Only what the series can support: anything HealthKit exposes directly on the
 * workout (calories, elevation metadata) is filled in by the caller, which has
 * the sample in hand.
 */
function summarize(
  series: Partial<Record<SeriesKey, SeriesPoint[]>>
): WorkoutTelemetry {
  const telemetry: WorkoutTelemetry = {};
  const hr = series.hr ?? [];
  const speed = series.speed ?? [];
  const cadence = series.cad ?? [];
  const power = series.power ?? [];

  const round = (value: number | null, digits = 2): number | null =>
    value === null ? null : Number(value.toFixed(digits));

  const avgHr = seriesMean(hr);
  const maxHr = seriesMax(hr);
  if (avgHr !== null) telemetry.avg_heart_rate = Math.round(avgHr);
  if (maxHr !== null) telemetry.max_heart_rate = Math.round(maxHr);

  const avgSpeed = round(seriesMean(speed), 3);
  const maxSpeed = round(seriesMax(speed), 3);
  if (avgSpeed !== null) telemetry.avg_speed_mps = avgSpeed;
  if (maxSpeed !== null) telemetry.max_speed_mps = maxSpeed;

  const avgCadence = round(seriesMean(cadence), 1);
  const maxCadence = round(seriesMax(cadence), 1);
  if (avgCadence !== null) telemetry.avg_cadence = avgCadence;
  if (maxCadence !== null) telemetry.max_cadence = maxCadence;

  const avgPower = round(seriesMean(power), 1);
  const maxPower = round(seriesMax(power), 1);
  if (avgPower !== null) telemetry.avg_power_watts = avgPower;
  if (maxPower !== null) telemetry.max_power_watts = maxPower;

  const avgGct = round(seriesMean(series.gct ?? []), 1);
  if (avgGct !== null) telemetry.ground_contact_time_ms = avgGct;

  // Queried in centimetres, stored in millimetres.
  const avgVo = seriesMean(series.vo ?? []);
  if (avgVo !== null) telemetry.vertical_oscillation_mm = round(avgVo * 10, 1);

  // Queried in metres, stored in centimetres.
  const avgStride = seriesMean(series.stride ?? []);
  if (avgStride !== null) telemetry.stride_length_cm = round(avgStride * 100, 1);

  return telemetry;
}

/**
 * Collects, downsamples and packages one workout's telemetry.
 *
 * Returns an empty object when the workout has nothing beyond its summary, so
 * the caller can spread the result unconditionally and older-style records stay
 * byte-identical to what they were before telemetry existed.
 */
export async function collectWorkoutTelemetry(
  workout: WorkoutProxyLike,
  events?: readonly {
    type: number;
    startDate: Date | string;
    endDate: Date | string;
  }[]
): Promise<WorkoutTelemetryBundle> {
  try {
    const [route, seriesResult] = await Promise.all([
      // A route failure is deliberately NOT treated as incomplete: an empty
      // route is the expected, common result for every indoor workout, so
      // marking those incomplete would keep them out of the reuse cache
      // forever and churn the per-run budget on the same workouts (#2191).
      collectWorkoutRoute(workout),
      collectWorkoutSeries(workout),
    ]);
    const series = seriesResult.series;

    const bundle: WorkoutTelemetryBundle = {};

    // Summarise from the full-rate series, before downsampling loses the peaks.
    const telemetry = summarize(series);
    if (Object.keys(telemetry).length > 0) bundle.telemetry = telemetry;

    if (series.hr?.length) {
      bundle.hr_samples = downsampleHrSamples(
        series.hr.map((p) => ({ t: p.t, bpm: p.v }))
      );
    }

    if (route.length > 0) {
      const points = downsampleGpsPoints(route);
      bundle.gps_points = mergeSeriesIntoGpsPoints(points, {
        hr: series.hr ? downsampleSeries(series.hr) : undefined,
        speed: series.speed ? downsampleSeries(series.speed) : undefined,
        cad: series.cad ? downsampleSeries(series.cad) : undefined,
        power: series.power ? downsampleSeries(series.power) : undefined,
      });
    }

    const laps = collectWorkoutLaps(events);
    if (laps.length > 0) bundle.laps = laps;

    if (seriesResult.incomplete) bundle.incomplete = true;

    return bundle;
  } catch (error) {
    // Telemetry is additive; a failure here must not cost us the workout. The
    // workout is still returned unenriched — `incomplete` only keeps it out of
    // the reuse cache so the next sync tries again.
    addLog(
      `[healthkit] Failed to collect workout telemetry: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'WARNING'
    );
    return { incomplete: true };
  }
}
