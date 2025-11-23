import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ZoomableChart from "../ZoomableChart";
import WorkoutHeatmap from "./WorkoutHeatmap";
import MuscleGroupRecoveryTracker from "./MuscleGroupRecoveryTracker";
import PrProgressionChart from "./PrProgressionChart";
import ExerciseVarietyScore from "./ExerciseVarietyScore";
import SetPerformanceAnalysisChart from "./SetPerformanceAnalysisChart";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { log, info, error } from "@/utils/logging";
import ActivityReportVisualizer from "../ActivityReportVisualizer"; // Import ActivityReportVisualizer
import {
  ExerciseDashboardData,
  ExerciseProgressData,
} from '@/services/reportsService';
import { getExerciseProgressData } from '@/services/exerciseEntryService';
import { getAvailableEquipment, getAvailableMuscleGroups, getAvailableExercises } from '@/services/exerciseSearchService';
import { addDays, subDays, addMonths, subMonths, addYears, subYears, parseISO } from 'date-fns';

import { formatNumber } from "@/utils/numberFormatting";

// Utility function to calculate total tonnage
const calculateTotalTonnage = (entries: { sets: { weight: number | string; reps: number | string; }[] }[]) => {
  return entries.reduce((totalTonnage, entry) => {
    return totalTonnage + entry.sets.reduce((entryTonnage, set) => {
      const weight = parseFloat(set.weight as any) || 0;
      const reps = parseInt(set.reps as any) || 0;
      return entryTonnage + (weight * reps);
    }, 0);
  }, 0);
};

// Utility function to get comparison dates
const getComparisonDates = (startDate: string, endDate: string, comparisonPeriod: string): [string, string] => {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

  let compStartDate: Date;
  let compEndDate: Date;

  switch (comparisonPeriod) {
    case 'previous-period':
      compStartDate = subDays(start, diffDays + 1);
      compEndDate = subDays(end, diffDays + 1);
      break;
    case 'last-year':
      compStartDate = subYears(start, 1);
      compEndDate = subYears(end, 1);
      break;
    default:
      return [startDate, endDate]; // Should not happen
  }

  return [compStartDate.toISOString().split('T')[0], compEndDate.toISOString().split('T')[0]];
};

interface ExerciseReportsDashboardProps {
  exerciseDashboardData: ExerciseDashboardData | null;
  startDate: string | null;
  endDate: string | null;
  onDrilldown: (date: string) => void;
}

const ExerciseReportsDashboard: React.FC<ExerciseReportsDashboardProps> = ({
  exerciseDashboardData,
  startDate,
  endDate,
  onDrilldown,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { loggingLevel, formatDateInUserTimezone, weightUnit, convertWeight } = usePreferences();
  const [selectedExercisesForChart, setSelectedExercisesForChart] = useState<string[]>([]);
  const [exerciseProgressData, setExerciseProgressData] = useState<Record<string, ExerciseProgressData[]>>({}); // Store data for multiple exercises
  const [comparisonExerciseProgressData, setComparisonExerciseProgressData] = useState<Record<string, ExerciseProgressData[]>>({}); // New state for comparison data
  const [widgetLayout, setWidgetLayout] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [availableEquipment, setAvailableEquipment] = useState<string[]>([]);
  const [availableMuscles, setAvailableMuscles] = useState<string[]>([]);
  const [availableExercises, setAvailableExercises] = useState<{ id: string, name: string }[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('All');
  const [aggregationLevel, setAggregationLevel] = useState<string>('daily'); // New state for aggregation level
  const [comparisonPeriod, setComparisonPeriod] = useState<string | null>(null); // New state for comparison period

  // Default layout for widgets
  const defaultLayout = [
    "keyStats",
    "heatmap",
    "filtersAggregation",
    "muscleGroupRecovery",
    "prProgression",
    "exerciseVariety",
    "volumeTrend",
    "maxWeightTrend",
    "estimated1RMTrend",
    "bestSetRepRange",
    "trainingVolumeByMuscleGroup",
    "repsVsWeightScatter",
    "setPerformance",
    "timeUnderTension",
    "prVisualization",
  ];

  useEffect(() => {
    // Load layout from local storage
    const savedLayout = localStorage.getItem('exerciseDashboardLayout');
    if (savedLayout) {
      setWidgetLayout(JSON.parse(savedLayout));
    } else {
      setWidgetLayout(defaultLayout);
    }
  }, []);

  useEffect(() => {
    if (selectedExercise && selectedExercise !== 'All') {
      setSelectedExercisesForChart([selectedExercise]);
    } else if (selectedExercise === 'All') {
      setSelectedExercisesForChart(availableExercises.map(ex => ex.id));
    }
    else {
      setSelectedExercisesForChart([]);
    }
  }, [selectedExercise, availableExercises]);

  const saveLayout = (layout: string[]) => {
    setWidgetLayout(layout);
    localStorage.setItem('exerciseDashboardLayout', JSON.stringify(layout));
  };

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [equipment, muscles, exercises] = await Promise.all([
          getAvailableEquipment(),
          getAvailableMuscleGroups(),
          getAvailableExercises(selectedMuscle, selectedEquipment)
        ]);
        setAvailableEquipment(equipment);
        setAvailableMuscles(muscles);
        setAvailableExercises(exercises);
      } catch (error) {
        console.error("Failed to fetch filter options:", error);
      }
    };

    fetchFilterOptions();
  }, [selectedMuscle, selectedEquipment]);

  const fetchExerciseChartData = useCallback(async () => {
    if (selectedExercisesForChart.length === 0 || !startDate || !endDate) {
      setExerciseProgressData({});
      setComparisonExerciseProgressData({});
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const allFetchedExerciseData: Record<string, ExerciseProgressData[]> = {};
      const allFetchedComparisonData: Record<string, ExerciseProgressData[]> = {};

      for (const exerciseId of selectedExercisesForChart) {
        const exerciseName = availableExercises.find(ex => ex.id === exerciseId)?.name || t('exercise.editExerciseEntryDialog.unknownExercise', 'Unknown Exercise');
        const data = await getExerciseProgressData(exerciseId, startDate, endDate, aggregationLevel);
        allFetchedExerciseData[exerciseId] = data.map(entry => ({ ...entry, exercise_name: exerciseName }));
        info(loggingLevel, `ExerciseReportsDashboard: Fetched exercise progress data for ${exerciseName} (${exerciseId}) with aggregation ${aggregationLevel}:`, allFetchedExerciseData[exerciseId]);

        if (comparisonPeriod) {
          const [compStartDate, compEndDate] = getComparisonDates(startDate, endDate, comparisonPeriod);
          const compData = await getExerciseProgressData(exerciseId, compStartDate, compEndDate, aggregationLevel);
          allFetchedComparisonData[exerciseId] = compData.map(entry => ({ ...entry, exercise_name: exerciseName }));
          info(loggingLevel, `ExerciseReportsDashboard: Fetched comparison exercise progress data for ${exerciseName} (${exerciseId}) with aggregation ${aggregationLevel} and period ${comparisonPeriod}:`, allFetchedComparisonData[exerciseId]);
        }
      }
      setExerciseProgressData(allFetchedExerciseData);
      setComparisonExerciseProgressData(allFetchedComparisonData);

    } catch (err) {
      const message = t('exerciseReportsDashboard.failedToLoadExerciseProgressData', 'Failed to load exercise progress data.');
      setErrorMessage(message);
      error(loggingLevel, `ExerciseReportsDashboard: Error fetching exercise progress data:`, err);
      toast({
        title: t('reports.errorToastTitle', 'Error'),
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedExercisesForChart, startDate, endDate, aggregationLevel, comparisonPeriod, loggingLevel, toast, selectedExercise, t]);

  useEffect(() => {
    fetchExerciseChartData();
  }, [fetchExerciseChartData]);

  if (!exerciseDashboardData) {
    return <div>{t('exerciseReportsDashboard.loadingExerciseData', 'Loading exercise data...')}</div>;
  }

  const totalTonnage = calculateTotalTonnage(exerciseDashboardData.exerciseEntries);


  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case "keyStats":
        return (
          <Card key={widgetId}>
            <CardHeader>
              <CardTitle>{t('exerciseReportsDashboard.overallPerformanceSnapshot', 'Overall Performance Snapshot')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(exerciseDashboardData.keyStats.totalWorkouts)}</span>
                <span className="text-sm text-center">{t('exerciseReportsDashboard.totalWorkouts', 'Total Workouts')}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-green-500 to-teal-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(convertWeight(totalTonnage, 'kg', weightUnit))} {weightUnit}</span>
                <span className="text-sm text-center">{t('exerciseReportsDashboard.totalTonnage', 'Total Tonnage')}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(convertWeight(exerciseDashboardData.keyStats.totalVolume, 'kg', weightUnit))} {weightUnit}</span>
                <span className="text-sm text-center">{t('exerciseReportsDashboard.totalVolume', 'Total Volume')}</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-red-500 to-pink-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(exerciseDashboardData.keyStats.totalReps)}</span>
                <span className="text-sm text-center">{t('exerciseReportsDashboard.totalReps', 'Total Reps')}</span>
              </div>
              {exerciseDashboardData.consistencyData && (
                <>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.currentStreak}</span>
                    <span className="text-sm text-center">{t('exerciseReportsDashboard.currentStreakDays', 'Current Streak (days)')}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.longestStreak}</span>
                    <span className="text-sm text-center">{t('exerciseReportsDashboard.longestStreakDays', 'Longest Streak (days)')}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-emerald-500 to-lime-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.weeklyFrequency.toFixed(1)}</span>
                    <span className="text-sm text-center">{t('exerciseReportsDashboard.weeklyFrequency', 'Weekly Frequency')}</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.monthlyFrequency.toFixed(1)}</span>
                    <span className="text-sm text-center">{t('exerciseReportsDashboard.monthlyFrequency', 'Monthly Frequency')}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      case "heatmap":
        return (
          <Card key="heatmap">
            <CardHeader>
              <CardTitle>{t('exerciseReportsDashboard.workoutHeatmap', 'Workout Heatmap')}</CardTitle>
            </CardHeader>
            <CardContent>
              {exerciseDashboardData?.exerciseEntries && exerciseDashboardData.exerciseEntries.length > 0 ? (
                <WorkoutHeatmap workoutDates={Array.from(new Set(exerciseDashboardData.exerciseEntries.map(entry => entry.entry_date)))} />
              ) : (
                <p className="text-center text-muted-foreground">{t('exerciseReportsDashboard.noWorkoutDataAvailableForHeatmap', 'No workout data available for heatmap.')}</p>
              )}
            </CardContent>
          </Card>
        );
      case "filtersAggregation":
        return (
          <Card key="filtersAggregation" className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('exerciseReportsDashboard.filtersAggregation', 'Filters & Aggregation')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Select value={aggregationLevel} onValueChange={setAggregationLevel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('exerciseReportsDashboard.aggregation', 'Aggregation')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t('exerciseReportsDashboard.daily', 'Daily')}</SelectItem>
                    <SelectItem value="weekly">{t('exerciseReportsDashboard.weekly', 'Weekly')}</SelectItem>
                    <SelectItem value="monthly">{t('exerciseReportsDashboard.monthly', 'Monthly')}</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={comparisonPeriod || 'none'} onValueChange={(value) => setComparisonPeriod(value === 'none' ? null : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('exerciseReportsDashboard.compareTo', 'Compare to')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('exerciseReportsDashboard.noComparison', 'No Comparison')}</SelectItem>
                    <SelectItem value="previous-period">{t('exerciseReportsDashboard.previousPeriod', 'Previous Period')}</SelectItem>
                    <SelectItem value="last-year">{t('exerciseReportsDashboard.lastYear', 'Last Year')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Select
                  value={selectedEquipment || ''}
                  onValueChange={(value) => setSelectedEquipment(value === 'All' ? null : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('exerciseReportsDashboard.filterByEquipment', 'Filter by Equipment')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">{t('exerciseReportsDashboard.allEquipment', 'All Equipment')}</SelectItem>
                    {availableEquipment.map(equipment => (
                      <SelectItem key={equipment} value={equipment}>{equipment}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedMuscle || ''}
                  onValueChange={(value) => setSelectedMuscle(value === 'All' ? null : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('exerciseReportsDashboard.filterByMuscleGroup', 'Filter by Muscle Group')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">{t('exerciseReportsDashboard.allMuscles', 'All Muscles')}</SelectItem>
                    {availableMuscles.map(muscle => (
                      <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
                <Select
                  value={selectedExercise || 'All'}
                  onValueChange={(value) => setSelectedExercise(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('exerciseReportsDashboard.selectExercises', 'Select exercises')}>
                      {selectedExercise === 'All' ? t('exerciseReportsDashboard.allExercises', 'All Exercises') : availableExercises.find(ex => ex.id === selectedExercise)?.name || t('exerciseReportsDashboard.selectExercises', 'Select exercises')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">{t('exerciseReportsDashboard.allExercises', 'All Exercises')}</SelectItem>
                    {availableExercises.map(exercise => (
                      <SelectItem key={exercise.id} value={exercise.id}>{exercise.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

            </CardContent>
          </Card>
        );
      case "muscleGroupRecovery":
        const recoveryData = exerciseDashboardData?.recoveryData;
        return recoveryData && Object.keys(recoveryData).length > 0 ? (
          <MuscleGroupRecoveryTracker key="muscleGroupRecovery" recoveryData={recoveryData} />
        ) : null;
      case "prProgression":
        return selectedExercisesForChart.map(exerciseId => {
          const prProgressionData = exerciseDashboardData.prProgressionData[exerciseId] || [];
          const exerciseName = availableExercises.find(ex => ex.id === exerciseId)?.name || t('exercise.editExerciseEntryDialog.unknownExercise', 'Unknown Exercise');
          return prProgressionData.length > 0 ? (
            <Card key={`prProgression-${exerciseId}`}>
              <CardHeader><CardTitle>{t('exerciseReportsDashboard.prProgression', `PR Progression - ${exerciseName}`, { exerciseName })}</CardTitle></CardHeader>
              <CardContent>
                <PrProgressionChart prProgressionData={prProgressionData} />
              </CardContent>
            </Card>
          ) : null;
        });
      case "exerciseVariety":
        const varietyData = exerciseDashboardData?.exerciseVarietyData;
        return varietyData && Object.keys(varietyData).length > 0 ? (
          <ExerciseVarietyScore key="exerciseVariety" varietyData={varietyData} />
        ) : null;
      case "volumeTrend":
        const volumeTrendData = selectedExercisesForChart.length > 0
          ? Object.values(exerciseProgressData).flat().reduce((acc, entry) => {
              const date = formatDateInUserTimezone(parseISO(entry.entry_date), 'MMM dd, yyyy');
              let existingEntry = acc.find(item => item.date === date);
              if (!existingEntry) {
                existingEntry = { date, volume: 0, comparisonVolume: 0 };
                acc.push(existingEntry);
              }
              existingEntry.volume += entry.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
              // For comparison, we need to find the corresponding entry in comparisonExerciseProgressData
              // This assumes a 1:1 date mapping for simplicity, might need more complex logic for real-world scenarios
              const comparisonEntry = Object.values(comparisonExerciseProgressData).flat().find(compEntry => compEntry.entry_date === entry.entry_date);
              if (comparisonEntry) {
                existingEntry.comparisonVolume += comparisonEntry.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
              }
              return acc;
            }, [] as { date: string; volume: number; comparisonVolume: number }[]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];
        return volumeTrendData.length > 0 && volumeTrendData.some(d => d.volume > 0) ? (
          <Card key="volumeTrend">
            <CardHeader>
              <CardTitle>{t('exerciseReportsDashboard.volumeTrend', 'Volume Trend')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title={t('exerciseReportsDashboard.volumeTrend', 'Volume Trend')}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                    data={volumeTrendData}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: t('exerciseReportsDashboard.volumeCurrent', `Volume (${weightUnit})`, { weightUnit }), angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    <Bar
                      dataKey="volume"
                      fill="#8884d8"
                      name={t('exerciseReportsDashboard.volumeCurrent', 'Volume (Current)')}
                    />
                    {comparisonPeriod && (
                      <Bar
                        dataKey="comparisonVolume"
                        fill="#8884d8"
                        opacity={0.6}
                        name={t('exerciseReportsDashboard.volumeComparison', 'Volume (Comparison)')}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "maxWeightTrend":
        const maxWeightTrendData = selectedExercisesForChart.length > 0
          ? Object.values(exerciseProgressData).flat().reduce((acc, entry) => {
              const date = formatDateInUserTimezone(parseISO(entry.entry_date), 'MMM dd, yyyy');
              let existingEntry = acc.find(item => item.date === date);
              if (!existingEntry) {
                existingEntry = { date, maxWeight: 0, comparisonMaxWeight: 0 };
                acc.push(existingEntry);
              }
              existingEntry.maxWeight = Math.max(existingEntry.maxWeight, ...entry.sets.map(set => set.weight));
              const comparisonEntry = Object.values(comparisonExerciseProgressData).flat().find(compEntry => compEntry.entry_date === entry.entry_date);
              if (comparisonEntry) {
                existingEntry.comparisonMaxWeight = Math.max(existingEntry.comparisonMaxWeight, ...comparisonEntry.sets.map(set => set.weight));
              }
              return acc;
            }, [] as { date: string; maxWeight: number; comparisonMaxWeight: number }[]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];
        return maxWeightTrendData.length > 0 && maxWeightTrendData.some(d => d.maxWeight > 0) ? (
          <Card key="maxWeightTrend">
            <CardHeader>
              <CardTitle>{t('exerciseReportsDashboard.maxWeightTrend', 'Max Weight Trend')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title={t('exerciseReportsDashboard.maxWeightTrend', 'Max Weight Trend')}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                    data={maxWeightTrendData}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: t('exerciseReportsDashboard.maxWeightCurrent', `Max Weight (${weightUnit})`, { weightUnit }), angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    <Bar
                      dataKey="maxWeight"
                      fill="#82ca9d"
                      name={t('exerciseReportsDashboard.maxWeightCurrent', 'Max Weight (Current)')}
                    />
                    {comparisonPeriod && (
                      <Bar
                        dataKey="comparisonMaxWeight"
                        fill="#82ca9d"
                        opacity={0.6}
                        name={t('exerciseReportsDashboard.maxWeightComparison', 'Max Weight (Comparison)')}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "estimated1RMTrend":
        const estimated1RMTrendData = selectedExercisesForChart.length > 0
          ? Object.values(exerciseProgressData).flat().reduce((acc, entry) => {
              const date = formatDateInUserTimezone(parseISO(entry.entry_date), 'MMM dd, yyyy');
              let existingEntry = acc.find(item => item.date === date);
              if (!existingEntry) {
                existingEntry = { date, estimated1RM: 0, comparisonEstimated1RM: 0 };
                acc.push(existingEntry);
              }
              existingEntry.estimated1RM = Math.round(Math.max(existingEntry.estimated1RM, ...entry.sets.map(set => set.weight * (1 + (set.reps / 30)))));
              const comparisonEntry = Object.values(comparisonExerciseProgressData).flat().find(compEntry => compEntry.entry_date === entry.entry_date);
              if (comparisonEntry) {
                existingEntry.comparisonEstimated1RM = Math.round(Math.max(existingEntry.comparisonEstimated1RM, ...comparisonEntry.sets.map(set => set.weight * (1 + (set.reps / 30)))));
              }
              return acc;
            }, [] as { date: string; estimated1RM: number; comparisonEstimated1RM: number }[]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];
        return estimated1RMTrendData.length > 0 && estimated1RMTrendData.some(d => d.estimated1RM > 0) ? (
          <Card key="estimated1RMTrend">
            <CardHeader>
              <CardTitle>{t('exerciseReportsDashboard.estimated1RMTrend', 'Estimated 1RM Trend')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title={t('exerciseReportsDashboard.estimated1RMTrend', 'Estimated 1RM Trend')}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                    data={estimated1RMTrendData}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: t('exerciseReportsDashboard.estimated1RMCurrent', `Estimated 1RM (${weightUnit})`, { weightUnit }), angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    <Bar
                      dataKey="estimated1RM"
                      fill="#ffc658"
                      name={t('exerciseReportsDashboard.estimated1RMCurrent', 'Estimated 1RM (Current)')}
                    />
                    {comparisonPeriod && (
                      <Bar
                        dataKey="comparisonEstimated1RM"
                        fill="#ffc658"
                        opacity={0.6}
                        name={t('exerciseReportsDashboard.estimated1RMComparison', 'Estimated 1RM (Comparison)')}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "bestSetRepRange":
        return (
          <div key="bestSetRepRange">
            {selectedExercisesForChart.map(exerciseId => {
              const bestSetRepRangeData = exerciseDashboardData.bestSetRepRange[exerciseId]
                ? Object.entries(exerciseDashboardData.bestSetRepRange[exerciseId] || {}).map(([range, data]) => ({
                    range,
                    weight: data.weight,
                  }))
                : [];
              const exerciseName = availableExercises.find(ex => ex.id === exerciseId)?.name || t('exercise.editExerciseEntryDialog.unknownExercise', 'Unknown Exercise');
              return bestSetRepRangeData.length > 0 && bestSetRepRangeData.some(d => d.weight > 0) ? (
                <Card key={`bestSetRepRange-${exerciseId}`}>
                  <CardHeader>
                    <CardTitle>{t('exerciseReportsDashboard.bestSetByRepRange', `Best Set by Rep Range - ${exerciseName}`, { exerciseName })}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ZoomableChart title={t('exerciseReportsDashboard.bestSetByRepRangeTitle', 'Best Set by Rep Range')}>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={bestSetRepRangeData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="range" />
                          <YAxis label={{ value: t('exerciseReportsDashboard.maxWeight', `Weight (${weightUnit})`, { weightUnit }), angle: -90, position: 'insideLeft', offset: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                          <Legend />
                          <Bar
                            dataKey="weight"
                            fill="#8884d8"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </ZoomableChart>
                  </CardContent>
                </Card>
              ) : null;
            })}
          </div>
        );
      case "trainingVolumeByMuscleGroup":
        const trainingVolumeByMuscleGroupData = exerciseDashboardData.muscleGroupVolume && Object.keys(exerciseDashboardData.muscleGroupVolume).length > 0
          ? Object.entries(exerciseDashboardData.muscleGroupVolume).map(([muscle, volume]) => ({
              muscle,
              volume,
            }))
          : [];
        return trainingVolumeByMuscleGroupData.length > 0 && trainingVolumeByMuscleGroupData.some(d => d.volume > 0) ? (
          <Card key="trainingVolumeByMuscleGroup">
            <CardHeader>
              <CardTitle>{t('exerciseReportsDashboard.trainingVolumeByMuscleGroup', 'Training Volume by Muscle Group')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trainingVolumeByMuscleGroupData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="muscle" />
                  <YAxis label={{ value: t('exerciseReportsDashboard.volumeCurrent', `Volume (${weightUnit})`, { weightUnit }), angle: -90, position: 'insideLeft', offset: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                  <Legend />
                  <Bar dataKey="volume" fill="#ff7300" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null;
      case "repsVsWeightScatter":
        return selectedExercisesForChart.map(exerciseId => {
          const repsVsWeightScatterData = (() => {
            const repWeightMap = new Map<number, { totalWeight: number, count: number }>();
            exerciseProgressData[exerciseId]?.flatMap(entry => entry.sets.map(set => ({
              reps: set.reps,
              weight: set.weight,
            }))).forEach(item => {
              if (repWeightMap.has(item.reps)) {
                const existing = repWeightMap.get(item.reps)!;
                existing.totalWeight += item.weight;
                existing.count += 1;
              } else {
                repWeightMap.set(item.reps, { totalWeight: item.weight, count: 1 });
              }
            });
            return Array.from(repWeightMap.entries()).map(([reps, { totalWeight, count }]) => ({
              reps,
              averageWeight: Math.round(totalWeight / count),
            })).sort((a, b) => a.reps - b.reps);
          })();
          const exerciseName = availableExercises.find(ex => ex.id === exerciseId)?.name || t('exercise.editExerciseEntryDialog.unknownExercise', 'Unknown Exercise');
          return repsVsWeightScatterData.length > 0 && repsVsWeightScatterData.some(d => d.averageWeight > 0) ? (
            <Card key={`repsVsWeightScatter-${exerciseId}`}>
              <CardHeader>
                <CardTitle>{t('exerciseReportsDashboard.repsVsWeight', `Reps vs Weight - ${exerciseName}`, { exerciseName })}</CardTitle>
              </CardHeader>
              <CardContent>
                <ZoomableChart title={t('exerciseReportsDashboard.repsVsWeight', 'Reps vs Weight', { exerciseName: '' })}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                      data={repsVsWeightScatterData}
                    >
                      <CartesianGrid />
                      <XAxis dataKey="reps" name={t('exerciseReportsDashboard.reps', 'Reps')} />
                      <YAxis label={{ value: t('exerciseReportsDashboard.averageWeight', `Average Weight (${weightUnit})`, { weightUnit }), angle: -90, position: 'insideLeft', offset: 10 }} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                      <Legend />
                      <Bar
                        dataKey="averageWeight"
                        name={exerciseName}
                        fill="#a4de6c"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ZoomableChart>
              </CardContent>
            </Card>
          ) : null;
        });
      case "timeUnderTension":
        return selectedExercisesForChart.map(exerciseId => {
          const timeUnderTensionData = exerciseProgressData[exerciseId]?.map(d => ({
            ...d,
            date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
            timeUnderTension: d.sets.reduce((sum, set) => sum + (set.duration || 0), 0)
          })) || [];
          const exerciseName = availableExercises.find(ex => ex.id === exerciseId)?.name || t('exercise.editExerciseEntryDialog.unknownExercise', 'Unknown Exercise');
          return timeUnderTensionData.length > 0 && timeUnderTensionData.some(d => d.timeUnderTension > 0) ? (
            <Card key={`timeUnderTension-${exerciseId}`}>
              <CardHeader>
                <CardTitle>{t('exerciseReportsDashboard.timeUnderTensionTrend', `Time Under Tension Trend - ${exerciseName}`, { exerciseName })}</CardTitle>
              </CardHeader>
              <CardContent>
                <ZoomableChart title={t('exerciseReportsDashboard.timeUnderTensionTrendTitle', 'Time Under Tension Trend')}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={timeUnderTensionData}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis label={{ value: t('exerciseReportsDashboard.timeUnderTensionMin', 'Time Under Tension (min)'), angle: -90, position: 'insideLeft', offset: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                      <Legend />
                      <Bar
                        dataKey="timeUnderTension"
                        fill="#d0ed57"
                        name={exerciseName}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </ZoomableChart>
              </CardContent>
            </Card>
          ) : null;
        });
      case "prVisualization":
        return selectedExercisesForChart.map(exerciseId => {
          const prVisualizationData = exerciseDashboardData.prData[exerciseId] || null;
          const exerciseName = availableExercises.find(ex => ex.id === exerciseId)?.name || t('exercise.editExerciseEntryDialog.unknownExercise', 'Unknown Exercise');
          return prVisualizationData && (prVisualizationData.oneRM > 0 || prVisualizationData.weight > 0 || prVisualizationData.reps > 0) ? (
            <Card key={`prVisualization-${exerciseId}`}>
              <CardHeader>
                <CardTitle>{t('exerciseReportsDashboard.personalRecords', `Personal Records (PRs) - ${exerciseName}`, { exerciseName })}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                    <span className="text-xl font-bold">
                      {convertWeight(prVisualizationData.oneRM, 'kg', weightUnit).toFixed(1)} {weightUnit}
                    </span>
                    <span className="text-sm text-muted-foreground">{t('exerciseReportsDashboard.estimated1RM', 'Estimated 1RM')}</span>
                    <span className="text-xs text-muted-foreground">
                      ({prVisualizationData.reps} {t('exerciseReportsDashboard.repsAt', 'reps @')}{" "}
                      {convertWeight(prVisualizationData.weight, 'kg', weightUnit)} {weightUnit} {t('exerciseReportsDashboard.on', 'on')}{" "}
                      {formatDateInUserTimezone(prVisualizationData.date, 'MMM dd, yyyy')})
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                    <span className="text-xl font-bold">
                      {convertWeight(prVisualizationData.weight, 'kg', weightUnit).toFixed(1)} {weightUnit}
                    </span>
                    <span className="text-sm text-muted-foreground">{t('exerciseReportsDashboard.maxWeight', 'Max Weight')}</span>
                    <span className="text-xs text-muted-foreground">
                      ({prVisualizationData.reps} {t('exerciseReportsDashboard.repsShort', 'reps')} {t('exerciseReportsDashboard.on', 'on')}{" "}
                      {formatDateInUserTimezone(prVisualizationData.date, 'MMM dd, yyyy')})
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                    <span className="text-xl font-bold">
                      {prVisualizationData.reps} {t('exerciseReportsDashboard.repsShort', 'reps')}
                    </span>
                    <span className="text-sm text-muted-foreground">{t('exerciseReportsDashboard.maxReps', 'Max Reps')}</span>
                    <span className="text-xs text-muted-foreground">
                      ({convertWeight(prVisualizationData.weight, 'kg', weightUnit)} {weightUnit} {t('exerciseReportsDashboard.on', 'on')}{" "}
                      {formatDateInUserTimezone(prVisualizationData.date, 'MMM dd, yyyy')})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null;
        });
      case "setPerformance":
        return selectedExercisesForChart.map(exerciseId => {
          const setPerformanceData = exerciseDashboardData.setPerformanceData[exerciseId]
            ? Object.entries(exerciseDashboardData.setPerformanceData[exerciseId]).map(([setName, data]) => ({
                setName: setName.replace('Set', ' Set'),
                avgWeight: data.avgWeight,
                avgReps: data.avgReps,
              }))
            : [];
          const exerciseName = availableExercises.find(ex => ex.id === exerciseId)?.name || t('exercise.editExerciseEntryDialog.unknownExercise', 'Unknown Exercise');
          return setPerformanceData.length > 0 && setPerformanceData.some(d => d.avgWeight > 0 || d.avgReps > 0) ? (
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
  const allGarminActivityEntries: ExerciseProgressData[] = [];
  if (selectedExercise === 'All') {
    // If "All Exercises" is selected, collect Garmin entries from all exercises
    Object.values(exerciseProgressData).forEach(dataArray => {
      dataArray.forEach(entry => {
        if (entry.provider_name === 'garmin' && entry.exercise_entry_id) {
          allGarminActivityEntries.push(entry);
        }
      });
    });
  } else if (selectedExercise) {
    // If a specific exercise is selected, collect its Garmin entries
    exerciseProgressData[selectedExercise]?.forEach(entry => {
      if (entry.provider_name === 'garmin' && entry.exercise_entry_id) {
        allGarminActivityEntries.push(entry);
      }
    });
  }

  // Sort entries by date in descending order
  allGarminActivityEntries.sort((a, b) => parseISO(b.entry_date).getTime() - parseISO(a.entry_date).getTime());

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading && <p>{t('exerciseReportsDashboard.loadingCharts', 'Loading charts...')}</p>}
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}
        {!loading && !errorMessage && widgetLayout.map(widgetId => renderWidget(widgetId))}
      </div>
  
      {!loading && !errorMessage && selectedExercisesForChart.length > 0 && Object.keys(exerciseProgressData).length === 0 && (
        <p className="text-center text-muted-foreground">
          {t('exerciseReportsDashboard.noProgressDataAvailable', 'No progress data available for the selected exercises in the chosen date range.')}
        </p>
      )}

      {/* Render ActivityReportVisualizer for each Garmin activity entry */}
      {allGarminActivityEntries.length > 0 && (
        <div className="mt-8 space-y-8">
          <h2 className="text-2xl font-bold">{t('exerciseReportsDashboard.activityMaps', 'Activity Maps')}</h2>
          {allGarminActivityEntries.map((entry) => (
            <div key={entry.exercise_entry_id} className="border p-4 rounded-lg shadow-sm">
              <h3 className="text-xl font-semibold mb-2">
                {entry.exercise_name} - {formatDateInUserTimezone(parseISO(entry.entry_date), 'MMM dd, yyyy')}
              </h3>
              <ActivityReportVisualizer
                exerciseEntryId={entry.exercise_entry_id}
                providerName={entry.provider_name || 'garmin'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExerciseReportsDashboard;