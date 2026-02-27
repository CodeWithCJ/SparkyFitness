import { EnergyUnit, LoggingLevel } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import i18n from '@/i18n';
import { debug, info, warn, error } from '@/utils/logging';

import { parseISO, subDays, subYears } from 'date-fns';
import {
  calculateFoodEntryNutrition,
  getEnergyUnitString,
} from './nutritionCalculations';
import { UserCustomNutrient } from '@/types/customNutrient';
import {
  CheckInMeasurement,
  CustomCategory,
  CustomMeasurement,
} from '@/types/checkin';
import { DailyExerciseEntry, DailyFoodEntry } from '@/types/reports';

interface StressDataPoint {
  time: string;
  stress_level: number;
}
export const calculateTotalTonnage = (
  entries: { sets: { weight: number | string; reps: number | string }[] }[]
) => {
  return entries.reduce((totalTonnage, entry) => {
    return (
      totalTonnage +
      entry.sets.reduce((entryTonnage, set) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const weight = parseFloat(set.weight as any) || 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reps = parseInt(set.reps as any) || 0;
        return entryTonnage + weight * reps;
      }, 0)
    );
  }, 0);
};

// Utility function to get comparison dates
export const getComparisonDates = (
  startDate: string,
  endDate: string,
  comparisonPeriod: string
): [string, string] => {
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

  return [
    compStartDate.toISOString().split('T')[0],
    compEndDate.toISOString().split('T')[0],
  ];
};

export const getHRVStatus = (
  hrv: number,
  baselineLow: number,
  baselineHigh: number
): { statusKey: string; statusDefault: string; color: string } => {
  if (hrv < baselineLow) {
    return {
      statusKey: 'reports.hrvLow',
      statusDefault: 'Low',
      color: '#f97316',
    };
  } else if (hrv > baselineHigh) {
    return {
      statusKey: 'reports.hrvElevated',
      statusDefault: 'High',
      color: '#3b82f6',
    };
  } else {
    return {
      statusKey: 'reports.hrvBalanced',
      statusDefault: 'Balanced',
      color: '#22c55e',
    };
  }
};

export const calculateBaseline = (
  values: number[]
): { low: number; high: number; avg: number } => {
  if (values.length === 0) return { low: 0, high: 100, avg: 50 };

  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;

  if (values.length < 2) {
    return { low: avg * 0.8, high: avg * 1.2, avg };
  }

  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  const avgSquaredDiff =
    squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  return {
    low: Math.max(0, avg - stdDev),
    high: avg + stdDev,
    avg,
  };
};

export const getHRStatus = (
  value: number
): { statusKey: string; statusDefault: string; color: string } => {
  if (value < 60) {
    return {
      statusKey: 'reports.heartRateAthletic',
      statusDefault: 'Athletic',
      color: '#22c55e',
    };
  } else if (value <= 80) {
    return {
      statusKey: 'reports.heartRateNormal',
      statusDefault: 'Normal',
      color: '#22c55e',
    };
  } else if (value <= 100) {
    return {
      statusKey: 'reports.heartRateElevated',
      statusDefault: 'Elevated',
      color: '#f97316',
    };
  } else {
    return {
      statusKey: 'reports.heartRateHigh',
      statusDefault: 'High',
      color: '#ef4444',
    };
  }
};

// Get status based on respiration rate - returns translation key
export const getRespirationStatus = (
  value: number
): { statusKey: string; statusDefault: string; color: string } => {
  if (value < 12) {
    return {
      statusKey: 'reports.respirationLow',
      statusDefault: 'Low',
      color: '#f97316',
    };
  } else if (value <= 20) {
    return {
      statusKey: 'reports.respirationNormal',
      statusDefault: 'Normal',
      color: '#22c55e',
    };
  } else {
    return {
      statusKey: 'reports.respirationElevated',
      statusDefault: 'Elevated',
      color: '#f97316',
    };
  }
};

// Get status based on SpO2 value - returns translation key
export const getSpO2Status = (
  value: number
): { statusKey: string; statusDefault: string; color: string } => {
  if (value >= 95) {
    return {
      statusKey: 'reports.spo2Excellent',
      statusDefault: 'Excellent',
      color: '#22c55e',
    };
  } else if (value >= 90) {
    return {
      statusKey: 'reports.spo2Normal',
      statusDefault: 'Normal',
      color: '#22c55e',
    };
  } else if (value >= 80) {
    return {
      statusKey: 'reports.spo2Low',
      statusDefault: 'Low',
      color: '#eab308',
    };
  } else {
    return {
      statusKey: 'reports.spo2VeryLow',
      statusDefault: 'Very Low',
      color: '#ef4444',
    };
  }
};

export const getSpO2StatusInfo = (
  value: number
): { status: string; color: string; description: string } => {
  if (value < 70) {
    return {
      status: 'Critical',
      color: '#ef4444',
      description: 'Dangerously low oxygen levels. Seek medical attention.',
    };
  } else if (value < 80) {
    return {
      status: 'Low',
      color: '#f97316',
      description: 'Below normal oxygen levels. Monitor closely.',
    };
  } else if (value < 90) {
    return {
      status: 'Moderate',
      color: '#eab308',
      description: 'Slightly below optimal levels.',
    };
  } else if (value < 95) {
    return {
      status: 'Normal',
      color: '#22c55e',
      description: 'Healthy oxygen saturation levels.',
    };
  } else {
    return {
      status: 'Excellent',
      color: '#22c55e',
      description: 'Optimal oxygen saturation.',
    };
  }
};

// Get color for a specific SpO2 value (for bar chart)

export const getSpO2Color = (value: number): string => {
  if (value < 70) return '#ef4444';
  if (value < 80) return '#f97316';
  if (value < 90) return '#eab308';
  return '#22c55e';
};

export const exportFoodDiary = async ({
  loggingLevel,
  tabularData,
  energyUnit,
  customNutrients,
  startDate,
  endDate,
  formatDateInUserTimezone,
  convertEnergy,
}: {
  loggingLevel: LoggingLevel;
  tabularData: DailyFoodEntry[];
  energyUnit: EnergyUnit;
  customNutrients: UserCustomNutrient[];
  startDate: string | null;
  endDate: string | null;
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string;
  convertEnergy: (
    value: number,
    fromUnit: EnergyUnit,
    toUnit: EnergyUnit
  ) => number;
}) => {
  info(loggingLevel, 'Reports: Attempting to export food diary.');
  try {
    if (!tabularData.length) {
      warn(loggingLevel, 'Reports: No food diary data to export.');
      toast({
        title: i18n.t('reports.noData', 'No Data'),
        description: i18n.t(
          'reports.noFoodDiaryDataToExport',
          'No food diary data to export'
        ),
        variant: 'destructive',
      });
      return;
    }

    const csvHeaders = [
      i18n.t('reports.foodDiaryExportHeaders.date', 'Date'),
      i18n.t('reports.foodDiaryExportHeaders.meal', 'Meal'),
      i18n.t('reports.foodDiaryExportHeaders.food', 'Food'),
      i18n.t('reports.foodDiaryExportHeaders.brand', 'Brand'),
      i18n.t('reports.foodDiaryExportHeaders.quantity', 'Quantity'),
      i18n.t('reports.foodDiaryExportHeaders.unit', 'Unit'),
      i18n.t('reports.foodDiaryExportHeaders.calories', 'Calories ({{unit}})', {
        unit: getEnergyUnitString(energyUnit),
      }),
      i18n.t('reports.foodDiaryExportHeaders.protein', 'Protein (g)'),
      i18n.t('reports.foodDiaryExportHeaders.carbs', 'Carbs (g)'),
      i18n.t('reports.foodDiaryExportHeaders.fat', 'Fat (g)'),
      i18n.t(
        'reports.foodDiaryExportHeaders.saturatedFat',
        'Saturated Fat (g)'
      ),
      i18n.t(
        'reports.foodDiaryExportHeaders.polyunsaturatedFat',
        'Polyunsaturated Fat (g)'
      ),
      i18n.t(
        'reports.foodDiaryExportHeaders.monounsaturatedFat',
        'Monounsaturated Fat (g)'
      ),
      i18n.t('reports.foodDiaryExportHeaders.transFat', 'Trans Fat (g)'),
      i18n.t('reports.foodDiaryExportHeaders.cholesterol', 'Cholesterol (mg)'),
      i18n.t('reports.foodDiaryExportHeaders.sodium', 'Sodium (mg)'),
      i18n.t('reports.foodDiaryExportHeaders.potassium', 'Potassium (mg)'),
      i18n.t(
        'reports.foodDiaryExportHeaders.dietaryFiber',
        'Dietary Fiber (g)'
      ),
      i18n.t('reports.foodDiaryExportHeaders.sugars', 'Sugars (g)'),
      i18n.t('reports.foodDiaryExportHeaders.vitaminA', 'Vitamin A (μg)'),
      i18n.t('reports.foodDiaryExportHeaders.vitaminC', 'Vitamin C (mg)'),
      i18n.t('reports.foodDiaryExportHeaders.calcium', 'Calcium (mg)'),
      i18n.t('reports.foodDiaryExportHeaders.iron', 'Iron (mg)'),
      ...customNutrients.map(
        (nutrient) => `${nutrient.name} (${nutrient.unit})`
      ),
    ];

    // Group data by date and include totals
    const groupedData = tabularData.reduce(
      (acc, entry) => {
        const date = entry.entry_date;
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(entry);
        return acc;
      },
      {} as Record<string, DailyFoodEntry[]>
    );

    const calculateFoodDayTotal = (entries: DailyFoodEntry[]) => {
      return entries.reduce(
        (total, entry) => {
          const calculatedNutrition = calculateFoodEntryNutrition(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entry as any
          ); // Cast to any for now

          const customNutrientTotals = customNutrients.reduce(
            (acc, nutrient) => {
              acc[nutrient.name] =
                (acc[nutrient.name] || 0) +
                (calculatedNutrition.custom_nutrients?.[nutrient.name] || 0);
              return acc;
            },
            {} as Record<string, number>
          );

          return {
            calories: total.calories + calculatedNutrition.calories,
            protein: total.protein + calculatedNutrition.protein,
            carbs: total.carbs + calculatedNutrition.carbs,
            fat: total.fat + calculatedNutrition.fat,
            saturated_fat:
              total.saturated_fat + (calculatedNutrition.saturated_fat || 0),
            polyunsaturated_fat:
              total.polyunsaturated_fat +
              (calculatedNutrition.polyunsaturated_fat || 0),
            monounsaturated_fat:
              total.monounsaturated_fat +
              (calculatedNutrition.monounsaturated_fat || 0),
            trans_fat: total.trans_fat + (calculatedNutrition.trans_fat || 0),
            cholesterol:
              total.cholesterol + (calculatedNutrition.cholesterol || 0),
            sodium: total.sodium + (calculatedNutrition.sodium || 0),
            potassium: total.potassium + (calculatedNutrition.potassium || 0),
            dietary_fiber:
              total.dietary_fiber + (calculatedNutrition.dietary_fiber || 0),
            sugars: total.sugars + (calculatedNutrition.sugars || 0),
            vitamin_a: total.vitamin_a + (calculatedNutrition.vitamin_a || 0),
            vitamin_c: total.vitamin_c + (calculatedNutrition.vitamin_c || 0),
            calcium: total.calcium + (calculatedNutrition.calcium || 0),
            iron: total.iron + (calculatedNutrition.iron || 0),
            ...customNutrientTotals,
          };
        },
        {
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          saturated_fat: 0,
          polyunsaturated_fat: 0,
          monounsaturated_fat: 0,
          trans_fat: 0,
          cholesterol: 0,
          sodium: 0,
          potassium: 0,
          dietary_fiber: 0,
          sugars: 0,
          vitamin_a: 0,
          vitamin_c: 0,
          calcium: 0,
          iron: 0,
          ...customNutrients.reduce(
            (acc, nutrient) => ({ ...acc, [nutrient.name]: 0 }),
            {}
          ),
        }
      );
    };

    const csvRows: string[][] = [];

    // Sort dates descending
    Object.keys(groupedData)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .forEach((date) => {
        const entries = groupedData[date];

        // Add individual entries
        entries.forEach((entry) => {
          const calculatedNutrition = calculateFoodEntryNutrition(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            entry as any
          ); // Cast to any for now

          csvRows.push([
            formatDateInUserTimezone(entry.entry_date, 'MMM dd, yyyy'), // Format date for display
            entry.meal_type,
            entry.foods.name,
            entry.foods.brand || '',
            entry.quantity.toString(),
            entry.unit,
            Math.round(
              convertEnergy(calculatedNutrition.calories, 'kcal', energyUnit)
            ).toString(),
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
            ...customNutrients.map((nutrient) =>
              (
                calculatedNutrition.custom_nutrients?.[nutrient.name] || 0
              ).toFixed(1)
            ),
          ]);
        });

        // Add total row
        const totals = calculateFoodDayTotal(entries);
        csvRows.push([
          formatDateInUserTimezone(date, 'MMM dd, yyyy'), // Format date for display
          i18n.t('reports.foodDiaryExportTotals.total', 'Total'),
          '',
          '',
          '',
          '',
          Math.round(
            convertEnergy(totals.calories, 'kcal', energyUnit)
          ).toString(),
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
          ...customNutrients.map((nutrient) =>
            (totals[nutrient.name] || 0).toFixed(1)
          ),
        ]);
      });

    const csvContent = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `food - diary - ${startDate} -to - ${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    info(loggingLevel, 'Reports: Food diary exported successfully.');
    toast({
      title: i18n.t('reports.foodDiaryExportSuccess', 'Success'),
      description: i18n.t(
        'reports.foodDiaryExportSuccess',
        'Food diary exported successfully'
      ),
    });
  } catch (err) {
    error(loggingLevel, 'Reports: Error exporting food diary:', err);
    toast({
      title: i18n.t('reports.errorToastTitle', 'Error'),
      description: i18n.t(
        'reports.foodDiaryExportError',
        'Failed to export food diary'
      ),
      variant: 'destructive',
    });
  }
};

export const exportExerciseEntries = async ({
  loggingLevel,
  energyUnit,
  exerciseEntries,
  startDate,
  endDate,
  formatDateInUserTimezone,
  convertEnergy,
}: {
  loggingLevel: LoggingLevel;
  energyUnit: EnergyUnit;
  exerciseEntries: DailyExerciseEntry[];
  startDate: string | null;
  endDate: string | null;
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string;
  convertEnergy: (
    value: number,
    fromUnit: EnergyUnit,
    toUnit: EnergyUnit
  ) => number;
}) => {
  info(loggingLevel, 'Reports: Attempting to export exercise entries.');
  try {
    if (!exerciseEntries.length) {
      warn(loggingLevel, 'Reports: No exercise entries to export.');
      toast({
        title: i18n.t('reports.noData', 'No Data'),
        description: i18n.t(
          'reports.noExerciseEntriesToExport',
          'No exercise entries to export'
        ),
        variant: 'destructive',
      });
      return;
    }

    const csvHeaders = [
      i18n.t('reports.exerciseEntriesExportHeaders.date', 'Date'),
      i18n.t(
        'reports.exerciseEntriesExportHeaders.exerciseName',
        'Exercise Name'
      ),
      i18n.t(
        'reports.exerciseEntriesExportHeaders.durationMinutes',
        'Duration (minutes)'
      ),
      i18n.t(
        'reports.exerciseEntriesExportHeaders.caloriesBurned',
        'Calories Burned ({{unit}})',
        { unit: getEnergyUnitString(energyUnit) }
      ),
      i18n.t('reports.exerciseEntriesExportHeaders.sets', 'Sets'),
      i18n.t('reports.exerciseEntriesExportHeaders.reps', 'Reps'),
      i18n.t('reports.exerciseEntriesExportHeaders.weight', 'Weight'),
      i18n.t('reports.exerciseEntriesExportHeaders.notes', 'Notes'),
      i18n.t('reports.exerciseEntriesExportHeaders.category', 'Category'),
      i18n.t('reports.exerciseEntriesExportHeaders.equipment', 'Equipment'),
      i18n.t(
        'reports.exerciseEntriesExportHeaders.primaryMuscles',
        'Primary Muscles'
      ),
      i18n.t(
        'reports.exerciseEntriesExportHeaders.secondaryMuscles',
        'Secondary Muscles'
      ),
    ];

    const csvRows = exerciseEntries.map((entry) => [
      formatDateInUserTimezone(entry.entry_date, 'MMM dd, yyyy'),
      entry.exercises.name,
      entry.duration_minutes.toString(),
      Math.round(
        convertEnergy(entry.calories_burned, 'kcal', energyUnit)
      ).toString(),
      entry.sets.map((set) => set.set_number).join('; ') || '', // Display set numbers
      entry.sets.map((set) => set.reps).join('; ') || '', // Display reps for each set
      entry.sets.map((set) => set.weight).join('; ') || '', // Display weight for each set
      entry.notes || '',
      entry.exercises.category,
      entry.exercises.equipment?.join(', ') || '',
      entry.exercises.primary_muscles?.join(', ') || '',
      entry.exercises.secondary_muscles?.join(', ') || '',
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exercise - entries - ${startDate} -to - ${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    info(loggingLevel, 'Reports: Exercise entries exported successfully.');
    toast({
      title: i18n.t('reports.exerciseEntriesExportSuccess', 'Success'),
      description: i18n.t(
        'reports.exerciseEntriesExportSuccess',
        'Exercise entries exported successfully'
      ),
    });
  } catch (err) {
    error(loggingLevel, 'Reports: Error exporting exercise entries:', err);
    toast({
      title: i18n.t('reports.errorToastTitle', 'Error'),
      description: i18n.t(
        'reports.exerciseEntriesExportError',
        'Failed to export exercise entries'
      ),
      variant: 'destructive',
    });
  }
};

export const exportBodyMeasurements = async ({
  loggingLevel,
  startDate,
  endDate,
  measurementData,
  defaultWeightUnit,
  defaultMeasurementUnit,
  formatDateInUserTimezone,
}: {
  loggingLevel: LoggingLevel;
  startDate: string | null;
  endDate: string | null;
  measurementData: CheckInMeasurement[];
  defaultWeightUnit: string;
  defaultMeasurementUnit: string;
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string;
}) => {
  info(loggingLevel, 'Reports: Attempting to export body measurements.');
  try {
    debug(loggingLevel, 'Reports: Fetching body measurements for export...');
    // Data is already loaded by loadReportsData, so we just use the state
    const measurements = measurementData;

    if (!measurements || measurements.length === 0) {
      warn(loggingLevel, 'Reports: No body measurements to export.');
      toast({
        title: i18n.t('reports.noData', 'No Data'),
        description: i18n.t(
          'reports.noBodyMeasurementsToExport',
          'No body measurements to export'
        ),
        variant: 'destructive',
      });
      return;
    }

    info(
      loggingLevel,
      `Reports: Fetched ${measurements.length} body measurement entries for export.`
    );

    const csvHeaders = [
      i18n.t('reports.bodyMeasurementsExportHeaders.date', 'Date'),
      i18n.t(
        'reports.bodyMeasurementsExportHeaders.weight',
        `Weight(${defaultWeightUnit})`
      ),
      i18n.t(
        'reports.bodyMeasurementsExportHeaders.neck',
        `Neck(${defaultMeasurementUnit})`
      ),
      i18n.t(
        'reports.bodyMeasurementsExportHeaders.waist',
        `Waist(${defaultMeasurementUnit})`
      ),
      i18n.t(
        'reports.bodyMeasurementsExportHeaders.hips',
        `Hips(${defaultMeasurementUnit})`
      ),
      i18n.t('reports.bodyMeasurementsExportHeaders.steps', 'Steps'),
      i18n.t(
        'reports.bodyMeasurementsExportHeaders.height',
        `Height(${defaultMeasurementUnit})`
      ),
      i18n.t(
        'reports.bodyMeasurementsExportHeaders.bodyFatPercentage',
        'Body Fat %'
      ),
    ];

    const csvRows = measurements
      .filter(
        (measurement) =>
          measurement.weight ||
          measurement.neck ||
          measurement.waist ||
          measurement.hips ||
          measurement.steps ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (measurement as any).height ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (measurement as any).body_fat_percentage
      )
      .map((measurement) => [
        formatDateInUserTimezone(measurement.entry_date, 'MMM dd, yyyy'), // Format date for display
        measurement.weight ? measurement.weight.toFixed(1) : '',
        measurement.neck ? measurement.neck.toFixed(1) : '',
        measurement.waist ? measurement.waist.toFixed(1) : '',
        measurement.hips ? measurement.hips.toFixed(1) : '',
        measurement.steps || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (measurement as any).height
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (measurement as any).height.toFixed(1)
          : '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (measurement as any).body_fat_percentage
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (measurement as any).body_fat_percentage.toFixed(1)
          : '',
      ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `body - measurements - ${startDate} -to - ${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    info(loggingLevel, 'Reports: Body measurements exported successfully.');
    toast({
      title: i18n.t('reports.bodyMeasurementsExportSuccess', 'Success'),
      description: i18n.t(
        'reports.bodyMeasurementsExportSuccess',
        'Body measurements exported successfully'
      ),
    });
  } catch (err) {
    error(loggingLevel, 'Reports: Error exporting body measurements:', err);
    toast({
      title: i18n.t('reports.errorToastTitle', 'Error'),
      description: i18n.t(
        'reports.bodyMeasurementsExportError',
        'Failed to export body measurements'
      ),
      variant: 'destructive',
    });
  }
};
export const exportCustomMeasurement = async ({
  loggingLevel,
  startDate,
  endDate,
  category,
  customMeasurementsData,
  formatDateInUserTimezone,
}: {
  loggingLevel: LoggingLevel;
  startDate: string | null;
  endDate: string | null;
  category: CustomCategory;
  customMeasurementsData: Record<string, CustomMeasurement[]>;
  formatDateInUserTimezone: (date: string | Date, formatStr?: string) => string;
}) => {
  info(
    loggingLevel,
    `Reports: Attempting to export custom measurements for category: ${category.name} (${category.id})`
  );
  try {
    const measurements = customMeasurementsData[category.id];
    if (!measurements || measurements.length === 0) {
      warn(
        loggingLevel,
        `Reports: No custom measurement data to export for category: ${category.name}.`
      );
      toast({
        title: i18n.t('reports.noData', 'No Data'),
        description: i18n.t(
          'reports.noCustomMeasurementDataToExport',
          `No ${category.display_name || category.name} data to export `,
          { categoryName: category.display_name || category.name }
        ),
        variant: 'destructive',
      });
      return;
    }

    info(
      loggingLevel,
      `Reports: Found ${measurements.length} custom measurement entries for category: ${category.name}.`
    );

    // Sort by timestamp descending
    const sortedMeasurements = [...measurements].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const csvHeaders = [
      i18n.t('reports.customMeasurementsExportHeaders.date', 'Date'),
      i18n.t('reports.customMeasurementsExportHeaders.time', 'Time'),
      i18n.t('reports.customMeasurementsExportHeaders.value', 'Value'),
    ];
    const csvRows = sortedMeasurements.map((measurement) => {
      const timestamp = new Date(measurement.timestamp);
      const hour = timestamp.getHours();
      const minutes = timestamp.getMinutes();
      const formattedHour = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} `;

      return [
        measurement.entry_date &&
        !isNaN(parseISO(measurement.entry_date).getTime())
          ? formatDateInUserTimezone(
              parseISO(measurement.entry_date),
              'MMM dd, yyyy'
            )
          : '', // Format date for display
        formattedHour,
        measurement.value.toString(),
      ];
    });

    const csvContent = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(category.display_name || category.name).toLowerCase().replace(/\s+/g, '-')} -${startDate} -to - ${endDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    info(
      loggingLevel,
      `Reports: Custom measurements exported successfully for category: ${category.name}.`
    );
    toast({
      title: i18n.t('reports.customMeasurementsExportSuccess', 'Success'),
      description: i18n.t(
        'reports.customMeasurementsExportSuccess',
        `${category.display_name || category.name} data exported successfully`,
        { categoryName: category.display_name || category.name }
      ),
    });
  } catch (err) {
    error(
      loggingLevel,
      `Reports: Error exporting custom measurements for category ${category.name}: `,
      err
    );
    toast({
      title: i18n.t('reports.errorToastTitle', 'Error'),
      description: i18n.t(
        'reports.customMeasurementsExportError',
        'Failed to export data'
      ),
      variant: 'destructive',
    });
  }
};

export const formatCustomChartData = (
  category: CustomCategory,
  data: CustomMeasurement[],
  loggingLevel: LoggingLevel,
  convertMeasurement: (val: number, from: string, to: string) => number,
  defaultMeasurementUnit: string
) => {
  debug(
    loggingLevel,
    `Reports: Formatting custom chart data for category: ${category.name} (${category.frequency})`
  );
  const isConvertibleMeasurement = ['kg', 'lbs', 'cm', 'inches'].includes(
    category.measurement_type.toLowerCase()
  );

  const convertValue = (value: string | number) => {
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numericValue)) {
      debug(
        loggingLevel,
        `Reports: convertValue received non - numeric value: ${value}. Returning null.`
      );
      return null;
    }
    if (isConvertibleMeasurement) {
      // Assuming custom measurements are stored in 'cm' if they are convertible
      const converted = convertMeasurement(
        numericValue,
        'cm',
        defaultMeasurementUnit
      );
      debug(
        loggingLevel,
        `Reports: Converted value from ${numericValue} to ${converted} for category.`
      );
      return converted;
    }
    debug(
      loggingLevel,
      `Reports: Returning original value ${numericValue} for non - convertible category.`
    );
    return numericValue;
  };

  if (category.frequency === 'Hourly' || category.frequency === 'All') {
    return data.map((d) => {
      const convertedValue = convertValue(d.value);
      debug(
        loggingLevel,
        `Reports: Mapping data point - original value: ${d.value}, converted value: ${convertedValue} `
      );
      return {
        date: `${d.entry_date} ${d.hour !== null ? String(d.hour).padStart(2, '0') + ':00' : ''} `,
        value: convertedValue,
        notes: d.notes,
      };
    });
  } else {
    // For daily, group by date and take the latest value
    const grouped = data.reduce(
      (acc, d) => {
        if (
          !acc[d.entry_date] ||
          new Date(d.timestamp) > new Date(acc[d.entry_date].timestamp)
        ) {
          acc[d.entry_date] = d;
        }
        return acc;
      },
      {} as Record<string, CustomMeasurement>
    );

    return Object.values(grouped).map((d) => {
      const convertedValue = convertValue(d.value);
      debug(
        loggingLevel,
        `Reports: Mapping grouped data point - original value: ${d.value}, converted value: ${convertedValue} `
      );
      return {
        date: d.entry_date,
        value: convertedValue,
        notes: d.notes,
      };
    });
  }
};

export const parseStressMeasurement = (
  value: string | number
): StressDataPoint[] => {
  if (typeof value !== 'string') return [];

  let cleaned = value.trim();

  if (cleaned.startsWith('{"{') || cleaned.startsWith('{"{\\"')) {
    cleaned = `[${cleaned.substring(1, cleaned.length - 1)}]`;
  }

  cleaned = cleaned.replace(/\\"/g, '"');

  cleaned = cleaned.replace(/"(\{.*?\})"/g, '$1');

  if (cleaned.match(/\}\s*\{/)) {
    cleaned = `[${cleaned.replace(/\}\s*\{/g, '},{')}]`;
  }

  try {
    const parsed: unknown = JSON.parse(cleaned);

    if (Array.isArray(parsed)) {
      const result: StressDataPoint[] = [];
      parsed.forEach((val) => {
        if (Array.isArray(val)) {
          result.push(...(val as StressDataPoint[]));
        } else if (typeof val === 'object' && val !== null) {
          result.push(val as StressDataPoint);
        }
      });
      return result;
    }

    if (typeof parsed === 'object' && parsed !== null) {
      return [parsed as StressDataPoint];
    }

    return [];
  } catch (error) {
    return [];
  }
};
