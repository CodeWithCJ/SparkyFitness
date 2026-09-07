import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Dumbbell, Activity } from 'lucide-react';
import WorkoutHeatmap from './WorkoutHeatmap';
import MuscleGroupRecoveryTracker from './MuscleGroupRecoveryTracker';
import { PrProgressionChart } from './PrProgressionChart';
import ExerciseVarietyScore from './ExerciseVarietyScore';
import SetPerformanceAnalysisChart from './SetPerformanceAnalysisChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { parseISO } from 'date-fns';
import { useExerciseProgressQueries } from '@/hooks/Exercises/useExercises';
import {
  useAvailableEquipment,
  useAvailableExercises,
  useAvailableMuscleGroups,
} from '@/hooks/Exercises/useExerciseSearch';
import { calculateTotalTonnage } from '@/utils/reportUtil';
import { ExerciseDashboardData } from '@/types/reports';
import {
  calculateEstimated1RMTrendData,
  calculateMaxWeightTrendData,
  calculateRepsVsWeightScatterData,
  calculateTimeUnderTensionData,
  calculateVolumeTrendData,
  extractTelemetryActivityEntries,
} from '@/utils/exerciseTrendUtils';
import { ExerciseDashboardFilters } from '@/components/ExerciseCharts/ExerciseDashboardFilters';
import { VolumeTrendChart } from '@/components/ExerciseCharts/VolumeTrendChart';
import { KeyStatsWidget } from '@/components/ExerciseCharts/KeyStatsWidget';
import { MaxWeightTrendChart } from '@/components/ExerciseCharts/MaxWeightTrendChart';
import { Estimated1RMTrendChart } from '@/components/ExerciseCharts/Estimated1RMTrendChart';
import { RepsVsWeightChart } from '@/components/ExerciseCharts/RepsVsWeightChart';
import { TimeUnderTensionChart } from '@/components/ExerciseCharts/TimeUnderTensionChart';
import { BestSetRepRangeChart } from '@/components/ExerciseCharts/BestSetRepRangeChart';
import { TrainingVolumeByMuscleGroupChart } from '@/components/ExerciseCharts/TrainingVolumeByMuscleGroupChart';
import { PrVisualizationWidget } from '@/components/ExerciseCharts/PrVisualizationWidget';
import { ActivityTelemetryList } from '@/components/ExerciseCharts/ActivityTelemetryList';
import { CardioVolumeIntervalChart } from '@/components/ExerciseCharts/CardioVolumeIntervalChart';
import { ActivityInterrogationFinder } from '@/components/ExerciseCharts/ActivityInterrogationFinder';
import { CardioPRBadgesWidget } from '@/components/ExerciseCharts/CardioPRBadgesWidget';
import { MatchedCoursesList } from '@/components/ExerciseCharts/MatchedCoursesList';
import {
  useExerciseStatsSummary,
  useExercisePRs,
  useMatchedCourses,
  queryExerciseActivities,
} from '@/hooks/Reports/useExerciseStats';
import type { ExerciseProgressResponse } from '@workspace/shared';

interface ExerciseReportsDashboardProps {
  exerciseDashboardData: ExerciseDashboardData | undefined;
  startDate: string | null;
  endDate: string | null;
}

// Default layout for widgets
const DEFAULT_LAYOUT = [
  'keyStats',
  'heatmap',
  'filtersAggregation',
  'muscleGroupRecovery',
  'prProgression',
  'exerciseVariety',
  'volumeTrend',
  'maxWeightTrend',
  'estimated1RMTrend',
  'bestSetRepRange',
  'trainingVolumeByMuscleGroup',
  'repsVsWeightScatter',
  'setPerformance',
  'timeUnderTension',
  'prVisualization',
];

const STRENGTH_LAYOUT = [
  'filtersAggregation',
  'volumeTrend',
  'maxWeightTrend',
  'estimated1RMTrend',
  'heatmap',
  'muscleGroupRecovery',
  'prProgression',
  'exerciseVariety',
  'bestSetRepRange',
  'trainingVolumeByMuscleGroup',
  'repsVsWeightScatter',
  'setPerformance',
  'timeUnderTension',
  'prVisualization',
];

const STRENGTH_CATEGORIES = [
  'Strength',
  'Powerlifting',
  'Olympic Weightlifting',
  'Strongman',
  'Plyometrics',
  'Isometric',
];

const ExerciseReportsDashboard = ({
  exerciseDashboardData,
  startDate,
  endDate,
}: ExerciseReportsDashboardProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, weightUnit, distanceUnit } =
    usePreferences();
  const unitSystem: 'metric' | 'imperial' =
    distanceUnit === 'miles' ? 'imperial' : 'metric';

  // Domain view selector: 'all' | 'strength' | 'cardio'
  const [viewMode, setViewMode] = useState<'all' | 'strength' | 'cardio'>(
    'all'
  );

  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(
    null
  );
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('All');
  const [aggregationLevel, setAggregationLevel] = useState<string>('daily'); // New state for aggregation level
  const [comparisonPeriod, setComparisonPeriod] = useState<string | null>(null); // New state for comparison period

  const [statsInterval, setStatsInterval] = useState<
    'day' | 'week' | 'month' | 'year'
  >('day');

  const { activeUserId } = useActiveUser();

  const { data: statsSummary } = useExerciseStatsSummary(
    statsInterval,
    startDate,
    endDate,
    activeUserId ?? undefined,
    unitSystem
  );
  const { data: prMatrix } = useExercisePRs(
    activeUserId ?? undefined,
    unitSystem
  );
  const { data: matchedCourses } = useMatchedCourses(
    activeUserId ?? undefined,
    unitSystem
  );

  const { data: availableEquipment = [], isLoading: equipmentLoading } =
    useAvailableEquipment();
  const { data: availableMuscles = [], isLoading: musclesLoading } =
    useAvailableMuscleGroups();
  const { data: availableExercises = [], isLoading: exercisesLoading } =
    useAvailableExercises(selectedMuscle, selectedEquipment);

  const loading = equipmentLoading || musclesLoading || exercisesLoading;

  const handleQueryFetch = useCallback(
    (params: {
      category?: string;
      distanceStandard?: string;
      searchKeyword?: string;
    }) => queryExerciseActivities({ ...params, unitSystem }),
    [unitSystem]
  );

  const selectedExercisesForChart = useMemo(() => {
    if (selectedExercise && selectedExercise !== 'All') {
      return [selectedExercise];
    }
    if (selectedExercise === 'All') {
      // availableExercises can list the same exercise_id under more than one
      // exercise_name (e.g. a synced provider logging naming variants over
      // time), so dedupe here to avoid duplicate query keys downstream.
      return Array.from(new Set(availableExercises.map((ex) => ex.id)));
    }
    return [];
  }, [selectedExercise, availableExercises]);

  const { mainQueries, comparisonQueries } = useExerciseProgressQueries({
    selectedExercisesForChart,
    startDate,
    endDate,
    aggregationLevel,
    comparisonPeriod,
  });

  const exerciseProgressData = selectedExercisesForChart.reduce(
    (acc, exerciseId, index) => {
      const queryData = mainQueries[index]?.data;
      if (queryData) {
        const exerciseName =
          availableExercises.find((ex) => ex.id === exerciseId)?.name ||
          t(
            'exercise.editExerciseEntryDialog.unknownExercise',
            'Unknown Exercise'
          );
        acc[exerciseId] = queryData.map((entry) => ({
          ...entry,
          exercise_name: exerciseName,
        }));
      }
      return acc;
    },
    {} as Record<
      string,
      (ExerciseProgressResponse & { exercise_name: string })[]
    >
  );

  const comparisonExerciseProgressData = selectedExercisesForChart.reduce(
    (acc, exerciseId, index) => {
      const queryData = comparisonQueries[index]?.data;
      if (queryData) {
        const exerciseName =
          availableExercises.find((ex) => ex.id === exerciseId)?.name ||
          t(
            'exercise.editExerciseEntryDialog.unknownExercise',
            'Unknown Exercise'
          );
        acc[exerciseId] = queryData.map((entry) => ({
          ...entry,
          exercise_name: exerciseName,
        }));
      }
      return acc;
    },
    {} as Record<
      string,
      (ExerciseProgressResponse & { exercise_name: string })[]
    >
  );

  const isFetchingCharts =
    mainQueries.some((q) => q.isFetching) ||
    comparisonQueries.some((q) => q.isFetching);

  if (!exerciseDashboardData || loading || isFetchingCharts) {
    return (
      <div>
        {t(
          'exerciseReportsDashboard.loadingExerciseData',
          'Loading exercise data...'
        )}
      </div>
    );
  }

  const totalTonnage = calculateTotalTonnage(
    exerciseDashboardData.exerciseEntries
  );

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'keyStats':
        return (
          <KeyStatsWidget
            key="keyStats"
            data={exerciseDashboardData}
            totalTonnage={totalTonnage}
            weightUnit={weightUnit}
          />
        );
      case 'heatmap':
        return (
          <Card key="heatmap">
            <CardHeader>
              <CardTitle>
                {t(
                  'exerciseReportsDashboard.workoutHeatmap',
                  'Workout Heatmap'
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {exerciseDashboardData?.exerciseEntries &&
              exerciseDashboardData.exerciseEntries.length > 0 ? (
                <WorkoutHeatmap
                  workoutDates={Array.from(
                    new Set(
                      exerciseDashboardData.exerciseEntries.map(
                        (entry) => entry.entry_date
                      )
                    )
                  )}
                />
              ) : (
                <p className="text-center text-muted-foreground">
                  {t(
                    'exerciseReportsDashboard.noWorkoutDataAvailableForHeatmap',
                    'No workout data available for heatmap.'
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        );
      case 'filtersAggregation':
        return (
          <ExerciseDashboardFilters
            key="filtersAggregation"
            comparisonPeriod={comparisonPeriod}
            setComparisonPeriod={setComparisonPeriod}
            selectedEquipment={selectedEquipment}
            setSelectedEquipment={setSelectedEquipment}
            selectedMuscle={selectedMuscle}
            setSelectedMuscle={setSelectedMuscle}
            selectedExercise={selectedExercise}
            setSelectedExercise={setSelectedExercise}
            availableEquipment={availableEquipment}
            availableMuscles={availableMuscles}
            availableExercises={availableExercises}
          />
        );
      case 'muscleGroupRecovery': {
        const recoveryData = exerciseDashboardData?.recoveryData;
        return recoveryData && Object.keys(recoveryData).length > 0 ? (
          <MuscleGroupRecoveryTracker
            key="muscleGroupRecovery"
            recoveryData={recoveryData}
          />
        ) : null;
      }
      case 'prProgression':
        return selectedExercisesForChart.map((exerciseId) => {
          const prProgressionData =
            exerciseDashboardData.prProgressionData[exerciseId] || [];
          const exerciseName =
            availableExercises.find((ex) => ex.id === exerciseId)?.name ||
            t(
              'exercise.editExerciseEntryDialog.unknownExercise',
              'Unknown Exercise'
            );
          return prProgressionData.length > 0 ? (
            <Card key={`prProgression-${exerciseId}`}>
              <CardHeader>
                <CardTitle>
                  {t(
                    'exerciseReportsDashboard.prProgression',
                    `PR Progression - ${exerciseName}`,
                    { exerciseName }
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PrProgressionChart prProgressionData={prProgressionData} />
              </CardContent>
            </Card>
          ) : null;
        });
      case 'exerciseVariety': {
        const varietyData = exerciseDashboardData?.exerciseVarietyData;
        return varietyData && Object.keys(varietyData).length > 0 ? (
          <ExerciseVarietyScore
            key="exerciseVariety"
            varietyData={varietyData}
          />
        ) : null;
      }
      case 'volumeTrend': {
        const volumeTrendData =
          selectedExercisesForChart.length > 0
            ? calculateVolumeTrendData(
                exerciseProgressData,
                comparisonExerciseProgressData,
                formatDateInUserTimezone,
                parseISO,
                aggregationLevel
              )
            : [];
        return volumeTrendData.length > 0 &&
          volumeTrendData.some((d) => d.volume > 0) ? (
          <VolumeTrendChart
            key="volumeTrend"
            data={volumeTrendData}
            weightUnit={weightUnit}
            comparisonPeriod={comparisonPeriod}
          />
        ) : null;
      }
      case 'maxWeightTrend': {
        const maxWeightTrendData =
          selectedExercisesForChart.length > 0
            ? calculateMaxWeightTrendData(
                exerciseProgressData,
                comparisonExerciseProgressData,
                formatDateInUserTimezone,
                parseISO,
                aggregationLevel
              )
            : [];
        return maxWeightTrendData.length > 0 &&
          maxWeightTrendData.some((d) => d.maxWeight > 0) ? (
          <MaxWeightTrendChart
            key="maxWeightTrend"
            data={maxWeightTrendData}
            weightUnit={weightUnit}
            comparisonPeriod={comparisonPeriod}
          />
        ) : null;
      }
      case 'estimated1RMTrend': {
        const estimated1RMTrendData =
          selectedExercisesForChart.length > 0
            ? calculateEstimated1RMTrendData(
                exerciseProgressData,
                comparisonExerciseProgressData,
                formatDateInUserTimezone,
                parseISO,
                aggregationLevel
              )
            : [];
        return estimated1RMTrendData.length > 0 &&
          estimated1RMTrendData.some((d) => d.estimated1RM > 0) ? (
          <Estimated1RMTrendChart
            key="estimated1RMTrend"
            data={estimated1RMTrendData}
            weightUnit={weightUnit}
            comparisonPeriod={comparisonPeriod}
          />
        ) : null;
      }
      case 'bestSetRepRange':
        return (
          <div key="bestSetRepRange">
            {selectedExercisesForChart.map((exerciseId) => {
              const bestSetRepRangeData = exerciseDashboardData.bestSetRepRange[
                exerciseId
              ]
                ? Object.entries(
                    exerciseDashboardData.bestSetRepRange[exerciseId] || {}
                  ).map(([range, data]) => ({
                    range,
                    weight: data.weight,
                  }))
                : [];
              const exerciseName =
                availableExercises.find((ex) => ex.id === exerciseId)?.name ||
                t(
                  'exercise.editExerciseEntryDialog.unknownExercise',
                  'Unknown Exercise'
                );

              return bestSetRepRangeData.length > 0 &&
                bestSetRepRangeData.some((d) => d.weight > 0) ? (
                <BestSetRepRangeChart
                  key={`bestSetRepRange-${exerciseId}`}
                  data={bestSetRepRangeData}
                  exerciseName={exerciseName}
                  weightUnit={weightUnit}
                />
              ) : null;
            })}
          </div>
        );
      case 'trainingVolumeByMuscleGroup': {
        const trainingVolumeByMuscleGroupData =
          exerciseDashboardData.muscleGroupVolume &&
          Object.keys(exerciseDashboardData.muscleGroupVolume).length > 0
            ? Object.entries(exerciseDashboardData.muscleGroupVolume).map(
                ([muscle, volume]) => ({ muscle, volume })
              )
            : [];
        return trainingVolumeByMuscleGroupData.length > 0 &&
          trainingVolumeByMuscleGroupData.some((d) => d.volume > 0) ? (
          <TrainingVolumeByMuscleGroupChart
            key="trainingVolumeByMuscleGroup"
            data={trainingVolumeByMuscleGroupData}
            weightUnit={weightUnit}
          />
        ) : null;
      }
      case 'repsVsWeightScatter':
        return selectedExercisesForChart.map((exerciseId) => {
          const exerciseData = exerciseProgressData[exerciseId] || [];
          const repsVsWeightScatterData =
            calculateRepsVsWeightScatterData(exerciseData);
          const exerciseName =
            availableExercises.find((ex) => ex.id === exerciseId)?.name ||
            t(
              'exercise.editExerciseEntryDialog.unknownExercise',
              'Unknown Exercise'
            );

          return repsVsWeightScatterData.length > 0 &&
            repsVsWeightScatterData.some((d) => d.averageWeight > 0) ? (
            <RepsVsWeightChart
              key={`repsVsWeightScatter-${exerciseId}`}
              data={repsVsWeightScatterData}
              exerciseName={exerciseName}
              weightUnit={weightUnit}
            />
          ) : null;
        });
      case 'timeUnderTension':
        return selectedExercisesForChart.map((exerciseId) => {
          const exerciseData = exerciseProgressData[exerciseId] || [];
          const timeUnderTensionData = calculateTimeUnderTensionData(
            exerciseData,
            formatDateInUserTimezone,
            parseISO
          );
          const exerciseName =
            availableExercises.find((ex) => ex.id === exerciseId)?.name ||
            t(
              'exercise.editExerciseEntryDialog.unknownExercise',
              'Unknown Exercise'
            );

          return timeUnderTensionData.length > 0 &&
            timeUnderTensionData.some((d) => d.timeUnderTension > 0) ? (
            <TimeUnderTensionChart
              key={`timeUnderTension-${exerciseId}`}
              data={timeUnderTensionData}
              exerciseName={exerciseName}
            />
          ) : null;
        });
      case 'prVisualization':
        return selectedExercisesForChart.map((exerciseId) => {
          const prVisualizationData =
            exerciseDashboardData.prData[exerciseId] || null;
          const exerciseName =
            availableExercises.find((ex) => ex.id === exerciseId)?.name ||
            t(
              'exercise.editExerciseEntryDialog.unknownExercise',
              'Unknown Exercise'
            );
          return prVisualizationData &&
            (prVisualizationData.oneRM > 0 ||
              prVisualizationData.weight > 0 ||
              prVisualizationData.reps > 0) ? (
            <PrVisualizationWidget
              key={`prVisualization-${exerciseId}`}
              data={prVisualizationData}
              exerciseName={exerciseName}
              weightUnit={weightUnit}
              formatDate={formatDateInUserTimezone}
            />
          ) : null;
        });
      case 'setPerformance':
        return selectedExercisesForChart.map((exerciseId) => {
          const setPerformanceData = exerciseDashboardData.setPerformanceData[
            exerciseId
          ]
            ? Object.entries(
                exerciseDashboardData.setPerformanceData[exerciseId]
              ).map(([setName, data]) => ({
                setName: setName.replace('Set', ' Set'),
                avgWeight: data.avgWeight,
                avgReps: data.avgReps,
              }))
            : [];
          const exerciseName =
            availableExercises.find((ex) => ex.id === exerciseId)?.name ||
            t(
              'exercise.editExerciseEntryDialog.unknownExercise',
              'Unknown Exercise'
            );
          return setPerformanceData.length > 0 &&
            setPerformanceData.some((d) => d.avgWeight > 0 || d.avgReps > 0) ? (
            <SetPerformanceAnalysisChart
              key={`setPerformance-${exerciseId}`}
              setPerformanceData={setPerformanceData}
              exerciseName={exerciseName} // Pass exerciseName to the component if it can display it
            />
          ) : null;
        });
      default:
        return null;
    }
  };

  // Collect all Garmin activity entries for the selected exercise(s)
  const allTelemetryActivityEntries = extractTelemetryActivityEntries(
    exerciseProgressData,
    selectedExercise,
    parseISO
  );

  const filteredGarminActivityEntries = (() => {
    if (viewMode === 'cardio') {
      return allTelemetryActivityEntries.filter(
        (entry) =>
          (entry.distance && entry.distance > 0) ||
          !entry.sets ||
          entry.sets.length === 0
      );
    }
    if (viewMode === 'strength') {
      return allTelemetryActivityEntries.filter((entry) => {
        const hasStrengthSets =
          entry.sets &&
          entry.sets.length > 0 &&
          entry.sets.some((s) => (s.weight || 0) > 0 || (s.reps || 0) > 0);
        const isStrengthCategory =
          entry.category != null &&
          STRENGTH_CATEGORIES.includes(entry.category);
        return hasStrengthSets || isStrengthCategory;
      });
    }
    return allTelemetryActivityEntries;
  })();

  return (
    <div className="space-y-6">
      {/* Tier 1: View Mode Tabs & Global Interval Selector */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-3 rounded-xl border bg-card shadow-sm">
        {/* Domain View Selector */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-lg">
          <Button
            variant={viewMode === 'all' ? 'default' : 'ghost'}
            size="sm"
            className="text-xs font-semibold h-8"
            onClick={() => setViewMode('all')}
          >
            <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
            {t('exerciseAnalytics.views.all', 'All Workouts')}
          </Button>
          <Button
            variant={viewMode === 'strength' ? 'default' : 'ghost'}
            size="sm"
            className="text-xs font-semibold h-8"
            onClick={() => setViewMode('strength')}
          >
            <Dumbbell className="w-3.5 h-3.5 mr-1.5" />
            {t('exerciseAnalytics.views.strength', 'Strength & Resistance')}
          </Button>
          <Button
            variant={viewMode === 'cardio' ? 'default' : 'ghost'}
            size="sm"
            className="text-xs font-semibold h-8"
            onClick={() => setViewMode('cardio')}
          >
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            {t('exerciseAnalytics.views.cardio', 'Cardio & GPS')}
          </Button>
        </div>

        {/* Global Interval Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('exerciseAnalytics.interval', 'Interval:')}
          </span>
          <div className="flex items-center bg-muted p-1 rounded-md text-xs">
            {(['day', 'week', 'month', 'year'] as const).map((int) => (
              <button
                key={int}
                onClick={() => {
                  setStatsInterval(int);
                  setAggregationLevel(
                    int === 'day'
                      ? 'daily'
                      : int === 'week'
                        ? 'weekly'
                        : int === 'month'
                          ? 'monthly'
                          : 'yearly'
                  );
                }}
                className={`px-2.5 py-1 rounded font-medium capitalize text-xs transition-all ${
                  statsInterval === int
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(`exerciseAnalytics.intervals.${int}`, int)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tier 2: Executive Performance Overview Banner & Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: KPIs & PR Badges Matrix */}
        <div className="lg:col-span-7 space-y-6">
          <KeyStatsWidget
            data={exerciseDashboardData}
            totalTonnage={totalTonnage}
            weightUnit={weightUnit}
          />
          <CardioPRBadgesWidget prData={prMatrix} viewMode={viewMode} />
        </div>

        {/* Right Side: Workout Heatmap Calendar */}
        <div className="lg:col-span-5">
          {exerciseDashboardData?.exerciseEntries &&
          exerciseDashboardData.exerciseEntries.length > 0 ? (
            <WorkoutHeatmap
              workoutDates={Array.from(
                new Set(
                  exerciseDashboardData.exerciseEntries.map(
                    (entry) => entry.entry_date
                  )
                )
              )}
            />
          ) : (
            <Card className="h-full border shadow-sm flex items-center justify-center p-6">
              <p className="text-center text-muted-foreground text-xs py-8">
                {t(
                  'exerciseAnalytics.noHeatmapData',
                  'No workout data available for heatmap.'
                )}
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Tier 3: Domain Analytics Sections */}

      {/* 3A: ALL WORKOUTS VIEW */}
      {viewMode === 'all' && (
        <div className="space-y-6">
          <CardioVolumeIntervalChart summaryData={statsSummary} />

          <MatchedCoursesList matchedData={matchedCourses} />

          <ActivityInterrogationFinder onQueryFetch={handleQueryFetch} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {!loading &&
              DEFAULT_LAYOUT.filter(
                (id) => id !== 'keyStats' && id !== 'heatmap'
              ).map((widgetId) => renderWidget(widgetId))}
          </div>
        </div>
      )}

      {/* 3B: STRENGTH & RESISTANCE VIEW */}
      {viewMode === 'strength' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {!loading &&
              STRENGTH_LAYOUT.filter((id) => id !== 'heatmap').map((widgetId) =>
                renderWidget(widgetId)
              )}
          </div>
        </div>
      )}

      {/* 3C: CARDIO & GPS VIEW */}
      {viewMode === 'cardio' && (
        <div className="space-y-6">
          <CardioVolumeIntervalChart summaryData={statsSummary} />

          <MatchedCoursesList matchedData={matchedCourses} />

          <ActivityInterrogationFinder onQueryFetch={handleQueryFetch} />
        </div>
      )}

      {/* Tier 4: Synced Activity Logs (Filtered by domain) */}
      <ActivityTelemetryList
        entries={filteredGarminActivityEntries}
        formatDate={formatDateInUserTimezone}
        parseISO={parseISO}
        title={
          viewMode === 'strength'
            ? t(
                'exerciseAnalytics.activityLogs.strength',
                'Strength Workout Activity Logs'
              )
            : viewMode === 'cardio'
              ? t(
                  'exerciseAnalytics.activityLogs.cardio',
                  'Cardio & GPS Activity Maps'
                )
              : t(
                  'exerciseAnalytics.activityLogs.all',
                  'Workout Activity History & Maps'
                )
        }
      />
    </div>
  );
};

export default ExerciseReportsDashboard;
