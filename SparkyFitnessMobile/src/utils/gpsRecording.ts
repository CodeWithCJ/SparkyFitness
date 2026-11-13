import type { GpsTrackPoint } from '@workspace/shared';
import type { WorkoutLapWindow } from '../types/healthRecords';

/**
 * Pure maths for a GPS-recorded walk, run or ride: which fixes to keep,
 * and the distance, pace, elevation and splits that fall out of the ones kept.
 * Nothing here touches the device, so all of it runs under Jest.
 */

export type RecordingActivity = 'walk' | 'run' | 'ride';
/** A recording activity, or jump rope (recorded on the watch, no GPS). */
export type DiaryActivity = RecordingActivity | 'jumpRope';

/** One accepted location fix. Times are epoch milliseconds. */
export interface RecordedPoint {
  t: number;
  lat: number;
  lon: number;
  /** Metres above sea level, when the fix carried one. */
  alt: number | null;
  /** Horizontal accuracy radius in metres. */
  hacc: number | null;
  vacc: number | null;
  /** Metres per second as the receiver reported it (negative means unknown). */
  speed: number | null;
  course: number | null;
  /**
   * Which recording stretch the fix belongs to. It goes up by one on every
   * resume, so the jump across a pause is never counted as distance or time.
   */
  seg: number;
}

/** A raw fix as the location library hands it over. */
export interface RawFix {
  t: number;
  lat: number;
  lon: number;
  alt?: number | null;
  hacc?: number | null;
  vacc?: number | null;
  speed?: number | null;
  course?: number | null;
}

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export const METERS_PER_KM = 1000;
export const METERS_PER_MILE = 1609.344;

/** Great-circle distance between two fixes, in metres. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface FilterProfile {
  /** Fixes with a worse accuracy radius than this are dropped. */
  maxAccuracyM: number;
  /** A jump implying a faster speed than this is a GPS glitch, not movement. */
  maxSpeedMps: number;
}

// Generous ceilings, not pace limits: a downhill ride really does reach
// 20 m/s, while a 12 m/s "run" is a car or a jump in the fix.
const FILTER_PROFILES: Record<RecordingActivity, FilterProfile> = {
  walk: { maxAccuracyM: 50, maxSpeedMps: 7 },
  run: { maxAccuracyM: 50, maxSpeedMps: 12 },
  ride: { maxAccuracyM: 50, maxSpeedMps: 30 },
};

/**
 * A fix closer than this to the last kept one is treated as standing-still
 * jitter: consumer GPS drifts a few metres even on a bench.
 */
export const MIN_STEP_METERS = 3;

/**
 * Still-jitter fixes are dropped, but one is kept at least this often so the
 * saved track keeps its timeline (a long red light is time on the clock).
 */
export const HEARTBEAT_MS = 15_000;

/**
 * The first fix of a stretch (the start, or the first one after a resume) has
 * nothing to be checked against, so it has to be good on its own. A cold start
 * often opens with a fix tens of metres off, which would put a spike at the
 * head of the route; waiting a few seconds for a tighter one avoids it.
 */
export const STRETCH_START_MAX_ACCURACY_M = 25;

/**
 * Decides whether a fix joins the track. Rejects the unusable (no
 * coordinates, poor accuracy, out of order), the physically impossible
 * (implied speed), and standing-still jitter.
 *
 * `previous` is the last fix already kept; `seg` is the current stretch.
 */
export function acceptFix(
  previous: RecordedPoint | undefined,
  fix: RawFix,
  seg: number,
  activity: RecordingActivity
): RecordedPoint | null {
  if (
    !Number.isFinite(fix.t) ||
    !Number.isFinite(fix.lat) ||
    !Number.isFinite(fix.lon) ||
    Math.abs(fix.lat) > 90 ||
    Math.abs(fix.lon) > 180
  ) {
    return null;
  }
  const profile = FILTER_PROFILES[activity];
  const hacc =
    typeof fix.hacc === 'number' && fix.hacc >= 0 && Number.isFinite(fix.hacc)
      ? fix.hacc
      : null;
  if (hacc !== null && hacc > profile.maxAccuracyM) return null;
  const startsStretch = !previous || previous.seg !== seg;
  if (startsStretch && hacc !== null && hacc > STRETCH_START_MAX_ACCURACY_M) {
    return null;
  }

  const point: RecordedPoint = {
    t: fix.t,
    lat: fix.lat,
    lon: fix.lon,
    alt: finiteOrNull(fix.alt),
    hacc,
    vacc: finiteOrNull(fix.vacc),
    speed:
      typeof fix.speed === 'number' &&
      Number.isFinite(fix.speed) &&
      fix.speed >= 0
        ? fix.speed
        : null,
    course:
      typeof fix.course === 'number' &&
      Number.isFinite(fix.course) &&
      fix.course >= 0
        ? fix.course
        : null,
    seg,
  };
  if (!previous) return point;
  if (fix.t <= previous.t) return null;
  // First fix after a resume: nothing to compare against, always keep it.
  if (previous.seg !== seg) return point;

  const meters = haversineMeters(previous, point);
  const seconds = (fix.t - previous.t) / 1000;
  if (meters / seconds > profile.maxSpeedMps) return null;
  // The step has to clear the fix's own error radius as well as the floor.
  const floor = Math.max(MIN_STEP_METERS, (hacc ?? 0) / 2);
  if (meters < floor && fix.t - previous.t < HEARTBEAT_MS) return null;
  return point;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Cumulative path length at each point, in metres, restarting nothing across a pause. */
export function cumulativeDistances(
  points: readonly RecordedPoint[]
): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && points[i].seg === points[i - 1].seg) {
      total += haversineMeters(points[i - 1], points[i]);
    }
    out.push(total);
  }
  return out;
}

/**
 * Seconds of recording at each point, with pauses removed: the clock
 * advances only between fixes of the same stretch.
 */
export function cumulativeActiveSeconds(
  points: readonly RecordedPoint[]
): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && points[i].seg === points[i - 1].seg) {
      total += (points[i].t - points[i - 1].t) / 1000;
    }
    out.push(total);
  }
  return out;
}

// GPS altitude is the noisiest channel, so elevation is measured on a moving
// average and counts a climb or descent only once it clears a hysteresis band;
// otherwise a flat route "gains" metres from jitter alone.
const ALTITUDE_SMOOTHING_WINDOW = 5;
const ELEVATION_THRESHOLD_M = 3;

function smoothedAltitudes(points: readonly RecordedPoint[]): number[] {
  const raw = points.map((p) => p.alt);
  const half = Math.floor(ALTITUDE_SMOOTHING_WINDOW / 2);
  const out: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    let sum = 0;
    let count = 0;
    for (
      let j = Math.max(0, i - half);
      j <= Math.min(raw.length - 1, i + half);
      j++
    ) {
      const value = raw[j];
      if (value !== null) {
        sum += value;
        count++;
      }
    }
    if (count > 0) out.push(sum / count);
  }
  return out;
}

/** Total climb and descent, in metres, over the smoothed altitude series. */
export function elevationGainLoss(points: readonly RecordedPoint[]): {
  gain: number;
  loss: number;
} {
  const altitudes = smoothedAltitudes(points);
  if (altitudes.length < 2) return { gain: 0, loss: 0 };
  let gain = 0;
  let loss = 0;
  let anchor = altitudes[0];
  for (const altitude of altitudes) {
    const delta = altitude - anchor;
    if (delta >= ELEVATION_THRESHOLD_M) {
      gain += delta;
      anchor = altitude;
    } else if (delta <= -ELEVATION_THRESHOLD_M) {
      loss += -delta;
      anchor = altitude;
    }
  }
  return { gain, loss };
}

export interface RecordingSummary {
  distanceMeters: number;
  /** Time on the clock with pauses removed. */
  activeSeconds: number;
  /** Active time minus stretches spent standing still. */
  movingSeconds: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
}

// Below this a fix-to-fix speed is "standing still" for moving time.
const MOVING_SPEED_MPS = 0.5;

export function summarizeRecording(
  points: readonly RecordedPoint[]
): RecordingSummary {
  const distances = cumulativeDistances(points);
  const active = cumulativeActiveSeconds(points);
  let moving = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].seg !== points[i - 1].seg) continue;
    const dt = (points[i].t - points[i - 1].t) / 1000;
    const dd = distances[i] - distances[i - 1];
    if (dt > 0 && dd / dt >= MOVING_SPEED_MPS) moving += dt;
  }
  const { gain, loss } = elevationGainLoss(points);
  return {
    distanceMeters: distances.length ? distances[distances.length - 1] : 0,
    activeSeconds: active.length ? active[active.length - 1] : 0,
    movingSeconds: moving,
    elevationGainMeters: gain,
    elevationLossMeters: loss,
  };
}

/** Seconds to cover one `unitMeters`, or null when nothing has been covered. */
export function paceSecondsPerUnit(
  distanceMeters: number,
  seconds: number,
  unitMeters: number
): number | null {
  if (!(distanceMeters > 0) || !(seconds > 0)) return null;
  return (seconds / distanceMeters) * unitMeters;
}

/**
 * Pace over roughly the last `windowMeters` of the track: what a watch shows
 * as "current pace". A single fix-to-fix pace jumps around too much to read.
 */
export function currentPaceSecondsPerUnit(
  points: readonly RecordedPoint[],
  unitMeters: number,
  windowMeters = 100
): number | null {
  if (points.length < 2) return null;
  const distances = cumulativeDistances(points);
  const active = cumulativeActiveSeconds(points);
  const last = points.length - 1;
  let from = last;
  while (from > 0 && distances[last] - distances[from] < windowMeters) from--;
  return paceSecondsPerUnit(
    distances[last] - distances[from],
    active[last] - active[from],
    unitMeters
  );
}

export interface RecordedSplit {
  /** 1-based. */
  index: number;
  distanceMeters: number;
  durationSeconds: number;
  /** Epoch ms of the split's boundaries on the wall clock. */
  startT: number;
  endT: number;
  /** True for the trailing stretch shorter than a full unit. */
  partial: boolean;
  /** Net height change over the split in metres, or null without altitude. */
  elevationChangeMeters?: number | null;
  /** Average heart rate over the split, or null with no readings in it. */
  avgHeartRate?: number | null;
}

/**
 * Per-km or per-mile splits. Boundaries are interpolated between the two
 * fixes that straddle them, so a split is exactly one unit long rather than
 * "as far as the next fix". A trailing stretch of at least 5% of a unit is
 * kept as a partial split.
 */
export function computeSplits(
  points: readonly RecordedPoint[],
  unitMeters: number
): RecordedSplit[] {
  if (points.length < 2 || !(unitMeters > 0)) return [];
  const distances = cumulativeDistances(points);
  const active = cumulativeActiveSeconds(points);
  const total = distances[distances.length - 1];
  const splits: RecordedSplit[] = [];

  // Instant (epoch ms), active-clock second and altitude at a path distance.
  const at = (
    target: number
  ): { t: number; active: number; alt: number | null } => {
    let i = 1;
    while (i < points.length - 1 && distances[i] < target) i++;
    const d0 = distances[i - 1];
    const d1 = distances[i];
    const ratio =
      d1 > d0 ? Math.min(1, Math.max(0, (target - d0) / (d1 - d0))) : 1;
    const alt0 = points[i - 1].alt;
    const alt1 = points[i].alt;
    return {
      t: points[i - 1].t + (points[i].t - points[i - 1].t) * ratio,
      active: active[i - 1] + (active[i] - active[i - 1]) * ratio,
      alt: alt0 !== null && alt1 !== null ? alt0 + (alt1 - alt0) * ratio : null,
    };
  };

  let startDistance = 0;
  let start = { t: points[0].t, active: active[0], alt: points[0].alt };
  let index = 1;
  while (startDistance + unitMeters <= total + 1e-6) {
    const endDistance = startDistance + unitMeters;
    const end = at(endDistance);
    splits.push({
      index,
      distanceMeters: unitMeters,
      durationSeconds: end.active - start.active,
      startT: start.t,
      endT: end.t,
      partial: false,
      elevationChangeMeters:
        start.alt !== null && end.alt !== null ? end.alt - start.alt : null,
    });
    index++;
    startDistance = endDistance;
    start = end;
  }
  const remainder = total - startDistance;
  if (remainder >= unitMeters * 0.05) {
    const lastActive = active[active.length - 1];
    splits.push({
      index,
      distanceMeters: remainder,
      durationSeconds: lastActive - start.active,
      startT: start.t,
      endT: points[points.length - 1].t,
      partial: true,
      elevationChangeMeters:
        start.alt !== null && points[points.length - 1].alt !== null
          ? (points[points.length - 1].alt as number) - start.alt
          : null,
    });
  }
  return splits;
}

/**
 * The same splits with each one's average heart rate from the readings that
 * fall inside it, or null when it holds none. Readings are epoch-ms samples.
 */
export function withSplitHeartRate(
  splits: readonly RecordedSplit[],
  samples: readonly { t: number; bpm: number }[]
): RecordedSplit[] {
  return splits.map((split) => {
    const inside = samples.filter(
      (sample) => sample.t >= split.startT && sample.t <= split.endT
    );
    return {
      ...split,
      avgHeartRate:
        inside.length > 0
          ? Math.round(
              inside.reduce((sum, sample) => sum + sample.bpm, 0) /
                inside.length
            )
          : null,
    };
  });
}

/**
 * Laps the person marked with the Lap button, as splits between the marks. The
 * stretch after the last mark runs to the end of the recording and counts as
 * `partial`, like a trailing split. Distance and active time at a mark are
 * interpolated between the fixes around it; a mark inside a pause takes the
 * fix before it, so a pause is never counted into a lap.
 *
 * `recordingEndT` is when the recording finished, which can be after the last
 * fix. A mark in that gap is kept. Distance and time are still clamped to the
 * last fix, so the gap is never invented as movement.
 */
export function computeLaps(
  points: readonly RecordedPoint[],
  marks: readonly number[],
  recordingEndT?: number
): RecordedSplit[] {
  if (points.length < 2) return [];
  const distances = cumulativeDistances(points);
  const active = cumulativeActiveSeconds(points);
  const first = points[0].t;
  const lastPointT = points[points.length - 1].t;
  const last = Math.max(lastPointT, recordingEndT ?? lastPointT);

  const at = (t: number): { distance: number; active: number } => {
    if (t <= first) return { distance: distances[0], active: active[0] };
    if (t >= lastPointT) {
      return {
        distance: distances[distances.length - 1],
        active: active[active.length - 1],
      };
    }
    let i = 1;
    while (i < points.length - 1 && points[i].t < t) i++;
    const before = points[i - 1];
    const after = points[i];
    if (before.seg !== after.seg) {
      return { distance: distances[i - 1], active: active[i - 1] };
    }
    const ratio = (t - before.t) / (after.t - before.t);
    return {
      distance: distances[i - 1] + (distances[i] - distances[i - 1]) * ratio,
      active: active[i - 1] + (active[i] - active[i - 1]) * ratio,
    };
  };

  const boundaries = [
    first,
    ...[...marks].sort((a, b) => a - b).filter((t) => t > first && t < last),
    last,
  ];
  const laps: RecordedSplit[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const start = at(boundaries[i - 1]);
    const end = at(boundaries[i]);
    const distanceMeters = end.distance - start.distance;
    // A lap pressed twice in a row, or right at the end, covers nothing.
    if (distanceMeters <= 0 && end.active - start.active <= 0) continue;
    laps.push({
      index: laps.length + 1,
      distanceMeters,
      durationSeconds: end.active - start.active,
      startT: boundaries[i - 1],
      endT: boundaries[i],
      partial: i === boundaries.length - 1,
    });
  }
  return laps;
}

/**
 * How long each split's bar is, 0 to 1, with faster splits longer, and which
 * split was fastest. Partial splits are drawn but never counted as the best,
 * since a few metres at a sprint is not a best kilometer.
 */
export function splitBars(
  splits: readonly RecordedSplit[],
  unitMeters: number
): { fraction: number; fastest: boolean }[] {
  const paces = splits.map((split) =>
    paceSecondsPerUnit(split.distanceMeters, split.durationSeconds, unitMeters)
  );
  const usable = paces.filter(
    (pace, i): pace is number =>
      pace !== null && Number.isFinite(pace) && !splits[i].partial
  );
  if (usable.length === 0)
    return splits.map(() => ({ fraction: 0, fastest: false }));
  const best = Math.min(...usable);
  const bestIndex = paces.findIndex(
    (pace, i) => pace === best && !splits[i].partial
  );
  return paces.map((pace, i) => ({
    fraction:
      pace === null || !Number.isFinite(pace) || pace <= 0
        ? 0
        : Math.min(1, best / pace),
    fastest: i === bestIndex,
  }));
}

/** Splits as the lap windows the server turns into per-lap stats. */
export function splitsToLapWindows(
  splits: readonly RecordedSplit[]
): WorkoutLapWindow[] {
  return splits.map((split) => ({
    lap_index: split.index,
    start_time: new Date(Math.round(split.startT)).toISOString(),
    end_time: new Date(Math.round(split.endT)).toISOString(),
  }));
}

/**
 * The most trackpoints one upload carries. The server accepts 50,000; this
 * stays well under it so a very long recording still uploads in one request.
 */
export const MAX_UPLOAD_POINTS = 20_000;

/**
 * Points in the wire shape the server stores, with cumulative distance. A
 * track longer than `maxPoints` is thinned evenly (first and last kept); the
 * distance on each kept point is still measured along the full path.
 */
export function toWorkoutGpsPoints(
  points: readonly RecordedPoint[],
  maxPoints: number = MAX_UPLOAD_POINTS
): GpsTrackPoint[] {
  const distances = cumulativeDistances(points);
  const stride = points.length > maxPoints ? points.length / maxPoints : 1;
  const out: GpsTrackPoint[] = [];
  let nextIndex = 0;
  for (let i = 0; i < points.length; i++) {
    const isLast = i === points.length - 1;
    if (i < Math.round(nextIndex) && !isLast) continue;
    nextIndex += stride;
    const p = points[i];
    const wire: GpsTrackPoint = {
      t: new Date(p.t).toISOString(),
      lat: p.lat,
      lon: p.lon,
      dist: Math.round(distances[i] * 10) / 10,
    };
    if (p.alt !== null) wire.alt = p.alt;
    if (p.speed !== null) wire.speed = p.speed;
    if (p.hacc !== null) wire.hacc = p.hacc;
    if (p.vacc !== null) wire.vacc = p.vacc;
    if (p.course !== null) wire.course = p.course;
    out.push(wire);
  }
  return out;
}

/** `m:ss` for under an hour, `h:mm:ss` beyond. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** `m:ss` per unit, or an em dash when there is no pace yet. */
export function formatPace(secondsPerUnit: number | null): string {
  if (secondsPerUnit === null || !Number.isFinite(secondsPerUnit)) return '—';
  // Anything slower than an hour per unit is a stationary reading, not a pace.
  if (secondsPerUnit > 3600) return '—';
  return formatClock(secondsPerUnit);
}

export type GpsSignalLevel = 'none' | 'weak' | 'fair' | 'good';

/** A fix older than this reads as no signal: the GPS has gone quiet. */
export const GPS_SIGNAL_STALE_MS = 15_000;

/**
 * How good the GPS is from the newest fix's accuracy radius: 10 m or better is
 * good, 25 m fair, anything coarser weak. The same rule the watch uses for its
 * signal bars.
 */
export function gpsSignalLevel(
  fix: { hacc: number; t: number } | null,
  now: number
): GpsSignalLevel {
  if (!fix || fix.hacc < 0 || now - fix.t > GPS_SIGNAL_STALE_MS) return 'none';
  if (fix.hacc <= 10) return 'good';
  if (fix.hacc <= 25) return 'fair';
  return 'weak';
}
