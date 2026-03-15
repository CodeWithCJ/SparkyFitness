import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WorkoutHeatmap from './WorkoutHeatmap';
import MuscleGroupRecoveryTracker from './MuscleGroupRecoveryTracker';
import { PrProgressionChart } from './PrProgressionChart';
import ExerciseVarietyScore from './ExerciseVarietyScore';
import SetPerformanceAnalysisChart from './SetPerformanceAnalysisChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { parseISO } from 'date-fns';
import { useExerciseProgressQueries } from '@/hooks/Exercises/useExercises';
import {
  useAvailableEquipment,
  useAvailableExercises,
  useAvailableMuscleGroups,
} from '@/hooks/Exercises/useExerciseSearch';
import { calculateTotalTonnage } from '@/utils/reportUtil';
import { ExerciseDashboardData, ExerciseProgressData } from '@/types/reports';
import {
  calculateEstimated1RMTrendData,
  calculateMaxWeightTrendData,
  calculateRepsVsWeightScatterData,
  calculateTimeUnderTensionData,
  calculateVolumeTrendData,
  extractGarminActivityEntries,
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
import { GarminActivityList } from '@/components/ExerciseCharts/GarminActivityList';

interface ExerciseReportsDashboardProps {
  exerciseDashboardData: ExerciseDashboardData | undefined;
  startDate: string | null;
  endDate: string | null;
  onDrilldown: (date: string) => void;
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
const ExerciseReportsDashboard = ({
  exerciseDashboardData,
  startDate,
  endDate,
  onDrilldown,
}: ExerciseReportsDashboardProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, weightUnit, convertWeight } =
    usePreferences();
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(
    null
  );
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('All');
  const [aggregationLevel, setAggregationLevel] = useState<string>('daily'); // New state for aggregation level
  const [comparisonPeriod, setComparisonPeriod] = useState<string | null>(null); // New state for comparison period

  const { data: availableEquipment = [], isLoading: equipmentLoading } =
    useAvailableEquipment();
  const { data: availableMuscles = [], isLoading: musclesLoading } =
    useAvailableMuscleGroups();
  const { data: availableExercises = [], isLoading: exercisesLoading } =
    useAvailableExercises(selectedMuscle, selectedEquipment);

  const loading = equipmentLoading || musclesLoading || exercisesLoading;

  const selectedExercisesForChart = useMemo(() => {
    if (selectedExercise && selectedExercise !== 'All') {
      return [selectedExercise];
    }
    if (selectedExercise === 'All') {
      return availableExercises.map((ex) => ex.id);
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
    {} as Record<string, ExerciseProgressData[]>
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
    {} as Record<string, ExerciseProgressData[]>
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
            aggregationLevel={aggregationLevel}
            setAggregationLevel={setAggregationLevel}
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
                parseISO
              )
            : [];
        return volumeTrendData.length > 0 &&
          volumeTrendData.some((d) => d.volume > 0) ? (
          <VolumeTrendChart
            key="volumeTrend"
            data={volumeTrendData}
            weightUnit={weightUnit}
            onDrilldown={onDrilldown}
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
                parseISO
              )
            : [];
        return maxWeightTrendData.length > 0 &&
          maxWeightTrendData.some((d) => d.maxWeight > 0) ? (
          <MaxWeightTrendChart
            key="maxWeightTrend"
            data={maxWeightTrendData}
            weightUnit={weightUnit}
            onDrilldown={onDrilldown}
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
                parseISO
              )
            : [];
        return estimated1RMTrendData.length > 0 &&
          estimated1RMTrendData.some((d) => d.estimated1RM > 0) ? (
          <Estimated1RMTrendChart
            key="estimated1RMTrend"
            data={estimated1RMTrendData}
            weightUnit={weightUnit}
            onDrilldown={onDrilldown}
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
              convertWeight={convertWeight}
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
  const allGarminActivityEntries = extractGarminActivityEntries(
    exerciseProgressData,
    selectedExercise,
    parseISO
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading && (
          <p>
            {t('exerciseReportsDashboard.loadingCharts', 'Loading charts...')}
          </p>
        )}
        {!loading && DEFAULT_LAYOUT.map((widgetId) => renderWidget(widgetId))}
      </div>
      {!loading &&
        selectedExercisesForChart.length > 0 &&
        Object.keys(exerciseProgressData).length === 0 && (
          <p className="text-center text-muted-foreground">
            {t(
              'exerciseReportsDashboard.noProgressDataAvailable',
              'No progress data available for the selected exercises in the chosen date range.'
            )}
          </p>
        )}
      <GarminActivityList
        entries={allGarminActivityEntries}
        formatDate={formatDateInUserTimezone}
        parseISO={parseISO}
      />
    </div>
  );
};

export default ExerciseReportsDashboard;
