import { ActivityCadenceChart } from '@/components/ExerciseCharts/ActivityCadenceChart';
import { ActivityElevationChart } from '@/components/ExerciseCharts/ActivityElevationChart';
import { ActivityHeartRateChart } from '@/components/ExerciseCharts/ActivityHeartRateChart';
import { ActivityHeartRateZonesChart } from '@/components/ExerciseCharts/ActivityHeartRateZoneChart';
import { ActivityPaceChart } from '@/components/ExerciseCharts/ActivityPaceChart';
import { ActivityStatsGrid } from '@/components/ExerciseCharts/ActivityStatsGrid';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useActivityDetailsQuery,
  useExerciseEntryById,
} from '@/hooks/Exercises/useExercises';
import {
  useWorkoutGpsPoints,
  useWorkoutLaps,
  useWorkoutHrZones,
} from '@/hooks/useGenericHealth';
import {
  processChartData,
  processGpsPointsToChartData,
  getActivityIcon,
  getEventTypeLabel,
  readActivityStats,
  readActivityStatsFromRelational,
  formatDuration,
  formatPace,
} from '@/utils/activityReportUtil';
import {
  convertMlToSelectedUnit,
  getEnergyUnitString,
} from '@/utils/nutritionCalculations';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ActivityReportLapTable from './ActivityReportLapTable';
import WorkoutSessionBreakdown from '@/components/ExerciseCharts/WorkoutSessionBreakdown';
import ActivityReportMap from './ActivityReportMap';
import WorkoutReportVisualizer from './WorkoutReportVisualizer';
import { ChartDataPoint } from '@/types/reports';

interface ActivityReportVisualizerProps {
  exerciseEntryId: string;
  providerName: string;
}

type XAxisMode = 'timeOfDay' | 'activityDuration' | 'distance';

const ActivityReportVisualizer = ({
  exerciseEntryId,
  providerName,
}: ActivityReportVisualizerProps) => {
  const { t } = useTranslation();
  const [xAxisMode, setXAxisMode] = useState<XAxisMode>('timeOfDay');
  const { data: exerciseEntry, isLoading: entryLoading } =
    useExerciseEntryById(exerciseEntryId);
  const { data: activityData, isLoading: activityLoading } =
    useActivityDetailsQuery(exerciseEntryId, providerName);

  const {
    distanceUnit,
    convertDistance,
    loggingLevel,
    energyUnit,
    convertEnergy,
    water_display_unit,
  } = usePreferences();

  // useWorkoutGpsPoints returns one row for the whole workout (its `points`
  // array holds every trackpoint), not a list of point-rows.
  const { data: gpsRow, isLoading: gpsLoading } =
    useWorkoutGpsPoints(exerciseEntryId);
  const gpsPoints = gpsRow?.points;
  const { data: dbLaps } = useWorkoutLaps(exerciseEntryId);
  const { data: dbHrZones } = useWorkoutHrZones(exerciseEntryId);

  // `||` (not `&&`): render the loading state until every source has settled, so we
  // never flash a chart built from partial data while a slower query is still in flight.
  const loading = entryLoading || activityLoading || gpsLoading;

  const effectiveLaps = useMemo(() => {
    if (dbLaps && dbLaps.length > 0) {
      return dbLaps.map((l) => ({
        lapIndex: l.lap_index,
        startTimeLocal: l.start_time ? String(l.start_time) : '',
        endTimeLocal: l.end_time ? String(l.end_time) : '',
        duration: l.duration_seconds,
        distance: l.distance_meters != null ? l.distance_meters / 1000 : 0,
        calories: l.calories ?? 0,
        averageHR: l.avg_heart_rate ?? 0,
        maxHR: l.max_heart_rate ?? 0,
        averageSpeed: l.avg_speed_mps ?? 0,
        maxSpeed: l.max_speed_mps ?? 0,
        averageRunCadence: l.avg_cadence ?? 0,
        elevationGain: l.elevation_gain_meters ?? 0,
        elevationLoss: l.elevation_loss_meters ?? 0,
      }));
    }
    return activityData?.activity?.splits?.lapDTOs || [];
  }, [dbLaps, activityData]);

  const allChartData = useMemo(() => {
    if (gpsPoints && gpsPoints.length > 0) {
      return processGpsPointsToChartData(
        gpsPoints,
        convertDistance,
        distanceUnit
      );
    }
    const metrics = activityData?.activity?.details?.activityDetailMetrics;
    if (activityData && Array.isArray(metrics) && metrics.length > 0) {
      return processChartData(
        metrics,
        activityData,
        loggingLevel,
        convertDistance,
        distanceUnit
      );
    }
    return [];
  }, [gpsPoints, activityData, loggingLevel, convertDistance, distanceUnit]);

  const hasDistanceData =
    allChartData.length > 0 &&
    allChartData.some((d: ChartDataPoint) => d.distance > 0);

  const effectiveXAxisMode: XAxisMode =
    !hasDistanceData && xAxisMode === 'distance' ? 'timeOfDay' : xAxisMode;

  const stats = useMemo(() => {
    if (exerciseEntry) {
      const relStats = readActivityStatsFromRelational(exerciseEntry);
      if (
        relStats.distance != null ||
        relStats.duration != null ||
        relStats.heartRate != null ||
        relStats.activityName != null
      ) {
        return relStats;
      }
    }
    return readActivityStats(activityData);
  }, [exerciseEntry, activityData]);

  const exerciseCount = useMemo(() => {
    const activityObj = activityData?.['activity'] as
      | Record<string, unknown>
      | undefined;
    const exerciseSetsObj = activityObj?.['exercise_sets'] as
      | Record<string, unknown>
      | undefined;
    const rawSets = exerciseSetsObj?.['exerciseSets'] as
      | Array<Record<string, unknown>>
      | undefined;

    if (Array.isArray(rawSets) && rawSets.length > 0) {
      const names = new Set<string>();
      rawSets.forEach((s: Record<string, unknown>) => {
        if (s['setType'] === 'REST') return;
        const exList = s['exercises'] as
          | Array<Record<string, unknown>>
          | undefined;
        if (exList && exList[0]) {
          names.add(
            (exList[0]['name'] as string) ||
              (exList[0]['category'] as string) ||
              'Exercise'
          );
        } else if (s['category']) {
          names.add(s['category'] as string);
        }
      });
      return names.size;
    }
    return 0;
  }, [activityData]);

  if (loading) {
    return <div>{t('reports.activityReport.loadingActivityReport')}</div>;
  }

  if (
    !exerciseEntry &&
    !activityData &&
    (!gpsPoints || gpsPoints.length === 0)
  ) {
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

  // Prefer the relational hr_zones table; only fall back to the raw provider blob for
  // activities synced before this table existed / before the backfill has run.
  let hrInTimezonesData:
    | Array<{ name: string; [key: string]: string | number }>
    | undefined;
  if (dbHrZones && dbHrZones.length > 0) {
    hrInTimezonesData = dbHrZones.map((zone) => ({
      name: `Zone ${zone.zone_index} (${zone.zone_lower_bpm ?? 0} bpm)`,
      [t('reports.activityReport.timeInZoneS')]: zone.seconds_in_zone,
    }));
  } else {
    const rawHrZones = activityData?.activity?.hr_in_timezones as
      | Array<{
          zoneNumber: number;
          zoneLowBoundary: number;
          secsInZone: number;
        }>
      | undefined;
    hrInTimezonesData = rawHrZones?.map((zone) => ({
      name: `Zone ${zone.zoneNumber} (${zone.zoneLowBoundary} bpm)`,
      [t('reports.activityReport.timeInZoneS')]: zone.secsInZone,
    }));
  }

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
  // Minimum display threshold: hides values that would round to "0.00" (e.g. GPS drift).
  const MIN_DISTANCE_FOR_DISPLAY = 0.005;
  const distanceFormatted =
    totalActivityDistanceForDisplay != null &&
    totalActivityDistanceForDisplay >= MIN_DISTANCE_FOR_DISPLAY
      ? `${totalActivityDistanceForDisplay.toFixed(2)} ${distanceUnit}`
      : null;

  const durationFormatted =
    durationSeconds != null ? formatDuration(durationSeconds, true) : null;

  const paceFormatted = formatPace(averagePaceForDisplay, distanceUnit);

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

  const waterLossFormatted =
    stats.waterEstimated != null && stats.waterEstimated > 0
      ? `${convertMlToSelectedUnit(stats.waterEstimated, water_display_unit).toFixed(water_display_unit === 'ml' ? 0 : 1)} ${water_display_unit}`
      : null;

  // Garmin-parity stats (Phase C3) — all sourced from the relational exercise_entries
  // columns added in 20260731000000_complete_workout_telemetry.sql, never the JSON blob.
  const movingTimeFormatted =
    stats.movingTimeSeconds != null
      ? formatDuration(stats.movingTimeSeconds, true)
      : null;

  const elapsedTimeFormatted =
    stats.elapsedTimeSeconds != null
      ? formatDuration(stats.elapsedTimeSeconds, true)
      : null;

  // Stored values are kcal; convert before labelling with the selected unit.
  const caloriesBreakdownFormatted =
    stats.activeCalories != null || stats.restingCalories != null
      ? `${Math.round(convertEnergy(stats.activeCalories ?? 0, 'kcal', energyUnit))} / ${Math.round(convertEnergy(stats.restingCalories ?? 0, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`
      : null;

  // formatPace only formats — the caller converts, as the average-pace block
  // above does. Without this the value stayed min/km under a "/mi" label.
  const avgMovingSpeedFormatted = (() => {
    if (stats.avgMovingSpeedMps == null || stats.avgMovingSpeedMps <= 0) {
      return null;
    }
    const minPerKm = 1000 / (stats.avgMovingSpeedMps * 60);
    const paceForUnit =
      distanceUnit === 'miles' ? minPerKm * 1.60934 : minPerKm;
    return formatPace(paceForUnit, distanceUnit);
  })();

  const elevationRangeFormatted =
    stats.minElevation != null && stats.maxElevation != null
      ? `${stats.minElevation.toFixed(0)} / ${stats.maxElevation.toFixed(0)} m`
      : null;

  const weatherFormatted =
    stats.weatherTempCelsius != null || stats.weatherCondition
      ? [
          stats.weatherTempCelsius != null
            ? `${stats.weatherTempCelsius.toFixed(0)}°C`
            : null,
          stats.weatherCondition,
        ]
          .filter(Boolean)
          .join(', ')
      : null;

  const gearFormatted = stats.gearName || null;

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

  const rawTypeKey = stats.activityTypeKey;
  const isGeneric =
    !rawTypeKey || rawTypeKey === 'custom' || rawTypeKey === 'other';
  const activityTypeKey = isGeneric
    ? stats.activityName ||
      ((exerciseEntry as Record<string, unknown>)?.[
        'exercise_name'
      ] as string) ||
      ((exerciseEntry as Record<string, unknown>)?.[
        'exercise_preset_entry_name'
      ] as string) ||
      activityData?.workout?.workoutName ||
      activityData?.activity?.activity?.activityName ||
      rawTypeKey
    : rawTypeKey;

  const displayTitle =
    ((exerciseEntry as Record<string, unknown>)?.[
      'exercise_preset_entry_name'
    ] as string) ||
    activityData?.workout?.workoutName ||
    activityData?.activity?.activity?.activityName ||
    stats.activityName ||
    ((exerciseEntry as Record<string, unknown>)?.['exercise_name'] as string) ||
    t('common.workout', 'Workout');

  return (
    <div className="activity-report-visualizer p-4">
      <div className="flex items-center mb-4 flex-wrap gap-2">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mr-2 shadow-sm border border-border/60">
          <span className="text-2xl">
            {getActivityIcon(activityTypeKey, displayTitle)}
          </span>
        </div>
        <h2 className="text-2xl font-bold">{displayTitle}</h2>
        {exerciseCount > 0 && (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
            {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
          </span>
        )}
      </div>

      {activityData?.activity?.activity && (
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
      )}

      {(() => {
        const mapPolyline =
          gpsPoints && gpsPoints.length > 0
            ? gpsPoints
                .filter((p) => p.lat !== 0 && p.lon !== 0)
                .map((p) => ({ lat: p.lat, lon: p.lon }))
            : activityData?.activity?.details?.geoPolylineDTO?.polyline || [];
        if (mapPolyline.length === 0) return null;
        return (
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-2">
              {t('reports.activityReport.activityMap')}
            </h3>
            <ActivityReportMap polylineData={mapPolyline} />
          </div>
        );
      })()}

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
          waterLoss={waterLossFormatted}
          movingTime={movingTimeFormatted}
          elapsedTime={elapsedTimeFormatted}
          caloriesBreakdown={caloriesBreakdownFormatted}
          avgMovingSpeed={avgMovingSpeedFormatted}
          elevationRange={elevationRangeFormatted}
          weather={weatherFormatted}
          gear={gearFormatted}
        />
      </div>

      {allChartData.length > 0 && (
        <div className="mb-4">
          <span className="mr-2">{t('reports.activityReport.xAxis')}</span>
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
          <ActivityHeartRateZonesChart
            data={hrInTimezonesData}
            providerName={providerName}
          />
        )}
      </div>

      {(() => {
        const isPresetChild = Boolean(
          (exerciseEntry as Record<string, unknown>)?.[
            'exercise_preset_entry_id'
          ]
        );
        const totalLapsSeconds = effectiveLaps.reduce(
          (sum, lap) => sum + (lap.duration || 0),
          0
        );
        const entryDurationSeconds = (stats.duration || 0) * 60;
        const isDurationMismatch =
          isPresetChild &&
          entryDurationSeconds > 0 &&
          totalLapsSeconds > 0 &&
          Math.abs(totalLapsSeconds - entryDurationSeconds) > 180;

        if (
          !effectiveLaps ||
          effectiveLaps.length === 0 ||
          isDurationMismatch
        ) {
          return null;
        }

        return (
          <ZoomableChart title={t('reports.activityReport.lapsTable')}>
            {(isMaximized, zoomLevel) => (
              <ActivityReportLapTable
                lapDTOs={effectiveLaps}
                isMaximized={isMaximized}
                zoomLevel={zoomLevel}
              />
            )}
          </ZoomableChart>
        );
      })()}

      {activityData?.workout && (
        <WorkoutReportVisualizer workoutData={activityData.workout} />
      )}

      <WorkoutSessionBreakdown exerciseEntry={exerciseEntry} />
    </div>
  );
};

export default ActivityReportVisualizer;
