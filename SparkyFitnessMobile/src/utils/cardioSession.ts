import type {
  ExerciseActivityQueryItem,
  ExerciseEntryHrZones,
  GpsTrackPoint,
  IndividualSessionResponse,
  WorkoutHeartRatePoint,
} from '@workspace/shared';
import { canEditGroupedWorkout } from '@workspace/shared';
import { haversineMeters } from './gpsRecording';
import { toFiniteNumber } from './numericInput';
import { distanceFromKm } from './unitConversions';

/** Trackpoints kept when drawing a route; plenty for a phone-width figure. */
const MAX_ROUTE_POINTS = 1500;

export interface ProjectedRoute {
  /** SVG path data in a `width` × `height` box. */
  d: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

type LatLon = Pick<GpsTrackPoint, 'lat' | 'lon'>;

/**
 * The fixes worth drawing, in order: finite, on the globe (maps clamp or
 * wrap anything else, so the map and the plain line would disagree), not 0,0
 * (what a sensor reports before it has a fix, not a place), and thinned to
 * at most MAX_ROUTE_POINTS while keeping the last one.
 */
export function usableRoutePoints(points: readonly LatLon[]): LatLon[] {
  const usable = points.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lon) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lon) <= 180 &&
      !(p.lat === 0 && p.lon === 0)
  );
  const step = Math.ceil(usable.length / MAX_ROUTE_POINTS);
  return usable.filter(
    (_, index) => index % step === 0 || index === usable.length - 1
  );
}

export interface RouteRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Smallest span shown, about 200 m, so a short or stationary track has context. */
const MIN_REGION_DELTA = 0.002;
/**
 * Largest spans shown, just under a full turn. At exactly 360° of longitude
 * the region's two edges are the same meridian, and Google Maps cannot fit
 * bounds between them; latitude gets the same margin below 180°.
 */
const MAX_LONGITUDE_DELTA = 359;
const MAX_LATITUDE_DELTA = 179;

/**
 * A map region around the route with a margin on every side, for the map's
 * first frame. Returns null for fewer than two usable points.
 */
export function routeRegion(
  points: readonly LatLon[],
  margin = 1.3
): RouteRegion | null {
  const usable = usableRoutePoints(points);
  if (usable.length < 2) return null;
  const lats = usable.map((p) => p.lat);
  const lons = usable.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lon = longitudeSpan(lons);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: lon.center,
    latitudeDelta: Math.min(
      Math.max((maxLat - minLat) * margin, MIN_REGION_DELTA),
      MAX_LATITUDE_DELTA
    ),
    longitudeDelta: Math.min(
      Math.max(lon.span * margin, MIN_REGION_DELTA),
      MAX_LONGITUDE_DELTA
    ),
  };
}

/**
 * The shortest arc of longitude holding every point. Sorted around the
 * circle, the points leave one widest empty gap; the route is the rest. For
 * an ordinary route that gap is the one across ±180°, which gives the plain
 * min-to-max span; for a route over the date line it is somewhere else.
 */
function longitudeSpan(lons: readonly number[]): {
  center: number;
  span: number;
} {
  const sorted = [...lons].sort((a, b) => a - b);
  const last = sorted.length - 1;
  // The gap after sorted[i] up to the next point, wrapping after the last.
  let gapIndex = last;
  let widestGap = (sorted[0] ?? 0) + 360 - (sorted[last] ?? 0);
  for (let i = 0; i < last; i++) {
    const gap = (sorted[i + 1] ?? 0) - (sorted[i] ?? 0);
    if (gap > widestGap) {
      widestGap = gap;
      gapIndex = i;
    }
  }
  const start = sorted[(gapIndex + 1) % sorted.length] ?? 0;
  const span = 360 - widestGap;
  let center = start + span / 2;
  if (center >= 180) center -= 360;
  return { center, span };
}

/**
 * Projects a GPS track into a box for drawing without map tiles. Longitude
 * is scaled by the cosine of the mean latitude so the shape is not stretched
 * east-west, and the route is centered and fit with its aspect kept.
 * Returns null for fewer than two usable points.
 */
export function projectRoute(
  points: readonly LatLon[],
  width: number,
  height: number,
  padding = 12
): ProjectedRoute | null {
  const sampled = usableRoutePoints(points);
  if (sampled.length < 2) return null;

  const meanLat = sampled.reduce((sum, p) => sum + p.lat, 0) / sampled.length;
  const lonScale = Math.cos((meanLat * Math.PI) / 180);
  const xs = sampled.map((p) => p.lon * lonScale);
  const ys = sampled.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale =
    spanX === 0 && spanY === 0
      ? 1
      : Math.min(
          spanX > 0 ? innerW / spanX : Infinity,
          spanY > 0 ? innerH / spanY : Infinity
        );
  const offsetX = padding + (innerW - spanX * scale) / 2;
  const offsetY = padding + (innerH - spanY * scale) / 2;

  const projected = xs.map((x, index) => ({
    x: offsetX + (x - minX) * scale,
    y: offsetY + ((ys[index] ?? 0) - minY) * scale,
  }));
  const d = projected
    .map(
      (p, index) =>
        `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    )
    .join(' ');
  return {
    d,
    start: projected[0] ?? { x: 0, y: 0 },
    end: projected[projected.length - 1] ?? { x: 0, y: 0 },
  };
}

/** Heart rate recorded on the trackpoints themselves, in time order. */
export function gpsHeartRateSeries(
  points: readonly GpsTrackPoint[]
): WorkoutHeartRatePoint[] {
  const series = points
    .filter((p) => typeof p.hr === 'number' && p.hr > 0)
    .map((p) => ({
      timestamp: Date.parse(p.t),
      bpm: p.hr as number,
      elapsedMinutes: 0,
    }))
    .filter((p) => Number.isFinite(p.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  const start = series[0]?.timestamp;
  if (start != null) {
    for (const point of series) {
      point.elapsedMinutes = (point.timestamp - start) / 60_000;
    }
  }
  return series;
}

export interface HeartRateZoneRow {
  zone: number;
  lowerBpm: number | null;
  upperBpm: number | null;
  seconds: number;
  /** Share of the time spent across all zones, 0-1. */
  share: number;
}

export function heartRateZoneRows(
  zones: readonly ExerciseEntryHrZones[]
): HeartRateZoneRow[] {
  return combinedHeartRateZoneRows([zones]);
}

/**
 * Time in each zone across several exercise entries: a whole workout, where
 * the watch stored zones per exercise. Seconds add up by zone; a zone's
 * bounds come from whichever entries carry them (they are computed from the
 * same max heart rate, so they agree), widest first. One entry's rows are
 * exactly `heartRateZoneRows` of it.
 */
export function combinedHeartRateZoneRows(
  zonesPerEntry: readonly (readonly ExerciseEntryHrZones[])[]
): HeartRateZoneRow[] {
  const byZone = new Map<
    number,
    { lowerBpm: number | null; upperBpm: number | null; seconds: number }
  >();
  for (const zones of zonesPerEntry) {
    for (const zone of zones) {
      const row = byZone.get(zone.zone_index) ?? {
        lowerBpm: null,
        upperBpm: null,
        seconds: 0,
      };
      row.seconds += Math.max(0, zone.seconds_in_zone);
      if (zone.zone_lower_bpm != null) {
        row.lowerBpm =
          row.lowerBpm == null
            ? zone.zone_lower_bpm
            : Math.min(row.lowerBpm, zone.zone_lower_bpm);
      }
      if (zone.zone_upper_bpm != null) {
        row.upperBpm =
          row.upperBpm == null
            ? zone.zone_upper_bpm
            : Math.max(row.upperBpm, zone.zone_upper_bpm);
      }
      byZone.set(zone.zone_index, row);
    }
  }
  const total = [...byZone.values()].reduce((sum, row) => sum + row.seconds, 0);
  return [...byZone.entries()]
    .sort(([a], [b]) => a - b)
    .map(([zone, row]) => ({
      zone,
      lowerBpm: row.lowerBpm,
      upperBpm: row.upperBpm,
      seconds: row.seconds,
      share: total > 0 ? row.seconds / total : 0,
    }));
}

/**
 * Maps a diary workout to the shape the cardio detail screen takes, or null
 * when that screen has nothing to add. Only synced workouts qualify: in-app
 * entries (manual, sparky, workout plan, or no source) carry no route, heart
 * rate, or zones, and strength sessions are logged as weight and reps. Pass
 * `allowInApp` for an in-app entry that is a run, walk or ride (a GPS
 * recording or watch run is saved as one).
 */
export function cardioSessionFromDiaryEntry(
  session: IndividualSessionResponse,
  distanceUnit: 'km' | 'miles',
  options: { allowInApp?: boolean } = {}
): ExerciseActivityQueryItem | null {
  if (!session.entry_date) return null;
  // In-app entries are skipped unless the caller asks for them.
  if (!options.allowInApp && canEditGroupedWorkout(session.source)) return null;
  if (session.exercise_snapshot?.modality === 'weight_reps') return null;
  if (session.sets.some((set) => set.weight != null || set.reps != null)) {
    return null;
  }

  const distanceKm =
    session.distance != null && session.distance > 0 ? session.distance : null;
  // The entry row comes straight from the database, where these columns are
  // numeric and so arrive as strings. Empty and zero both mean "not measured",
  // matching the server's activity item, so a walk shows no "0 floors".
  const floors = toFiniteNumber(session.floors_climbed);
  const elevationGain = toFiniteNumber(session.elevation_gain_meters);
  return {
    id: session.id,
    userId: '',
    exerciseName:
      session.name ??
      session.exercise_snapshot?.name ??
      session.category ??
      'Workout',
    category: session.category ?? session.exercise_snapshot?.category ?? null,
    entryDate: session.entry_date,
    entryTime: session.entry_time ?? null,
    durationMinutes: session.duration_minutes,
    movingDurationMinutes: null,
    distanceMeters: distanceKm != null ? distanceKm * 1000 : null,
    distanceFormatted:
      distanceKm != null ? distanceFromKm(distanceKm, distanceUnit) : null,
    avgPaceSecondsPerKm: null,
    formattedPace: null,
    caloriesBurned: session.calories_burned,
    avgHeartRate: session.avg_heart_rate,
    floorsClimbed: floors > 0 ? floors : null,
    elevationGainMeters: elevationGain > 0 ? elevationGain : null,
    source: session.source,
    notes: session.notes,
    hasGpsTrack: false,
  };
}

export interface PacePoint {
  /** Distance from the start, in the display unit (km or mi). */
  distance: number;
  /** Seconds per display unit. */
  paceSeconds: number;
}

/** Each pace reading spans at least this long, which smooths GPS jitter. */
const PACE_WINDOW_SECONDS = 30;
/** Readings slower than this (seconds per unit) are standing still. */
const MAX_PACE_SECONDS = 3600;
/** Points kept for the chart. */
const MAX_PACE_POINTS = 400;

/**
 * Pace along a recorded or imported route: for each stretch of at least
 * `PACE_WINDOW_SECONDS` between trackpoints, the seconds per kilometer or mile
 * over it, plotted at the distance where it ended. Stretches that are
 * standing still are left out, so a red light is a gap and not a spike to an
 * hour per kilometer. Uses each point's own `dist` when the track carries it,
 * and falls back to the path length between fixes.
 */
export function paceSeriesFromTrack(
  points: readonly GpsTrackPoint[],
  unitMeters: number
): PacePoint[] {
  if (points.length < 2 || !(unitMeters > 0)) return [];
  const samples: { t: number; meters: number }[] = [];
  let running = 0;
  let previous: GpsTrackPoint | null = null;
  for (const point of points) {
    const t = Date.parse(point.t);
    if (!Number.isFinite(t)) continue;
    // Out of order: leave the running distance and the previous fix alone.
    if (samples.length > 0 && t <= samples[samples.length - 1].t) continue;
    if (typeof point.dist === 'number' && Number.isFinite(point.dist)) {
      running = point.dist;
    } else if (previous) {
      running += haversineMeters(previous, point);
    }
    previous = point;
    samples.push({ t, meters: running });
  }

  return paceSeriesFromSamples(samples, unitMeters);
}

/**
 * A distance recorded against time with no route (an indoor session):
 * `[active seconds, cumulative metres]` rows, in the same windows as a track.
 */
export function paceSeriesFromDistance(
  rows: readonly (readonly number[])[],
  unitMeters: number
): PacePoint[] {
  if (rows.length < 2 || !(unitMeters > 0)) return [];
  const samples = rows
    .filter((row) => row.length >= 2)
    .map((row) => ({ t: row[0] * 1000, meters: row[1] }))
    .sort((a, b) => a.t - b.t);
  return paceSeriesFromSamples(samples, unitMeters);
}

function paceSeriesFromSamples(
  samples: readonly { t: number; meters: number }[],
  unitMeters: number
): PacePoint[] {
  const series: PacePoint[] = [];
  let anchor = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    const seconds = (sample.t - anchor.t) / 1000;
    if (seconds < PACE_WINDOW_SECONDS) continue;
    const meters = sample.meters - anchor.meters;
    if (meters > 0) {
      const pace = seconds / (meters / unitMeters);
      if (pace > 0 && pace <= MAX_PACE_SECONDS) {
        series.push({
          distance: sample.meters / unitMeters,
          paceSeconds: pace,
        });
      }
    }
    anchor = sample;
  }

  if (series.length <= MAX_PACE_POINTS) return series;
  const step = Math.ceil(series.length / MAX_PACE_POINTS);
  const kept = series.filter(
    (_, i) => i % step === 0 || i === series.length - 1
  );
  let fastest = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i].paceSeconds < series[fastest].paceSeconds) fastest = i;
  }
  if (kept.includes(series[fastest])) return kept;
  const fastestPoint = series[fastest];
  const insertAt = kept.findIndex(
    (sample) => sample.distance > fastestPoint.distance
  );
  if (insertAt === -1) kept.push(fastestPoint);
  else kept.splice(insertAt, 0, fastestPoint);
  return kept;
}
