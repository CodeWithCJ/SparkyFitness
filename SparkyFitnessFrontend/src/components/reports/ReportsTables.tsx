import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { debug, info, warn, error } from "@/utils/logging";
import { parseISO } from "date-fns";
import { formatNutrientValue, getNutrientUnit } from '@/lib/utils';

interface DailyFoodEntry {
  entry_date: string;
  meal_type: string;
  quantity: number;
  unit: string;
  foods?: { // Make foods optional
    name: string;
    brand?: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    glycemic_index?: string;
    saturated_fat?: number;
    polyunsaturated_fat?: number;
    monounsaturated_fat?: number;
    trans_fat?: number;
    cholesterol?: number;
    sodium?: number;
    potassium?: number;
    dietary_fiber?: number;
    sugars?: number;
    vitamin_a?: number;
    vitamin_c?: number;
    calcium?: number;
    iron?: number;
    serving_size: number;
  };
  // Ensure these fields are always present as they are now pre-calculated from backend
  food_name: string;
  brand_name?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: number; // This will be NULL for meal totals, but will be handled
  glycemic_index?: string;
  saturated_fat: number;
  polyunsaturated_fat: number;
  monounsaturated_fat: number;
  trans_fat: number;
  cholesterol: number;
  sodium: number;
  potassium: number;
  dietary_fiber: number;
  sugars: number;
  vitamin_a: number;
  vitamin_c: number;
  calcium: number;
  iron: number;
}

interface DailyExerciseEntry {
  id: string;
  entry_date: string;
  duration_minutes: number;
  calories_burned: number;
  notes?: string;
  exercises: {
    id: string;
    name: string;
    category: string;
    calories_per_hour: number;
    equipment?: string[];
    primary_muscles?: string[];
    secondary_muscles?: string[];
  };
  sets: { // Define the structure of sets
    id: string;
    set_number: number;
    set_type: string;
    reps: number;
    weight: number;
    duration?: number;
    rest_time?: number;
    notes?: string;
  }[];
}

interface MeasurementData {
  entry_date: string; // Changed from 'date' to 'entry_date'
  weight?: number;
  neck?: number;
  waist?: number;
  hips?: number;
  steps?: number;
  height?: number;
  body_fat_percentage?: number;
}

interface CustomCategory {
  id: string;
  name: string;
  display_name?: string | null;
  measurement_type: string;
  frequency: string;
  data_type: string;
}

interface CustomMeasurementData {
  category_id: string;
  entry_date: string; // Changed from 'date' to 'entry_date'
  hour?: number;
  value: string | number;
  notes?: string;
  timestamp: string;
}

interface ReportsTablesProps {
  tabularData: DailyFoodEntry[];
  exerciseEntries: DailyExerciseEntry[]; // New prop for exercise entries
  measurementData: MeasurementData[];
  customCategories: CustomCategory[];
  customMeasurementsData: Record<string, CustomMeasurementData[]>;
  prData: any; // Add prData to props
  showWeightInKg: boolean;
  showMeasurementsInCm: boolean;
  onExportFoodDiary: () => void;
  onExportBodyMeasurements: () => void;
  onExportCustomMeasurements: (category: CustomCategory) => void;
  onExportExerciseEntries: () => void; // New prop for exporting exercise entries
}

const ReportsTables = ({
  tabularData,
  exerciseEntries, // Destructure new prop
  measurementData,
  customCategories,
  customMeasurementsData,
  prData, // Destructure prData
  showWeightInKg,
  showMeasurementsInCm,
  onExportFoodDiary,
  onExportBodyMeasurements,
  onExportCustomMeasurements,
  onExportExerciseEntries, // Destructure new prop
}: ReportsTablesProps) => {
  const { t } = useTranslation();
  const { loggingLevel, dateFormat, formatDateInUserTimezone, nutrientDisplayPreferences, weightUnit, convertWeight, energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();


  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const reportTabularPreferences = nutrientDisplayPreferences.find(p => p.view_group === 'report_tabular' && p.platform === platform);
  const visibleNutrients = reportTabularPreferences ? reportTabularPreferences.visible_nutrients : ['calories', 'protein', 'carbs', 'fat'];
  const [exerciseNameFilter, setExerciseNameFilter] = useState("");
  const [setTypeFilter, setSetTypeFilter] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  info(loggingLevel, 'ReportsTables: Rendering component.');

  // Sort tabular data by date descending, then by meal type
  debug(loggingLevel, 'ReportsTables: Sorting food tabular data.');
  const sortedFoodTabularData = [...tabularData].sort((a, b) => {
    const dateCompare = new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime();
    if (dateCompare !== 0) return dateCompare;

    const mealOrder = { breakfast: 0, lunch: 1, dinner: 2, snacks: 3 }; // Added snacks
    return (mealOrder[a.meal_type as keyof typeof mealOrder] || 4) - (mealOrder[b.meal_type as keyof typeof mealOrder] || 4);
  });

  // Group food entries by date and calculate daily totals
  debug(loggingLevel, 'ReportsTables: Grouping food data by date and calculating totals.');
  const groupedFoodData = sortedFoodTabularData.reduce((acc, entry) => {
    const date = entry.entry_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, DailyFoodEntry[]>);

  // Create flattened data with totals for rendering
  debug(loggingLevel, 'ReportsTables: Creating flattened food data with totals.');
  const foodDataWithTotals: (DailyFoodEntry & { isTotal?: boolean })[] = [];
  Object.keys(groupedFoodData)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    .forEach(date => {
      const entries = groupedFoodData[date];
      foodDataWithTotals.push(...entries);

      // Calculate totals for the day directly from the already calculated values
      const dailyTotals = entries.reduce((acc, entry) => {
        return {
          ...acc,
          calories: (acc.calories || 0) + (entry.calories || 0),
          protein: (acc.protein || 0) + (entry.protein || 0),
          carbs: (acc.carbs || 0) + (entry.carbs || 0),
          fat: (acc.fat || 0) + (entry.fat || 0),
          saturated_fat: (acc.saturated_fat || 0) + (entry.saturated_fat || 0),
          polyunsaturated_fat: (acc.polyunsaturated_fat || 0) + (entry.polyunsaturated_fat || 0),
          monounsaturated_fat: (acc.monounsaturated_fat || 0) + (entry.monounsaturated_fat || 0),
          trans_fat: (acc.trans_fat || 0) + (entry.trans_fat || 0),
          cholesterol: (acc.cholesterol || 0) + (entry.cholesterol || 0),
          sodium: (acc.sodium || 0) + (entry.sodium || 0),
          potassium: (acc.potassium || 0) + (entry.potassium || 0),
          dietary_fiber: (acc.dietary_fiber || 0) + (entry.dietary_fiber || 0),
          sugars: (acc.sugars || 0) + (entry.sugars || 0),
          vitamin_a: (acc.vitamin_a || 0) + (entry.vitamin_a || 0),
          vitamin_c: (acc.vitamin_c || 0) + (entry.vitamin_c || 0),
          calcium: (acc.calcium || 0) + (entry.calcium || 0),
          iron: (acc.iron || 0) + (entry.iron || 0),
          glycemic_index: 'None', // GI is not aggregated in daily totals
        };
      }, {
        calories: 0, protein: 0, carbs: 0, fat: 0, saturated_fat: 0,
        polyunsaturated_fat: 0, monounsaturated_fat: 0, trans_fat: 0,
        cholesterol: 0, sodium: 0, potassium: 0, dietary_fiber: 0,
        sugars: 0, vitamin_a: 0, vitamin_c: 0, calcium: 0, iron: 0,
        glycemic_index: 'None'
      } as Partial<DailyFoodEntry>); // Use Partial to allow for initial empty state

      foodDataWithTotals.push({
        entry_date: date,
        meal_type: 'Total',
        quantity: 0,
        unit: '',
        isTotal: true,
        food_name: 'Total',
        calories: dailyTotals.calories,
        protein: dailyTotals.protein,
        carbs: dailyTotals.carbs,
        fat: dailyTotals.fat,
        saturated_fat: dailyTotals.saturated_fat,
        polyunsaturated_fat: dailyTotals.polyunsaturated_fat,
        monounsaturated_fat: dailyTotals.monounsaturated_fat,
        trans_fat: dailyTotals.trans_fat,
        cholesterol: dailyTotals.cholesterol,
        sodium: dailyTotals.sodium,
        potassium: dailyTotals.potassium,
        dietary_fiber: dailyTotals.dietary_fiber,
        sugars: dailyTotals.sugars,
        vitamin_a: dailyTotals.vitamin_a,
        vitamin_c: dailyTotals.vitamin_c,
        calcium: dailyTotals.calcium,
        iron: dailyTotals.iron,
        glycemic_index: 'None',
        serving_size: 100 // Default value, not used for totals
      });
    });
  debug(loggingLevel, `ReportsTables: Generated ${foodDataWithTotals.length} rows for food diary table.`);

  // Sort exercise entries by date descending
  debug(loggingLevel, 'ReportsTables: Sorting exercise entries.');
  const sortedExerciseEntries = [...(exerciseEntries || [])].sort((a, b) =>
    new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
  );

  const filteredExerciseEntries = useMemo(() => {
    let sortableItems = [...sortedExerciseEntries];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems.filter(entry => {
      const entryDate = parseISO(entry.entry_date);
      if (exerciseNameFilter && !entry.exercises.name.toLowerCase().includes(exerciseNameFilter.toLowerCase())) return false;
      if (setTypeFilter && !entry.sets.some(set => set.set_type.toLowerCase().includes(setTypeFilter.toLowerCase()))) return false;

      return true;
    });
  }, [sortedExerciseEntries, exerciseNameFilter, setTypeFilter, sortConfig]);

  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Sort measurement data by date descending
  debug(loggingLevel, 'ReportsTables: Sorting measurement data.');
  const sortedMeasurementData = [...measurementData]
    .filter(measurement =>
      measurement.weight !== undefined ||
      measurement.neck !== undefined ||
      measurement.waist !== undefined ||
      measurement.hips !== undefined ||
      measurement.steps !== undefined
    )
    .sort((a, b) =>
      new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    );

  return (
    <div className="space-y-6">
      {/* Food Diary Table with Export Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('reportsTables.foodDiaryTable', 'Food Diary Table')}</CardTitle>
            <Button
              onClick={onExportFoodDiary}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reportsTables.date', 'Date')}</TableHead>
                  <TableHead>{t('reportsTables.meal', 'Meal')}</TableHead>
                  <TableHead className="min-w-[250px]">{t('reportsTables.food', 'Food')}</TableHead>
                  <TableHead>{t('reportsTables.quantity', 'Quantity')}</TableHead>
                  {visibleNutrients.map(nutrient => {
                    // Create a human-friendly label and only show unit when available
                    const rawLabel = nutrient.replace(/_/g, ' ');
                    const toTitleCase = (s: string) => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    const label = nutrient === 'glycemic_index' ? t('reports.foodDiaryExportHeaders.glycemicIndex', 'Glycemic Index') : toTitleCase(rawLabel);
                    const unit = nutrient === 'calories' ? getEnergyUnitString(energyUnit) : getNutrientUnit(nutrient);
                    return <TableHead key={nutrient}>{label}{unit ? ` (${unit})` : ''}</TableHead>;
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {foodDataWithTotals.map((entry, index) => {
                  return (
                    <TableRow key={index} className={entry.isTotal ? "bg-gray-50 dark:bg-gray-900 font-semibold border-t-2" : ""}>
                      <TableCell>{formatDateInUserTimezone(parseISO(entry.entry_date), dateFormat)}</TableCell>
                      <TableCell className="capitalize">{entry.meal_type}</TableCell>
                      <TableCell className="min-w-[250px]">
                        {!entry.isTotal && (
                          <div>
                            <div className="font-medium">{entry.food_name || entry.foods?.name}</div>
                            {(entry.brand_name || entry.foods?.brand) && <div className="text-sm text-gray-500">{entry.brand_name || entry.foods?.brand}</div>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{entry.isTotal ? '' : `${entry.quantity} ${entry.unit}`}</TableCell>
                      {visibleNutrients.map(nutrient => {
                        // Special-case glycemic_index because it's a categorical value (string), not numeric
                        if (nutrient === 'glycemic_index') {
                          const giValue = entry.isTotal ? '' : (entry.glycemic_index || entry.foods?.glycemic_index || 'None');
                          return <TableCell key={nutrient}>{giValue}</TableCell>;
                        }

                        // Directly use the pre-calculated nutrient value from the entry
                        const value = (entry[nutrient as keyof DailyFoodEntry] as number) || 0;
                        return <TableCell key={nutrient}>{nutrient === 'calories' ? Math.round(convertEnergy(value, 'kcal', energyUnit)) : formatNutrientValue(value, nutrient)}</TableCell>
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Exercise Entries Table with Export Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('reportsTables.exerciseEntriesTable', 'Exercise Entries Table')}</CardTitle>
            <Button
              onClick={onExportExerciseEntries}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center space-x-2 mt-4">
            <Input
              placeholder={t('reportsTables.filterByExerciseName', 'Filter by exercise name...')}
              value={exerciseNameFilter}
              onChange={(e) => setExerciseNameFilter(e.target.value)}
              className="max-w-sm"
            />
            <Input
              placeholder={t('reportsTables.filterBySetType', 'Filter by set type...')}
              value={setTypeFilter}
              onChange={(e) => setSetTypeFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead onClick={() => requestSort('entry_date')}>{t('reportsTables.date', 'Date')}</TableHead>
                  <TableHead onClick={() => requestSort('exercise_name')}>{t('reportsTables.exercise', 'Exercise')}</TableHead>
                  <TableHead onClick={() => requestSort('set_number')}>{t('reportsTables.set', 'Set')}</TableHead>
                  <TableHead onClick={() => requestSort('set_type')}>{t('reportsTables.type', 'Type')}</TableHead>
                  <TableHead onClick={() => requestSort('reps')}>{t('reportsTables.reps', 'Reps')}</TableHead>
                  <TableHead onClick={() => requestSort('weight')}>{t('reportsTables.weight', 'Weight')} ({weightUnit})</TableHead>
                  <TableHead>{t('reportsTables.tonnage', 'Tonnage')}</TableHead>
                  <TableHead onClick={() => requestSort('duration')}>{t('reportsTables.durationMin', 'Duration (min)')}</TableHead>
                  <TableHead onClick={() => requestSort('rest_time')}>{t('reportsTables.restS', 'Rest (s)')}</TableHead>
                  <TableHead>{t('reportsTables.notes', 'Notes')}</TableHead>
                  <TableHead onClick={() => requestSort('calories_burned')}>{t('reportsTables.caloriesBurned', `Calories Burned (${getEnergyUnitString(energyUnit)})`)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExerciseEntries.map((entry) => {
                  const isPr = prData && prData[entry.exercises.id] && prData[entry.exercises.id].date === entry.entry_date;
                  const isExpanded = expandedRows[entry.id];

                  return (
                    <React.Fragment key={entry.id}>
                      <TableRow className={isPr ? "bg-yellow-100 dark:bg-yellow-900" : ""}>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setExpandedRows(prev => ({ ...prev, [entry.id]: !prev[entry.id] }))}>
                            {isExpanded ? '▼' : '▶'}
                          </Button>
                          {formatDateInUserTimezone(parseISO(entry.entry_date), dateFormat)}
                        </TableCell>
                        <TableCell>{entry.exercises.name}</TableCell>
                        <TableCell>{entry.sets.length}</TableCell>
                        <TableCell></TableCell>
                        <TableCell>
                          {Math.min(...entry.sets.map(s => s.reps))} - {Math.max(...entry.sets.map(s => s.reps))}
                        </TableCell>
                        <TableCell>
                          {entry.sets.length > 0 ? convertWeight(entry.sets.reduce((acc, s) => acc + Number(s.weight), 0) / entry.sets.length, 'kg', weightUnit).toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell>
                          {entry.sets.length > 0 ? convertWeight(entry.sets.reduce((acc, s) => acc + (Number(s.weight) * Number(s.reps)), 0), 'kg', weightUnit).toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell>
                          {entry.sets.reduce((acc, s) => acc + (s.duration || 0), 0)}
                        </TableCell>
                        <TableCell>
                          {entry.sets.reduce((acc, s) => acc + (s.rest_time || 0), 0)}
                        </TableCell>
                        <TableCell>{entry.notes || ''}</TableCell>
                        <TableCell>{Math.round(convertEnergy(entry.calories_burned, 'kcal', energyUnit))}</TableCell>
                      </TableRow>
                      {isExpanded && entry.sets.map((set, setIndex) => (
                        <TableRow key={`${entry.id}-set-${set.id || setIndex}`} className="bg-gray-50 dark:bg-gray-800">
                          <TableCell></TableCell>
                          <TableCell></TableCell>
                          <TableCell>{set.set_number}</TableCell>
                          <TableCell>{set.set_type}</TableCell>
                          <TableCell>{set.reps}</TableCell>
                          <TableCell>{convertWeight(set.weight, 'kg', weightUnit).toFixed(2)}</TableCell>
                          <TableCell>{convertWeight(Number(set.weight) * Number(set.reps), 'kg', weightUnit).toFixed(2)}</TableCell>
                          <TableCell>{set.duration || '-'}</TableCell>
                          <TableCell>{set.rest_time || '-'}</TableCell>
                          <TableCell colSpan={2}>{set.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Body Measurements Table with Export Button */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('reportsTables.bodyMeasurementsTable', 'Body Measurements Table')}</CardTitle>
            <Button
              onClick={onExportBodyMeasurements}
              variant="outline"
              size="sm"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reportsTables.date', 'Date')}</TableHead>
                  <TableHead>{t('reportsTables.weight', 'Weight')} ({showWeightInKg ? 'kg' : 'lbs'})</TableHead>
                  <TableHead>{t('reportsTables.neck', 'Neck')} ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>{t('reportsTables.waist', 'Waist')} ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>{t('reportsTables.hips', 'Hips')} ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>{t('reportsTables.steps', 'Steps')}</TableHead>
                  <TableHead>{t('reportsTables.height', 'Height')} ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>{t('reportsTables.bodyFatPercentage', 'Body Fat %')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMeasurementData.map((measurement, index) => (
                  <TableRow key={index}>
                    <TableCell>{formatDateInUserTimezone(parseISO(measurement.entry_date), dateFormat)}</TableCell>
                    <TableCell>{measurement.weight ? measurement.weight.toFixed(1) : '-'}</TableCell>
                    <TableCell>{measurement.neck ? measurement.neck.toFixed(1) : '-'}</TableCell>
                    <TableCell>{measurement.waist ? measurement.waist.toFixed(1) : '-'}</TableCell>
                    <TableCell>{measurement.hips ? measurement.hips.toFixed(1) : '-'}</TableCell>
                    <TableCell>{measurement.steps || '-'}</TableCell>
                    <TableCell>{measurement.height ? measurement.height.toFixed(1) : '-'}</TableCell>
                    <TableCell>{measurement.body_fat_percentage ? measurement.body_fat_percentage.toFixed(1) : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Custom Measurements Tables */}
      {customCategories.map((category) => {
        const data = customMeasurementsData[category.id] || [];
        // Sort by timestamp descending (latest first)
        debug(loggingLevel, `ReportsTables: Sorting custom measurement data for category: ${category.name}.`);
        const sortedData = [...data].sort((a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        return (
          <Card key={category.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{category.display_name || category.name} ({category.measurement_type})</CardTitle>
                <Button
                  onClick={() => onExportCustomMeasurements(category)}
                  variant="outline"
                  size="sm"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('reportsTables.date', 'Date')}</TableHead>
                      <TableHead>{t('reports.customMeasurementsExportHeaders.time', 'Time')}</TableHead>
                      <TableHead>{t('reports.customMeasurementsExportHeaders.value', 'Value')} ({category.measurement_type})</TableHead>
                      <TableHead>{t('reportsTables.notes', 'Notes')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((measurement, index) => {
                      // Extract hour from timestamp
                      const timestamp = parseISO(measurement.timestamp);
                      const hour = timestamp.getHours();
                      const minutes = timestamp.getMinutes();
                      const formattedHour = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

                      return (
                        <TableRow key={index}>
                          <TableCell>{measurement.entry_date && !isNaN(parseISO(measurement.entry_date).getTime()) ? formatDateInUserTimezone(parseISO(measurement.entry_date), dateFormat) : ''}</TableCell>
                          <TableCell>{formattedHour}</TableCell>
                          <TableCell>{typeof measurement.value === 'number' ? measurement.value.toFixed(2) : String(measurement.value)}</TableCell>
                          <TableCell>{measurement.notes || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default ReportsTables;
