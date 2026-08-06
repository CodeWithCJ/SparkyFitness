import { DistanceUnit, LoggingLevel } from '@/contexts/PreferencesContext';
import { t } from 'i18next';
import { info, warn, error as logError } from '@/utils/logging';
import {
  ActivityDetailMetric,
  ActivityDetailsResponse,
} from '@/types/exercises';
import {
  ExerciseEntries,
  ExerciseEntryResponse,
  GpsTrackPoint,
} from '@workspace/shared';
import { ChartDataPoint } from '@/types/reports';

interface MetricDescriptor {
  key: string;
  metricsIndex?: number;
}

/**
 * Extracts elevation gain from a Garmin/Strava/Withings activity object.
 * Different providers use different field names:
 *   - Garmin Connect API (activity list): elevationGain
 *   - Garmin workout sessions:           totalAscent
 *   - Garmin mobile SDK:                 totalElevationGainInMeters
 *   - Strava:                            total_elevation_gain
 */
export const extractElevationGain = (
  activity: Record<string, unknown> | undefined | null
): number => {
  if (!activity) return 0;
  return (
    (activity['elevationGain'] as number) ||
    (activity['totalAscent'] as number) ||
    (activity['totalElevationGainInMeters'] as number) ||
    (activity['total_elevation_gain'] as number) ||
    0
  );
};

/**
 * Maps an activity type key to an emoji icon.
 * Handles provider-specific type keys (Garmin, Strava, Fitbit, Polar, Withings).
 * Falls back to 🏃 for unknown types.
 */
export const getActivityIcon = (
  typeKey: string | undefined | null,
  activityName?: string | undefined | null
): string => {
  const textToSearch = `${typeKey || ''} ${activityName || ''}`
    .toLowerCase()
    .trim();
  if (!textToSearch) return '🏃';

  if (
    textToSearch.includes('swim') ||
    textToSearch.includes('swimming') ||
    textToSearch.includes('water')
  )
    return '🏊';
  if (
    textToSearch.includes('cycling') ||
    textToSearch.includes('biking') ||
    textToSearch.includes('bike') ||
    textToSearch.includes('ride') ||
    textToSearch.includes('virtualride') ||
    textToSearch.includes('ebikeride') ||
    textToSearch.includes('handcycle')
  )
    return '🚴';
  if (
    textToSearch.includes('running') ||
    textToSearch.includes('run') ||
    textToSearch.includes('virtualrun') ||
    textToSearch.includes('trail_run') ||
    textToSearch.includes('trailrun') ||
    textToSearch.includes('treadmill') ||
    textToSearch.includes('jogging')
  )
    return '🏃';
  if (textToSearch.includes('soccer') || textToSearch.includes('football'))
    return '⚽';
  if (textToSearch.includes('basketball')) return '🏀';
  if (textToSearch.includes('tennis')) return '🎾';
  if (textToSearch.includes('golf')) return '⛳';
  if (
    textToSearch.includes('hiking') ||
    textToSearch.includes('walking') ||
    textToSearch.includes('walk') ||
    textToSearch.includes('hike')
  )
    return '🚶';
  if (
    textToSearch.includes('strength') ||
    textToSearch.includes('weight') ||
    textToSearch.includes('weighttraining') ||
    textToSearch.includes('barbell') ||
    textToSearch.includes('dumbbell')
  )
    return '🏋️';
  if (textToSearch.includes('yoga')) return '🧘';
  if (textToSearch.includes('rowing') || textToSearch.includes('row'))
    return '🚣';
  if (
    textToSearch.includes('skiing') ||
    textToSearch.includes('alpineski') ||
    textToSearch.includes('nordicski')
  )
    return '⛷️';
  if (textToSearch.includes('snowboard')) return '🏂';
  if (textToSearch.includes('volleyball')) return '🏐';
  if (textToSearch.includes('hockey')) return '🏒';
  if (
    textToSearch.includes('rugby') ||
    textToSearch.includes('americanfootball')
  )
    return '🏈';
  if (textToSearch.includes('boxing') || textToSearch.includes('martialarts'))
    return '🥊';
  if (textToSearch.includes('cardio') || textToSearch.includes('aerobic'))
    return '💪';
  if (textToSearch.includes('elliptical')) return '🔄';
  if (textToSearch.includes('stair') || textToSearch.includes('step'))
    return '🪜';
  if (textToSearch.includes('surf')) return '🏄';
  if (textToSearch.includes('climb')) return '🧗';

  return '🏃';
};

/**
 * Returns a meaningful event type label, or null if the value should be hidden.
 * Hides "uncategorized", empty, or missing event types.
 */
export const getEventTypeLabel = (eventType: unknown): string | null => {
  if (!eventType) return null;

  let label: string;
  if (typeof eventType === 'object' && eventType !== null) {
    label = (eventType as { typeKey?: string }).typeKey ?? '';
  } else {
    label = String(eventType);
  }

  if (!label || label.toLowerCase() === 'uncategorized') return null;
  return label;
};

/**
 * Providers whose raw `exercise_entries.source` string cannot just be
 * capitalized into a display name — either the source itself is a brand
 * mismatch (`healthkit` is Apple's API name, not what it calls the app;
 * `Apple Health`), or it's an internal alias that must collapse onto another
 * provider's label (`garmin_fit`, the FIT-file import path, is still Garmin
 * to the user, not its own brand). Every other provider — garmin, strava,
 * "Health Connect", a future Fitbit/Oura/Polar/Withings/Hevy integration —
 * needs no entry here: capitalizeWords already turns their raw source string
 * into the correct display name (verified: this app hardcodes "Garmin" as
 * plain text in several other places too, e.g. externalProviderService.ts —
 * there's no canonical provider-display-name table to defer to instead).
 *
 * `key` is present only where the label is worth resolving through
 * useTranslation() — i.e. a real product name (Apple Health), not an
 * internal alias like garmin_fit, which just needs the same plain string
 * "garmin" itself resolves to.
 *
 * Keys of this map are lowercased `exercise_entries.source` values; this is a
 * plain util, not a component, so it cannot call useTranslation() itself —
 * resolve with t(key, fallback) at the render boundary.
 */
const PROVIDER_LABEL_EXCEPTIONS: Record<
  string,
  { key?: string; fallback: string }
> = {
  garmin_fit: { fallback: 'Garmin' },
  healthkit: {
    key: 'reports.activityReport.provider.appleHealth',
    fallback: 'Apple Health',
  },
};

/** "health connect" / "garmin_fit" -> "Health Connect" / "Garmin Fit". */
const capitalizeWords = (value: string): string =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export interface ProviderLabel {
  /** Pass to t() when isTranslationKey is true; render as-is otherwise. */
  label: string;
  /** false for a provider with no known display name — label is the raw provider_name. */
  isTranslationKey: boolean;
  /** English text to pass as t()'s default; unused when isTranslationKey is false. */
  fallback: string;
}

/**
 * Resolves a provider_name to either a translation key (the small set of
 * providers in PROVIDER_LABEL_EXCEPTIONS) or a capitalized version of the raw
 * provider name (everything else) — never a hardcoded display string, so the
 * caller must resolve it with t() before rendering.
 *
 * Never pass provider_name (or this result) back into a query: it's matched
 * against `exercise_entry_activity_details.provider_name` in the database, so
 * anything other than the original raw value silently returns nothing.
 */
export const providerLabel = (
  providerName?: string | null
): ProviderLabel | null => {
  if (!providerName) return null;
  const entry = PROVIDER_LABEL_EXCEPTIONS[providerName.toLowerCase()];
  if (entry) {
    return entry.key
      ? { label: entry.key, isTranslationKey: true, fallback: entry.fallback }
      : {
          label: entry.fallback,
          isTranslationKey: false,
          fallback: entry.fallback,
        };
  }
  const capitalized = capitalizeWords(providerName);
  return { label: capitalized, isTranslationKey: false, fallback: capitalized };
};

export const processChartData = (
  metrics: ActivityDetailMetric[],
  activityData: ActivityDetailsResponse,
  loggingLevel: LoggingLevel,
  convertDistance: (
    value: number,
    from: DistanceUnit,
    to: DistanceUnit
  ) => number,
  distanceUnit: DistanceUnit
): ChartDataPoint[] => {
  if (!metrics || metrics.length === 0) return [];

  const rawMetricDescriptors =
    activityData?.activity?.details?.metricDescriptors;
  if (!rawMetricDescriptors) {
    logError(
      loggingLevel,
      t('reports.activityReport.metricDescriptorsNotFound')
    );
    return [];
  }

  const metricDescriptors = rawMetricDescriptors as MetricDescriptor[];
  const timestampDescriptor = metricDescriptors.find(
    (d: MetricDescriptor) => d.key === 'directTimestamp'
  );

  if (!timestampDescriptor) {
    logError(
      loggingLevel,
      t('reports.activityReport.metricDescriptorsMissingKeys')
    );
    return [];
  }

  const heartRateDescriptor = metricDescriptors.find(
    (d: MetricDescriptor) => d.key === 'directHeartRate'
  );

  // Build index map using metricsIndex from each descriptor (not a sequential counter).
  // Each descriptor's metricsIndex tells us exactly which slot in the metrics[] array
  // it occupies — unrecognised descriptors still consume slots and must not be skipped.
  // Falls back to position-based counting for descriptors that don't carry metricsIndex.
  const metricKeyToDataIndexMap: { [key: string]: number } = {};
  metricDescriptors.forEach(
    (descriptor: MetricDescriptor, position: number) => {
      const index = descriptor.metricsIndex ?? position;
      metricKeyToDataIndexMap[descriptor.key] = index;
    }
  );

  const timestampIndex = metricKeyToDataIndexMap['directTimestamp'];
  const distanceIndex = metricKeyToDataIndexMap['sumDistance']; // may be undefined
  const speedIndex = metricKeyToDataIndexMap['directSpeed'];
  const heartRateIndex = metricKeyToDataIndexMap['directHeartRate'];
  // Garmin uses directRunCadence (strides/min) on newer firmware; fall back to
  // directDoubleCadence (steps/min) which some activity types report instead.
  const runCadenceIndex =
    metricKeyToDataIndexMap['directRunCadence'] ??
    metricKeyToDataIndexMap['directDoubleCadence'] ??
    metricKeyToDataIndexMap['directCadence'];
  const elevationIndex = metricKeyToDataIndexMap['directElevation'];

  if (!heartRateDescriptor) {
    warn(loggingLevel, t('reports.activityReport.heartRateDescriptorNotFound'));
  } else {
    info(
      loggingLevel,
      `Heart Rate Descriptor found at index: ${heartRateIndex}`
    );
  }

  if (timestampIndex === undefined) {
    logError(
      loggingLevel,
      t('reports.activityReport.missingTimestampOrDistanceDescriptor')
    );
    return [];
  }

  let activityStartTime: number = 0;
  let initialDistance: number = 0;

  const REFERENCE_UNIX_EPOCH_START = 1000000000000;

  const relativeTimestamps: number[] = [];
  const absoluteTimestamps: number[] = [];

  for (const metric of metrics) {
    const ts = parseFloat(metric.metrics[timestampIndex] ?? '0');
    if (!isNaN(ts)) {
      if (ts < REFERENCE_UNIX_EPOCH_START) {
        relativeTimestamps.push(ts);
      } else {
        absoluteTimestamps.push(ts);
      }
    }
  }

  if (absoluteTimestamps.length > 0) {
    activityStartTime = Math.min(...absoluteTimestamps);
  } else if (relativeTimestamps.length > 0) {
    activityStartTime = Math.min(...relativeTimestamps);
  } else {
    logError(loggingLevel, t('reports.activityReport.noValidTimestampsFound'));
    return [];
  }

  if (distanceIndex !== undefined) {
    const firstDataPoint = metrics.find(
      (metric) =>
        parseFloat(metric.metrics[timestampIndex] ?? '0') === activityStartTime
    );
    if (firstDataPoint) {
      const dist = parseFloat(firstDataPoint.metrics[distanceIndex] ?? '0');
      initialDistance = !isNaN(dist) ? dist : 0;
    } else if (metrics.length > 0) {
      const firstMetricDistance = parseFloat(
        metrics[0]?.metrics[distanceIndex] ?? '0'
      );
      initialDistance = !isNaN(firstMetricDistance) ? firstMetricDistance : 0;
    }
  }

  const processedMetrics = metrics
    .map((metric: ActivityDetailMetric): ChartDataPoint | null => {
      const currentTimestamp = parseFloat(
        metric.metrics[timestampIndex] ?? '0'
      );

      if (isNaN(currentTimestamp)) {
        return null;
      }

      const currentDistance =
        distanceIndex !== undefined
          ? parseFloat(metric.metrics[distanceIndex] ?? '0')
          : 0;

      if (distanceIndex !== undefined && isNaN(currentDistance)) {
        return null;
      }

      const speed =
        speedIndex !== undefined && metric.metrics[speedIndex] !== undefined
          ? Number(metric.metrics[speedIndex])
          : 0;
      const heartRate =
        heartRateIndex !== undefined &&
        metric.metrics[heartRateIndex] !== undefined
          ? Number(metric.metrics[heartRateIndex])
          : null;
      const runCadence =
        runCadenceIndex !== undefined &&
        metric.metrics[runCadenceIndex] !== undefined
          ? Number(metric.metrics[runCadenceIndex])
          : 0;
      const elevation =
        elevationIndex !== undefined &&
        metric.metrics[elevationIndex] !== undefined
          ? Number(metric.metrics[elevationIndex])
          : null;

      const paceMinutesPerKm = speed > 0 ? 1000 / (speed * 60) : 0;
      const activityDurationSeconds =
        (currentTimestamp - activityStartTime) / 1000;
      const relativeDistanceMeters = currentDistance - initialDistance;

      return {
        timestamp: currentTimestamp,
        activityDuration: activityDurationSeconds / 60,
        distance: relativeDistanceMeters,
        speed: speed ? parseFloat(speed.toFixed(2)) : 0,
        pace:
          paceMinutesPerKm > 0 ? parseFloat(paceMinutesPerKm.toFixed(2)) : 0,
        heartRate: heartRate,
        runCadence: runCadence,
        elevation: elevation,
      };
    })
    .filter((metric): metric is ChartDataPoint => metric !== null);

  processedMetrics.sort((a, b) => a.timestamp - b.timestamp);

  const sampledData: ChartDataPoint[] = [];
  const maxPoints = 50;
  const samplingRate = Math.max(
    1,
    Math.floor(processedMetrics.length / maxPoints)
  );

  for (let i = 0; i < processedMetrics.length; i++) {
    if (i % samplingRate === 0 || i === processedMetrics.length - 1) {
      const processedMetric = processedMetrics[i];
      if (processedMetric) {
        sampledData.push(processedMetric);
      }
    }
  }

  return sampledData.map((dataPoint) => ({
    ...dataPoint,
    distance: convertDistance(dataPoint.distance / 1000, 'km', distanceUnit),
  }));
};

export const processGpsPointsToChartData = (
  // The workout's trackpoint array (ExerciseEntryGpsPoints.points), not the
  // wrapping row -- callers pass gpsData?.points.
  points: GpsTrackPoint[] | undefined,
  convertDistance: (
    value: number,
    from: DistanceUnit,
    to: DistanceUnit
  ) => number,
  distanceUnit: DistanceUnit
): ChartDataPoint[] => {
  if (!points || points.length === 0) return [];
  const firstPt = points[0];
  if (!firstPt) return [];
  const startTs = new Date(firstPt.t).getTime();
  const initialDist = firstPt.dist ?? 0;

  return points.map((pt) => {
    const currentTs = new Date(pt.t).getTime();
    const speed = pt.speed ?? 0;
    const paceMinutesPerKm = speed > 0 ? 1000 / (speed * 60) : 0;
    const relDistance = (pt.dist ?? 0) - initialDist;

    return {
      timestamp: currentTs,
      activityDuration: (currentTs - startTs) / 60000,
      distance: convertDistance(relDistance / 1000, 'km', distanceUnit),
      speed: speed ? parseFloat(speed.toFixed(2)) : 0,
      pace: paceMinutesPerKm > 0 ? parseFloat(paceMinutesPerKm.toFixed(2)) : 0,
      heartRate: pt.hr ?? null,
      runCadence: pt.cad ?? 0,
      elevation: pt.alt ?? null,
    };
  });
};

export interface ActivityStats {
  /** km */
  distance: number | null;
  /** minutes */
  duration: number | null;
  calories: number | null;
  /** bpm */
  heartRate: number | null;
  /** steps/min or rpm */
  cadence: number | null;
  /** min/km */
  pace: number | null;
  /** metres */
  ascent: number | null;
  /** ml */
  waterEstimated: number | null;
  activityName: string | null;
  activityTypeKey: string | null;
  /** seconds */
  movingTimeSeconds: number | null;
  /** seconds */
  elapsedTimeSeconds: number | null;
  /** seconds; strength-session "work time" (active set time, excludes rest/warm-up) */
  workTimeSeconds: number | null;
  restingCalories: number | null;
  activeCalories: number | null;
  /** m/s */
  avgMovingSpeedMps: number | null;
  /** metres */
  minElevation: number | null;
  /** metres */
  maxElevation: number | null;
  weatherTempCelsius: number | null;
  weatherCondition: string | null;
  gearName: string | null;
}

/**
 * Read summary stats from an activity detail record in a provider-agnostic way.
 *
 * Field priority per stat (first non-nullish positive value wins):
 *   distance   – Garmin: activity.distance (already km after server convert)
 *                Strava:  activity.distance / 1000 (stored in metres)
 *   duration   – Garmin: activity.duration (minutes after server convert)
 *                Strava:  activity.moving_time / 60  |  activity.elapsed_time / 60
 *                Fitbit:  activity.duration / 60000 (stored in ms)
 *   calories   – activity.calories  |  activity.active_calories
 *   heartRate  – Garmin: activity.averageHR
 *                Strava:  activity.average_heartrate
 *                Fitbit:  activity.averageHeartRate
 *   cadence    – Garmin: averageRunCadenceInStepsPerMinute | averageRunCadence
 *                Strava:  activity.average_cadence
 *   pace       – Garmin: activity.averagePace (min/km)
 *                derived: 1000 / (averageSpeed_m_s * 60)  (Strava / Garmin speed)
 *   ascent     – Garmin: activity.totalAscent | activity.elevationGain
 *                Strava:  activity.total_elevation_gain
 */
export function readActivityStatsFromRelational(
  entry:
    | Partial<ExerciseEntries>
    | Partial<ExerciseEntryResponse>
    | Record<string, unknown>
    | undefined
    | null
): ActivityStats {
  if (!entry) {
    return {
      distance: null,
      duration: null,
      calories: null,
      heartRate: null,
      cadence: null,
      pace: null,
      ascent: null,
      waterEstimated: null,
      activityName: null,
      activityTypeKey: null,
      movingTimeSeconds: null,
      elapsedTimeSeconds: null,
      workTimeSeconds: null,
      restingCalories: null,
      activeCalories: null,
      avgMovingSpeedMps: null,
      minElevation: null,
      maxElevation: null,
      weatherTempCelsius: null,
      weatherCondition: null,
      gearName: null,
    };
  }

  const pos = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  // Some columns (e.g. min_elevation_meters) can legitimately be 0 or negative
  // (below sea level); `pos` would incorrectly drop those.
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const e = entry as Record<string, unknown>;
  const distance = pos(e['distance']);
  const duration = pos(e['duration_minutes']);
  const calories = pos(e['calories_burned']);
  const heartRate = pos(e['avg_heart_rate']);
  const cadence = pos(e['avg_cadence']);
  const avgSpeedMs = pos(e['avg_speed_mps']);
  const pace =
    avgSpeedMs != null && avgSpeedMs > 0
      ? 1000 / (avgSpeedMs * 60)
      : distance && duration
        ? duration / distance
        : null;
  const ascent = pos(e['elevation_gain_meters']);
  const rawWater = e['water_estimated'] ?? e['water_estimated_ml'];
  const waterEstimated = pos(rawWater);
  const activityName = (e['exercise_name'] as string) ?? null;
  const activityTypeKey = (e['category'] as string) ?? activityName ?? null;

  return {
    distance,
    duration,
    calories,
    heartRate,
    cadence,
    pace,
    ascent,
    waterEstimated,
    activityName,
    activityTypeKey,
    movingTimeSeconds: pos(e['moving_time_seconds']),
    elapsedTimeSeconds: pos(e['elapsed_time_seconds']),
    workTimeSeconds: pos(e['work_time_seconds']),
    restingCalories: pos(e['resting_calories']),
    activeCalories: pos(e['active_calories']),
    avgMovingSpeedMps: pos(e['avg_moving_speed_mps']),
    minElevation: num(e['min_elevation_meters']),
    maxElevation: num(e['max_elevation_meters']),
    weatherTempCelsius: num(e['weather_temp_celsius']),
    weatherCondition: (e['weather_condition'] as string) ?? null,
    gearName: (e['gear_name'] as string) ?? null,
  };
}

/**
 * Read summary stats from an activity detail record or relational exercise entry in a provider-agnostic way.
 */
export function readActivityStats(
  activityData:
    | ActivityDetailsResponse
    | Partial<ExerciseEntries>
    | Partial<ExerciseEntryResponse>
    | undefined
    | null
): ActivityStats {
  if (!activityData) {
    return {
      distance: null,
      duration: null,
      calories: null,
      heartRate: null,
      cadence: null,
      pace: null,
      ascent: null,
      waterEstimated: null,
      activityName: null,
      activityTypeKey: null,
      movingTimeSeconds: null,
      elapsedTimeSeconds: null,
      workTimeSeconds: null,
      restingCalories: null,
      activeCalories: null,
      avgMovingSpeedMps: null,
      minElevation: null,
      maxElevation: null,
      weatherTempCelsius: null,
      weatherCondition: null,
      gearName: null,
    };
  }

  if (
    'duration_minutes' in activityData ||
    'exercise_name' in activityData ||
    'calories_burned' in activityData
  ) {
    return readActivityStatsFromRelational(
      activityData as Partial<ExerciseEntries>
    );
  }

  const a = (activityData as ActivityDetailsResponse)?.activity?.activity ?? {};

  const pos = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // distance – Garmin stores km (converted server-side); Strava stores metres.
  const isStrava =
    a['sport_type'] != null ||
    a['moving_time'] != null ||
    a['elapsed_time'] != null;
  const rawDist = a['distance'] as number | undefined;
  const distance =
    rawDist != null && rawDist > 0
      ? isStrava
        ? rawDist / 1000 // Strava: metres → km
        : rawDist // Garmin: already km after server conversion
      : null;

  // duration – Garmin: minutes (converted server-side); Strava: seconds; Fitbit: ms.
  const isFitbit =
    a['activeDuration'] != null ||
    a['averageHeartRate'] != null ||
    a['logId'] != null;
  const rawDur = a['duration'] as number | undefined;
  const rawMoving = a['moving_time'] as number | undefined;
  const rawElapsed = a['elapsed_time'] as number | undefined;
  const rawFitbitDur = a['activeDuration'] as number | undefined;
  let duration: number | null = null;
  if (rawFitbitDur != null && rawFitbitDur > 0) {
    duration = rawFitbitDur / 60000;
  } else if (isFitbit && rawDur != null && rawDur > 0) {
    duration = rawDur / 60000;
  } else if (rawMoving != null && rawMoving > 0) {
    duration = rawMoving / 60;
  } else if (rawElapsed != null && rawElapsed > 0) {
    duration = rawElapsed / 60;
  } else if (rawDur != null && rawDur > 0) {
    duration = rawDur;
  }

  const calories = pos(a['calories']) ?? pos(a['active_calories']);

  const heartRate =
    pos(a['averageHR']) ??
    pos(a['average_heartrate']) ??
    pos(a['averageHeartRate']);

  const cadence =
    pos(a['averageRunCadenceInStepsPerMinute']) ??
    pos(a['averageRunCadence']) ??
    pos(a['average_cadence']);

  const rawPace = pos(a['averagePace']);
  const avgSpeedMs = pos(a['averageSpeed']) ?? pos(a['average_speed']);
  const derivedPace =
    avgSpeedMs != null && avgSpeedMs > 0 ? 1000 / (avgSpeedMs * 60) : null;
  const pace = rawPace ?? derivedPace;

  const ascent =
    pos(a['totalAscent']) ??
    pos(a['elevationGain']) ??
    pos(a['total_elevation_gain']);

  const waterEstimated = pos(a['waterEstimated']);

  const activityName =
    (a['activityName'] as string | undefined) ??
    (a['name'] as string | undefined) ??
    null;

  const activityTypeKey =
    (a['activityType'] as { typeKey?: string } | undefined)?.typeKey ??
    (a['sport_type'] as string | undefined) ??
    (a['type'] as string | undefined) ??
    activityName ??
    null;

  return {
    distance,
    duration,
    calories,
    heartRate,
    cadence,
    pace,
    ascent,
    waterEstimated,
    activityName,
    activityTypeKey,
    // Only populated from the relational path (readActivityStatsFromRelational above) —
    // no equivalent field exists in the raw provider blob parsed below.
    movingTimeSeconds: null,
    elapsedTimeSeconds: null,
    workTimeSeconds: null,
    restingCalories: null,
    activeCalories: null,
    avgMovingSpeedMps: null,
    minElevation: null,
    maxElevation: null,
    weatherTempCelsius: null,
    weatherCondition: null,
    gearName: null,
  };
}

/** Format seconds as H:MM:SS (>= 1 h) or M:SS (< 1 h), optionally appending time unit (h:m:s or m:s). */
export function formatDuration(
  totalSeconds: number,
  includeUnit: boolean = false
): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    const formatted = `${h}:${String(m).padStart(2, '0')}:${ss}`;
    return includeUnit ? `${formatted} h:m:s` : formatted;
  }
  const formatted = `${m}:${ss}`;
  return includeUnit ? `${formatted} m:s` : formatted;
}

/**
 * Format decimal pace (minutes per km/mi) into M:SS min/km or M:SS min/mi.
 * e.g. 6.88 min/km -> "6:53 min/km"
 */
export function formatPace(
  paceMinPerUnit: number | null | undefined,
  unit: DistanceUnit = 'km'
): string | null {
  if (
    paceMinPerUnit == null ||
    !Number.isFinite(paceMinPerUnit) ||
    paceMinPerUnit <= 0
  ) {
    return null;
  }
  let minutes = Math.floor(paceMinPerUnit);
  let seconds = Math.round((paceMinPerUnit - minutes) * 60);
  if (seconds >= 60) {
    minutes += 1;
    seconds = 0;
  }
  const unitStr = unit === 'km' ? 'min/km' : 'min/mi';
  return `${minutes}:${String(seconds).padStart(2, '0')} ${unitStr}`;
}
