import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutDashboard, Dumbbell, Activity, ChevronDown } from 'lucide-react';
import WorkoutHeatmap from './WorkoutHeatmap';
import { workoutHeatmapWindow } from '@/utils/workoutHeatmap';
import {
  useTrainingConsistency,
  useWorkoutDays,
} from '@/hooks/Reports/useReports';
import TrainingConsistencyCard from './TrainingConsistencyCard';
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
import { MuscleHeatmap } from '@/components/ExerciseCharts/MuscleHeatmap';
import { PrVisualizationWidget } from '@/components/ExerciseCharts/PrVisualizationWidget';
import { ActivityTelemetryList } from '@/components/ExerciseCharts/ActivityTelemetryList';
import { CardioVolumeIntervalChart } from '@/components/ExerciseCharts/CardioVolumeIntervalChart';
import { CardioSessionList } from '@/components/ExerciseCharts/CardioSessionList';
import { ActivityInterrogationFinder } from '@/components/ExerciseCharts/ActivityInterrogationFinder';
import { CardioPRBadgesWidget } from '@/components/ExerciseCharts/CardioPRBadgesWidget';
import { MatchedCoursesList } from '@/components/ExerciseCharts/MatchedCoursesList';
import {
  useExerciseStatsSummary,
  useExercisePRs,
  useMatchedCourses,
  queryExerciseActivities,
} from '@/hooks/Reports/useExerciseStats';
import { todayInZone, type ExerciseProgressResponse } from '@workspace/shared';

interface ExerciseReportsDashboardProps {
  exerciseDashboardData: ExerciseDashboardData | undefined;
  startDate: string | null;
  endDate: string | null;
}

const SNAPSHOT_WIDGETS = [
  'muscleHeatmap',
  'muscleGroupRecovery',
  'exerciseVariety',
  'trainingVolumeByMuscleGroup',
];

const ANALYSIS_WIDGETS = [
  'filtersAggregation',
  'volumeTrend',
  'maxWeightTrend',
  'estimated1RMTrend',
  'bestSetRepRange',
  'repsVsWeightScatter',
  'setPerformance',
  'timeUnderTension',
  'prProgression',
  'prVisualization',
];

const ANALYSIS_CHARTS = ANALYSIS_WIDGETS.filter(
  (widgetId) => widgetId !== 'filtersAggregation'
);

function chartHasContent(node: unknown): boolean {
  if (node == null || node === false) return false;
  if (Array.isArray(node)) return node.some(chartHasContent);
  return true;
}

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
  const { formatDateInUserTimezone, weightUnit, distanceUnit, timezone } =
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
  const [showMoreAnalysis, setShowMoreAnalysis] = useState(false);
  const [openChart, setOpenChart] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 1024px)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const { activeUserId } = useActiveUser();

  // The heatmap always covers the last 12 months on its own lightweight
  // query; the report's date filter only outlines days inside it (#2461).
  const heatmapToday = todayInZone(timezone);
  const heatmapWindow = workoutHeatmapWindow(heatmapToday);
  const { data: workoutDaysData } = useWorkoutDays(
    heatmapWindow.start,
    heatmapWindow.end,
    activeUserId
  );
  const workoutDays = workoutDaysData?.days ?? [];
  const { data: trainingConsistency } = useTrainingConsistency(activeUserId);

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
    // All and Strength feed the activity list from these progress queries,
    // so they stay selected with the extra charts closed. Cardio has its
    // own session list and must not query, even if that flag is still set
    // from the view the user just left.
    if (viewMode === 'cardio') return [];

    if (selectedExercise && selectedExercise !== 'All') {
      return [selectedExercise];
    }
    if (selectedExercise === 'All') {
      // availableExercises comes from a DISTINCT over exercise_entries, whose
      // exercise_id is nullable by design: deleting an exercise from the
      // library sets it to null on preserved diary snapshots rather than
      // deleting the entry. Drop those rows here — there is no exercise left
      // to fetch progress for — before the id feeds the per-exercise progress
      // queries below, or a null slips through as the literal string "null"
      // in the request URL.
      // availableExercises can also list the same exercise_id under more than
      // one exercise_name (e.g. a synced provider logging naming variants
      // over time), so dedupe here too, to avoid duplicate query keys
      // downstream.
      return Array.from(
        new Set(
          availableExercises
            .map((ex) => ex.id)
            .filter((id): id is string => !!id)
        )
      );
    }
    return [];
  }, [selectedExercise, availableExercises, viewMode]);

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

  if (!exerciseDashboardData || loading) {
    return (
      <div>
        {t(
          'exerciseReportsDashboard.loadingExerciseData',
          'Loading exercise data...'
        )}
      </div>
    );
  }

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case 'keyStats':
        return (
          <KeyStatsWidget
            key="keyStats"
            data={exerciseDashboardData}
            weightUnit={weightUnit}
          />
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
      case 'muscleHeatmap': {
        const setsByMuscle = exerciseDashboardData.muscleGroupSets || {};
        return Object.values(setsByMuscle).some((count) => count > 0) ? (
          <MuscleHeatmap key="muscleHeatmap" setsByMuscle={setsByMuscle} />
        ) : null;
      }
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
                ([muscle, volume]) => ({ muscle, volume: Math.round(volume) })
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

  const chartTitle = (widgetId: string) => {
    switch (widgetId) {
      case 'volumeTrend':
        return t('exerciseReportsDashboard.volumeTrend', 'Volume Trend');
      case 'maxWeightTrend':
        return t('exerciseReportsDashboard.maxWeightTrend', 'Max Weight Trend');
      case 'estimated1RMTrend':
        return t(
          'exerciseReportsDashboard.estimated1RMTrend',
          'Estimated 1RM Trend'
        );
      case 'bestSetRepRange':
        return t(
          'exerciseReportsDashboard.bestSetByRepRangeTitle',
          'Best Set by Rep Range'
        );
      case 'repsVsWeightScatter':
        return t(
          'exerciseReportsDashboard.repsVsWeightTitle',
          'Reps vs Weight'
        );
      case 'setPerformance':
        return t(
          'exerciseReportsDashboard.setPerformanceAnalysis.title',
          'Set Performance Analysis'
        );
      case 'timeUnderTension':
        return t(
          'exerciseReportsDashboard.timeUnderTensionTrendTitle',
          'Time Under Tension Trend'
        );
      case 'prProgression':
        return t(
          'exerciseReportsDashboard.prProgressionTitle',
          'PR Progression'
        );
      case 'prVisualization':
        return t(
          'exerciseReportsDashboard.personalRecordsTitle',
          'Personal Records'
        );
      default:
        return widgetId;
    }
  };

  const analysisSection = (
    <>
      <button
        type="button"
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => setShowMoreAnalysis((open) => !open)}
      >
        {showMoreAnalysis
          ? t('exerciseAnalytics.hideAnalysis', 'Hide extra charts')
          : t('exerciseAnalytics.moreAnalysis', 'More analysis')}
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform ${
            showMoreAnalysis ? 'rotate-180' : ''
          }`}
        />
      </button>

      {showMoreAnalysis && (
        <div className="space-y-3">
          {isFetchingCharts ? (
            <p className="text-sm text-muted-foreground">
              {t(
                'exerciseReportsDashboard.loadingExerciseData',
                'Loading exercise data...'
              )}
            </p>
          ) : null}
          {renderWidget('filtersAggregation')}
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
            {ANALYSIS_CHARTS.map((widgetId) => {
              const node = renderWidget(widgetId);
              if (!chartHasContent(node)) return null;
              const open = openChart === widgetId;
              return (
                <div key={widgetId} className="min-w-0">
                  <button
                    type="button"
                    className="lg:hidden flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left text-sm font-medium"
                    aria-expanded={open}
                    onClick={() => setOpenChart(open ? null : widgetId)}
                  >
                    {chartTitle(widgetId)}
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${
                        open ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <div
                    className={
                      open
                        ? 'mt-2 lg:mt-0 max-lg:[&_h3]:sr-only'
                        : 'hidden lg:block'
                    }
                  >
                    {(open || isDesktop) && node}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Tier 1: View Mode Tabs & Global Interval Selector */}
      <div className="sticky top-0 z-20 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 p-3 rounded-xl border bg-card shadow-sm">
        {/* Domain View Selector */}
        <div className="self-start inline-flex items-center gap-1 bg-muted p-1 rounded-md">
          <button
            type="button"
            title={t('exerciseAnalytics.views.all', 'All Workouts')}
            className={`inline-flex items-center px-2.5 py-1 rounded font-medium text-xs whitespace-nowrap transition-all ${
              viewMode === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setViewMode('all')}
          >
            <LayoutDashboard className="w-3.5 h-3.5 mr-1.5" />
            <span className="md:hidden">
              {t('exerciseAnalytics.views.allShort', 'All')}
            </span>
            <span className="hidden md:inline">
              {t('exerciseAnalytics.views.all', 'All Workouts')}
            </span>
          </button>
          <button
            type="button"
            title={t(
              'exerciseAnalytics.views.strength',
              'Strength & Resistance'
            )}
            className={`inline-flex items-center px-2.5 py-1 rounded font-medium text-xs whitespace-nowrap transition-all ${
              viewMode === 'strength'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setViewMode('strength')}
          >
            <Dumbbell className="w-3.5 h-3.5 mr-1.5" />
            <span className="md:hidden">
              {t('exerciseAnalytics.views.strengthShort', 'Strength')}
            </span>
            <span className="hidden md:inline">
              {t('exerciseAnalytics.views.strength', 'Strength & Resistance')}
            </span>
          </button>
          <button
            type="button"
            title={t('exerciseAnalytics.views.cardio', 'Cardio & GPS')}
            className={`inline-flex items-center px-2.5 py-1 rounded font-medium text-xs whitespace-nowrap transition-all ${
              viewMode === 'cardio'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setViewMode('cardio')}
          >
            <Activity className="w-3.5 h-3.5 mr-1.5" />
            <span className="md:hidden">
              {t('exerciseAnalytics.views.cardioShort', 'Cardio')}
            </span>
            <span className="hidden md:inline">
              {t('exerciseAnalytics.views.cardio', 'Cardio & GPS')}
            </span>
          </button>
        </div>

        {/* Global Interval Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t('exerciseAnalytics.interval', 'Group by:')}
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
                    ? 'bg-primary text-primary-foreground shadow-sm'
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
            weightUnit={weightUnit}
          />
          <CardioPRBadgesWidget prData={prMatrix} viewMode={viewMode} />
          <TrainingConsistencyCard data={trainingConsistency} />
        </div>

        {/* Right Side: Workout Heatmap Calendar */}
        <div className="lg:col-span-5">
          {workoutDays.length > 0 ? (
            <WorkoutHeatmap
              workoutDays={workoutDays}
              today={heatmapToday}
              rangeStart={startDate ?? undefined}
              rangeEnd={endDate ?? undefined}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {SNAPSHOT_WIDGETS.map((widgetId) => renderWidget(widgetId))}
          </div>

          {analysisSection}
        </div>
      )}

      {/* 3B: STRENGTH & RESISTANCE VIEW */}
      {viewMode === 'strength' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {SNAPSHOT_WIDGETS.map((widgetId) => renderWidget(widgetId))}
          </div>
          {analysisSection}
        </div>
      )}

      {/* 3C: CARDIO & GPS VIEW */}
      {viewMode === 'cardio' && (
        <div className="space-y-6">
          <CardioSessionList
            key={`${startDate ?? ''}-${endDate ?? ''}-${unitSystem}-${activeUserId ?? ''}`}
            startDate={startDate}
            endDate={endDate}
            unitSystem={unitSystem}
            formatDate={formatDateInUserTimezone}
            parseISO={parseISO}
          />

          <CardioVolumeIntervalChart summaryData={statsSummary} />

          <MatchedCoursesList matchedData={matchedCourses} />

          <ActivityInterrogationFinder onQueryFetch={handleQueryFetch} />
        </div>
      )}

      {/* Tier 4: Synced Activity Logs (Filtered by domain) */}
      {viewMode !== 'cardio' && (
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
              : t(
                  'exerciseAnalytics.activityLogs.all',
                  'Workout Activity History & Maps'
                )
          }
        />
      )}
    </div>
  );
};

export default ExerciseReportsDashboard;
