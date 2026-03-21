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
  metricDescriptors.forEach((descriptor: MetricDescriptor, position: number) => {
    const index = descriptor.metricsIndex ?? position;
    metricKeyToDataIndexMap[descriptor.key] = index;
  });

  const timestampIndex = metricKeyToDataIndexMap['directTimestamp'];
  const distanceIndex = metricKeyToDataIndexMap['sumDistance']; // may be undefined
  const speedIndex = metricKeyToDataIndexMap['directSpeed'];
  const heartRateIndex = metricKeyToDataIndexMap['directHeartRate'];
  const runCadenceIndex =
    metricKeyToDataIndexMap['directRunCadence'] ??
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
