import { DistanceUnit, LoggingLevel } from '@/contexts/PreferencesContext';
import { t } from 'i18next';
import { info, warn, error as logError } from '@/utils/logging';
import {
  ActivityDetailMetric,
  ActivityDetailsResponse,
} from '@/types/exercises';
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
export const getActivityIcon = (typeKey: string | undefined | null): string => {
  if (!typeKey) return '🏃';
  const key = typeKey.toLowerCase();

  if (
    key.includes('cycling') ||
    key.includes('biking') ||
    key === 'ride' ||
    key === 'virtualride' ||
    key === 'ebikeride' ||
    key === 'handcycle'
  )
    return '🚴';
  if (
    key.includes('running') ||
    key === 'run' ||
    key === 'virtualrun' ||
    key === 'trail_run' ||
    key === 'trailrun'
  )
    return '🏃';
  if (key.includes('swimming') || key === 'swim') return '🏊';
  if (key.includes('soccer') || key === 'football') return '⚽';
  if (key.includes('basketball')) return '🏀';
  if (key.includes('tennis')) return '🎾';
  if (key.includes('golf')) return '⛳';
  if (
    key.includes('hiking') ||
    key.includes('walking') ||
    key === 'walk' ||
    key === 'hike'
  )
    return '🚶';
  if (
    key.includes('strength') ||
    key.includes('weight') ||
    key === 'weighttraining'
  )
    return '🏋️';
  if (key.includes('yoga')) return '🧘';
  if (key.includes('rowing') || key === 'rowing') return '🚣';
  if (key.includes('skiing') || key === 'alpineski' || key === 'nordicski')
    return '⛷️';
  if (key.includes('snowboard')) return '🏂';
  if (key.includes('volleyball')) return '🏐';
  if (key.includes('hockey')) return '🏒';
  if (key.includes('rugby') || key.includes('americanfootball')) return '🏈';
  if (key.includes('boxing') || key.includes('martialarts')) return '🥊';
  if (key.includes('cardio') || key.includes('aerobic')) return '💪';
  if (key.includes('elliptical')) return '🔄';
  if (key.includes('stair') || key.includes('step')) return '🪜';
  if (key.includes('surf')) return '🏄';
  if (key.includes('climb')) return '🧗';

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

  // Fix: use metricsIndex from the descriptor object directly so that unknown
  // descriptor keys (e.g. directCadence, directPower) never shift the index of
  // subsequent known keys. Falls back to position-based counting for descriptors
  // that don't carry a metricsIndex field.
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
  activityName: string | null;
  activityTypeKey: string | null;
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
export function readActivityStats(
  activityData: ActivityDetailsResponse
): ActivityStats {
  const a = activityData?.activity?.activity ?? {};

  const pos = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // distance – Garmin stores km; Strava stores metres
  const garminDist = pos(a['distance']);
  const stravaDist =
    pos(a['distance']) !== null && (a['distance'] as number) > 1000
      ? (a['distance'] as number) / 1000
      : null;
  // If the stored value looks like metres (> 200 is a heuristic: no activity
  // shorter than 200 km), treat it as metres and convert.
  const rawDist = a['distance'] as number | undefined;
  const distance =
    rawDist != null && rawDist > 200
      ? rawDist / 1000
      : (garminDist ?? stravaDist);

  // duration – Garmin: minutes; Strava: seconds; Fitbit: milliseconds
  const rawDur = a['duration'] as number | undefined;
  const rawMoving = a['moving_time'] as number | undefined;
  const rawElapsed = a['elapsed_time'] as number | undefined;
  let duration: number | null = null;
  if (rawDur != null && rawDur > 0) {
    // Garmin already in minutes after server conversion;
    // Fitbit stores ms (typically > 60000 for a real workout)
    duration = rawDur > 1440 ? rawDur / 60000 : rawDur;
  } else if (rawMoving != null && rawMoving > 0) {
    duration = rawMoving / 60;
  } else if (rawElapsed != null && rawElapsed > 0) {
    duration = rawElapsed / 60;
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

  // pace – Garmin: min/km; derive from speed if missing
  const rawPace = pos(a['averagePace']);
  const avgSpeedMs = pos(a['averageSpeed']) ?? pos(a['average_speed']);
  const derivedPace =
    avgSpeedMs != null && avgSpeedMs > 0 ? 1000 / (avgSpeedMs * 60) : null;
  const pace = rawPace ?? derivedPace;

  const ascent =
    pos(a['totalAscent']) ??
    pos(a['elevationGain']) ??
    pos(a['total_elevation_gain']);

  // activity name / type
  const activityName =
    (a['activityName'] as string | undefined) ??
    (a['name'] as string | undefined) ??
    null;

  const activityTypeKey =
    (a['activityType'] as { typeKey?: string } | undefined)?.typeKey ??
    (a['sport_type'] as string | undefined) ??
    (a['type'] as string | undefined) ??
    null;

  return {
    distance,
    duration,
    calories,
    heartRate,
    cadence,
    pace,
    ascent,
    activityName,
    activityTypeKey,
  };
}

/** Format seconds as H:MM:SS (>= 1 h) or M:SS (< 1 h). */
export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);
  const ss = String(s).padStart(2, '0');
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  }
  return `${m}:${ss}`;
}

