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
import {
  ExerciseDashboardData,
  ExerciseProgressData,
} from '@/services/reportsService';
import { getExerciseProgressData } from '@/services/exerciseEntryService';
import { getAvailableEquipment, getAvailableMuscleGroups, getAvailableExercises } from '@/services/exerciseSearchService';
import { addDays, subDays, addMonths, subMonths, addYears, subYears, parseISO } from 'date-fns';

import { formatNumber } from "@/utils/numberFormatting";

// Utility function to calculate total tonnage
const calculateTotalTonnage = (entries: ExerciseProgressData[]) => {
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
  }, [selectedExercisesForChart, startDate, endDate, aggregationLevel, comparisonPeriod, loggingLevel, toast]);

  useEffect(() => {
    fetchExerciseChartData();
  }, [fetchExerciseChartData]);

  if (!exerciseDashboardData) {
    return <div>Loading exercise data...</div>;
  }

  const totalTonnage = calculateTotalTonnage(exerciseDashboardData.exerciseEntries);

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
              {exerciseDashboardData && (
                <WorkoutHeatmap workoutDates={Array.from(new Set(exerciseDashboardData.exerciseEntries.map(entry => entry.entry_date)))} />
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
            </CardContent>
          </Card>
        );
      case "muscleGroupRecovery":
        return (
          <MuscleGroupRecoveryTracker key="muscleGroupRecovery" recoveryData={exerciseDashboardData.recoveryData} />
        );
      case "prProgression":
        return selectedExercisesForChart.length > 0 ? (
          <PrProgressionChart key="prProgression" prProgressionData={exerciseDashboardData.prProgressionData[selectedExercisesForChart[0]]} />
        ) : null;
      case "exerciseVariety":
        return (
          <ExerciseVarietyScore key="exerciseVariety" varietyData={exerciseDashboardData.exerciseVarietyData} />
        );
      case "volumeTrend":
        return selectedExercisesForChart.length > 0 ? (
          <ZoomableChart key="volumeTrend" title="Volume Trend">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                data={
                  selectedExercisesForChart.length > 0
                    ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
                        ...d,
                        date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
                        volume: d.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0),
                        comparisonVolume: comparisonExerciseProgressData[selectedExercisesForChart[0]]?.find(compD => compD.entry_date === d.entry_date)?.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0) || null,
                      })) || []
                    : []
                }
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
        ) : null;
      case "maxWeightTrend":
        return selectedExercisesForChart.length > 0 ? (
          <ZoomableChart key="maxWeightTrend" title="Max Weight Trend">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                data={
                  selectedExercisesForChart.length > 0
                    ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
                        ...d,
                        date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
                        maxWeight: Math.max(...d.sets.map(set => set.weight)),
                        comparisonMaxWeight: comparisonExerciseProgressData[selectedExercisesForChart[0]]?.find(compD => compD.entry_date === d.entry_date)?.sets.reduce((max, set) => Math.max(max, set.weight), 0) || null,
                      })) || []
                    : []
                }
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
        ) : null;
      case "estimated1RMTrend":
        return selectedExercisesForChart.length > 0 ? (
          <ZoomableChart key="estimated1RMTrend" title="Estimated 1RM Trend">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart onClick={(e) => e && e.activePayload && e.activePayload.length > 0 && onDrilldown(e.activePayload[0].payload.entry_date)}
                data={
                  selectedExercisesForChart.length > 0
                    ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
                        ...d,
                        date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
                        estimated1RM: Math.round(Math.max(...d.sets.map(set => set.weight * (1 + (set.reps / 30))))),
                        comparisonEstimated1RM: comparisonExerciseProgressData[selectedExercisesForChart[0]]?.find(compD => compD.entry_date === d.entry_date)?.sets.reduce((max, set) => Math.max(max, set.weight * (1 + (set.reps / 30))), 0) || null,
                      })) || []
                    : []
                }
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
        ) : null;
      case "bestSetRepRange":
        return selectedExercisesForChart.length > 0 && exerciseDashboardData.bestSetRepRange[selectedExercisesForChart[0]] ? (
          <ZoomableChart key="bestSetRepRange" title="Best Set by Rep Range">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={Object.entries(exerciseDashboardData.bestSetRepRange[selectedExercisesForChart[0]] || {}).map(([range, data]) => ({
                range,
                weight: data.weight,
              }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis label={{ value: `Weight (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                <Legend />
                <Bar dataKey="weight" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </ZoomableChart>
        ) : null;
      case "trainingVolumeByMuscleGroup":
        return exerciseDashboardData.muscleGroupVolume && Object.keys(exerciseDashboardData.muscleGroupVolume).length > 0 ? (
          <Card key="trainingVolumeByMuscleGroup">
            <CardHeader>
              <CardTitle>Training Volume by Muscle Group</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={Object.entries(exerciseDashboardData.muscleGroupVolume).map(([muscle, volume]) => ({
                  muscle,
                  volume,
                }))}>
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
        return selectedExercisesForChart.length > 0 ? (
          <ZoomableChart key="repsVsWeightScatter" title="Reps vs Weight">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                data={
                  selectedExercisesForChart.length > 0
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
                    : []
                }
              >
                <CartesianGrid />
                <XAxis dataKey="reps" name="Reps" />
                <YAxis label={{ value: `Average Weight (${weightUnit})`, angle: -90, position: 'insideLeft', offset: 10 }} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                <Legend />
                {selectedExercisesForChart.map((exerciseId, index) => (
                  <Bar
                    key={exerciseId}
                    dataKey="averageWeight"
                    name={availableExercises.find(ex => ex.id === exerciseId)?.name}
                    fill="#a4de6c"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ZoomableChart>
        ) : null;
      case "timeUnderTension":
        return selectedExercisesForChart.length > 0 ? (
          <ZoomableChart key="timeUnderTension" title="Time Under Tension Trend">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={
                  selectedExercisesForChart.length > 0
                    ? exerciseProgressData[selectedExercisesForChart[0]]?.map(d => ({
                        ...d,
                        date: formatDateInUserTimezone(parseISO(d.entry_date), 'MMM dd, yyyy'),
                        timeUnderTension: d.sets.reduce((sum, set) => sum + (set.duration || 0), 0)
                      })) || []
                    : []
                }
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis label={{ value: 'Time Under Tension (min)', angle: -90, position: 'insideLeft', offset: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--background))' }} />
                <Legend />
                {selectedExercisesForChart.map((exerciseId, index) => (
                  <Bar
                    key={exerciseId}
                    dataKey="timeUnderTension"
                    fill="#d0ed57"
                    name={`${availableExercises.find(ex => ex.id === exerciseId)?.name}`}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ZoomableChart>
        ) : null;
      case "prVisualization":
        return selectedExercisesForChart.length > 0 && exerciseDashboardData.prData[selectedExercisesForChart[0]] ? (
          <Card key="prVisualization">
            <CardHeader>
              <CardTitle>Personal Records (PRs)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                  <span className="text-xl font-bold">
                    {convertWeight(exerciseDashboardData.prData[selectedExercisesForChart[0]].oneRM, 'kg', weightUnit).toFixed(1)} {weightUnit}
                  </span>
                  <span className="text-sm text-muted-foreground">Estimated 1RM</span>
                  <span className="text-xs text-muted-foreground">
                    ({exerciseDashboardData.prData[selectedExercisesForChart[0]].reps} reps @{" "}
                    {convertWeight(exerciseDashboardData.prData[selectedExercisesForChart[0]].weight, 'kg', weightUnit)} {weightUnit} on{" "}
                    {formatDateInUserTimezone(exerciseDashboardData.prData[selectedExercisesForChart[0]].date, 'MMM dd, yyyy')})
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                  <span className="text-xl font-bold">
                    {convertWeight(exerciseDashboardData.prData[selectedExercisesForChart[0]].weight, 'kg', weightUnit).toFixed(1)} {weightUnit}
                  </span>
                  <span className="text-sm text-muted-foreground">Max Weight</span>
                  <span className="text-xs text-muted-foreground">
                    ({exerciseDashboardData.prData[selectedExercisesForChart[0]].reps} reps on{" "}
                    {formatDateInUserTimezone(exerciseDashboardData.prData[selectedExercisesForChart[0]].date, 'MMM dd, yyyy')})
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center p-4 border rounded-lg">
                  <span className="text-xl font-bold">
                    {exerciseDashboardData.prData[selectedExercisesForChart[0]].reps} reps
                  </span>
                  <span className="text-sm text-muted-foreground">Max Reps</span>
                  <span className="text-xs text-muted-foreground">
                    ({convertWeight(exerciseDashboardData.prData[selectedExercisesForChart[0]].weight, 'kg', weightUnit)} {weightUnit} on{" "}
                    {formatDateInUserTimezone(exerciseDashboardData.prData[selectedExercisesForChart[0]].date, 'MMM dd, yyyy')})
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null;
      case "setPerformance":
        return selectedExercisesForChart.length > 0 && exerciseDashboardData.setPerformanceData[selectedExercisesForChart[0]] ? (
          <SetPerformanceAnalysisChart
            key="setPerformance"
            setPerformanceData={
              Object.entries(exerciseDashboardData.setPerformanceData[selectedExercisesForChart[0]]).map(([setName, data]) => ({
                setName: setName.replace('Set', ' Set'),
                avgWeight: data.avgWeight,
                avgReps: data.avgReps,
              }))
            }
          />
        ) : null;
      default:
        return null;
    }
  };


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
    </div>
  );
};

export default ExerciseReportsDashboard;