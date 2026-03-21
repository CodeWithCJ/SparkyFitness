import { ActivityCadenceChart } from '@/components/ExerciseCharts/ActivityCadenceChart';
import { ActivityElevationChart } from '@/components/ExerciseCharts/ActivityElevationChart';
import { ActivityHeartRateChart } from '@/components/ExerciseCharts/ActivityHeartRateChart';
import { ActivityHeartRateZonesChart } from '@/components/ExerciseCharts/ActivityHeartRateZoneChart';
import { ActivityPaceChart } from '@/components/ExerciseCharts/ActivityPaceChart';
import { ActivityStatsGrid } from '@/components/ExerciseCharts/ActivityStatsGrid';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActivityDetailsQuery } from '@/hooks/Exercises/useExercises';
import {
  processChartData,
  getActivityIcon,
  getEventTypeLabel,
  readActivityStats,
  formatDuration,
} from '@/utils/activityReportUtil';
import { info } from '@/utils/logging';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ActivityReportLapTable from './ActivityReportLapTable';
import ActivityReportMap from './ActivityReportMap';
import WorkoutReportVisualizer from './WorkoutReportVisualizer';
import { ChartDataPoint } from '@/types/reports';

interface ActivityReportVisualizerProps {
  exerciseEntryId: string;
  providerName: string;
}

type XAxisMode = 'timeOfDay' | 'activityDuration' | 'distance';

interface HeartRateZone {
  zoneNumber: number;
  zoneLowBoundary: number;
  secsInZone: number;
}

const ActivityReportVisualizer = ({
  exerciseEntryId,
  providerName,
}: ActivityReportVisualizerProps) => {
  const { t } = useTranslation();
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>('timeOfDay');
  const {
    data: activityData,
    isLoading: loading,
    isError: error,
  } = useActivityDetailsQuery(exerciseEntryId, providerName);

  const {
    distanceUnit,
    convertDistance,
    loggingLevel,
    energyUnit,
    convertEnergy,
  } = usePreferences();

  const allChartData = activityData
    ? processChartData(
        activityData.activity?.details?.activityDetailMetrics || [],
        activityData,
        loggingLevel,
        convertDistance,
        distanceUnit
      )
    : [];

  const hasDistanceData =
    allChartData.length > 0 &&
    allChartData.some((d: ChartDataPoint) => d.distance > 0);

  // Derive the effective x-axis mode — fall back to timeOfDay when no distance data
  const effectiveXAxisMode: XAxisMode =
    !hasDistanceData && xAxisMode === 'distance' ? 'timeOfDay' : xAxisMode;

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

  // Provider-agnostic stats
  const stats = readActivityStats(activityData);

  // Distance: prefer chart data (most accurate after conversion), fall back to stats
  let totalActivityDistanceForDisplay: number | null = null;
  if (allChartData.length > 0 && hasDistanceData) {
    totalActivityDistanceForDisplay =
      allChartData[allChartData.length - 1]?.distance ?? null;
  } else if (stats.distance != null && stats.distance > 0) {
    totalActivityDistanceForDisplay = convertDistance(
      stats.distance,
      'km',
      distanceUnit
    );
  }

  // Pace: prefer stored value, fall back to chart calculation
  let averagePaceForDisplay: number | null = null;
  if (stats.pace != null && stats.pace > 0) {
    averagePaceForDisplay = stats.pace;
    if (distanceUnit === 'miles') {
      averagePaceForDisplay = averagePaceForDisplay * 1.60934;
    }
  } else if (paceData.length > 0) {
    const totalPace = paceData.reduce(
      (sum: number, dp: ChartDataPoint) => sum + dp.pace,
      0
    );
    let calculatedPace = totalPace / paceData.length;
    if (distanceUnit === 'miles') {
      calculatedPace = calculatedPace * 1.60934;
    }
    averagePaceForDisplay = calculatedPace > 0 ? calculatedPace : null;
  }

  // Duration in seconds for formatting
  const durationSeconds =
    stats.duration != null && stats.duration > 0 ? stats.duration * 60 : null;

  // Formatted stat strings — null means "hide the card"
  // Use >= 0.005 so values that round to "0.00" are treated as zero and hidden.
  const distanceFormatted =
    totalActivityDistanceForDisplay != null &&
    totalActivityDistanceForDisplay >= 0.005
      ? `${totalActivityDistanceForDisplay.toFixed(2)} ${distanceUnit}`
      : null;

  const durationFormatted =
    durationSeconds != null ? formatDuration(durationSeconds) : null;

  const paceFormatted =
    averagePaceForDisplay != null && averagePaceForDisplay > 0
      ? `${averagePaceForDisplay.toFixed(2)} /${distanceUnit === 'km' ? 'km' : 'mi'}`
      : null;

  const ascentFormatted =
    stats.ascent != null && stats.ascent > 0
      ? `${stats.ascent.toFixed(0)} m`
      : null;

  const caloriesFormatted =
    stats.calories != null && stats.calories > 0
      ? `${Math.round(convertEnergy(stats.calories, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`
      : null;

  const heartRateFormatted =
    stats.heartRate != null && stats.heartRate > 0
      ? `${stats.heartRate.toFixed(0)} bpm`
      : null;

  const cadenceFormatted =
    stats.cadence != null && stats.cadence > 0
      ? `${stats.cadence.toFixed(0)} spm`
      : null;

  const getXAxisDataKey = () => {
    switch (effectiveXAxisMode) {
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
    switch (effectiveXAxisMode) {
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

  const activityTypeKey = stats.activityTypeKey;

  return (
    <div className="activity-report-visualizer p-4">
      <div className="flex items-center mb-4">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
          <span className="text-xl">
            {activityData.activity ? getActivityIcon(activityTypeKey) : '🏋️'}
          </span>
        </div>
        <h2 className="text-2xl font-bold">
          {stats.activityName || activityData.workout?.workoutName}
        </h2>
        <span className="ml-2 text-gray-500 cursor-pointer">✏️</span>
      </div>

      {activityData &&
        activityData.activity &&
        activityData.activity.activity && (
          <>
            <div className="flex flex-wrap gap-4 mb-6 text-sm text-muted-foreground">
              {(() => {
                const eventLabel = getEventTypeLabel(
                  activityData.activity.activity.eventType
                );
                return eventLabel ? (
                  <span>
                    {t('reports.activityReport.event')} {eventLabel}
                  </span>
                ) : null;
              })()}
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
              <ActivityStatsGrid
                distance={distanceFormatted}
                duration={durationFormatted}
                pace={paceFormatted}
                ascent={ascentFormatted}
                calories={caloriesFormatted}
                heartRate={heartRateFormatted}
                cadence={cadenceFormatted}
              />
            </div>

            {allChartData.length > 0 && (
              <div className="mb-4">
                <span className="mr-2">
                  {t('reports.activityReport.xAxis')}
                </span>
                <button
                  className={`px-3 py-1 rounded-md text-sm ${effectiveXAxisMode === 'timeOfDay' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
                  onClick={() => setXAxisMode('timeOfDay')}
                >
                  {t('reports.activityReport.timeOfDay')}
                </button>
                <button
                  className={`ml-2 px-3 py-1 rounded-md text-sm ${effectiveXAxisMode === 'activityDuration' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
                  onClick={() => setXAxisMode('activityDuration')}
                >
                  {t('reports.activityReport.duration')}
                </button>
                {hasDistanceData && (
                  <button
                    className={`ml-2 px-3 py-1 rounded-md text-sm ${effectiveXAxisMode === 'distance' ? 'bg-blue-500 text-white' : 'bg-gray-700 text-white'}`}
                    onClick={() => setXAxisMode('distance')}
                  >
                    {t('reports.activityReport.distance')}
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {paceData && paceData.length > 0 && (
                <ActivityPaceChart
                  data={paceData}
                  xAxisMode={effectiveXAxisMode}
                  getXAxisDataKey={getXAxisDataKey}
                  getXAxisLabel={getXAxisLabel}
                  distanceUnit={distanceUnit}
                />
              )}
              {heartRateData && heartRateData.length > 0 && (
                <ActivityHeartRateChart
                  data={heartRateData}
                  xAxisMode={effectiveXAxisMode}
                  getXAxisDataKey={getXAxisDataKey}
                  getXAxisLabel={getXAxisLabel}
                  distanceUnit={distanceUnit}
                />
              )}
              {runCadenceData && runCadenceData.length > 0 && (
                <ActivityCadenceChart
                  data={runCadenceData}
                  xAxisMode={effectiveXAxisMode}
                  getXAxisDataKey={getXAxisDataKey}
                  getXAxisLabel={getXAxisLabel}
                  distanceUnit={distanceUnit}
                />
              )}

              {elevationData && elevationData.length > 0 && (
                <ActivityElevationChart
                  data={elevationData}
                  xAxisMode={effectiveXAxisMode}
                  getXAxisDataKey={getXAxisDataKey}
                  getXAxisLabel={getXAxisLabel}
                  distanceUnit={distanceUnit}
                />
              )}

              {hrInTimezonesData && hrInTimezonesData.length > 0 && (
                <ActivityHeartRateZonesChart data={hrInTimezonesData} />
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
