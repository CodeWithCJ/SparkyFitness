import {
  GpsTrackPoint,
  HealthMetricSamples,
  WorkoutHeartRatePoint,
  buildWorkoutHeartRateSeries,
} from '@workspace/shared';
import { ChartDataPoint } from '@/types/reports';
import {
  processChartData,
  processGpsPointsToChartData,
} from '@/utils/activityReportUtil';

export interface ExtractedWorkoutTelemetryPoint {
  timestamp: number;
  min: number;
  bpm: number;
  timeStr: string;
}

export interface ExtractedWorkoutTelemetry {
  points: ExtractedWorkoutTelemetryPoint[];
  avgBpm: number | null;
  maxBpm: number | null;
  startTimeLabel: string | null;
  endTimeLabel: string | null;
}

interface WorkoutInput {
  id: string;
  entry_date?: string;
  entry_time?: string | null;
  duration_minutes?: number | null;
  avg_heart_rate?: number | string | null;
  max_heart_rate?: number | string | null;
  [key: string]: unknown;
}

/** Formats a timestamp into "HH:mm" in a given IANA timezone. */
export const formatEpochToTimeString = (
  epochMs: number,
  timezone: string
): string => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone || 'UTC',
    }).format(new Date(epochMs));
  } catch {
    const d = new Date(epochMs);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(
      d.getUTCMinutes()
    ).padStart(2, '0')}`;
  }
};

/**
 * Single source of truth for extracting continuous heart rate telemetry for a workout.
 * Inspects in strict priority order:
 * 1. exercise_entry_gps_points (t, hr)
 * 2. exercise_entry_activity_details (Garmin / Polar metrics)
 * 3. health_metric_samples (wearable background samples matching workout window)
 */
export const extractWorkoutHeartRateSeries = (
  gpsPoints: GpsTrackPoint[] | undefined,
  activityData: Record<string, unknown> | undefined,
  hrSampleBuckets: readonly HealthMetricSamples[] | undefined,
  workout: WorkoutInput,
  timezone: string
): ExtractedWorkoutTelemetry => {
  let rawChartPoints: ChartDataPoint[] = [];

  // 1. High-frequency GPS trackpoints
  if (gpsPoints && gpsPoints.length > 0) {
    const rawGpsData = processGpsPointsToChartData(gpsPoints, (d) => d, 'km');
    rawChartPoints = rawGpsData.filter(
      (p) => p.heartRate !== null && p.heartRate > 0
    );
  }

  // 2. Garmin activityDetailMetrics fallback
  if (rawChartPoints.length === 0 && activityData) {
    const act = activityData['activity'] as Record<string, unknown> | undefined;
    const details = act?.['details'] as Record<string, unknown> | undefined;
    const metrics = (details?.['activityDetailMetrics'] ||
      (activityData['details'] as Record<string, unknown> | undefined)?.[
        'activityDetailMetrics'
      ]) as Array<{ metrics: string[] }> | undefined;

    if (Array.isArray(metrics) && metrics.length > 0) {
      const processed = processChartData(
        metrics,
        activityData,
        'SILENT',
        (d) => d,
        'km'
      );
      rawChartPoints = processed.filter(
        (p) => p.heartRate !== null && p.heartRate > 0
      );
    }
  }

  // 3. health_metric_samples wearable series fallback
  if (
    rawChartPoints.length === 0 &&
    hrSampleBuckets &&
    hrSampleBuckets.length > 0
  ) {
    const entryRecord = {
      entry_date: workout.entry_date,
      entry_time:
        typeof workout.entry_time === 'string' ? workout.entry_time : null,
      duration_minutes: workout.duration_minutes,
      record_timezone:
        typeof workout['record_timezone'] === 'string'
          ? workout['record_timezone']
          : null,
    };
    const wearSeries: WorkoutHeartRatePoint[] = buildWorkoutHeartRateSeries(
      hrSampleBuckets,
      workout.id,
      entryRecord,
      timezone
    );
    rawChartPoints = wearSeries.map((p: WorkoutHeartRatePoint) => ({
      timestamp: p.timestamp,
      activityDuration: p.elapsedMinutes,
      distance: 0,
      speed: 0,
      pace: 0,
      heartRate: p.bpm,
      runCadence: 0,
      elevation: null,
    }));
  }

  // Map into ExtractedWorkoutTelemetryPoint
  const points: ExtractedWorkoutTelemetryPoint[] = rawChartPoints.map((p) => {
    const bpm = Math.round(p.heartRate || 0);
    const min = Math.round(p.activityDuration);
    const timeStr = formatEpochToTimeString(p.timestamp, timezone);
    return {
      timestamp: p.timestamp,
      min,
      bpm,
      timeStr,
    };
  });

  // Calculate or fallback summary statistics
  const bpms = points.map((p) => p.bpm);
  const avgBpm =
    bpms.length > 0
      ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length)
      : workout.avg_heart_rate
        ? Math.round(Number(workout.avg_heart_rate))
        : null;

  const maxBpm =
    bpms.length > 0
      ? Math.max(...bpms)
      : workout.max_heart_rate
        ? Math.round(Number(workout.max_heart_rate))
        : null;

  let startTimeLabel: string | null = null;
  let endTimeLabel: string | null = null;

  if (points.length > 0) {
    startTimeLabel = points[0]?.timeStr ?? null;
    endTimeLabel = points[points.length - 1]?.timeStr ?? null;
  } else if (workout.entry_time) {
    const rawTime = String(workout.entry_time).slice(0, 5);
    startTimeLabel = rawTime;
    const durMins = Math.round(Number(workout.duration_minutes || 0));
    if (durMins > 0 && rawTime.includes(':')) {
      const [hStr, mStr] = rawTime.split(':');
      const startMinutes =
        parseInt(hStr || '0', 10) * 60 + parseInt(mStr || '0', 10);
      const endMinutes = (startMinutes + durMins) % 1440;
      const endH = Math.floor(endMinutes / 60);
      const endM = endMinutes % 60;
      endTimeLabel = `${String(endH).padStart(2, '0')}:${String(endM).padStart(
        2,
        '0'
      )}`;
    }
  }

  return {
    points,
    avgBpm,
    maxBpm,
    startTimeLabel,
    endTimeLabel,
  };
};
