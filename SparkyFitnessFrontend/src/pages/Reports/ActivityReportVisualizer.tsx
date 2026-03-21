import { ActivityCadenceChart } from '@/components/ExerciseCharts/ActivityCadenceChart';
import { ActivityElevationChart } from '@/components/ExerciseCharts/ActivityElevationChart';
import { ActivityHeartRateChart } from '@/components/ExerciseCharts/ActivityHeartRateChart';
import { ActivityHeartRateZonesChart } from '@/components/ExerciseCharts/ActivityHeartRateZoneChart';
import { ActivityPaceChart } from '@/components/ExerciseCharts/ActivityPaceChart';
import { ActivityStatsGrid } from '@/components/ExerciseCharts/ActivityStatsGrid';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActivityDetailsQuery } from '@/hooks/Exercises/useExercises';
import { processChartData } from '@/utils/activityReportUtil';
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

  const allChartData = processChartData(
    activityData.activity?.details?.activityDetailMetrics || [],
    activityData,
    loggingLevel,
    convertDistance,
    distanceUnit
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
  const totalActivityAscent = activityData.activity?.activity?.elevationGain || activityData.activity?.activity?.totalAscent || 0;
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
      activityData.activity.activity.distance,
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
              <ActivityStatsGrid
                distance={totalActivityDistanceFormatted}
                duration={totalActivityDurationFormatted}
                pace={averagePaceFormatted}
                ascent={totalActivityAscentFormatted}
                calories={totalActivityCaloriesFormatted}
                heartRate={averageHRFormatted}
                cadence={averageRunCadenceFormatted}
              />
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
                <ActivityPaceChart
                  data={paceData}
                  xAxisMode={xAxisMode}
                  getXAxisDataKey={getXAxisDataKey}
                  getXAxisLabel={getXAxisLabel}
                  distanceUnit={distanceUnit}
                />
              )}
              {heartRateData && heartRateData.length > 0 && (
                <ActivityHeartRateChart
                  data={heartRateData}
                  xAxisMode={xAxisMode}
                  getXAxisDataKey={getXAxisDataKey}
                  getXAxisLabel={getXAxisLabel}
                  distanceUnit={distanceUnit}
                />
              )}
              {runCadenceData && runCadenceData.length > 0 && (
                <ActivityCadenceChart
                  data={runCadenceData}
                  xAxisMode={xAxisMode}
                  getXAxisDataKey={getXAxisDataKey}
                  getXAxisLabel={getXAxisLabel}
                  distanceUnit={distanceUnit}
                />
              )}

              {elevationData && elevationData.length > 0 && (
                <ActivityElevationChart
                  data={elevationData}
                  xAxisMode={xAxisMode}
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
