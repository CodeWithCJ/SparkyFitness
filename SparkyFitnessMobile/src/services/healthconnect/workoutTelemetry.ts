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
import {
  hasEnrichedSession,
  sessionTelemetryKey,
} from '../shared/enrichedSessionCache';
import {
  isClientUnavailableError,
  isPermanentlyUnavailableError,
  isQuotaExceededError,
} from '../shared/quotaError';
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

/** Paging for the consent-prefetch session read. */
const ROUTE_PREFETCH_PAGE_SIZE = 1000;
const ROUTE_PREFETCH_MAX_PAGES = 20;

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

/**
 * requestExerciseRoute resolves with the bare location array — the native
 * module resolves `parseExerciseRoute(...)` directly, with no `{ type, route }`
 * wrapper. The library's 3.5.3 typings declare the wrapped shape (corrected
 * upstream in 4.1.2), so both are accepted here.
 */
function locationsOf(result: unknown): readonly HcLocation[] {
  if (Array.isArray(result)) return result as readonly HcLocation[];
  const wrapped = (result as HcExerciseRoute | undefined)?.route;
  return Array.isArray(wrapped) ? wrapped : [];
}

/**
 * The native module funnels every route-consent dialog through one
 * ActivityResultLauncher and one uncorrelated result channel: results are
 * matched to waiting callers purely by ordering, so concurrent requests can
 * hand one workout another workout's route (or strand a caller forever when a
 * stacked launch is dropped). Exactly one request in flight, ever.
 */
let routeRequestChain: Promise<unknown> = Promise.resolve();

function requestExerciseRouteSerialized(recordId: string): Promise<unknown> {
  const request = routeRequestChain.then(() => requestExerciseRoute(recordId));
  routeRequestChain = request.catch(() => undefined);
  return request;
}

function toGpsPoints(locations: readonly HcLocation[]): WorkoutGpsPoint[] {
  const points: WorkoutGpsPoint[] = [];
  for (const location of locations) {
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

/**
 * Routes resolved ahead of the engine's timed metric read, keyed by record id.
 *
 * A consent dialog has no deadline — it sits until the user answers. Inside the
 * engine's per-metric timeout that stalls the ExerciseSession read past its
 * limit and fails the whole sync, so interactive runs resolve consent up front
 * via prefetchSessionRoutes and the timed read consumes the cached result.
 */
const prefetchedRoutes = new Map<string, WorkoutGpsPoint[]>();

/**
 * Telemetry-collection cache key for one Health Connect session.
 *
 * lastModifiedTime moves whenever the source rewrites the record, so a session
 * still being filled in by the watch is re-collected rather than frozen at its
 * first reading. endTime is the fallback for sources that omit it.
 */
export const sessionCacheKey = (record: unknown): string | null => {
  const metadata = (record as { metadata?: { id?: string; lastModifiedTime?: string } }).metadata;
  const endTime = (record as { endTime?: string }).endTime;
  return sessionTelemetryKey(metadata?.id, metadata?.lastModifiedTime ?? endTime);
};

/**
 * Resolves route consent for sessions in the window that need it, one dialog at
 * a time, caching the resulting points for the timed read. Failures only cost
 * routes, never the sync.
 *
 * `limit` must match the telemetry budget the enrichment pass will use. This
 * runs *before* that pass and outside its budget, so an unbounded prefetch over
 * a year-long window would serially resolve consent for thousands of sessions
 * that enrichment then never reaches — recreating the very foreground stall
 * this bounding exists to prevent (#2191). Sessions are taken newest-first, the
 * same order enrichment claims its budget in, so the prefetch warms exactly the
 * sessions that will be enriched.
 */
export async function prefetchSessionRoutes(
  startTime: Date,
  endTime: Date,
  limit: number
): Promise<void> {
  prefetchedRoutes.clear();
  if (limit <= 0) return;

  let sessions: Record<string, unknown>[];
  try {
    // Paged: this window is the user's whole configured sync range, which can
    // hold more sessions than one page. An unpaged read silently skipped every
    // session past the first page, so those never got their route.
    sessions = [];
    let pageToken: string | undefined;
    let page = 0;
    do {
      page++;
      const result = await readRecords('ExerciseSession', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        },
        pageSize: ROUTE_PREFETCH_PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
      } as never);
      sessions.push(...((result?.records ?? []) as Record<string, unknown>[]));
      pageToken = result?.pageToken;
    } while (pageToken && page < ROUTE_PREFETCH_MAX_PAGES);
  } catch (error) {
    addLog(
      `[HealthConnectService] Route consent prefetch read failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'WARNING'
    );
    return;
  }

  // Newest-first, matching enrichExerciseSessions' claim order.
  sessions.sort((a, b) =>
    String(b.startTime ?? '').localeCompare(String(a.startTime ?? '')),
  );

  // The limit counts enrichment CANDIDATES, not consent requests.
  //
  // enrichExerciseSessions spends a budget claim on every valid uncached
  // session, whether or not it needs consent. Counting only issued requests
  // would let the prefetch skip past the newest sessions (embedded route, or no
  // route at all) without spending its limit, walk back to older ones, and
  // prompt for sessions enrichment will never reach.
  let candidates = 0;
  for (const session of sessions) {
    if (candidates >= limit) break;

    // Same validity test enrichExerciseSessions applies before claiming, so
    // the two walk the same sessions in the same order.
    const startTime = session.startTime;
    const endTime = session.endTime;
    if (typeof startTime !== 'string' || typeof endTime !== 'string') continue;
    const startMs = Date.parse(startTime);
    const endMs = Date.parse(endTime);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }

    // Sessions whose telemetry is already collected are skipped by enrichment,
    // so they are not candidates and warming their route would be wasted
    // consent work.
    if (await hasEnrichedSession(sessionCacheKey(session))) continue;

    candidates++;

    const route = session.exerciseRoute as HcExerciseRoute | undefined;
    const recordId = (session.metadata as { id?: string } | undefined)?.id;
    if (routeHasData(route) || !routeNeedsConsent(route) || !recordId) continue;

    const remembered = await getRouteConsent(recordId);
    if (remembered === 'denied') continue;
    try {
      const result = await requestExerciseRouteSerialized(recordId);
      prefetchedRoutes.set(recordId, toGpsPoints(locationsOf(result)));
      await setRouteConsent(recordId, 'granted');
    } catch {
      await setRouteConsent(recordId, 'denied');
    }
  }
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
  interactive: boolean,
  /**
   * Called when a consent request threw, which `requestExerciseRoute` does
   * identically for a real refusal and for a transient failure. The caller uses
   * it to leave the session out of the permanent reuse cache for one more sync.
   */
  onPossiblySpuriousDenial?: () => void,
): Promise<WorkoutGpsPoint[]> {
  const route = session.exerciseRoute as HcExerciseRoute | undefined;
  const recordId = (session.metadata as { id?: string } | undefined)?.id;

  if (routeHasData(route)) return toGpsPoints(route?.route ?? []);

  const prefetched = recordId ? prefetchedRoutes.get(recordId) : undefined;
  if (prefetched) return prefetched;

  if (routeNeedsConsent(route) && interactive && recordId) {
    const remembered = await getRouteConsent(recordId);
    if (remembered === 'denied') return [];
    try {
      const result = await requestExerciseRouteSerialized(recordId);
      await setRouteConsent(recordId, 'granted');
      return toGpsPoints(locationsOf(result));
    } catch {
      // The user declined, or the record has no route. Remember either way so
      // the 6h overlap re-sync does not prompt for the same session again.
      //
      // This is also the moment a transient failure becomes a persistent
      // 'denied', which DENIAL_EXPIRY_MS exists to heal. The permanent session
      // cache would beat that expiry, so the caller is told to skip caching
      // this session once. A real refusal settles on the next sync, where the
      // remembered 'denied' short-circuits above without throwing.
      await setRouteConsent(recordId, 'denied');
      onPossiblySpuriousDenial?.();
      return [];
    }
  }

  return [];
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
  } catch (error) {
    // A quota or dead-client failure says nothing about whether this session
    // has the series — it is the same read failing for everyone. Surface it so
    // the session is not cached as "collected, nothing there".
    if (isRetryableReadError(error)) throw new RetryableTelemetryError(error);
    // Explicitly unsupported or unauthorized: a stable answer, treat as absent.
    return [];
  }
}

/**
 * Which sample series a session can plausibly carry, by Health Connect
 * exerciseType (numbering per EXERCISE_MAP in dataTransformation.ts).
 *
 * Every series costs a read, and a second unfiltered read when the
 * origin-scoped one comes back empty — so reading all five for a session that
 * can only ever have heart rate is up to ten native calls to learn nothing
 * (#2191). The sets below are deliberately narrow: an exerciseType that
 * matches none of them keeps the previous read-everything behaviour, so an
 * unrecognised or newly added type never silently loses data.
 */

/** Strength, floor and mind-body work: heart rate is the only plausible series. */
const HEART_RATE_ONLY_TYPES = new Set([
  1, 3, 6, 7, 12, 13, 15, 17, 18, 19, 20, 21, 22, 23, 24, 30, 33, 40, 42, 43,
  48, 49, 67, 70, 71, 77, 81, 83,
]);

/** Foot-based locomotion: step cadence, never pedaling cadence. */
const FOOT_BASED_TYPES = new Set([37, 56, 57, 79]);

/** Pedal-driven: pedaling cadence, never step cadence. */
const PEDAL_BASED_TYPES = new Set([8, 9]);

type SeriesName =
  | 'HeartRate'
  | 'Speed'
  | 'Power'
  | 'StepsCadence'
  | 'CyclingPedalingCadence';

const ALL_SERIES: SeriesName[] = [
  'HeartRate',
  'Speed',
  'Power',
  'StepsCadence',
  'CyclingPedalingCadence',
];

export function seriesForExerciseType(
  exerciseType: number | undefined
): SeriesName[] {
  if (typeof exerciseType !== 'number') return ALL_SERIES;
  if (HEART_RATE_ONLY_TYPES.has(exerciseType)) return ['HeartRate'];
  if (FOOT_BASED_TYPES.has(exerciseType)) {
    return ['HeartRate', 'Speed', 'Power', 'StepsCadence'];
  }
  if (PEDAL_BASED_TYPES.has(exerciseType)) {
    return ['HeartRate', 'Speed', 'Power', 'CyclingPedalingCadence'];
  }
  return ALL_SERIES;
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
  /**
   * Set when a read failed in a way that is worth retrying, as opposed to the
   * session genuinely having nothing beyond its summary. Callers must not cache
   * such a session as collected: the cache has no expiry, so a transient
   * failure recorded there is permanent.
   */
  incomplete?: boolean;
}

/**
 * Read failures worth retrying, as opposed to "this record type is
 * unavailable or unauthorized here" — which is a stable answer and correctly
 * caches as "nothing to collect".
 *
 * Quota exhaustion and a dead client are the named cases, but the default is
 * retryable: only an explicitly recognised unsupported/unauthorized error is
 * treated as stable. A generic native read failure is neither proof that the
 * series is absent nor a stable authorization result, and treating it as one
 * caches an empty bundle that suppresses collection for good.
 */
class RetryableTelemetryError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'RetryableTelemetryError';
  }
}

const isRetryableReadError = (error: unknown): boolean =>
  isQuotaExceededError(error) ||
  isClientUnavailableError(error) ||
  !isPermanentlyUnavailableError(error);

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

  // Series a session of this type cannot carry are not read at all; each skipped
  // one saves up to two native reads plus their bridge and sort cost.
  const wanted = new Set(
    seriesForExerciseType(session.exerciseType as number | undefined)
  );
  const readSeries = (name: SeriesName): Promise<SeriesPoint[]> =>
    wanted.has(name)
      ? readSeriesForWindow(name, window, sampleExtractors[name])
      : Promise.resolve([]);

  let routeRetryable = false;

  try {
    const [route, hr, speed, power, stepsCadence, cyclingCadence] =
      await Promise.all([
        collectSessionRoute(session, options.interactive, () => {
          routeRetryable = true;
        }),
        readSeries('HeartRate'),
        readSeries('Speed'),
        readSeries('Power'),
        readSeries('StepsCadence'),
        readSeries('CyclingPedalingCadence'),
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

    if (routeRetryable) bundle.incomplete = true;

    return bundle;
  } catch (error) {
    // Telemetry is additive; never lose the session over it. The session is
    // still returned unenriched — `incomplete` only keeps it out of the reuse
    // cache so the next sync tries again.
    addLog(
      `[HealthConnectService] Failed to collect session telemetry: ${
        error instanceof Error ? error.message : String(error)
      }`,
      'WARNING'
    );
    return { incomplete: true };
  }
}
