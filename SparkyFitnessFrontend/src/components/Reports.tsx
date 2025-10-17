import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, ScatterChart, Scatter } from 'recharts'; // Added ScatterChart, Scatter
import { BarChart3, TrendingUp, Activity, Dumbbell } from "lucide-react"; // Added Dumbbell
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
import { log, debug, info, warn, error, UserLoggingLevel } from "@/utils/logging";
import { format, parseISO, addDays } from 'date-fns'; // Import format, parseISO, addDays from date-fns
import { calculateFoodEntryNutrition } from '@/utils/nutritionCalculations'; // Import the new utility function
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
  MeasurementData as ReportsMeasurementData, // Alias to avoid naming conflict if needed
  DailyFoodEntry,
  CustomCategory,
  CustomMeasurementData,
  DailyExerciseEntry, // Import DailyExerciseEntry
  ExerciseProgressData, // Import ExerciseProgressData
  ExerciseDashboardData, // Import new type for dashboard data
} from '@/services/reportsService';
import { getExerciseProgressData } from '@/services/exerciseEntryService'; // Import getExerciseProgressData
import { getExerciseDashboardData } from '@/services/reportsService'; // Import new dashboard data function

const Reports = () => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { weightUnit: defaultWeightUnit, measurementUnit: defaultMeasurementUnit, convertWeight, convertMeasurement, formatDateInUserTimezone, parseDateInUserTimezone, loggingLevel, timezone } = usePreferences();
  const [nutritionData, setNutritionData] = useState<NutritionData[]>([]);
  const [measurementData, setMeasurementData] = useState<ReportsMeasurementData[]>([]);
  const [tabularData, setTabularData] = useState<DailyFoodEntry[]>([]);
  const [exerciseEntries, setExerciseEntries] = useState<DailyExerciseEntry[]>([]); // New state for exercise entries
  const [exerciseDashboardData, setExerciseDashboardData] = useState<ExerciseDashboardData | null>(null); // New state for exercise dashboard data
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customMeasurementsData, setCustomMeasurementsData] = useState<Record<string, CustomMeasurementData[]>>({});
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [showWeightInKg, setShowWeightInKg] = useState(defaultWeightUnit === 'kg');
  const [showMeasurementsInCm, setShowMeasurementsInCm] = useState(defaultMeasurementUnit === 'cm');
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
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);
    debug(loggingLevel, 'Reports: Inside date re-initialization useEffect - today:', today, 'twoWeeksAgo:', twoWeeksAgo);
    debug(loggingLevel, 'Reports: Inside date re-initialization useEffect - formatted today:', formatDateInUserTimezone(today, 'yyyy-MM-dd'), 'formatted twoWeeksAgo:', formatDateInUserTimezone(twoWeeksAgo, 'yyyy-MM-dd'));
    setStartDate(formatDateInUserTimezone(twoWeeksAgo, 'yyyy-MM-dd'));
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
      showWeightInKg,
      showMeasurementsInCm,
      loggingLevel
    });
    
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
    }, [user, activeUserId, startDate, endDate, loggingLevel, formatDateInUserTimezone, parseDateInUserTimezone, showWeightInKg, showMeasurementsInCm, defaultWeightUnit, defaultMeasurementUnit]); // Added showWeightInKg, showMeasurementsInCm, defaultWeightUnit, defaultMeasurementUnit to dependencies


  const loadReports = async () => {
    info(loggingLevel, 'Reports: Loading reports...');
    try {
      setLoading(true);
      
      const [
        {
          nutritionData: fetchedNutritionData,
          tabularData: fetchedTabularData,
          exerciseEntries: fetchedExerciseEntries,
          measurementData: fetchedMeasurementData,
          customCategories: fetchedCustomCategories,
          customMeasurementsData: fetchedCustomMeasurementsData,
        },
        fetchedExerciseDashboardData,
      ] = await Promise.all([
        loadReportsData(activeUserId, startDate, endDate),
        getExerciseDashboardData(activeUserId, startDate, endDate, null, null, null),
      ]);

      setNutritionData(fetchedNutritionData);
      setTabularData(fetchedTabularData);
      setExerciseEntries(fetchedExerciseEntries);
      setExerciseDashboardData(fetchedExerciseDashboardData);
      
      // Apply unit conversions to fetchedMeasurementData
      const measurementDataFormatted = fetchedMeasurementData.map(m => ({
        entry_date: m.entry_date,
        weight: m.weight ? convertWeight(m.weight, 'kg', showWeightInKg ? 'kg' : 'lbs') : undefined,
        neck: m.neck ? convertMeasurement(m.neck, 'cm', showMeasurementsInCm ? 'cm' : 'inches') : undefined,
        waist: m.waist ? convertMeasurement(m.waist, 'cm', showMeasurementsInCm ? 'cm' : 'inches') : undefined,
        hips: m.hips ? convertMeasurement(m.hips, 'cm', showMeasurementsInCm ? 'cm' : 'inches') : undefined,
        steps: m.steps || undefined,
      }));
      setMeasurementData(measurementDataFormatted);

      setCustomCategories(fetchedCustomCategories);
      setCustomMeasurementsData(fetchedCustomMeasurementsData);
      info(loggingLevel, 'Reports: Reports loaded successfully.');
    } catch (error) {
      error(loggingLevel, 'Reports: Error loading reports:', error);
      toast({
        title: "Error",
        description: "Failed to load reports.",
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
          title: "No Data",
          description: "No food diary data to export",
          variant: "destructive",
          });
        return;
      }

      const csvHeaders = [
        'Date', 'Meal', 'Food', 'Brand', 'Quantity', 'Unit',
        'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)',
        'Saturated Fat (g)', 'Polyunsaturated Fat (g)', 'Monounsaturated Fat (g)', 'Trans Fat (g)',
        'Cholesterol (mg)', 'Sodium (mg)', 'Potassium (mg)', 'Dietary Fiber (g)', 'Sugars (g)',
        'Vitamin A (μg)', 'Vitamin C (mg)', 'Calcium (mg)', 'Iron (mg)'
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
          };
        }, {
          calories: 0, protein: 0, carbs: 0, fat: 0, saturated_fat: 0,
          polyunsaturated_fat: 0, monounsaturated_fat: 0, trans_fat: 0,
          cholesterol: 0, sodium: 0, potassium: 0, dietary_fiber: 0,
          sugars: 0, vitamin_a: 0, vitamin_c: 0, calcium: 0, iron: 0
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
              Math.round(calculatedNutrition.calories).toString(),
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
              (calculatedNutrition.iron || 0).toFixed(2) // mg
            ]);
          });
          
          // Add total row
          const totals = calculateFoodDayTotal(entries);
          csvRows.push([
            formatDateInUserTimezone(date, 'MMM dd, yyyy'), // Format date for display
            'Total',
            '',
            '',
            '',
            '',
            Math.round(totals.calories).toString(),
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
            totals.iron.toFixed(2) // mg
          ]);
        });

      const csvContent = [csvHeaders, ...csvRows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `food-diary-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, 'Reports: Food diary exported successfully.');
      toast({
        title: "Success",
        description: "Food diary exported successfully",
      });
    } catch (err) {
      error(loggingLevel, 'Reports: Error exporting food diary:', err);
      toast({
        title: "Error",
        description: "Failed to export food diary",
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
          title: "No Data",
          description: "No exercise entries to export",
          variant: "destructive",
        });
        return;
      }

      const csvHeaders = [
        'Date', 'Exercise Name', 'Duration (minutes)', 'Calories Burned',
        'Sets', 'Reps', 'Weight', 'Notes', 'Category', 'Equipment',
        'Primary Muscles', 'Secondary Muscles'
      ];

      const csvRows = exerciseEntries.map(entry => [
        formatDateInUserTimezone(entry.entry_date, 'MMM dd, yyyy'),
        entry.exercises.name,
        entry.duration_minutes.toString(),
        Math.round(entry.calories_burned).toString(),
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
      a.download = `exercise-entries-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, 'Reports: Exercise entries exported successfully.');
      toast({
        title: "Success",
        description: "Exercise entries exported successfully",
      });
    } catch (err) {
      error(loggingLevel, 'Reports: Error exporting exercise entries:', err);
      toast({
        title: "Error",
        description: "Failed to export exercise entries",
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
          title: "No Data",
          description: "No body measurements to export",
          variant: "destructive",
        });
        return;
      }

      info(loggingLevel, `Reports: Fetched ${measurements.length} body measurement entries for export.`);

      const csvHeaders = [
        'Date',
        `Weight (${showWeightInKg ? 'kg' : 'lbs'})`,
        `Neck (${showMeasurementsInCm ? 'cm' : 'inches'})`,
        `Waist (${showMeasurementsInCm ? 'cm' : 'inches'})`,
        `Hips (${showMeasurementsInCm ? 'cm' : 'inches'})`,
        'Steps'
      ];

      const csvRows = measurements
        .filter(measurement =>
          measurement.weight ||
          measurement.neck ||
          measurement.waist ||
          measurement.hips ||
          measurement.steps
        )
        .map(measurement => [
          formatDateInUserTimezone(measurement.entry_date, 'MMM dd, yyyy'), // Format date for display
          measurement.weight ? convertWeight(measurement.weight, 'kg', showWeightInKg ? 'kg' : 'lbs').toFixed(1) : '',
          measurement.neck ? convertMeasurement(measurement.neck, 'cm', showMeasurementsInCm ? 'cm' : 'inches').toFixed(1) : '',
          measurement.waist ? convertMeasurement(measurement.waist, 'cm', showMeasurementsInCm ? 'cm' : 'inches').toFixed(1) : '',
          measurement.hips ? convertMeasurement(measurement.hips, 'cm', showMeasurementsInCm ? 'cm' : 'inches').toFixed(1) : '',
          measurement.steps || ''
        ]);

      const csvContent = [csvHeaders, ...csvRows].map(row =>
        row.map(cell => `"${cell}"`).join(',')
      ).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `body-measurements-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, 'Reports: Body measurements exported successfully.');
      toast({
        title: "Success",
        description: "Body measurements exported successfully",
      });
    } catch (err) {
      error(loggingLevel, 'Reports: Error exporting body measurements:', err);
      toast({
        title: "Error",
        description: "Failed to export body measurements",
        variant: "destructive",
      });
    }
  };

  const exportCustomMeasurements = async (category: CustomCategory) => {
    info(loggingLevel, `Reports: Attempting to export custom measurements for category: ${category.name} (${category.id})`);
    try {
      const measurements = customMeasurementsData[category.id];
      if (!measurements || measurements.length === 0) {
        warn(loggingLevel, `Reports: No custom measurement data to export for category: ${category.name}.`);
        toast({
          title: "No Data",
          description: `No ${category.name} data to export`,
          variant: "destructive",
        });
        return;
      }

      info(loggingLevel, `Reports: Found ${measurements.length} custom measurement entries for category: ${category.name}.`);

      // Sort by timestamp descending
      const sortedMeasurements = [...measurements].sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const csvHeaders = ['Date', 'Hour', 'Value'];
      const csvRows = sortedMeasurements.map(measurement => {
        const timestamp = new Date(measurement.timestamp);
        const hour = timestamp.getHours();
        const formattedHour = `${hour.toString().padStart(2, '0')}:00`;
        
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
      a.download = `${category.name.toLowerCase().replace(/\s+/g, '-')}-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      info(loggingLevel, `Reports: Custom measurements exported successfully for category: ${category.name}.`);
      toast({
        title: "Success",
        description: `${category.name} data exported successfully`,
      });
    } catch (err) {
      error(loggingLevel, `Reports: Error exporting custom measurements for category ${category.name}:`, err);
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive",
      });
    }
  };

  const formatCustomChartData = (category: CustomCategory, data: CustomMeasurementData[]) => {
    debug(loggingLevel, `Reports: Formatting custom chart data for category: ${category.name} (${category.frequency})`);
    const isConvertibleMeasurement = ['kg', 'lbs', 'cm', 'inches'].includes(category.measurement_type.toLowerCase());

    const convertValue = (value: string | number) => {
      const numericValue = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(numericValue)) {
        debug(loggingLevel, `Reports: convertValue received non-numeric value: ${value}. Returning null.`);
        return null;
      }
      if (isConvertibleMeasurement) {
        // Assuming custom measurements are stored in 'cm' if they are convertible
        const converted = convertMeasurement(parseFloat(value.toString()), 'cm', showMeasurementsInCm ? 'cm' : 'inches');
        debug(loggingLevel, `Reports: Converted value from ${value} to ${converted} for category.`);
        return converted;
      }
      debug(loggingLevel, `Reports: Returning original value ${value} for non-convertible category.`);
      return value;
    };

    if (category.frequency === 'Hourly' || category.frequency === 'All') {
      return data.map(d => {
        const convertedValue = convertValue(d.value);
        debug(loggingLevel, `Reports: Mapping data point - original value: ${d.value}, converted value: ${convertedValue}`);
        return {
          date: `${d.entry_date} ${d.hour !== null ? String(d.hour).padStart(2, '0') + ':00' : ''}`,
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
        debug(loggingLevel, `Reports: Mapping grouped data point - original value: ${d.value}, converted value: ${convertedValue}`);
        return {
          date: d.entry_date,
          value: convertedValue,
          notes: d.notes
        };
      });
    }
  };

  const handleWeightUnitToggle = (showInKg: boolean) => {
    debug(loggingLevel, 'Reports: Weight unit toggle handler called:', {
      showInKg,
      currentShowWeightInKg: showWeightInKg,
      currentWeightUnit: defaultWeightUnit
    });
    setShowWeightInKg(showInKg);
  };

  const handleMeasurementUnitToggle = (showInCm: boolean) => {
    debug(loggingLevel, 'Reports: Measurement unit toggle handler called:', {
      showInCm,
      currentShowMeasurementsInCm: showMeasurementsInCm,
      currentMeasurementUnit: defaultMeasurementUnit
    });
    setShowMeasurementsInCm(showInCm);
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
    return <div>Please sign in to view reports.</div>;
  }

  info(loggingLevel, 'Reports: Rendering reports component.');
  return (
    <div className="space-y-6">
      {startDate && endDate ? ( // Only render ReportsControls if dates are initialized
        <ReportsControls
          startDate={startDate}
          endDate={endDate}
          showWeightInKg={showWeightInKg}
          showMeasurementsInCm={showMeasurementsInCm}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          onWeightUnitToggle={handleWeightUnitToggle}
          onMeasurementUnitToggle={handleMeasurementUnitToggle}
        />
      ) : (
        <div>Loading date controls...</div> // Or a loading spinner
      )}

      {loading ? (
        <div>Loading reports...</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3"> {/* Changed to 3 columns */}
            <TabsTrigger value="charts" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Charts
            </TabsTrigger>
            <TabsTrigger value="exercise-charts" className="flex items-center gap-2"> {/* New tab for exercise charts */}
              <Dumbbell className="w-4 h-4" />
              Exercise Progress
            </TabsTrigger>
            <TabsTrigger value="table" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Table View
            </TabsTrigger>
          </TabsList>

          <TabsContent value="charts" className="space-y-6">
            <NutritionChartsGrid nutritionData={nutritionData} />
            <MeasurementChartsGrid
              measurementData={measurementData}
              showWeightInKg={showWeightInKg}
              showMeasurementsInCm={showMeasurementsInCm}
            />

            {/* Custom Measurements Charts */}
            {customCategories.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Custom Measurements</h3>
                <div className="space-y-4">
                  {customCategories.filter(c => c.data_type === 'numeric').map((category) => {
                    const data = customMeasurementsData[category.id] || [];
                    const chartData = formatCustomChartData(category, data);
                    
                    return (
                      <ZoomableChart key={category.id} title={`${category.name} (${category.measurement_type})`}>
                        <Card>
                          <CardHeader>
                            <CardTitle className="flex items-center">
                              <Activity className="w-5 h-5 mr-2" />
                              {category.measurement_type.toLowerCase() === 'length' || category.measurement_type.toLowerCase() === 'distance'
                                ? `${category.name} (${showMeasurementsInCm ? 'cm' : 'inches'})`
                                : `${category.name} (${category.measurement_type})`}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis
                                  label={{
                                    value: category.measurement_type.toLowerCase() === 'length' || category.measurement_type.toLowerCase() === 'distance'
                                      ? (showMeasurementsInCm ? 'cm' : 'inches')
                                      : category.measurement_type,
                                    angle: -90,
                                    position: 'insideLeft',
                                    offset: 10
                                  }}
                                />
                                <Tooltip
                                  content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      const unit = category.measurement_type.toLowerCase() === 'length' || category.measurement_type.toLowerCase() === 'distance'
                                        ? (showMeasurementsInCm ? 'cm' : 'inches')
                                        : category.measurement_type;
                                      const numericValue = Number(data.value);

                                      return (
                                        <div className="p-2 bg-background border rounded-md shadow-md">
                                          <p className="label">{`${label}`}</p>
                                          {!isNaN(numericValue) ? (
                                            <p className="intro">{`${numericValue.toFixed(1)} ${unit}`}</p>
                                          ) : (
                                            <p className="intro">N/A</p>
                                          )}
                                          {data.notes && <p className="desc" style={{ marginTop: '5px' }}>{`Notes: ${data.notes}`}</p>}
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

          <TabsContent value="exercise-charts" className="space-y-6"> {/* New tab content */}
            <ExerciseReportsDashboard
              exerciseDashboardData={exerciseDashboardData}
              startDate={startDate}
              endDate={endDate}
              onDrilldown={handleDrilldown}
            />
          </TabsContent>

          <TabsContent value="table" className="space-y-6">
            <ReportsTables
              tabularData={tabularData}
              exerciseEntries={drilldownDate ? exerciseEntries.filter(e => e.entry_date === drilldownDate) : exerciseEntries} // Pass exerciseEntries
              measurementData={measurementData}
              customCategories={customCategories}
              customMeasurementsData={customMeasurementsData}
              prData={exerciseDashboardData?.prData}
              showWeightInKg={showWeightInKg}
              showMeasurementsInCm={showMeasurementsInCm}
              onExportFoodDiary={exportFoodDiary}
              onExportBodyMeasurements={exportBodyMeasurements}
              onExportCustomMeasurements={exportCustomMeasurements}
              onExportExerciseEntries={exportExerciseEntries} // Pass export function
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default Reports;
