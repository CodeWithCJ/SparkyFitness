/**
 * Derives per-lap aggregates from a workout's GPS and heart-rate series.
 *
 * Mobile clients send laps as bare time windows: HealthKit exposes lap/segment
 * workout *events* with no statistics attached, and Health Connect laps carry
 * only a length. Aggregating here rather than on-device keeps the logic in one
 * place instead of once per platform, and keeps the upload small.
 */

import type { HrSample } from './hrZoneCalculator.js';

/** A GPS trackpoint as it arrives on the wire (short keys). */
export interface TelemetryGpsPoint {
  t: string;
  lat: number;
  lon: number;
  alt?: number | null;
  speed?: number | null;
  hr?: number | null;
  cad?: number | null;
  power?: number | null;
  dist?: number | null;
  hacc?: number | null;
  vacc?: number | null;
  course?: number | null;
}

/** A lap window as sent by the client. */
export interface LapWindow {
  lap_index: number;
  start_time: string;
  end_time: string;
}

/** A lap window plus everything derivable from the series. */
export interface DerivedLap extends LapWindow {
  duration_seconds: number;
  distance_meters: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_cadence: number | null;
  avg_power_watts: number | null;
  elevation_gain_meters: number | null;
  elevation_loss_meters: number | null;
}

const EARTH_RADIUS_M = 6371000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in metres between two coordinates. */
function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + v, 0);
  return total / values.length;
}

// Reduces rather than spreads into Math.max/Math.min: a long session's speed,
// cadence, power, or altitude series can run tens of thousands of points, and
// one argument per element risks "RangeError: Maximum call stack size exceeded".
function max(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((m, v) => (v > m ? v : m), values[0]);
}

function min(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((m, v) => (v < m ? v : m), values[0]);
}

const round = (value: number | null, digits = 2): number | null =>
  value === null ? null : Number(value.toFixed(digits));

/**
 * Distance covered across a run of points.
 *
 * Prefers the device's own cumulative `dist` (it accounts for GPS smoothing the
 * raw coordinates don't reflect) and falls back to summing great-circle hops.
 */
function distanceOver(points: readonly TelemetryGpsPoint[]): number | null {
  if (points.length < 2) return null;

  const first = points[0];
  const last = points[points.length - 1];
  if (isNum(first.dist) && isNum(last.dist) && last.dist >= first.dist) {
    return last.dist - first.dist;
  }

  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!isNum(prev.lat) || !isNum(prev.lon)) continue;
    if (!isNum(curr.lat) || !isNum(curr.lon)) continue;
    total += haversineMeters(prev.lat, prev.lon, curr.lat, curr.lon);
  }
  return total > 0 ? total : null;
}

/** Cumulative positive and negative altitude change across a run of points. */
function elevationDeltas(points: readonly TelemetryGpsPoint[]): {
  gain: number | null;
  loss: number | null;
} {
  const altitudes = points
    .map((p) => p.alt)
    .filter((alt): alt is number => isNum(alt));
  if (altitudes.length < 2) return { gain: null, loss: null };

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < altitudes.length; i += 1) {
    const delta = altitudes[i] - altitudes[i - 1];
    if (delta > 0) gain += delta;
    else loss -= delta;
  }
  return { gain, loss };
}

/**
 * Samples falling inside [start, end).
 *
 * Half-open so a point landing exactly on a boundary is counted once, by the
 * later lap, rather than inflating both laps around it.
 */
function withinWindow<T extends { t: string }>(
  samples: readonly T[],
  startMs: number,
  endMs: number
): T[] {
  return samples.filter((s) => {
    const ms = Date.parse(s.t);
    return Number.isFinite(ms) && ms >= startMs && ms < endMs;
  });
}

/**
 * Fills in each lap's aggregates from the workout's GPS and HR series.
 *
 * Laps with no samples in range still come back, carrying their duration and
 * nulls: a lap the device recorded is real even if telemetry is missing for it,
 * and dropping it would silently renumber the rest.
 */
export function deriveLaps(
  laps: readonly LapWindow[],
  gpsPoints: readonly TelemetryGpsPoint[] = [],
  hrSamples: readonly HrSample[] = []
): DerivedLap[] {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  return laps
    .map((lap) => {
      const startMs = Date.parse(lap.start_time);
      const endMs = Date.parse(lap.end_time);
      const valid = Number.isFinite(startMs) && Number.isFinite(endMs);
      const durationSeconds =
        valid && endMs > startMs ? Math.round((endMs - startMs) / 1000) : 0;

      if (!valid) {
        return {
          ...lap,
          duration_seconds: 0,
          distance_meters: null,
          calories: null,
          avg_heart_rate: null,
          max_heart_rate: null,
          avg_speed_mps: null,
          max_speed_mps: null,
          avg_cadence: null,
          avg_power_watts: null,
          elevation_gain_meters: null,
          elevation_loss_meters: null,
        };
      }

      const points = withinWindow(gpsPoints, startMs, endMs);
      const hr = withinWindow(hrSamples, startMs, endMs);

      // Heart rate comes from the dedicated series when present (indoor
      // workouts have HR but no GPS) and otherwise from the points themselves.
      const hrValues = hr.length
        ? hr.map((s) => s.bpm).filter(isNum)
        : points.map((p) => p.hr).filter(isNum);

      const speeds = points.map((p) => p.speed).filter(isNum);
      const cadences = points.map((p) => p.cad).filter(isNum);
      const powers = points.map((p) => p.power).filter(isNum);
      const { gain, loss } = elevationDeltas(points);

      const avgHr = mean(hrValues);
      const maxHr = max(hrValues);

      return {
        ...lap,
        duration_seconds: durationSeconds,
        distance_meters: round(distanceOver(points)),
        calories: null,
        avg_heart_rate: avgHr === null ? null : Math.round(avgHr),
        max_heart_rate: maxHr === null ? null : Math.round(maxHr),
        avg_speed_mps: round(mean(speeds), 3),
        max_speed_mps: round(max(speeds), 3),
        avg_cadence: round(mean(cadences), 1),
        avg_power_watts: round(mean(powers), 1),
        elevation_gain_meters: round(gain),
        elevation_loss_meters: round(loss),
      };
    })
    .sort((a, b) => a.lap_index - b.lap_index);
}

/**
 * Whole-workout telemetry derived from the series, used to fill any summary
 * field the device did not report itself. Client-supplied values win; this only
 * backfills gaps.
 */
export function deriveWorkoutTelemetry(
  gpsPoints: readonly TelemetryGpsPoint[] = [],
  hrSamples: readonly HrSample[] = []
): Record<string, number | null> {
  const hrValues = hrSamples.length
    ? hrSamples.map((s) => s.bpm).filter(isNum)
    : gpsPoints.map((p) => p.hr).filter(isNum);

  const speeds = gpsPoints.map((p) => p.speed).filter(isNum);
  const cadences = gpsPoints.map((p) => p.cad).filter(isNum);
  const powers = gpsPoints.map((p) => p.power).filter(isNum);
  const altitudes = gpsPoints.map((p) => p.alt).filter(isNum);
  const { gain, loss } = elevationDeltas(gpsPoints);

  const avgHr = mean(hrValues);
  const maxHr = max(hrValues);

  const derived: Record<string, number | null> = {
    avg_heart_rate: avgHr === null ? null : Math.round(avgHr),
    max_heart_rate: maxHr === null ? null : Math.round(maxHr),
    avg_speed_mps: round(mean(speeds), 3),
    max_speed_mps: round(max(speeds), 3),
    avg_cadence: round(mean(cadences), 1),
    max_cadence: round(max(cadences), 1),
    avg_power_watts: round(mean(powers), 1),
    max_power_watts: round(max(powers), 1),
    elevation_gain_meters: round(gain),
    elevation_loss_meters: round(loss),
    min_elevation_meters: round(min(altitudes)),
    max_elevation_meters: round(max(altitudes)),
  };

  for (const key of Object.keys(derived)) {
    if (derived[key] === null) delete derived[key];
  }
  return derived;
}
