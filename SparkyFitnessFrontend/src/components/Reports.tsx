import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, ScatterChart, Scatter } from 'recharts'; // Added ScatterChart, Scatter
import { BarChart3, TrendingUp, Activity, Dumbbell, BedDouble } from "lucide-react"; // Added Dumbbell and BedDouble
import { getFastingDataRange, FastingLog } from '@/services/fastingService';
import { FastingReport } from './reports/FastingReport';
import { usePreferences } from "@/contexts/PreferencesContext";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import ZoomableChart from "./ZoomableChart";
import ReportsControls from "./reports/ReportsControls";
import NutritionChartsGrid from "./reports/NutritionChartsGrid";
import MeasurementChartsGrid from "./reports/MeasurementChartsGrid";
import ReportsTables from "./reports/ReportsTables";
import ExerciseReportsDashboard from "./reports/ExerciseReportsDashboard"; // Import ExerciseReportsDashboard
import SleepReport from "./reports/SleepReport"; // Import SleepReport
import BodyBatteryCard, { BODY_BATTERY_METRICS } from "./reports/BodyBatteryCard"; // Import BodyBatteryCard
import RespirationCard, { RESPIRATION_METRICS } from "./reports/RespirationCard"; // Import RespirationCard

// Metrics to hide from the custom measurements charts (shown in dedicated cards instead)
const HIDDEN_CUSTOM_METRICS = [
  ...BODY_BATTERY_METRICS,
  ...RESPIRATION_METRICS,  // Shown in dedicated Respiration card
  'Average SpO2',  // Shown in Sleep tab SpO2 card
  'Average Overnight HRV',  // Shown in Sleep tab HRV card
];
import StressChart from "./StressChart"; // Import StressChart
import { log, debug, info, warn, error, UserLoggingLevel } from "@/utils/logging";
import { format, parseISO, addDays } from 'date-fns'; // Import format, parseISO, addDays from date-fns
import { calculateFoodEntryNutrition } from '@/utils/nutritionCalculations';
import { calculateSmartYAxisDomain, getChartConfig } from "@/utils/chartUtils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select components

import {
  loadReportsData,
  NutritionData,
  MeasurementData,
  DailyFoodEntry,
  CustomCategory,
  CustomMeasurementData,
  DailyExerciseEntry, // Import DailyExerciseEntry
  ExerciseProgressData, // Import ExerciseProgressData
  ExerciseDashboardData, // Import new type for dashboard data
} from '@/services/reportsService';
import { SleepAnalyticsData, MoodEntry, StressDataPoint } from '@/types';
import { getExerciseProgressData } from '@/services/exerciseEntryService';
import { getExerciseDashboardData, getSleepAnalyticsData } from '@/services/reportsService';
import { getCategories as getCustomCategories } from '@/services/customCategoryService';
import { getRawStressData } from '@/services/customMeasurementService';
import { getMoodEntries } from '@/services/moodService';
import { customNutrientService } from "@/services/customNutrientService";
import { UserCustomNutrient } from "@/types/customNutrient";
import MoodChart from './MoodChart';

interface ExtendedNutritionData extends NutritionData {
  [key: string]: number | string; // Add index signature for custom nutrients
}

interface ExtendedDailyFoodEntry extends DailyFoodEntry {
  [key: string]: any; // Add index signature for custom nutrients
}

const Reports = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { weightUnit: defaultWeightUnit, measurementUnit: defaultMeasurementUnit, convertWeight, convertMeasurement, formatDateInUserTimezone, parseDateInUserTimezone, loggingLevel, timezone, energyUnit, convertEnergy } = usePreferences();

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };
  const [nutritionData, setNutritionData] = useState<ExtendedNutritionData[]>([]);
  const [measurementData, setMeasurementData] = useState<MeasurementData[]>([]);
  const [tabularData, setTabularData] = useState<ExtendedDailyFoodEntry[]>([]);
  const [exerciseEntries, setExerciseEntries] = useState<DailyExerciseEntry[]>([]); // New state for exercise entries
  const [exerciseDashboardData, setExerciseDashboardData] = useState<ExerciseDashboardData | null>(null); // New state for exercise dashboard data
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customMeasurementsData, setCustomMeasurementsData] = useState<Record<string, CustomMeasurementData[]>>({});
  const [rawStressData, setRawStressData] = useState<StressDataPoint[]>([]); // New state for raw stress data
  const [moodData, setMoodData] = useState<MoodEntry[]>([]); // New state for mood data
  const [customNutrients, setCustomNutrients] = useState<UserCustomNutrient[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [fastingData, setFastingData] = useState<FastingLog[]>([]);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [drilldownDate, setDrilldownDate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("charts");


  const handleDrilldown = (date: string) => {
    setDrilldownDate(date);
    // You might want to switch to the table tab here
  };

  // Effect to re-initialize startDate and endDate when timezone preference changes
  useEffect(() => {
    debug(loggingLevel, 'Reports: Timezone preference changed or component mounted, initializing/re-initializing default date range.');
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);
    debug(loggingLevel, 'Reports: Inside date re-initialization useEffect - today:', today, 'oneWeekAgo:', oneWeekAgo);
    debug(loggingLevel, 'Reports: Inside date re-initialization useEffect - formatted today:', formatDateInUserTimezone(today, 'yyyy-MM-dd'), 'formatted oneWeekAgo:', formatDateInUserTimezone(oneWeekAgo, 'yyyy-MM-dd'));
    setStartDate(formatDateInUserTimezone(oneWeekAgo, 'yyyy-MM-dd'));
    setEndDate(formatDateInUserTimezone(today, 'yyyy-MM-dd'));

    // Debug logs for new Date() and toISOString() moved here to access loggingLevel
    debug(loggingLevel, "Reports.tsx - Raw new Date():", new Date());
    debug(loggingLevel, "Reports.tsx - Raw new Date().toISOString():", new Date().toISOString());

  }, [timezone, formatDateInUserTimezone, loggingLevel]); // Depend on timezone from usePreferences

  // Effect to load reports when user, activeUser, date range changes, or refresh events are triggered
  useEffect(() => {
    info(loggingLevel, 'Reports: Component mounted/updated with:', {
      user: !!user,
      activeUserId,
      startDate,
      endDate,
      loggingLevel
    });
    // Add logging for activeUserId, startDate, endDate before calling getMoodEntries
    debug(loggingLevel, 'Reports: Parameters for getMoodEntries - activeUserId:', activeUserId, 'startDate:', startDate, 'endDate:', endDate);

    if (user && activeUserId && startDate && endDate) { // Only load reports if dates are set
      loadReports();
    } else {
      info(loggingLevel, 'Reports: Skipping initial report load because user, activeUserId, startDate, or endDate is not yet available.');
    }

    const handleRefresh = () => {
      info(loggingLevel, "Reports: Received refresh event, triggering data reload.");
      loadReports();
    };

    window.addEventListener('foodDiaryRefresh', handleRefresh);
    window.addEventListener('measurementsRefresh', handleRefresh);
    window.addEventListener('exerciseRefresh', handleRefresh); // Listen for exercise refresh

    return () => {
      window.removeEventListener('foodDiaryRefresh', handleRefresh);
      window.removeEventListener('measurementsRefresh', handleRefresh);
      window.removeEventListener('exerciseRefresh', handleRefresh); // Clean up exercise refresh listener
    };
  }, [user, activeUserId, startDate, endDate, loggingLevel, formatDateInUserTimezone, parseDateInUserTimezone, defaultWeightUnit, defaultMeasurementUnit, t]); // Added showWeightInKg, showMeasurementsInCm, defaultWeightUnit, defaultMeasurementUnit to dependencies


  const loadReports = async () => {
    info(loggingLevel, 'Reports: Loading reports...');
    try {
      setLoading(true);

      const results = await Promise.allSettled([
        loadReportsData(activeUserId, startDate, endDate),
        getExerciseDashboardData(activeUserId, startDate, endDate, null, null, null),
        getRawStressData(activeUserId),
        getMoodEntries(activeUserId, startDate, endDate),
        getFastingDataRange(startDate, endDate),
        customNutrientService.getCustomNutrients(),
      ]);

      // Process results from Promise.allSettled
      const [
        reportsDataResult,
        exerciseDashboardResult,
        rawStressDataResult,
        moodEntriesResult,
        fastingDataResult,
        customNutrientsResult,
      ] = results;
      debug(loggingLevel, 'Reports: moodEntriesResult after Promise.allSettled:', moodEntriesResult);
      // Add logging for the status and value/reason of moodEntriesResult
      if (moodEntriesResult.status === 'fulfilled') {
        debug(loggingLevel, 'Reports: moodEntriesResult fulfilled with value:', moodEntriesResult.value);
      } else {
        error(loggingLevel, 'Reports: moodEntriesResult rejected with reason:', moodEntriesResult.reason);
      }

      if (reportsDataResult.status === 'fulfilled') {
        setNutritionData(reportsDataResult.value.nutritionData as ExtendedNutritionData[]);
        setTabularData(reportsDataResult.value.tabularData as ExtendedDailyFoodEntry[]);
        setExerciseEntries(reportsDataResult.value.exerciseEntries);
        // Apply unit conversions to fetchedMeasurementData
        const measurementDataFormatted = reportsDataResult.value.measurementData.map(m => ({
          entry_date: m.entry_date,
          weight: m.weight ? convertWeight(m.weight, 'kg', defaultWeightUnit) : undefined,
          neck: m.neck ? convertMeasurement(m.neck, 'cm', defaultMeasurementUnit) : undefined,
          waist: m.waist ? convertMeasurement(m.waist, 'cm', defaultMeasurementUnit) : undefined,
          hips: m.hips ? convertMeasurement(m.hips, 'cm', defaultMeasurementUnit) : undefined,
          steps: m.steps || undefined,
          height: m.height ? convertMeasurement(m.height, 'cm', defaultMeasurementUnit) : undefined,
          body_fat_percentage: m.body_fat_percentage || undefined,
        }));
        setMeasurementData(measurementDataFormatted);
        setCustomCategories(reportsDataResult.value.customCategories);
        setCustomMeasurementsData(reportsDataResult.value.customMeasurementsData);
      } else {
        error(loggingLevel, 'Reports: Failed to load core reports data:', reportsDataResult.reason);
        setNutritionData([]);
        setTabularData([]);
        setExerciseEntries([]);
        setMeasurementData([]);
        setCustomCategories([]);
        setCustomMeasurementsData({});
      }

      if (exerciseDashboardResult.status === 'fulfilled') {
        setExerciseDashboardData(exerciseDashboardResult.value);
      } else {
        error(loggingLevel, 'Reports: Failed to load exercise dashboard data:', exerciseDashboardResult.reason);
        setExerciseDashboardData(null);
      }

      if (rawStressDataResult.status === 'fulfilled') {
        setRawStressData(rawStressDataResult.value);
      } else {
        error(loggingLevel, 'Reports: Failed to load raw stress data:', rawStressDataResult.reason);
        setRawStressData([]);
      }

      if (moodEntriesResult.status === 'fulfilled') {
        setMoodData(moodEntriesResult.value);
      } else {
        error(loggingLevel, 'Reports: Failed to load mood entries:', moodEntriesResult.reason);
        setMoodData([]); // Ensure moodData is always an array
        toast({
          title: "Mood Data Error",
          description: "Failed to load mood entries.",
          variant: "destructive",
        });
      }

      if (fastingDataResult.status === 'fulfilled') {
        setFastingData(fastingDataResult.value);
      } else {
        error(loggingLevel, 'Reports: Failed to load fasting data:', fastingDataResult.reason);
        setFastingData([]);
      }

      if (customNutrientsResult.status === 'fulfilled') {
        setCustomNutrients(customNutrientsResult.value);
      } else {
        error(loggingLevel, 'Reports: Failed to load custom nutrients:', customNutrientsResult.reason);
        setCustomNutrients([]);
      }

      info(loggingLevel, 'Reports: Reports loaded successfully.');
    } catch (error) {
      error(loggingLevel, 'Reports: Error loading reports:', error);
      toast({
        title: t('reports.errorToastTitle', "Error"),
        description: t('reports.errorLoadingReports', "Failed to load reports."),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      debug(loggingLevel, 'Reports: Loading state set to false.');
    }
  };

  const exportFoodDiary = async () => {
    info(loggingLevel, 'Reports: Attempting to export food diary.');
    try {
      if (!tabularData.length) {
        warn(loggingLevel, 'Reports: No food diary data to export.');
        toast({
          title: t('reports.noData', "No Data"),
          description: t('reports.noFoodDiaryDataToExport', "No food diary data to export"),
          variant: "destructive",
        });
        return;
      }

      const csvHeaders = [
        t('reports.foodDiaryExportHeaders.date', 'Date'), t('reports.foodDiaryExportHeaders.meal', 'Meal'), t('reports.foodDiaryExportHeaders.food', 'Food'), t('reports.foodDiaryExportHeaders.brand', 'Brand'), t('reports.foodDiaryExportHeaders.quantity', 'Quantity'), t('reports.foodDiaryExportHeaders.unit', 'Unit'),
        t('reports.foodDiaryExportHeaders.calories', 'Calories ({{unit}})', { unit: getEnergyUnitString(energyUnit) }), t('reports.foodDiaryExportHeaders.protein', 'Protein (g)'), t('reports.foodDiaryExportHeaders.carbs', 'Carbs (g)'), t('reports.foodDiaryExportHeaders.fat', 'Fat (g)'),
        t('reports.foodDiaryExportHeaders.saturatedFat', 'Saturated Fat (g)'), t('reports.foodDiaryExportHeaders.polyunsaturatedFat', 'Polyunsaturated Fat (g)'), t('reports.foodDiaryExportHeaders.monounsaturatedFat', 'Monounsaturated Fat (g)'), t('reports.foodDiaryExportHeaders.transFat', 'Trans Fat (g)'),
        t('reports.foodDiaryExportHeaders.cholesterol', 'Cholesterol (mg)'), t('reports.foodDiaryExportHeaders.sodium', 'Sodium (mg)'), t('reports.foodDiaryExportHeaders.potassium', 'Potassium (mg)'), t('reports.foodDiaryExportHeaders.dietaryFiber', 'Dietary Fiber (g)'), t('reports.foodDiaryExportHeaders.sugars', 'Sugars (g)'),
        t('reports.foodDiaryExportHeaders.vitaminA', 'Vitamin A (μg)'), t('reports.foodDiaryExportHeaders.vitaminC', 'Vitamin C (mg)'), t('reports.foodDiaryExportHeaders.calcium', 'Calcium (mg)'), t('reports.foodDiaryExportHeaders.iron', 'Iron (mg)'),
        ...customNutrients.map(nutrient => `${nutrient.name} (${nutrient.unit})`)
      ];

      // Group data by date and include totals
      const groupedData = tabularData.reduce((acc, entry) => {
        const date = entry.entry_date;
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(entry);
        return acc;
      }, {} as Record<string, DailyFoodEntry[]>);

      const calculateFoodDayTotal = (entries: DailyFoodEntry[]) => {
        return entries.reduce((total, entry) => {
          const calculatedNutrition = calculateFoodEntryNutrition(entry as any); // Cast to any for now
          
          const customNutrientTotals = customNutrients.reduce((acc, nutrient) => {
            acc[nutrient.name] = (acc[nutrient.name] || 0) + (calculatedNutrition.custom_nutrients?.[nutrient.name] || 0);
            return acc;
          }, {} as Record<string, number>);

          return {
            calories: total.calories + calculatedNutrition.calories,
            protein: total.protein + calculatedNutrition.protein,
            carbs: total.carbs + calculatedNutrition.carbs,
            fat: total.fat + calculatedNutrition.fat,
            saturated_fat: total.saturated_fat + (calculatedNutrition.saturated_fat || 0),
            polyunsaturated_fat: total.polyunsaturated_fat + (calculatedNutrition.polyunsaturated_fat || 0),
            monounsaturated_fat: total.monounsaturated_fat + (calculatedNutrition.monounsaturated_fat || 0),
            trans_fat: total.trans_fat + (calculatedNutrition.trans_fat || 0),
            cholesterol: total.cholesterol + (calculatedNutrition.cholesterol || 0),
            sodium: total.sodium + (calculatedNutrition.sodium || 0),
            potassium: total.potassium + (calculatedNutrition.potassium || 0),
            dietary_fiber: total.dietary_fiber + (calculatedNutrition.dietary_fiber || 0),
            sugars: total.sugars + (calculatedNutrition.sugars || 0),
            vitamin_a: total.vitamin_a + (calculatedNutrition.vitamin_a || 0),
            vitamin_c: total.vitamin_c + (calculatedNutrition.vitamin_c || 0),
            calcium: total.calcium + (calculatedNutrition.calcium || 0),
            iron: total.iron + (calculatedNutrition.iron || 0),
            ...customNutrientTotals,
          };
        }, {
          calories: 0, protein: 0, carbs: 0, fat: 0, saturated_fat: 0,
          polyunsaturated_fat: 0, monounsaturated_fat: 0, trans_fat: 0,
          cholesterol: 0, sodium: 0, potassium: 0, dietary_fiber: 0,
          sugars: 0, vitamin_a: 0, vitamin_c: 0, calcium: 0, iron: 0,
          ...customNutrients.reduce((acc, nutrient) => ({ ...acc, [nutrient.name]: 0 }), {})
        });
      };

      const csvRows: string[][] = [];

      // Sort dates descending
      Object.keys(groupedData)
        .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
        .forEach(date => {
          const entries = groupedData[date];

          // Add individual entries
          entries.forEach(entry => {
            const calculatedNutrition = calculateFoodEntryNutrition(entry as any); // Cast to any for now

            csvRows.push([
              formatDateInUserTimezone(entry.entry_date, 'MMM dd, yyyy'), // Format date for display
              entry.meal_type,
              entry.foods.name,
              entry.foods.brand || '',
              entry.quantity.toString(),
              entry.unit,
              Math.round(convertEnergy(calculatedNutrition.calories, 'kcal', energyUnit)).toString(),
              calculatedNutrition.protein.toFixed(1), // g
              calculatedNutrition.carbs.toFixed(1), // g
              calculatedNutrition.fat.toFixed(1), // g
              (calculatedNutrition.saturated_fat || 0).toFixed(1), // g
              (calculatedNutrition.polyunsaturated_fat || 0).toFixed(1), // g
              (calculatedNutrition.monounsaturated_fat || 0).toFixed(1), // g
              (calculatedNutrition.trans_fat || 0).toFixed(1), // g
              (calculatedNutrition.cholesterol || 0).toFixed(2), // mg
              (calculatedNutrition.sodium || 0).toFixed(2), // mg
              (calculatedNutrition.potassium || 0).toFixed(2), // mg
              (calculatedNutrition.dietary_fiber || 0).toFixed(1), // g
              (calculatedNutrition.sugars || 0).toFixed(1), // g
              Math.round(calculatedNutrition.vitamin_a || 0).toString(), // μg - full number
              (calculatedNutrition.vitamin_c || 0).toFixed(2), // mg
              (calculatedNutrition.calcium || 0).toFixed(2), // mg
              (calculatedNutrition.iron || 0).toFixed(2), // mg
              ...customNutrients.map(nutrient => (calculatedNutrition.custom_nutrients?.[nutrient.name] || 0).toFixed(1))
            ]);
          });

          // Add total row
          const totals = calculateFoodDayTotal(entries);
          csvRows.push([
            formatDateInUserTimezone(date, 'MMM dd, yyyy'), // Format date for display
            t('reports.foodDiaryExportTotals.total', 'Total'),
            '',
            '',
            '',
            '',
            Math.round(convertEnergy(totals.calories, 'kcal', energyUnit)).toString(),
            totals.protein.toFixed(1), // g
            totals.carbs.toFixed(1), // g
            totals.fat.toFixed(1), // g
            totals.saturated_fat.toFixed(1), // g
            totals.polyunsaturated_fat.toFixed(1), // g
            totals.monounsaturated_fat.toFixed(1), // g
            totals.trans_fat.toFixed(1), // g
            totals.cholesterol.toFixed(2), // mg
            totals.sodium.toFixed(2), // mg
            totals.potassium.toFixed(2), // mg
            totals.dietary_fiber.toFixed(1), // g
            totals.sugars.toFixed(1), // g
            Math.round(totals.vitamin_a).toString(), // μg - full number
            totals.vitamin_c.toFixed(2), // mg
            totals.calcium.toFixed(2), // mg
            totals.iron.toFixed(2), // mg
            ...customNutrients.map(nutrient => (totals[nutrient.name] || 0).toFixed(1))
          ]);
        });

      const csvContent = [csvHeaders, ...csvRows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `food - diary - ${ startDate } -to - ${ endDate }.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, 'Reports: Food diary exported successfully.');
      toast({
        title: t('reports.foodDiaryExportSuccess', "Success"),
        description: t('reports.foodDiaryExportSuccess', "Food diary exported successfully"),
      });
    } catch (err) {
      error(loggingLevel, 'Reports: Error exporting food diary:', err);
      toast({
        title: t('reports.errorToastTitle', "Error"),
        description: t('reports.foodDiaryExportError', "Failed to export food diary"),
        variant: "destructive",
      });
    }
  };

  const exportExerciseEntries = async () => {
    info(loggingLevel, 'Reports: Attempting to export exercise entries.');
    try {
      if (!exerciseEntries.length) {
        warn(loggingLevel, 'Reports: No exercise entries to export.');
        toast({
          title: t('reports.noData', "No Data"),
          description: t('reports.noExerciseEntriesToExport', "No exercise entries to export"),
          variant: "destructive",
        });
        return;
      }

      const csvHeaders = [
        t('reports.exerciseEntriesExportHeaders.date', 'Date'), t('reports.exerciseEntriesExportHeaders.exerciseName', 'Exercise Name'), t('reports.exerciseEntriesExportHeaders.durationMinutes', 'Duration (minutes)'), t('reports.exerciseEntriesExportHeaders.caloriesBurned', 'Calories Burned ({{unit}})', { unit: getEnergyUnitString(energyUnit) }),
        t('reports.exerciseEntriesExportHeaders.sets', 'Sets'), t('reports.exerciseEntriesExportHeaders.reps', 'Reps'), t('reports.exerciseEntriesExportHeaders.weight', 'Weight'), t('reports.exerciseEntriesExportHeaders.notes', 'Notes'), t('reports.exerciseEntriesExportHeaders.category', 'Category'), t('reports.exerciseEntriesExportHeaders.equipment', 'Equipment'),
        t('reports.exerciseEntriesExportHeaders.primaryMuscles', 'Primary Muscles'), t('reports.exerciseEntriesExportHeaders.secondaryMuscles', 'Secondary Muscles')
      ];

      const csvRows = exerciseEntries.map(entry => [
        formatDateInUserTimezone(entry.entry_date, 'MMM dd, yyyy'),
        entry.exercises.name,
        entry.duration_minutes.toString(),
        Math.round(convertEnergy(entry.calories_burned, 'kcal', energyUnit)).toString(),
        entry.sets.map(set => set.set_number).join('; ') || '', // Display set numbers
        entry.sets.map(set => set.reps).join('; ') || '', // Display reps for each set
        entry.sets.map(set => set.weight).join('; ') || '', // Display weight for each set
        entry.notes || '',
        entry.exercises.category,
        entry.exercises.equipment?.join(', ') || '',
        entry.exercises.primary_muscles?.join(', ') || '',
        entry.exercises.secondary_muscles?.join(', ') || '',
      ]);

      const csvContent = [csvHeaders, ...csvRows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exercise - entries - ${ startDate } -to - ${ endDate }.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, 'Reports: Exercise entries exported successfully.');
      toast({
        title: t('reports.exerciseEntriesExportSuccess', "Success"),
        description: t('reports.exerciseEntriesExportSuccess', "Exercise entries exported successfully"),
      });
    } catch (err) {
      error(loggingLevel, 'Reports: Error exporting exercise entries:', err);
      toast({
        title: t('reports.errorToastTitle', "Error"),
        description: t('reports.exerciseEntriesExportError', "Failed to export exercise entries"),
        variant: "destructive",
      });
    }
  };

  const exportBodyMeasurements = async () => {
    info(loggingLevel, 'Reports: Attempting to export body measurements.');
    try {
      debug(loggingLevel, 'Reports: Fetching body measurements for export...');
      // Data is already loaded by loadReportsData, so we just use the state
      const measurements = measurementData;

      if (!measurements || measurements.length === 0) {
        warn(loggingLevel, 'Reports: No body measurements to export.');
        toast({
          title: t('reports.noData', "No Data"),
          description: t('reports.noBodyMeasurementsToExport', "No body measurements to export"),
          variant: "destructive",
        });
        return;
      }

      info(loggingLevel, `Reports: Fetched ${ measurements.length } body measurement entries for export.`);

      const csvHeaders = [
        t('reports.bodyMeasurementsExportHeaders.date', 'Date'),
        t('reports.bodyMeasurementsExportHeaders.weight', `Weight(${ defaultWeightUnit })`),
        t('reports.bodyMeasurementsExportHeaders.neck', `Neck(${ defaultMeasurementUnit })`),
        t('reports.bodyMeasurementsExportHeaders.waist', `Waist(${ defaultMeasurementUnit })`),
        t('reports.bodyMeasurementsExportHeaders.hips', `Hips(${ defaultMeasurementUnit })`),
        t('reports.bodyMeasurementsExportHeaders.steps', 'Steps'),
        t('reports.bodyMeasurementsExportHeaders.height', `Height(${ defaultMeasurementUnit })`),
        t('reports.bodyMeasurementsExportHeaders.bodyFatPercentage', 'Body Fat %')
      ];

      const csvRows = measurements
        .filter(measurement =>
          measurement.weight ||
          measurement.neck ||
          measurement.waist ||
          measurement.hips ||
          measurement.steps ||
          (measurement as any).height ||
          (measurement as any).body_fat_percentage
        )
        .map(measurement => [
          formatDateInUserTimezone(measurement.entry_date, 'MMM dd, yyyy'), // Format date for display
          measurement.weight ? measurement.weight.toFixed(1) : '',
          measurement.neck ? measurement.neck.toFixed(1) : '',
          measurement.waist ? measurement.waist.toFixed(1) : '',
          measurement.hips ? measurement.hips.toFixed(1) : '',
          measurement.steps || '',
          (measurement as any).height ? (measurement as any).height.toFixed(1) : '',
          (measurement as any).body_fat_percentage ? (measurement as any).body_fat_percentage.toFixed(1) : ''
        ]);

      const csvContent = [csvHeaders, ...csvRows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `body - measurements - ${ startDate } -to - ${ endDate }.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, 'Reports: Body measurements exported successfully.');
      toast({
        title: t('reports.bodyMeasurementsExportSuccess', "Success"),
        description: t('reports.bodyMeasurementsExportSuccess', "Body measurements exported successfully"),
      });
    } catch (err) {
      error(loggingLevel, 'Reports: Error exporting body measurements:', err);
      toast({
        title: t('reports.errorToastTitle', "Error"),
        description: t('reports.bodyMeasurementsExportError', "Failed to export body measurements"),
        variant: "destructive",
      });
    }
  };

  const exportCustomMeasurements = async (category: CustomCategory) => {
    info(loggingLevel, `Reports: Attempting to export custom measurements for category: ${ category.name } (${ category.id })`);
    try {
      const measurements = customMeasurementsData[category.id];
      if (!measurements || measurements.length === 0) {
        warn(loggingLevel, `Reports: No custom measurement data to export for category: ${ category.name }.`);
        toast({
          title: t('reports.noData', "No Data"),
          description: t('reports.noCustomMeasurementDataToExport', `No ${ category.display_name || category.name } data to export `, { categoryName: category.display_name || category.name }),
          variant: "destructive",
        });
        return;
      }

      info(loggingLevel, `Reports: Found ${ measurements.length } custom measurement entries for category: ${ category.name }.`);

      // Sort by timestamp descending
      const sortedMeasurements = [...measurements].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const csvHeaders = [
        t('reports.customMeasurementsExportHeaders.date', 'Date'),
        t('reports.customMeasurementsExportHeaders.time', 'Time'),
        t('reports.customMeasurementsExportHeaders.value', 'Value')
      ];
      const csvRows = sortedMeasurements.map(measurement => {
        const timestamp = new Date(measurement.timestamp);
        const hour = timestamp.getHours();
        const minutes = timestamp.getMinutes();
        const formattedHour = `${ hour.toString().padStart(2, '0') }:${ minutes.toString().padStart(2, '0') } `;

        return [
          measurement.entry_date && !isNaN(parseISO(measurement.entry_date).getTime()) ? formatDateInUserTimezone(parseISO(measurement.entry_date), 'MMM dd, yyyy') : '', // Format date for display
          formattedHour,
          measurement.value.toString()
        ];
      });

      const csvContent = [csvHeaders, ...csvRows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ (category.display_name || category.name).toLowerCase().replace(/\s+/g, '-') } -${ startDate } -to - ${ endDate }.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, `Reports: Custom measurements exported successfully for category: ${ category.name }.`);
      toast({
        title: t('reports.customMeasurementsExportSuccess', "Success"),
        description: t('reports.customMeasurementsExportSuccess', `${ category.display_name || category.name } data exported successfully`, { categoryName: category.display_name || category.name }),
      });
    } catch (err) {
      error(loggingLevel, `Reports: Error exporting custom measurements for category ${ category.name }: `, err);
      toast({
        title: t('reports.errorToastTitle', "Error"),
        description: t('reports.customMeasurementsExportError', "Failed to export data"),
        variant: "destructive",
      });
    }
  };

  const formatCustomChartData = (category: CustomCategory, data: CustomMeasurementData[]) => {
    debug(loggingLevel, `Reports: Formatting custom chart data for category: ${ category.name } (${ category.frequency })`);
    const isConvertibleMeasurement = ['kg', 'lbs', 'cm', 'inches'].includes(category.measurement_type.toLowerCase());

    const convertValue = (value: string | number) => {
      const numericValue = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(numericValue)) {
        debug(loggingLevel, `Reports: convertValue received non - numeric value: ${ value }. Returning null.`);
        return null;
      }
      if (isConvertibleMeasurement) {
        // Assuming custom measurements are stored in 'cm' if they are convertible
        const converted = convertMeasurement(numericValue, 'cm', defaultMeasurementUnit);
        debug(loggingLevel, `Reports: Converted value from ${ numericValue } to ${ converted } for category.`);
        return converted;
      }
      debug(loggingLevel, `Reports: Returning original value ${ numericValue } for non - convertible category.`);
      return numericValue;
    };

    if (category.frequency === 'Hourly' || category.frequency === 'All') {
      return data.map(d => {
        const convertedValue = convertValue(d.value);
        debug(loggingLevel, `Reports: Mapping data point - original value: ${ d.value }, converted value: ${ convertedValue } `);
        return {
          date: `${ d.entry_date } ${ d.hour !== null ? String(d.hour).padStart(2, '0') + ':00' : '' } `,
          value: convertedValue,
          notes: d.notes
        };
      });
    } else {
      // For daily, group by date and take the latest value
      const grouped = data.reduce((acc, d) => {
        if (!acc[d.entry_date] || new Date(d.timestamp) > new Date(acc[d.entry_date].timestamp)) {
          acc[d.entry_date] = d;
        }
        return acc;
      }, {} as Record<string, CustomMeasurementData>);

      return Object.values(grouped).map(d => {
        const convertedValue = convertValue(d.value);
        debug(loggingLevel, `Reports: Mapping grouped data point - original value: ${ d.value }, converted value: ${ convertedValue } `);
        return {
          date: d.entry_date,
          value: convertedValue,
          notes: d.notes
        };
      });
    }
  };

  // Helper function to get smart Y-axis domain for custom measurements
  const getCustomYAxisDomain = (data: any[]) => {
    const config = getChartConfig('value');
    return calculateSmartYAxisDomain(data, 'value', {
      marginPercent: config.marginPercent,
      minRangeThreshold: config.minRangeThreshold
    });
  };


  const handleStartDateChange = (date: string) => {
    debug(loggingLevel, 'Reports: Start date change handler called:', {
      newDate: date,
      currentStartDate: startDate
    });
    setStartDate(date);
  };

  const handleEndDateChange = (date: string) => {
    debug(loggingLevel, 'Reports: End date change handler called:', {
      newDate: date,
      currentEndDate: endDate
    });
    setEndDate(date);
  };


  if (!user || !activeUserId) {
    info(loggingLevel, 'Reports: User not signed in, displaying sign-in message.');
    return <div>{t('reports.signInMessage', "Please sign in to view reports.")}</div>;
  }

  info(loggingLevel, 'Reports: Rendering reports component.');
  return (
    <div className="space-y-6">
      {startDate && endDate ? ( // Only render ReportsControls if dates are initialized
        <ReportsControls
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
        />
      ) : (
        <div>{t('reports.loadingDateControls', "Loading date controls...")}</div> // Or a loading spinner
      )}

      {loading ? (
        <div>{t('reports.loadingReports', "Loading reports...")}</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="charts" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {t('reports.chartsTab', "Charts")}
            </TabsTrigger>
            <TabsTrigger value="fasting" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {t('reports.fasting.insightsTab', "Fasting Insights")}
            </TabsTrigger>
            <TabsTrigger value="exercise-charts" className="flex items-center gap-2">
              <Dumbbell className="w-4 h-4" />
              {t('reports.exerciseProgressTab', "Exercise Progress")}
            </TabsTrigger>
            <TabsTrigger value="sleep-analytics" className="flex items-center gap-2">
              <BedDouble className="w-4 h-4" />
              {t('reports.sleepTab', "Sleep")}
            </TabsTrigger>
            <TabsTrigger value="table" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {t('reports.tableTab', "Table View")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="space-y-6">
            <NutritionChartsGrid nutritionData={nutritionData} customNutrients={customNutrients} />
            <MeasurementChartsGrid
              measurementData={measurementData}
              showWeightInKg={defaultWeightUnit === 'kg'}
              showMeasurementsInCm={defaultMeasurementUnit === 'cm'}
            />

            {/* Body Battery Card */}
            <BodyBatteryCard
              categories={customCategories}
              measurementsData={customMeasurementsData}
            />

            {/* Respiration Card */}
            <RespirationCard
              categories={customCategories}
              measurementsData={customMeasurementsData}
            />

            {/* Custom Measurements Charts (excluding dedicated cards) */}
            {customCategories.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">{t('reports.customMeasurementsTitle', "Custom Measurements")}</h3>
                <div className="space-y-4">
                  {customCategories.filter(c => c.data_type === 'numeric' && !HIDDEN_CUSTOM_METRICS.includes(c.name)).map((category) => {
                    const data = customMeasurementsData[category.id] || [];
                    const chartData = formatCustomChartData(category, data);

                    return (
                      <ZoomableChart key={category.id} title={t('reports.customMeasurementChartTitle', '{{categoryName}} ({{measurementType}})', { categoryName: category.display_name || category.name, measurementType: category.measurement_type })}>
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center">
                              <Activity className="w-5 h-5 mr-2" />
                              {category.measurement_type.toLowerCase() === 'length' || category.measurement_type.toLowerCase() === 'distance'
                                ? `${ category.display_name || category.name } (${ defaultMeasurementUnit })`
                                : `${ category.display_name || category.name } (${ category.measurement_type })`}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="h-80">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="date" />
                                  <YAxis
                                    type="number"
                                    domain={getCustomYAxisDomain(chartData) || undefined}
                                    tickFormatter={(value) => {
                                      if (category.measurement_type.toLowerCase() === 'waist') {
                                        return value.toFixed(1);
                                      }
                                      return value.toFixed(2);
                                    }}
                                  />
                                  <Tooltip
                                    content={({ active, payload, label }) => {
                                      if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        const unit = category.measurement_type.toLowerCase() === 'length' || category.measurement_type.toLowerCase() === 'distance'
                                          ? (defaultMeasurementUnit)
                                          : category.measurement_type;
                                        const numericValue = Number(data.value);

                                        return (
                                          <div className="p-2 bg-background border rounded-md shadow-md">
                                            <p className="label">{`${ label } `}</p>
                                            {!isNaN(numericValue) ? (
                                              <p className="intro">{`${ numericValue.toFixed(1) } ${ unit } `}</p>
                                            ) : (
                                              <p className="intro">{t('reports.notApplicable', 'N/A')}</p>
                                            )}
                                            {data.notes && <p className="desc" style={{ marginTop: '5px' }}>{t('reports.notes', 'Notes: ') + data.notes}</p>}
                                          </div>
                                        );
                                      }
                                      return null;
                                    }}
                                  />
                                  <Line type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </CardContent>
                        </Card>
                      </ZoomableChart>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="fasting" className="space-y-6">
            <FastingReport fastingData={fastingData} />
          </TabsContent>
          <TabsContent value="exercise-charts" className="space-y-6">
            {/* Existing exercise charts content */}
            <ExerciseReportsDashboard
              exerciseDashboardData={exerciseDashboardData}
              startDate={startDate}
              endDate={endDate}
              onDrilldown={handleDrilldown}
            />
          </TabsContent>

          <TabsContent value="sleep-analytics" className="space-y-6">
            <SleepReport startDate={startDate} endDate={endDate} />
          </TabsContent>

          <TabsContent value="stress-analytics" className="space-y-6">
            {rawStressData?.length > 0 ? (
              <StressChart
                title={t('reports.stressChartTitle', "Raw Stress Levels")}
                data={rawStressData}
              />
            ) : (
              <p>{t('reports.noStressData', "No raw stress data available.")}</p>
            )}

            {moodData?.length > 0 ? (
              <ZoomableChart title={t('reports.moodChartTitle', "Daily Mood")}>
                <ZoomableChart title={t('reports.moodChartTitle', "Daily Mood")}>
                  <MoodChart
                    title={t('reports.moodChartTitle', "Daily Mood")}
                    data={moodData}
                  />
                </ZoomableChart>
              </ZoomableChart>
            ) : (
              <p>{t('reports.noMoodData', "No daily mood data available.")}</p>
            )}
          </TabsContent>


          <TabsContent value="table" className="space-y-6">
            <ReportsTables
              tabularData={tabularData}
              exerciseEntries={drilldownDate ? exerciseEntries.filter(e => e.entry_date === drilldownDate) : exerciseEntries} // Pass exerciseEntries
              measurementData={measurementData}
              customCategories={customCategories}
              customMeasurementsData={customMeasurementsData}
              prData={exerciseDashboardData?.prData}
              showWeightInKg={defaultWeightUnit === 'kg'}
              showMeasurementsInCm={defaultMeasurementUnit === 'cm'}
              onExportFoodDiary={exportFoodDiary}
              onExportBodyMeasurements={exportBodyMeasurements}
              onExportCustomMeasurements={exportCustomMeasurements}
              onExportExerciseEntries={exportExerciseEntries} // Pass export function
              customNutrients={customNutrients} // Pass customNutrients
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Reports;
