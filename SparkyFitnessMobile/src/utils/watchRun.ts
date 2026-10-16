import type { RecordedPoint, RecordingActivity } from './gpsRecording';

/**
 * A walk or run the watch recorded on its own, as it arrives over the watch
 * connection. Route fixes and heart-rate readings are packed as number arrays
 * because the connection carries property lists and a long run has thousands.
 */
export interface WatchRunPayload {
  /** The id the watch stamped on its Apple Health workout. */
  clientId: string;
  kind: 'walk' | 'run';
  place: 'indoor' | 'outdoor';
  /** Epoch ms. */
  startedAt: number;
  endedAt: number;
  /** Clock time with pauses removed, from the workout builder. */
  activeSeconds: number;
  distanceMeters: number;
  activeEnergyKcal: number;
  /** `[t (epoch ms), lat, lon, alt, hacc, seg]`; `alt` is `NO_ALTITUDE` when unknown. */
  route: number[][];
  /** `[t (epoch ms), bpm]`. */
  heartRate: number[][];
  /** Epoch ms of each Lap press on the watch, oldest first. */
  laps: number[];
  /** Cumulative metres at each lap mark, same order; empty when not sent. */
  lapDistances: number[];
  /** `[active seconds, cumulative metres]` about every 10 s, for the pace chart. */
  distanceSeries: number[][];
  /** The plan the run followed, if any, and whether it reached the last step. */
  planId: string | null;
  /** A training-program workout the run was (program id and 0-based index). */
  program: { id: string; index: number } | null;
  planCompleted: boolean;
  /** The learned indoor factor the watch applied to its distance (1 when none). */
  distanceScale?: number;
  /**
   * What the watch showed before the wearer entered the treadmill's distance
   * on the wrist; absent when they kept the watch's figure.
   */
  estimatedDistanceMeters?: number;
}

/** Stands in for "no altitude": a property list cannot carry null. */
export const WATCH_NO_ALTITUDE = -9999;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Checks a payload from the wire and returns it cleaned, or null when it is
 * unusable. Drops malformed route and heart-rate rows rather than failing the
 * whole run, since the activity itself is still worth logging.
 */
export function parseWatchRunPayload(raw: unknown): WatchRunPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.clientId !== 'string' || p.clientId.length === 0) return null;
  if (p.kind !== 'walk' && p.kind !== 'run') return null;
  if (p.place !== 'indoor' && p.place !== 'outdoor') return null;
  if (!finite(p.startedAt) || !finite(p.endedAt) || p.endedAt < p.startedAt) {
    return null;
  }
  const rows = (value: unknown, width: number): number[][] =>
    Array.isArray(value)
      ? value.filter(
          (row): row is number[] =>
            Array.isArray(row) &&
            row.length >= width &&
            row.slice(0, width).every(finite)
        )
      : [];
  return {
    clientId: p.clientId,
    kind: p.kind,
    place: p.place,
    startedAt: p.startedAt,
    endedAt: p.endedAt,
    activeSeconds: finite(p.activeSeconds) ? Math.max(0, p.activeSeconds) : 0,
    distanceMeters: finite(p.distanceMeters)
      ? Math.max(0, p.distanceMeters)
      : 0,
    activeEnergyKcal: finite(p.activeEnergyKcal)
      ? Math.max(0, p.activeEnergyKcal)
      : 0,
    route: rows(p.route, 6),
    heartRate: rows(p.heartRate, 2),
    planId: typeof p.planId === 'string' && p.planId ? p.planId : null,
    program:
      typeof p.programId === 'string' &&
      p.programId &&
      finite(p.programIndex) &&
      p.programIndex >= 0
        ? { id: p.programId, index: Math.floor(p.programIndex) }
        : null,
    planCompleted: p.planCompleted === true,
    distanceSeries: rows(p.distanceSeries, 2),
    lapDistances: Array.isArray(p.lapDistances)
      ? p.lapDistances.filter(finite)
      : [],
    laps: Array.isArray(p.laps)
      ? p.laps.filter(finite).sort((a, b) => a - b)
      : [],
    ...(finite(p.distanceScale) && p.distanceScale > 0
      ? { distanceScale: p.distanceScale }
      : {}),
    ...(finite(p.estimatedDistanceMeters) && p.estimatedDistanceMeters > 0
      ? { estimatedDistanceMeters: p.estimatedDistanceMeters }
      : {}),
  };
}

export function watchRunActivity(payload: WatchRunPayload): RecordingActivity {
  return payload.kind;
}

/** The route as the recorder's own point type, for splits and the upload. */
export function watchRunPoints(payload: WatchRunPayload): RecordedPoint[] {
  return payload.route
    .map(([t, lat, lon, alt, hacc, seg]) => ({
      t,
      lat,
      lon,
      alt: alt === WATCH_NO_ALTITUDE ? null : alt,
      hacc: hacc >= 0 ? hacc : null,
      vacc: null,
      speed: null,
      course: null,
      seg,
    }))
    .sort((a, b) => a.t - b.t);
}

/** A lap for an entry with no route: a time window and what was covered in it. */
export interface WatchRunLapWindow {
  lap_index: number;
  start_time: string;
  end_time: string;
  distance_meters?: number;
  avg_heart_rate?: number;
}

/**
 * Cuts a run at the wearer's lap marks: from the start to the first mark, mark
 * to mark, and the last mark to the end. Used for indoor runs, which have no
 * route to derive laps from. The distance of each lap is the difference of
 * the distances recorded at the marks (the whole run's distance closes the
 * last one); it is left out when the watch did not send one per mark. The
 * average heart rate is taken from the readings inside the window.
 */
export function indoorLapWindows(
  payload: WatchRunPayload
): WatchRunLapWindow[] {
  const marks = payload.laps.filter(
    (t) => t > payload.startedAt && t < payload.endedAt
  );
  if (marks.length === 0) return [];
  const edges = [payload.startedAt, ...marks, payload.endedAt];
  const distances =
    payload.lapDistances.length === payload.laps.length &&
    marks.length === payload.laps.length
      ? [0, ...payload.lapDistances, payload.distanceMeters]
      : null;
  const windows: WatchRunLapWindow[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const end = edges[i + 1];
    const lap: WatchRunLapWindow = {
      lap_index: i + 1,
      start_time: new Date(start).toISOString(),
      end_time: new Date(end).toISOString(),
    };
    if (distances) {
      lap.distance_meters = Math.max(0, distances[i + 1] - distances[i]);
    }
    const readings = payload.heartRate
      .filter(([t]) => t >= start && t < end)
      .map(([, bpm]) => bpm);
    if (readings.length > 0) {
      lap.avg_heart_rate = Math.round(
        readings.reduce((sum, bpm) => sum + bpm, 0) / readings.length
      );
    }
    windows.push(lap);
  }
  return windows;
}
