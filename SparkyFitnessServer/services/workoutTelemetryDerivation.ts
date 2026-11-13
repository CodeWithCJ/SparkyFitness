/**
 * Derives per-lap aggregates from a workout's GPS and heart-rate series.
 *
 * Mobile clients send laps as bare time windows: HealthKit exposes lap/segment
 * workout *events* with no statistics attached, and Health Connect laps carry
 * only a length. Aggregating here rather than on-device keeps the logic in one
 * place instead of once per platform, and keeps the upload small.
 */

import type { HrSample } from '@workspace/shared';

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
  moving_time_seconds: number | null;
  avg_moving_speed_mps: number | null;
}

// GPS speed below this is treated as "stopped" for moving-time/moving-speed
// purposes (waiting at a crossing, tying a shoelace). Below the noise floor of
// consumer GPS, a stationary device still reports small jitter speeds of a
// few centimetres/second, so a strict `> 0` threshold would count that jitter
// as movement. Exported so deriveLaps and deriveWorkoutTelemetry apply the
// same definition rather than each choosing (and drifting from) their own.
export const STOP_SPEED_THRESHOLD_MPS = 0.1;

/**
 * Time actually spent moving, integrated over the real (possibly uneven)
 * gaps between samples rather than assumed to be evenly spaced. A point's
 * speed is taken as representative of the interval since the previous point.
 */
function movingTimeSeconds(
  points: readonly TelemetryGpsPoint[],
  thresholdMps: number
): number | null {
  if (points.length < 2) return null;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prevMs = Date.parse(points[i - 1].t);
    const currMs = Date.parse(points[i].t);
    if (
      !Number.isFinite(prevMs) ||
      !Number.isFinite(currMs) ||
      currMs <= prevMs
    ) {
      continue;
    }
    const speed = points[i].speed;
    if (isNum(speed) && speed > thresholdMps) {
      total += (currMs - prevMs) / 1000;
    }
  }
  return total > 0 ? Math.round(total) : null;
}

/** Mean speed across only the samples above the stop threshold. */
function movingSpeedMps(
  points: readonly TelemetryGpsPoint[],
  thresholdMps: number
): number | null {
  const moving = points
    .map((p) => p.speed)
    .filter((s): s is number => isNum(s) && s > thresholdMps);
  return round(mean(moving), 3);
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

/**
 * Half-width of the centred moving-average applied to the altitude series
 * before any elevation figure is derived, in seconds (so a 15 s window).
 *
 * Time-based rather than a fixed sample count on purpose: tracks in this
 * database range from ~1 s to ~48 s between samples, and a fixed
 * "average 7 points" window would smooth a 1 s track over 7 s but a 48 s track
 * over five minutes. A sparse track has already averaged its own jitter away
 * by sampling slowly, so this window correctly becomes a no-op for it.
 */
const ELEVATION_SMOOTHING_HALF_WINDOW_SECONDS = 7.5;

/**
 * Minimum sustained altitude change, in metres, before it counts as climb or
 * descent. Sits just above the ~0.7 m median vertical accuracy these tracks
 * report, so sensor jitter does not accumulate as ascent.
 */
const ELEVATION_MIN_DELTA_METERS = 1.0;

/**
 * Altitude series with a centred moving average over
 * ±ELEVATION_SMOOTHING_HALF_WINDOW_SECONDS applied, paired with nothing else —
 * callers use it for gain/loss and for min/max so every elevation figure on a
 * workout comes from the same series.
 */
function smoothedAltitudes(points: readonly TelemetryGpsPoint[]): number[] {
  const samples: Array<{ ms: number; alt: number }> = [];
  for (const p of points) {
    if (!isNum(p.alt)) continue;
    const ms = Date.parse(p.t);
    if (!Number.isFinite(ms)) continue;
    samples.push({ ms, alt: p.alt });
  }
  if (samples.length === 0) {
    // No usable timestamps: fall back to the raw altitudes so a track with
    // broken time still reports something rather than silently nothing.
    return points.map((p) => p.alt).filter((alt): alt is number => isNum(alt));
  }
  samples.sort((a, b) => a.ms - b.ms);

  const halfMs = ELEVATION_SMOOTHING_HALF_WINDOW_SECONDS * 1000;
  const out: number[] = [];
  let lo = 0;
  let hi = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const centre = samples[i].ms;
    while (hi < samples.length && samples[hi].ms <= centre + halfMs) {
      sum += samples[hi].alt;
      hi += 1;
    }
    while (samples[lo].ms < centre - halfMs) {
      sum -= samples[lo].alt;
      lo += 1;
    }
    out.push(sum / (hi - lo));
  }
  return out;
}

/**
 * Cumulative positive and negative altitude change across a run of points.
 *
 * Summing every positive sample-to-sample delta counts GPS/barometer jitter as
 * climb: on a real Apple Watch walk that produced 34.7 m of "gain" against the
 * 13.1 m Apple Fitness reported for the same track, a 2.6x overstatement. The
 * noise is autocorrelated, so a per-sample threshold alone barely helps —
 * smoothing first is what removes it.
 *
 * So: smooth the series over a time window, then accumulate with hysteresis —
 * a move only counts once it has travelled ELEVATION_MIN_DELTA_METERS from the
 * last committed pivot, which stops an oscillation around one altitude from
 * being banked repeatedly. Calibrated against that Apple Fitness track: this
 * yields 13.0 m against Apple's 13.1 m.
 */
function elevationDeltas(points: readonly TelemetryGpsPoint[]): {
  gain: number | null;
  loss: number | null;
} {
  const altitudes = smoothedAltitudes(points);
  if (altitudes.length < 2) return { gain: null, loss: null };

  let gain = 0;
  let loss = 0;
  let pivot = altitudes[0];
  // +1 climbing, -1 descending, 0 undecided
  let direction = 0;

  for (let i = 1; i < altitudes.length; i += 1) {
    const delta = altitudes[i] - pivot;
    if (delta >= ELEVATION_MIN_DELTA_METERS && direction >= 0) {
      gain += delta;
      pivot = altitudes[i];
      direction = 1;
    } else if (-delta >= ELEVATION_MIN_DELTA_METERS && direction <= 0) {
      loss += -delta;
      pivot = altitudes[i];
      direction = -1;
    } else if (direction > 0 && -delta >= ELEVATION_MIN_DELTA_METERS) {
      loss += -delta;
      pivot = altitudes[i];
      direction = -1;
    } else if (direction < 0 && delta >= ELEVATION_MIN_DELTA_METERS) {
      gain += delta;
      pivot = altitudes[i];
      direction = 1;
    }
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
          moving_time_seconds: null,
          avg_moving_speed_mps: null,
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
        // HealthKit and Health Connect expose no per-lap moving/paused split,
        // so derive it from the samples in this lap's window.
        moving_time_seconds: movingTimeSeconds(
          points,
          STOP_SPEED_THRESHOLD_MPS
        ),
        avg_moving_speed_mps: movingSpeedMps(points, STOP_SPEED_THRESHOLD_MPS),
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
  // Smoothed, not raw: min/max must describe the same series gain/loss is
  // measured on, or the workout reports a floor it never actually reached.
  // Raw min on a real Apple Watch walk was 6.9 m against Apple's 8.8 m, an
  // artefact of a single noisy sample.
  const altitudes = smoothedAltitudes(gpsPoints);
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
    // Same definition as deriveLaps, applied to the whole series. Only fills
    // the gap when the device reported neither (HealthKit does not); Strava
    // and Garmin send their own moving_time and win via the caller's merge.
    moving_time_seconds: movingTimeSeconds(gpsPoints, STOP_SPEED_THRESHOLD_MPS),
    avg_moving_speed_mps: movingSpeedMps(gpsPoints, STOP_SPEED_THRESHOLD_MPS),
  };

  for (const key of Object.keys(derived)) {
    if (derived[key] === null) delete derived[key];
  }
  return derived;
}
