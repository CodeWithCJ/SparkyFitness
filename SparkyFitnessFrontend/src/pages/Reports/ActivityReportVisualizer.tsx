import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import ZoomableChart from '@/components/ZoomableChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  FaRoute,
  FaClock,
  FaWalking,
  FaMountain,
  FaFire,
  FaHeartbeat,
  FaRunning,
} from 'react-icons/fa';
import ActivityReportLapTable from './ActivityReportLapTable';
import { info, warn, error as logError } from '@/utils/logging';
import ActivityReportMap from './ActivityReportMap';
import WorkoutReportVisualizer from './WorkoutReportVisualizer';
import { useActivityDetailsQuery } from '@/hooks/Exercises/useExercises';

interface ActivityReportVisualizerProps {
  exerciseEntryId: string;
  providerName: string;
}

type XAxisMode = 'timeOfDay' | 'activityDuration' | 'distance';

interface MetricDescriptor {
  key: string;
}

export interface ActivityDetailMetric {
  metrics: string[];
}

interface HeartRateZone {
  zoneNumber: number;
  zoneLowBoundary: number;
  secsInZone: number;
}

interface WorkoutStep {
  [key: string]: unknown;
}

export interface WorkoutData {
  workoutName: string;
  description?: string;
  sportType?: { sportTypeKey: string };
  estimatedDurationInSecs?: number;
  workoutSegments?: {
    segmentOrder: number;
    workoutSteps: WorkoutStep[];
  }[];
}

interface ChartDataPoint {
  timestamp: number;
  activityDuration: number;
  distance: number;
  speed: number;
  pace: number;
  heartRate: number | null;
  runCadence: number;
  elevation: number | null;
}

const ActivityReportVisualizer = ({
  exerciseEntryId,
  providerName,
}: ActivityReportVisualizerProps) => {
  const { t } = useTranslation();
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>('timeOfDay');
  const [isMounted, setIsMounted] = useState(false);
  const {
    data: activityData,
    isLoading: loading,
    isError: error,
  } = useActivityDetailsQuery(exerciseEntryId, providerName);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const {
    distanceUnit,
    convertDistance,
    loggingLevel,
    energyUnit,
    convertEnergy,
  } = usePreferences();

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };

  if (loading) {
    return <div>{t('reports.activityReport.loadingActivityReport')}</div>;
  }

  if (error) {
    return (
      <div className="text-red-500">
        {t('reports.activityReport.error', { error: String(error) })}
      </div>
    );
  }

  if (!activityData) {
    return <div>{t('reports.activityReport.noActivityDataAvailable')}</div>;
  }

  const processChartData = (
    metrics: ActivityDetailMetric[]
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
    const distanceDescriptor = metricDescriptors.find(
      (d: MetricDescriptor) => d.key === 'sumDistance'
    );

    if (!timestampDescriptor || !distanceDescriptor) {
      logError(
        loggingLevel,
        t('reports.activityReport.metricDescriptorsMissingKeys')
      );
      return [];
    }

    const heartRateDescriptor = metricDescriptors.find(
      (d: MetricDescriptor) => d.key === 'directHeartRate'
    );

    const metricKeyToDataIndexMap: { [key: string]: number } = {};
    let currentDataIndex = 0;

    metricDescriptors.forEach((descriptor: MetricDescriptor) => {
      if (descriptor.key === 'directHeartRate') {
        metricKeyToDataIndexMap['directHeartRate'] = currentDataIndex;
        currentDataIndex++;
      } else if (descriptor.key === 'sumElapsedDuration') {
        metricKeyToDataIndexMap['sumElapsedDuration'] = currentDataIndex;
        currentDataIndex++;
      } else if (descriptor.key === 'directAirTemperature') {
        metricKeyToDataIndexMap['directAirTemperature'] = currentDataIndex;
        currentDataIndex++;
      } else if (descriptor.key === 'directTimestamp') {
        metricKeyToDataIndexMap['directTimestamp'] = currentDataIndex;
        currentDataIndex++;
      } else if (descriptor.key === 'sumDistance') {
        metricKeyToDataIndexMap['sumDistance'] = currentDataIndex;
        currentDataIndex++;
      } else if (descriptor.key === 'directSpeed') {
        metricKeyToDataIndexMap['directSpeed'] = currentDataIndex;
        currentDataIndex++;
      } else if (descriptor.key === 'directRunCadence') {
        metricKeyToDataIndexMap['directRunCadence'] = currentDataIndex;
        currentDataIndex++;
      } else if (descriptor.key === 'directElevation') {
        metricKeyToDataIndexMap['directElevation'] = currentDataIndex;
        currentDataIndex++;
      }
    });

    const timestampIndex = metricKeyToDataIndexMap['directTimestamp'];
    const distanceIndex = metricKeyToDataIndexMap['sumDistance'];
    const speedIndex = metricKeyToDataIndexMap['directSpeed'];
    const heartRateIndex = metricKeyToDataIndexMap['directHeartRate'];
    const runCadenceIndex = metricKeyToDataIndexMap['directRunCadence'];
    const elevationIndex = metricKeyToDataIndexMap['directElevation'];

    if (!heartRateDescriptor) {
      warn(
        loggingLevel,
        t('reports.activityReport.heartRateDescriptorNotFound')
      );
    } else {
      info(
        loggingLevel,
        `Heart Rate Descriptor found at index: ${heartRateIndex}`
      );
    }

    if (timestampIndex === undefined || distanceIndex === undefined) {
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
      logError(
        loggingLevel,
        t('reports.activityReport.noValidTimestampsFound')
      );
      return [];
    }

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

    const processedMetrics = metrics
      .map((metric: ActivityDetailMetric): ChartDataPoint | null => {
        const currentTimestamp = parseFloat(
          metric.metrics[timestampIndex] ?? '0'
        );
        const currentDistance = parseFloat(
          metric.metrics[distanceIndex] ?? '0'
        );

        if (isNaN(currentTimestamp) || isNaN(currentDistance)) {
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

  const allChartData = processChartData(
    activityData.activity?.details?.activityDetailMetrics || []
  );

  const paceData = allChartData.filter(
    (data: ChartDataPoint) => data.speed > 0
  );
  const heartRateData = allChartData.filter(
    (data: ChartDataPoint) => data.heartRate !== null && data.heartRate > 0
  );
  const runCadenceData = allChartData.filter(
    (data: ChartDataPoint) => data.runCadence > 0
  );
  const elevationData = allChartData.filter(
    (data: ChartDataPoint) => data.elevation !== null
  );

  info(
    loggingLevel,
    'Pace Data Timestamps:',
    paceData.map((d: ChartDataPoint) => d.timestamp)
  );
  info(
    loggingLevel,
    'Heart Rate Data Timestamps:',
    heartRateData.map((d: ChartDataPoint) => d.timestamp)
  );
  info(
    loggingLevel,
    'Elevation Data Timestamps:',
    elevationData.map((d: ChartDataPoint) => d.timestamp)
  );
  info(loggingLevel, 'Filtered Heart Rate Data:', heartRateData);

  const rawHrZones = activityData.activity?.hr_in_timezones as
    | HeartRateZone[]
    | undefined;
  const hrInTimezonesData = rawHrZones?.map((zone) => ({
    name: `Zone ${zone.zoneNumber} (${zone.zoneLowBoundary} bpm)`,
    [t('reports.activityReport.timeInZoneS')]: zone.secsInZone,
  }));

  const totalActivityDurationSeconds =
    activityData.activity?.activity?.duration || 0;
  const totalActivityCalories = activityData.activity?.activity?.calories || 0;
  const totalActivityAscent = activityData.activity?.activity?.totalAscent || 0;
  const averageHR = activityData.activity?.activity?.averageHR || 0;
  const averageRunCadence =
    activityData.activity?.activity?.averageRunCadence || 0;

  let totalActivityDistanceForDisplay: number = 0;
  let averagePaceForDisplay: number = 0;

  if (allChartData.length > 0) {
    totalActivityDistanceForDisplay =
      allChartData[allChartData.length - 1]?.distance ?? 0;
  } else if (
    activityData.activity?.activity?.distance &&
    activityData.activity.activity.distance > 0
  ) {
    totalActivityDistanceForDisplay = convertDistance(
      activityData.activity.activity.distance / 1000,
      'km',
      distanceUnit
    );
  }

  if (
    activityData.activity?.activity?.averagePace &&
    activityData.activity.activity.averagePace > 0
  ) {
    averagePaceForDisplay = activityData.activity.activity.averagePace;
    if (distanceUnit === 'miles') {
      averagePaceForDisplay = averagePaceForDisplay * 1.60934;
    }
  } else if (paceData.length > 0) {
    const totalPaceKm = paceData.reduce(
      (sum: number, dataPoint: ChartDataPoint) => sum + dataPoint.pace,
      0
    );
    if (paceData.length > 0) {
      let calculatedPace = totalPaceKm / paceData.length;
      if (distanceUnit === 'miles') {
        calculatedPace = calculatedPace * 1.60934;
      }
      averagePaceForDisplay = calculatedPace;
    }
  }

  const totalActivityDurationFormatted =
    totalActivityDurationSeconds > 0
      ? `${Math.floor(totalActivityDurationSeconds / 60)}:${(totalActivityDurationSeconds % 60).toFixed(0).padStart(2, '0')}`
      : 'N/A';
  const totalActivityDistanceFormatted =
    totalActivityDistanceForDisplay > 0
      ? `${totalActivityDistanceForDisplay.toFixed(2)} ${distanceUnit}`
      : 'N/A';
  const averagePaceFormatted =
    averagePaceForDisplay > 0
      ? `${averagePaceForDisplay.toFixed(2)} /${distanceUnit === 'km' ? 'km' : 'mi'}`
      : 'N/A';
  const totalActivityAscentFormatted =
    totalActivityAscent > 0 ? `${totalActivityAscent.toFixed(0)}` : '--';
  const totalActivityCaloriesFormatted =
    totalActivityCalories > 0
      ? `${Math.round(convertEnergy(totalActivityCalories, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`
      : 'N/A';
  const averageHRFormatted =
    averageHR > 0 ? `${averageHR.toFixed(0)} bpm` : 'N/A';
  const averageRunCadenceFormatted =
    averageRunCadence > 0 ? `${averageRunCadence.toFixed(0)} spm` : 'N/A';

  const getXAxisDataKey = () => {
    switch (xAxisMode) {
      case 'activityDuration':
        return 'activityDuration';
      case 'distance':
        return 'distance';
      case 'timeOfDay':
      default:
        return 'timestamp';
    }
  };

  const getXAxisLabel = () => {
    switch (xAxisMode) {
      case 'activityDuration':
        return t('reports.activityReport.activityDurationMin');
      case 'distance':
        return (
          t('reports.activityReport.distance') +
          ` (${distanceUnit === 'km' ? 'km' : 'mi'})`
        );
      case 'timeOfDay':
      default:
        return t('reports.activityReport.timeOfDayLocal');
    }
  };

  return (
    <div className="activity-report-visualizer p-4">
      <div className="flex items-center mb-4">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
          <span className="text-xl">{activityData.activity ? '🏃' : '🏋️'}</span>
        </div>
        <h2 className="text-2xl font-bold">
          {activityData?.activity?.activity?.activityName ||
            activityData.workout?.workoutName}
        </h2>
        <span className="ml-2 text-gray-500 cursor-pointer">✏️</span>
      </div>

      {activityData &&
        activityData.activity &&
        activityData.activity.activity && (
          <>
            <div className="flex flex-wrap gap-4 mb-6 text-sm text-muted-foreground">
              {!!activityData.activity.activity.eventType && (
                <span>
                  {t('reports.activityReport.event')}{' '}
                  {typeof activityData.activity.activity.eventType ===
                    'object' &&
                  activityData.activity.activity.eventType !== null
                    ? (
                        activityData.activity.activity.eventType as {
                          typeKey: string;
                        }
                      ).typeKey || t('common.notApplicable')
                    : String(activityData.activity.activity.eventType)}
                </span>
              )}
              {!!activityData.activity?.activity.course && (
                <span className="mr-4">
                  {t('reports.activityReport.course')}{' '}
                  {typeof activityData.activity.activity.course === 'object' &&
                  activityData.activity.activity.course !== null
                    ? (
                        activityData.activity.activity.course as {
                          typeKey: string;
                        }
                      ).typeKey || t('common.notApplicable')
                    : String(activityData.activity.activity.course)}
                </span>
              )}
              {!!activityData.activity?.activity.gear && (
                <span className="mr-4">
                  {t('reports.activityReport.gear')}{' '}
                  {typeof activityData.activity.activity.gear === 'object' &&
                  activityData.activity.activity.gear !== null
                    ? (
                        activityData.activity.activity.gear as {
                          typeKey: string;
                        }
                      ).typeKey || t('common.notApplicable')
                    : String(activityData.activity.activity.gear)}
                </span>
              )}
            </div>

            {activityData.activity?.details?.geoPolylineDTO?.polyline &&
              activityData.activity.details.geoPolylineDTO.polyline.length >
                0 && (
                <div className="mb-8">
                  <h3 className="text-xl font-semibold mb-2">
                    {t('reports.activityReport.activityMap')}
                  </h3>
                  <ActivityReportMap
                    polylineData={
                      activityData.activity.details.geoPolylineDTO.polyline
                    }
                  />
                </div>
              )}

            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-2">
                {t('reports.activityReport.stats')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-sm font-medium">
                      {t('reports.activityReport.distance')}
                    </CardTitle>
                    <FaRoute className="h-5 w-5 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {totalActivityDistanceFormatted}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-sm font-medium">
                      {t('reports.activityReport.time')}
                    </CardTitle>
                    <FaClock className="h-5 w-5 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {totalActivityDurationFormatted}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-sm font-medium">
                      {t('reports.activityReport.avgPace')}
                    </CardTitle>
                    <FaWalking className="h-5 w-5 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {averagePaceFormatted}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-sm font-medium">
                      {t('reports.activityReport.totalAscent')}
                    </CardTitle>
                    <FaMountain className="h-5 w-5 text-gray-700" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {totalActivityAscentFormatted}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-sm font-medium">
                      {t('reports.activityReport.calories')}
                    </CardTitle>
                    <FaFire className="h-5 w-5 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {totalActivityCaloriesFormatted}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-sm font-medium">
                      {t('reports.activityReport.heartRate')}
                    </CardTitle>
                    <FaHeartbeat className="h-5 w-5 text-pink-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {averageHRFormatted}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-sm font-medium">
                      {t('reports.activityReport.runningDynamics')}
                    </CardTitle>
                    <FaRunning className="h-5 w-5 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {averageRunCadenceFormatted}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="mb-4">
              <span className="mr-2">{t('reports.activityReport.xAxis')}</span>
              <button
                className={`px-3 py-1 rounded-md text-sm ${xAxisMode === 'timeOfDay' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
                onClick={() => setXAxisMode('timeOfDay')}
              >
                {t('reports.activityReport.timeOfDay')}
              </button>
              <button
                className={`ml-2 px-3 py-1 rounded-md text-sm ${xAxisMode === 'activityDuration' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
                onClick={() => setXAxisMode('activityDuration')}
              >
                {t('reports.activityReport.duration')}
              </button>
              <button
                className={`ml-2 px-3 py-1 rounded-md text-sm ${xAxisMode === 'distance' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
                onClick={() => setXAxisMode('distance')}
              >
                {t('reports.activityReport.distance')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {paceData && paceData.length > 0 && (
                <ZoomableChart title={t('reports.activityReport.paceAndSpeed')}>
                  {(isMaximized, zoomLevel) => (
                    <Card
                      className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}
                    >
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {t('reports.activityReport.paceAndSpeed')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent
                        className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}
                      >
                        {isMounted ? (
                          <ResponsiveContainer
                            width={`${100 * zoomLevel}%`}
                            height={
                              isMaximized
                                ? `${100 * zoomLevel}%`
                                : 300 * zoomLevel
                            }
                            minWidth={0}
                            minHeight={0}
                            debounce={100}
                          >
                            <LineChart
                              data={paceData}
                              syncId="activityReportSync"
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey={getXAxisDataKey()}
                                label={{
                                  value: getXAxisLabel(),
                                  position: 'insideBottom',
                                  offset: -5,
                                }}
                                tickFormatter={(value) => {
                                  if (xAxisMode === 'activityDuration')
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  if (xAxisMode === 'distance')
                                    return `${Number(value).toFixed(2)}`;
                                  if (xAxisMode === 'timeOfDay')
                                    return new Date(value).toLocaleTimeString();
                                  return String(value);
                                }}
                                interval="preserveStartEnd"
                              />
                              <YAxis
                                yAxisId="left"
                                orientation="left"
                                stroke="#8884d8"
                              />
                              <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#82ca9d"
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'hsl(var(--background))',
                                  borderColor: 'hsl(var(--border))',
                                }}
                                labelFormatter={(value) => {
                                  if (xAxisMode === 'timeOfDay') {
                                    return new Date(value).toLocaleTimeString();
                                  }
                                  if (xAxisMode === 'activityDuration') {
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  }
                                  if (xAxisMode === 'distance') {
                                    return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                                  }
                                  return String(value);
                                }}
                              />
                              <Legend />
                              <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="pace"
                                stroke="#8884d8"
                                name={t('reports.activityReport.paceMinPerKm')}
                                dot={false}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="speed"
                                stroke="#82ca9d"
                                name={t('reports.activityReport.speedMPerS')}
                                dot={false}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[300px] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                            <span className="text-xs text-muted-foreground">
                              {t('common.loading', 'Loading chart...')}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </ZoomableChart>
              )}

              {heartRateData && heartRateData.length > 0 && (
                <ZoomableChart title={t('reports.activityReport.heartRateBpm')}>
                  {(isMaximized, zoomLevel) => (
                    <Card
                      className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}
                    >
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {t('reports.activityReport.heartRateBpm')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent
                        className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}
                      >
                        {isMounted ? (
                          <ResponsiveContainer
                            width={`${100 * zoomLevel}%`}
                            height={
                              isMaximized
                                ? `${100 * zoomLevel}%`
                                : 300 * zoomLevel
                            }
                            minWidth={0}
                            minHeight={0}
                            debounce={100}
                          >
                            <LineChart
                              data={heartRateData}
                              syncId="activityReportSync"
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey={getXAxisDataKey()}
                                label={{
                                  value: getXAxisLabel(),
                                  position: 'insideBottom',
                                  offset: -5,
                                }}
                                tickFormatter={(value) => {
                                  if (xAxisMode === 'activityDuration')
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  if (xAxisMode === 'distance')
                                    return `${Number(value).toFixed(2)}`;
                                  if (xAxisMode === 'timeOfDay')
                                    return new Date(value).toLocaleTimeString();
                                  return String(value);
                                }}
                                interval="preserveStartEnd"
                              />
                              <YAxis />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'hsl(var(--background))',
                                  borderColor: 'hsl(var(--border))',
                                }}
                                labelFormatter={(value) => {
                                  if (xAxisMode === 'timeOfDay') {
                                    return new Date(value).toLocaleTimeString();
                                  }
                                  if (xAxisMode === 'activityDuration') {
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  }
                                  if (xAxisMode === 'distance') {
                                    return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                                  }
                                  return String(value);
                                }}
                              />
                              <Legend />
                              <Line
                                type="monotone"
                                dataKey="heartRate"
                                stroke="#ff7300"
                                name={t('reports.activityReport.heartRateBpm')}
                                dot={false}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[300px] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                            <span className="text-xs text-muted-foreground">
                              {t('common.loading', 'Loading chart...')}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </ZoomableChart>
              )}

              {runCadenceData && runCadenceData.length > 0 && (
                <ZoomableChart
                  title={t('reports.activityReport.runCadenceSpM')}
                >
                  {(isMaximized, zoomLevel) => (
                    <Card
                      className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}
                    >
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {t('reports.activityReport.runCadenceSpM')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent
                        className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}
                      >
                        {isMounted ? (
                          <ResponsiveContainer
                            width={`${100 * zoomLevel}%`}
                            height={
                              isMaximized
                                ? `${100 * zoomLevel}%`
                                : 300 * zoomLevel
                            }
                            minWidth={0}
                            minHeight={0}
                            debounce={100}
                          >
                            <LineChart
                              data={runCadenceData}
                              syncId="activityReportSync"
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey={getXAxisDataKey()}
                                label={{
                                  value: getXAxisLabel(),
                                  position: 'insideBottom',
                                  offset: -5,
                                }}
                                tickFormatter={(value) => {
                                  if (xAxisMode === 'activityDuration')
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  if (xAxisMode === 'distance')
                                    return `${Number(value).toFixed(2)}`;
                                  if (xAxisMode === 'timeOfDay')
                                    return new Date(value).toLocaleTimeString();
                                  return String(value);
                                }}
                                interval="preserveStartEnd"
                              />
                              <YAxis />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'hsl(var(--background))',
                                  borderColor: 'hsl(var(--border))',
                                }}
                                labelFormatter={(value) => {
                                  if (xAxisMode === 'timeOfDay') {
                                    return new Date(value).toLocaleTimeString();
                                  }
                                  if (xAxisMode === 'activityDuration') {
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  }
                                  if (xAxisMode === 'distance') {
                                    return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                                  }
                                  return String(value);
                                }}
                              />
                              <Legend />
                              <Line
                                type="monotone"
                                dataKey="runCadence"
                                stroke="#387900"
                                name={t('reports.activityReport.runCadenceSpM')}
                                dot={false}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[300px] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                            <span className="text-xs text-muted-foreground">
                              {t('common.loading', 'Loading chart...')}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </ZoomableChart>
              )}

              {elevationData && elevationData.length > 0 && (
                <ZoomableChart title={t('reports.activityReport.elevationM')}>
                  {(isMaximized, zoomLevel) => (
                    <Card
                      className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}
                    >
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {t('reports.activityReport.elevationM')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent
                        className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}
                      >
                        {isMounted ? (
                          <ResponsiveContainer
                            width={`${100 * zoomLevel}%`}
                            height={
                              isMaximized
                                ? `${100 * zoomLevel}%`
                                : 300 * zoomLevel
                            }
                            minWidth={0}
                            minHeight={0}
                            debounce={100}
                          >
                            <LineChart
                              data={elevationData}
                              syncId="activityReportSync"
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey={getXAxisDataKey()}
                                label={{
                                  value: getXAxisLabel(),
                                  position: 'insideBottom',
                                  offset: -5,
                                }}
                                tickFormatter={(value) => {
                                  if (xAxisMode === 'activityDuration')
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  if (xAxisMode === 'distance')
                                    return `${Number(value).toFixed(2)}`;
                                  if (xAxisMode === 'timeOfDay')
                                    return new Date(value).toLocaleTimeString();
                                  return String(value);
                                }}
                                interval="preserveStartEnd"
                              />
                              <YAxis />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'hsl(var(--background))',
                                  borderColor: 'hsl(var(--border))',
                                }}
                                labelFormatter={(value) => {
                                  if (xAxisMode === 'timeOfDay') {
                                    return new Date(value).toLocaleTimeString();
                                  }
                                  if (xAxisMode === 'activityDuration') {
                                    return `${Number(value).toFixed(0)} ${t('common.min')}`;
                                  }
                                  if (xAxisMode === 'distance') {
                                    return `${Number(value).toFixed(2)} ${distanceUnit === 'km' ? 'km' : 'mi'}`;
                                  }
                                  return String(value);
                                }}
                                formatter={(value: number | undefined) =>
                                  Number(value).toFixed(2)
                                }
                              />
                              <Legend />
                              <Line
                                type="monotone"
                                dataKey="elevation"
                                stroke="#007bff"
                                name={t('reports.activityReport.elevationM')}
                                dot={false}
                                strokeWidth={2}
                                isAnimationActive={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[300px] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                            <span className="text-xs text-muted-foreground">
                              {t('common.loading', 'Loading chart...')}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </ZoomableChart>
              )}

              {hrInTimezonesData && hrInTimezonesData.length > 0 && (
                <ZoomableChart
                  title={t('reports.activityReport.heartRateTimeInZones')}
                >
                  {(isMaximized, zoomLevel) => (
                    <Card
                      className={`mb-8 ${isMaximized ? 'h-full flex flex-col' : ''}`}
                    >
                      <CardHeader>
                        <CardTitle className="text-sm">
                          {t('reports.activityReport.heartRateTimeInZones')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent
                        className={`flex-grow ${isMaximized ? 'min-h-0 h-full' : ''}`}
                      >
                        {isMounted ? (
                          <ResponsiveContainer
                            width={`${100 * zoomLevel}%`}
                            height={
                              isMaximized
                                ? `${100 * zoomLevel}%`
                                : 300 * zoomLevel
                            }
                            minWidth={0}
                            minHeight={0}
                            debounce={100}
                          >
                            <BarChart data={hrInTimezonesData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'hsl(var(--background))',
                                  borderColor: 'hsl(var(--border))',
                                }}
                                formatter={(value: number | undefined) =>
                                  value &&
                                  `${value.toFixed(2)} ${t('reports.activityReport.timeInZoneS')}`
                                }
                              />
                              <Legend />
                              <Bar
                                dataKey={t(
                                  'reports.activityReport.timeInZoneS'
                                )}
                                fill="#8884d8"
                                isAnimationActive={false}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-[300px] w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 rounded-md">
                            <span className="text-xs text-muted-foreground">
                              {t('common.loading', 'Loading chart...')}
                            </span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </ZoomableChart>
              )}
            </div>

            {activityData.activity?.splits?.lapDTOs &&
              activityData.activity.splits.lapDTOs.length > 0 && (
                <ZoomableChart title={t('reports.activityReport.lapsTable')}>
                  {(isMaximized, zoomLevel) => (
                    <ActivityReportLapTable
                      lapDTOs={activityData.activity!.splits?.lapDTOs ?? []}
                      isMaximized={isMaximized}
                      zoomLevel={zoomLevel}
                    />
                  )}
                </ZoomableChart>
              )}
          </>
        )}
      {activityData.workout && (
        <WorkoutReportVisualizer workoutData={activityData.workout} />
      )}
    </div>
  );
};

export default ActivityReportVisualizer;
