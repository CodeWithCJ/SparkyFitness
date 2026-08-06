import { readRecords, requestExerciseRoute } from 'react-native-health-connect';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
 * Per-workout telemetry collection from Health Connect.
 *
 * Health Connect has no per-session sample scoping (unlike HealthKit's workout
 * predicate), so each series is read over the session's time window and
 * correlated here.
 */

/** AsyncStorage prefix for remembered per-session route consent decisions. */
const ROUTE_CONSENT_PREFIX = '@SparkyFitness/routeConsent:';

/**
 * Ceiling on samples we will accept from an unfiltered fallback read, as a
 * multiple of one sample per second. Anything denser than this is another app's
 * data overlapping the window rather than this session's.
 */
const FALLBACK_DENSITY_LIMIT = 2;

type RouteConsent = 'granted' | 'denied';

interface StoredRouteConsent {
  value: RouteConsent;
  storedAtMs: number;
}

/**
 * How long a 'denied' decision is trusted before we re-prompt. requestExerciseRoute
 * throws the same way for a real user refusal and for a transient failure (Health
 * Connect briefly unavailable, client disconnected) — there is no error code that
 * tells them apart — so a permanent 'denied' would mean a session hit by a
 * transient error never gets a route again, ever. 24h is long enough that the 6h
 * overlap re-sync window never re-prompts for the same session, but short enough
 * that a transient failure heals itself within a day or two of syncs.
 */
const DENIAL_EXPIRY_MS = 24 * 60 * 60 * 1000;

const consentKey = (recordId: string): string =>
  `${ROUTE_CONSENT_PREFIX}${recordId}`;

export const getRouteConsent = async (
  recordId: string
): Promise<RouteConsent | null> => {
  try {
    const raw = await AsyncStorage.getItem(consentKey(recordId));
    if (!raw) return null;
    // Older stored values were the bare string 'granted'/'denied', not JSON —
    // JSON.parse throws on those, which falls through to the catch below and
    // is treated as "no decision yet", i.e. a one-time re-prompt during
    // migration to the timestamped format.
    const parsed = JSON.parse(raw) as Partial<StoredRouteConsent>;
    if (parsed.value !== 'granted' && parsed.value !== 'denied') return null;
    if (
      parsed.value === 'denied' &&
      typeof parsed.storedAtMs === 'number' &&
      Date.now() - parsed.storedAtMs > DENIAL_EXPIRY_MS
    ) {
      return null; // expired — treat as undecided so it gets re-prompted
    }
    return parsed.value;
  } catch {
    return null;
  }
};

export const setRouteConsent = async (
  recordId: string,
  consent: RouteConsent
): Promise<void> => {
  try {
    const stored: StoredRouteConsent = { value: consent, storedAtMs: Date.now() };
    await AsyncStorage.setItem(consentKey(recordId), JSON.stringify(stored));
  } catch {
    // A failed write only costs us a repeat prompt; never block the sync.
  }
};

/** Route result as it actually arrives over the bridge. */
interface HcExerciseRoute {
  type?: unknown;
  route?: readonly HcLocation[];
}

interface HcLocation {
  time: string;
  latitude: number;
  longitude: number;
  altitude?: { inMeters?: number } | number;
  horizontalAccuracy?: { inMeters?: number } | number;
  verticalAccuracy?: { inMeters?: number } | number;
}

/**
 * Whether the route needs an explicit per-session consent prompt.
 *
 * The native module writes this field as a STRING ("CONSENT_REQUIRED"), but the
 * library shipped a numeric enum declaring the same member as 2 — so comparing
 * against the enum never matched and routes were silently never requested.
 * `patches/react-native-health-connect@3.5.3.patch` makes that enum
 * string-valued, which fixes the mismatch (and upstream's own documented
 * example) without changing runtime behaviour.
 *
 * The numeric form is still accepted so this keeps working if the patch is ever
 * dropped during an upgrade — a silent regression here means no GPS at all.
 */
export function routeNeedsConsent(route: HcExerciseRoute | undefined): boolean {
  const type = route?.type;
  return type === 'CONSENT_REQUIRED' || type === 2;
}

/** Whether the route already carries usable points. */
function routeHasData(route: HcExerciseRoute | undefined): boolean {
  return Array.isArray(route?.route) && route.route.length > 0;
}

const metersOf = (
  value: { inMeters?: number } | number | undefined
): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const meters = value?.inMeters;
  return typeof meters === 'number' && Number.isFinite(meters) ? meters : null;
};

/**
 * Reads the session's GPS route, prompting for consent when needed.
 *
 * `interactive` must be false on any background path: requestExerciseRoute
 * presents a system dialog, which cannot be shown from a headless task and
 * will fail or hang there. Skipped sessions get their route on a later
 * foreground sync instead.
 */
export async function collectSessionRoute(
  session: Record<string, unknown>,
  interactive: boolean
): Promise<WorkoutGpsPoint[]> {
  let route = session.exerciseRoute as HcExerciseRoute | undefined;
  const recordId = (session.metadata as { id?: string } | undefined)?.id;

  if (!routeHasData(route) && routeNeedsConsent(route) && interactive && recordId) {
    const remembered = await getRouteConsent(recordId);
    if (remembered === 'denied') return [];
    try {
      route = (await requestExerciseRoute(recordId)) as HcExerciseRoute;
      await setRouteConsent(recordId, 'granted');
    } catch {
      // The user declined, or the record has no route. Remember either way so
      // the 6h overlap re-sync does not prompt for the same session again.
      await setRouteConsent(recordId, 'denied');
      return [];
    }
  }

  if (!routeHasData(route)) return [];

  const points: WorkoutGpsPoint[] = [];
  for (const location of route?.route ?? []) {
    const ms = Date.parse(location.time);
    if (
      !Number.isFinite(ms) ||
      !Number.isFinite(location.latitude) ||
      !Number.isFinite(location.longitude)
    ) {
      continue;
    }
    points.push({
      t: new Date(ms).toISOString(),
      lat: location.latitude,
      lon: location.longitude,
      alt: metersOf(location.altitude),
      hacc: metersOf(location.horizontalAccuracy),
      vacc: metersOf(location.verticalAccuracy),
    });
  }

  return points.sort((a, b) => a.t.localeCompare(b.t));
}

interface WindowRead {
  startTime: string;
  endTime: string;
  dataOrigin?: string;
  durationMs: number;
}

/**
 * Reads a record type across the session window, preferring the session's own
 * data origin.
 *
 * Falls back to an unfiltered read when the origin-scoped one is empty: it is
 * common for the session and its heart rate to come from different apps (a
 * session recorded by Strava, heart rate written by Wear OS), in which case the
 * filter excludes exactly the data we want. The fallback is rejected when it
 * returns implausibly many samples for the duration, which indicates unrelated
 * overlapping data rather than this session's.
 */
async function readSeriesForWindow(
  recordType: string,
  window: WindowRead,
  extract: (record: unknown) => SeriesPoint[]
): Promise<SeriesPoint[]> {
  const timeRangeFilter = {
    operator: 'between' as const,
    startTime: window.startTime,
    endTime: window.endTime,
  };

  const collect = (records: unknown[]): SeriesPoint[] => {
    const startMs = Date.parse(window.startTime);
    const endMs = Date.parse(window.endTime);
    return records
      .flatMap(extract)
      .filter((p) => {
        const ms = Date.parse(p.t);
        return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
      })
      .sort((a, b) => a.t.localeCompare(b.t));
  };

  try {
    if (window.dataOrigin) {
      const scoped = await readRecords(recordType as never, {
        timeRangeFilter,
        dataOriginFilter: [window.dataOrigin],
      } as never);
      const points = collect((scoped as { records?: unknown[] }).records ?? []);
      if (points.length > 0) return points;
    }

    const unfiltered = await readRecords(recordType as never, {
      timeRangeFilter,
    } as never);
    const points = collect(
      (unfiltered as { records?: unknown[] }).records ?? []
    );

    const maxPlausible =
      (window.durationMs / 1000) * FALLBACK_DENSITY_LIMIT + 60;
    if (points.length > maxPlausible) {
      addLog(
        `[HealthConnectService] Ignoring ${recordType} fallback read: ${points.length} samples is implausible for the session length`,
        'DEBUG'
      );
      return [];
    }
    return points;
  } catch {
    // Type unavailable or unauthorized; treat as absent.
    return [];
  }
}

const sampleExtractors: Record<
  string,
  (record: unknown) => SeriesPoint[]
> = {
  HeartRate: (record) =>
    ((record as { samples?: { time: string; beatsPerMinute: number }[] })
      .samples ?? [])
      .filter((s) => Number.isFinite(s?.beatsPerMinute))
      .map((s) => ({ t: s.time, v: s.beatsPerMinute })),
  Speed: (record) =>
    ((record as { samples?: { time: string; speed?: { inMetersPerSecond?: number } }[] })
      .samples ?? [])
      .map((s) => ({ t: s.time, v: s.speed?.inMetersPerSecond }))
      .filter((s): s is SeriesPoint => Number.isFinite(s.v as number)) as SeriesPoint[],
  Power: (record) =>
    ((record as { samples?: { time: string; power?: { inWatts?: number } }[] })
      .samples ?? [])
      .map((s) => ({ t: s.time, v: s.power?.inWatts }))
      .filter((s): s is SeriesPoint => Number.isFinite(s.v as number)) as SeriesPoint[],
  StepsCadence: (record) =>
    ((record as { samples?: { time: string; rate?: number }[] }).samples ?? [])
      .map((s) => ({ t: s.time, v: s.rate }))
      .filter((s): s is SeriesPoint => Number.isFinite(s.v as number)) as SeriesPoint[],
  CyclingPedalingCadence: (record) =>
    ((record as { samples?: { time: string; revolutionsPerMinute?: number }[] })
      .samples ?? [])
      .map((s) => ({ t: s.time, v: s.revolutionsPerMinute }))
      .filter((s): s is SeriesPoint => Number.isFinite(s.v as number)) as SeriesPoint[],
};

/**
 * Converts the session's laps (or, failing that, its segments) into lap
 * windows. Only the boundaries are sent; the server derives the statistics.
 */
export function collectSessionLaps(
  session: Record<string, unknown>
): WorkoutLapWindow[] {
  const source =
    (Array.isArray(session.laps) && session.laps.length > 0
      ? session.laps
      : session.segments) ?? [];

  if (!Array.isArray(source) || source.length === 0) return [];

  return (source as { startTime?: string; endTime?: string }[])
    .filter(
      (lap) =>
        typeof lap?.startTime === 'string' &&
        typeof lap?.endTime === 'string' &&
        Number.isFinite(Date.parse(lap.startTime)) &&
        Number.isFinite(Date.parse(lap.endTime))
    )
    .sort((a, b) => (a.startTime as string).localeCompare(b.startTime as string))
    .map((lap, index) => ({
      lap_index: index + 1,
      start_time: lap.startTime as string,
      end_time: lap.endTime as string,
    }));
}

/** Everything collected for one session, downsampled for upload. */
export interface SessionTelemetryBundle {
  gps_points?: WorkoutGpsPoint[];
  hr_samples?: WorkoutHrSample[];
  laps?: WorkoutLapWindow[];
  telemetry?: WorkoutTelemetry;
}

const round = (value: number | null, digits = 2): number | null =>
  value === null ? null : Number(value.toFixed(digits));

/**
 * Collects, downsamples and packages one session's telemetry.
 *
 * Returns {} when the session has nothing beyond its summary, so callers can
 * spread the result and records without telemetry stay exactly as they were.
 */
export async function collectSessionTelemetry(
  session: Record<string, unknown>,
  options: { interactive: boolean }
): Promise<SessionTelemetryBundle> {
  const startTime = session.startTime as string | undefined;
  const endTime = session.endTime as string | undefined;
  if (!startTime || !endTime) return {};

  const durationMs = Date.parse(endTime) - Date.parse(startTime);
  if (!Number.isFinite(durationMs) || durationMs <= 0) return {};

  const window: WindowRead = {
    startTime,
    endTime,
    dataOrigin: (session.metadata as { dataOrigin?: string } | undefined)
      ?.dataOrigin,
    durationMs,
  };

  try {
    const [route, hr, speed, power, stepsCadence, cyclingCadence] =
      await Promise.all([
        collectSessionRoute(session, options.interactive),
        readSeriesForWindow('HeartRate', window, sampleExtractors.HeartRate),
        readSeriesForWindow('Speed', window, sampleExtractors.Speed),
        readSeriesForWindow('Power', window, sampleExtractors.Power),
        readSeriesForWindow(
          'StepsCadence',
          window,
          sampleExtractors.StepsCadence
        ),
        readSeriesForWindow(
          'CyclingPedalingCadence',
          window,
          sampleExtractors.CyclingPedalingCadence
        ),
      ]);

    // Whichever cadence the activity produced; a session yields one or neither.
    const cadence = stepsCadence.length > 0 ? stepsCadence : cyclingCadence;

    const bundle: SessionTelemetryBundle = {};

    // Summarise before downsampling so peaks survive.
    const telemetry: WorkoutTelemetry = {};
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

    // Deliberately no elapsed_time_seconds: it is just the session window,
    // which `duration` already carries. Setting it unconditionally would mean
    // every session came back "enriched" even when no series was found, and
    // enrichExerciseSessions must leave such records untouched.
    if (Object.keys(telemetry).length > 0) bundle.telemetry = telemetry;

    if (hr.length > 0) {
      bundle.hr_samples = downsampleHrSamples(
        hr.map((p) => ({ t: p.t, bpm: p.v }))
      );
    }

    if (route.length > 0) {
      bundle.gps_points = mergeSeriesIntoGpsPoints(downsampleGpsPoints(route), {
        hr: hr.length ? downsampleSeries(hr) : undefined,
        speed: speed.length ? downsampleSeries(speed) : undefined,
        cad: cadence.length ? downsampleSeries(cadence) : undefined,
        power: power.length ? downsampleSeries(power) : undefined,
      });
    }

    const laps = collectSessionLaps(session);
    if (laps.length > 0) bundle.laps = laps;

    return bundle;
  } catch (error) {
    // Telemetry is additive; never lose the session over it.
    addLog(
      `[HealthConnectService] Failed to collect session telemetry: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'WARNING'
    );
    return {};
  }
}
