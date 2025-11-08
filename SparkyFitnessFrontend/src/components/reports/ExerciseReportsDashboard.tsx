import React, { useState, useEffect, useCallback } from "react";
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
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [aggregationLevel, setAggregationLevel] = useState<string>('daily'); // New state for aggregation level
  const [comparisonPeriod, setComparisonPeriod] = useState<string | null>(null); // New state for comparison period
  const [availableGarminEntries, setAvailableGarminEntries] = useState<ExerciseProgressData[]>([]); // New state for available Garmin entries
  const [selectedActivityReportEntryId, setSelectedActivityReportEntryId] = useState<string | null>(null); // New state for selected activity report

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
    if (selectedExercise) {
      setSelectedExercisesForChart([selectedExercise]);
    } else {
      setSelectedExercisesForChart([]);
    }
  }, [selectedExercise]);

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
      const newExerciseProgressData: Record<string, ExerciseProgressData[]> = {};
      const newComparisonExerciseProgressData: Record<string, ExerciseProgressData[]> = {};
      let garminEntriesForSelectedExercise: ExerciseProgressData[] = [];

      for (const exerciseId of selectedExercisesForChart) {
        const data = await getExerciseProgressData(exerciseId, startDate, endDate, aggregationLevel);
        newExerciseProgressData[exerciseId] = data;
        info(loggingLevel, `ExerciseReportsDashboard: Fetched exercise progress data for ${exerciseId} with aggregation ${aggregationLevel}:`, data);

        if (comparisonPeriod) {
          const [compStartDate, compEndDate] = getComparisonDates(startDate, endDate, comparisonPeriod);
          const compData = await getExerciseProgressData(exerciseId, compStartDate, compEndDate, aggregationLevel);
          newComparisonExerciseProgressData[exerciseId] = compData;
          info(loggingLevel, `ExerciseReportsDashboard: Fetched comparison exercise progress data for ${exerciseId} with aggregation ${aggregationLevel} and period ${comparisonPeriod}:`, compData);
        }
      }
      setExerciseProgressData(newExerciseProgressData);
      setComparisonExerciseProgressData(newComparisonExerciseProgressData);
      if (selectedExercise) {
        garminEntriesForSelectedExercise = newExerciseProgressData[selectedExercise]?.filter(entry => entry.provider_name === 'garmin' && entry.exercise_entry_id) || [];
        setAvailableGarminEntries(garminEntriesForSelectedExercise);
        // Automatically select the first Garmin entry if available and nothing is selected
        if (garminEntriesForSelectedExercise.length > 0 && !selectedActivityReportEntryId) {
          setSelectedActivityReportEntryId(garminEntriesForSelectedExercise[0].exercise_entry_id);
        } else if (garminEntriesForSelectedExercise.length === 0) {
          setSelectedActivityReportEntryId(null);
        }
      }

    } catch (err) {
      const message = "Failed to load exercise progress data.";
      setErrorMessage(message);
      error(loggingLevel, `ExerciseReportsDashboard: Error fetching exercise progress data:`, err);
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedExercisesForChart, startDate, endDate, aggregationLevel, comparisonPeriod, loggingLevel, toast, selectedActivityReportEntryId, selectedExercise]);

  useEffect(() => {
    fetchExerciseChartData();
  }, [fetchExerciseChartData]);

  if (!exerciseDashboardData) {
    return <div>Loading exercise data...</div>;
  }

  const totalTonnage = calculateTotalTonnage(exerciseDashboardData.exerciseEntries);

  // Determine if the selected exercise is a Garmin activity and get its details
  const selectedExerciseEntry = selectedActivityReportEntryId
    ? availableGarminEntries.find(entry => entry.exercise_entry_id === selectedActivityReportEntryId)
    : null;

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case "keyStats":
        return (
          <Card key={widgetId}>
            <CardHeader>
              <CardTitle>Overall Performance Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(exerciseDashboardData.keyStats.totalWorkouts)}</span>
                <span className="text-sm text-center">Total Workouts</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-green-500 to-teal-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(convertWeight(totalTonnage, 'kg', weightUnit))} {weightUnit}</span>
                <span className="text-sm text-center">Total Tonnage</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(convertWeight(exerciseDashboardData.keyStats.totalVolume, 'kg', weightUnit))} {weightUnit}</span>
                <span className="text-sm text-center">Total Volume</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-red-500 to-pink-600 text-white shadow-lg h-full">
                <span className="text-3xl font-bold">{formatNumber(exerciseDashboardData.keyStats.totalReps)}</span>
                <span className="text-sm text-center">Total Reps</span>
              </div>
              {exerciseDashboardData.consistencyData && (
                <>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.currentStreak}</span>
                    <span className="text-sm text-center">Current Streak (days)</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.longestStreak}</span>
                    <span className="text-sm text-center">Longest Streak (days)</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-emerald-500 to-lime-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.weeklyFrequency.toFixed(1)}</span>
                    <span className="text-sm text-center">Weekly Frequency</span>
                  </div>
                  <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-lg h-full">
                    <span className="text-3xl font-bold">{exerciseDashboardData.consistencyData.monthlyFrequency.toFixed(1)}</span>
                    <span className="text-sm text-center">Monthly Frequency</span>
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
              <CardTitle>Workout Heatmap</CardTitle>
            </CardHeader>
            <CardContent>
              {exerciseDashboardData?.exerciseEntries && exerciseDashboardData.exerciseEntries.length > 0 ? (
                <WorkoutHeatmap workoutDates={Array.from(new Set(exerciseDashboardData.exerciseEntries.map(entry => entry.entry_date)))} />
              ) : (
                <p className="text-center text-muted-foreground">No workout data available for heatmap.</p>
              )}
            </CardContent>
          </Card>
        );
      case "filtersAggregation":
        return (
          <Card key="filtersAggregation" className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Filters & Aggregation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Select value={aggregationLevel} onValueChange={setAggregationLevel}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Aggregation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={comparisonPeriod || 'none'} onValueChange={(value) => setComparisonPeriod(value === 'none' ? null : value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Compare to" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Comparison</SelectItem>
                    <SelectItem value="previous-period">Previous Period</SelectItem>
                    <SelectItem value="last-year">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <Select
                  value={selectedEquipment || ''}
                  onValueChange={(value) => setSelectedEquipment(value === 'All' ? null : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter by Equipment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Equipment</SelectItem>
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
                    <SelectValue placeholder="Filter by Muscle Group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Muscles</SelectItem>
                    {availableMuscles.map(muscle => (
                      <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
                <Select
                  value={selectedExercise || ''}
                  onValueChange={(value) => setSelectedExercise(value === 'All' ? null : value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select exercises" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Exercises</SelectItem>
                    {availableExercises.map(exercise => (
                      <SelectItem key={exercise.id} value={exercise.id}>{exercise.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedExercise && availableGarminEntries.length > 0 && (
                  <Select
                    value={selectedActivityReportEntryId || ''}
                    onValueChange={setSelectedActivityReportEntryId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Activity Report Date" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableGarminEntries.map(entry => (
                        <SelectItem key={entry.exercise_entry_id} value={entry.exercise_entry_id}>
                          {formatDateInUserTimezone(parseISO(entry.entry_date), 'MMM dd, yyyy')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
            </CardContent>
          </Card>
        );
      case "muscleGroupRecovery":
        const recoveryData = exerciseDashboardData?.recoveryData;
        return recoveryData && Object.keys(recoveryData).length > 0 ? (
          <MuscleGroupRecoveryTracker key="muscleGroupRecovery" recoveryData={recoveryData} />
        ) : null;
      case "prProgression":
        const prProgressionData = selectedExercisesForChart.length > 0 && exerciseDashboardData.prProgressionData[selectedExercisesForChart[0]]
          ? exerciseDashboardData.prProgressionData[selectedExercisesForChart[0]]
          : [];
        return prProgressionData.length > 0 ? (
          <PrProgressionChart key="prProgression" prProgressionData={prProgressionData} />
        ) : null;
      case "exerciseVariety":
        const varietyData = exerciseDashboardData?.exerciseVarietyData;
        return varietyData && Object.keys(varietyData).length > 0 ? (
          <ExerciseVarietyScore key="exerciseVariety" varietyData={varietyData} />
        ) : null;
      case "volumeTrend":
        const volumeTrendData = selectedExercisesForChart.length > 0
          ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
              ...d,
              date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
              volume: d.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0),
              comparisonVolume: comparisonExerciseProgressData[selectedExercisesForChart[0]]?.find(compD => compD.entry_date === d.entry_date)?.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0) || null,
            })) || []
          : [];
        return volumeTrendData.length > 0 && volumeTrendData.some(d => d.volume > 0) ? (
          <Card key="volumeTrend">
            <CardHeader>
              <CardTitle>Volume Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title="Volume Trend">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                    data={volumeTrendData}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: `Volume (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    {selectedExercisesForChart.map((exerciseId, index) => (
                      <React.Fragment key={exerciseId}>
                        <Bar
                          dataKey="volume"
                          fill="#8884d8"
                          name={`${availableExercises.find(ex => ex.id === exerciseId)?.name} (Current)`}
                        />
                        {comparisonPeriod && (
                          <Bar
                            dataKey="comparisonVolume"
                            fill="#8884d8"
                            opacity={0.6}
                            name={`${availableExercises.find(ex => ex.id === exerciseId)?.name} (Comparison)`}
                          />
                        )}
                      </React.Fragment>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "maxWeightTrend":
        const maxWeightTrendData = selectedExercisesForChart.length > 0
          ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
              ...d,
              date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
              maxWeight: Math.max(...d.sets.map(set => set.weight)),
              comparisonMaxWeight: comparisonExerciseProgressData[selectedExercisesForChart[0]]?.find(compD => compD.entry_date === d.entry_date)?.sets.reduce((max, set) => Math.max(max, set.weight), 0) || null,
            })) || []
          : [];
        return maxWeightTrendData.length > 0 && maxWeightTrendData.some(d => d.maxWeight > 0) ? (
          <Card key="maxWeightTrend">
            <CardHeader>
              <CardTitle>Max Weight Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title="Max Weight Trend">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                    data={maxWeightTrendData}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: `Max Weight (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    {selectedExercisesForChart.map((exerciseId, index) => (
                      <React.Fragment key={exerciseId}>
                        <Bar
                          dataKey="maxWeight"
                          fill="#82ca9d"
                          name={`${availableExercises.find(ex => ex.id === exerciseId)?.name} (Current)`}
                        />
                        {comparisonPeriod && (
                          <Bar
                            dataKey="comparisonMaxWeight"
                            fill="#82ca9d"
                            opacity={0.6}
                            name={`${availableExercises.find(ex => ex.id === exerciseId)?.name} (Comparison)`}
                          />
                        )}
                      </React.Fragment>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "estimated1RMTrend":
        const estimated1RMTrendData = selectedExercisesForChart.length > 0
          ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
              ...d,
              date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
              estimated1RM: Math.round(Math.max(...d.sets.map(set => set.weight * (1 + (set.reps / 30))))),
              comparisonEstimated1RM: comparisonExerciseProgressData[selectedExercisesForChart[0]]?.find(compD => compD.entry_date === d.entry_date)?.sets.reduce((max, set) => Math.max(max, set.weight * (1 + (set.reps / 30))), 0) || null,
            })) || []
          : [];
        return estimated1RMTrendData.length > 0 && estimated1RMTrendData.some(d => d.estimated1RM > 0) ? (
          <Card key="estimated1RMTrend">
            <CardHeader>
              <CardTitle>Estimated 1RM Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title="Estimated 1RM Trend">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                    data={estimated1RMTrendData}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: `Estimated 1RM (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    {selectedExercisesForChart.map((exerciseId, index) => (
                      <React.Fragment key={exerciseId}>
                        <Bar
                          dataKey="estimated1RM"
                          fill="#ffc658"
                          name={`${availableExercises.find(ex => ex.id === exerciseId)?.name} (Current)`}
                        />
                        {comparisonPeriod && (
                          <Bar
                            dataKey="comparisonEstimated1RM"
                            fill="#ffc658"
                            opacity={0.6}
                            name={`${availableExercises.find(ex => ex.id === exerciseId)?.name} (Comparison)`}
                          />
                        )}
                      </React.Fragment>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "bestSetRepRange":
        const bestSetRepRangeData = selectedExercisesForChart.length > 0 && exerciseDashboardData.bestSetRepRange[selectedExercisesForChart[0]]
          ? Object.entries(exerciseDashboardData.bestSetRepRange[selectedExercisesForChart[0]] || {}).map(([range, data]) => ({
              range,
              weight: data.weight,
            }))
          : [];
        return bestSetRepRangeData.length > 0 && bestSetRepRangeData.some(d => d.weight > 0) ? (
          <Card key="bestSetRepRange">
            <CardHeader>
              <CardTitle>Best Set by Rep Range</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title="Best Set by Rep Range">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={bestSetRepRangeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="range" />
                    <YAxis label={{ value: `Weight (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    {selectedExercisesForChart[0] && ( // Render only if an exercise is selected
                      <Bar
                        dataKey="weight"
                        fill="#8884d8"
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
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
              <CardTitle>Training Volume by Muscle Group</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trainingVolumeByMuscleGroupData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="muscle" />
                  <YAxis label={{ value: `Volume (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                  <Legend />
                  <Bar dataKey="volume" fill="#ff7300" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null;
      case "repsVsWeightScatter":
        const repsVsWeightScatterData = selectedExercisesForChart.length > 0
          ? (() => {
              const repWeightMap = new Map<number, { totalWeight: number, count: number }>();
              exerciseProgressData[selectedExercisesForChart[0]]?.flatMap(entry => entry.sets.map(set => ({
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
            })()
          : [];
        return repsVsWeightScatterData.length > 0 && repsVsWeightScatterData.some(d => d.averageWeight > 0) ? (
          <Card key="repsVsWeightScatter">
            <CardHeader>
              <CardTitle>Reps vs Weight</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title="Reps vs Weight">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                    data={repsVsWeightScatterData}
                  >
                    <CartesianGrid />
                    <XAxis dataKey="reps" name="Reps" />
                    <YAxis label={{ value: `Average Weight (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    {selectedExercisesForChart[0] && ( // Render only if an exercise is selected
                      <Bar
                        dataKey="averageWeight"
                        name={availableExercises.find(ex => ex.id === selectedExercisesForChart[0])?.name}
                        fill="#a4de6c"
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "timeUnderTension":
        const timeUnderTensionData = selectedExercisesForChart.length > 0
          ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
              ...d,
              date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
              timeUnderTension: d.sets.reduce((sum, set) => sum + (set.duration || 0), 0)
            })) || []
          : [];
        return timeUnderTensionData.length > 0 && timeUnderTensionData.some(d => d.timeUnderTension > 0) ? (
          <Card key="timeUnderTension">
            <CardHeader>
              <CardTitle>Time Under Tension Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ZoomableChart title="Time Under Tension Trend">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={timeUnderTensionData}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis label={{ value: 'Time Under Tension (min)', angle: -90, position: 'insideLeft', offset: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                    <Legend />
                    {selectedExercisesForChart.map((exerciseId, index) => (
                      <React.Fragment key={exerciseId}>
                        <Bar
                          dataKey="timeUnderTension"
                          fill="#d0ed57"
                          name={`${availableExercises.find(ex => ex.id === exerciseId)?.name}`}
                        />
                      </React.Fragment>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </ZoomableChart>
            </CardContent>
          </Card>
        ) : null;
      case "prVisualization":
        const prVisualizationData = selectedExercisesForChart.length > 0 && exerciseDashboardData.prData[selectedExercisesForChart[0]]
          ? exerciseDashboardData.prData[selectedExercisesForChart[0]]
          : null;
        return prVisualizationData && (prVisualizationData.oneRM > 0 || prVisualizationData.weight > 0 || prVisualizationData.reps > 0) ? (
          <Card key="prVisualization">
            <CardHeader>
              <CardTitle>Personal Records (PRs)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                  <span className="text-xl font-bold">
                    {convertWeight(prVisualizationData.oneRM, 'kg', weightUnit).toFixed(1)} {weightUnit}
                  </span>
                  <span className="text-sm text-muted-foreground">Estimated 1RM</span>
                  <span className="text-xs text-muted-foreground">
                    ({prVisualizationData.reps} reps @{" "}
                    {convertWeight(prVisualizationData.weight, 'kg', weightUnit)} {weightUnit} on{" "}
                    {formatDateInUserTimezone(prVisualizationData.date, 'MMM dd, yyyy')})
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                  <span className="text-xl font-bold">
                    {convertWeight(prVisualizationData.weight, 'kg', weightUnit).toFixed(1)} {weightUnit}
                  </span>
                  <span className="text-sm text-muted-foreground">Max Weight</span>
                  <span className="text-xs text-muted-foreground">
                    ({prVisualizationData.reps} reps on{" "}
                    {formatDateInUserTimezone(prVisualizationData.date, 'MMM dd, yyyy')})
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                  <span className="text-xl font-bold">
                    {prVisualizationData.reps} reps
                  </span>
                  <span className="text-sm text-muted-foreground">Max Reps</span>
                  <span className="text-xs text-muted-foreground">
                    ({convertWeight(prVisualizationData.weight, 'kg', weightUnit)} {weightUnit} on{" "}
                    {formatDateInUserTimezone(prVisualizationData.date, 'MMM dd, yyyy')})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null;
      case "setPerformance":
        const setPerformanceData = selectedExercisesForChart.length > 0 && exerciseDashboardData.setPerformanceData[selectedExercisesForChart[0]]
          ? Object.entries(exerciseDashboardData.setPerformanceData[selectedExercisesForChart[0]]).map(([setName, data]) => ({
              setName: setName.replace('Set', ' Set'),
              avgWeight: data.avgWeight,
              avgReps: data.avgReps,
            }))
          : [];
        return setPerformanceData.length > 0 && setPerformanceData.some(d => d.avgWeight > 0 || d.avgReps > 0) ? (
          <SetPerformanceAnalysisChart
            key="setPerformance"
            setPerformanceData={setPerformanceData}
          />
        ) : null;
      default:
        return null;
    }
  };

  // Find the selected exercise entry that is a Garmin activity
  const selectedGarminActivityEntry = selectedActivityReportEntryId
    ? availableGarminEntries.find(entry => entry.exercise_entry_id === selectedActivityReportEntryId)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading && <p>Loading charts...</p>}
        {errorMessage && <p className="text-red-500">{errorMessage}</p>}
        {!loading && !errorMessage && widgetLayout.map(widgetId => renderWidget(widgetId))}
      </div>
  
      {!loading && !errorMessage && selectedExercisesForChart.length > 0 && Object.keys(exerciseProgressData).length === 0 && (
        <p className="text-center text-muted-foreground">
          No progress data available for the selected exercises in the chosen date range.
        </p>
      )}

      {/* Render ActivityReportVisualizer if a Garmin activity is selected */}
      {selectedGarminActivityEntry && (
        <div className="mt-8">
          <ActivityReportVisualizer
            exerciseEntryId={selectedGarminActivityEntry.exercise_entry_id}
            providerName={selectedGarminActivityEntry.provider_name || 'garmin'} // Default to 'garmin' if provider_name is somehow missing
          />
        </div>
      )}
    </div>
  );
};

export default ExerciseReportsDashboard;