import React, { useState, useMemo } from "react";
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
  foods: { // Keep for backward compatibility or nested scenarios
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
  // Add snapshotted fields
  food_name?: string;
  brand_name?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  serving_size?: number;
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
  const { loggingLevel, dateFormat, formatDateInUserTimezone, nutrientDisplayPreferences, weightUnit, convertWeight } = usePreferences();
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

  const calculateFoodDayTotal = (entries: DailyFoodEntry[]) => {
    return entries.reduce((total, entry) => {
      const source = entry.calories ? entry : entry.foods;
      const multiplier = entry.quantity / (source.serving_size || 100);
      
      return {
        calories: total.calories + (source.calories || 0) * multiplier,
        protein: total.protein + (source.protein || 0) * multiplier,
        carbs: total.carbs + (source.carbs || 0) * multiplier,
        fat: total.fat + (source.fat || 0) * multiplier,
        saturated_fat: total.saturated_fat + (source.saturated_fat || 0) * multiplier,
        polyunsaturated_fat: total.polyunsaturated_fat + (source.polyunsaturated_fat || 0) * multiplier,
        monounsaturated_fat: total.monounsaturated_fat + (source.monounsaturated_fat || 0) * multiplier,
        trans_fat: total.trans_fat + (source.trans_fat || 0) * multiplier,
        cholesterol: total.cholesterol + (source.cholesterol || 0) * multiplier,
        sodium: total.sodium + (source.sodium || 0) * multiplier,
        potassium: total.potassium + (source.potassium || 0) * multiplier,
        dietary_fiber: total.dietary_fiber + (source.dietary_fiber || 0) * multiplier,
        sugars: total.sugars + (source.sugars || 0) * multiplier,
        vitamin_a: total.vitamin_a + (source.vitamin_a || 0) * multiplier,
        vitamin_c: total.vitamin_c + (source.vitamin_c || 0) * multiplier,
        calcium: total.calcium + (source.calcium || 0) * multiplier,
        iron: total.iron + (source.iron || 0) * multiplier,
        glycemic_index: 'None' // GI is not aggregated
      };
    }, {
      calories: 0, protein: 0, carbs: 0, fat: 0, saturated_fat: 0,
      polyunsaturated_fat: 0, monounsaturated_fat: 0, trans_fat: 0,
      cholesterol: 0, sodium: 0, potassium: 0, dietary_fiber: 0,
      sugars: 0, vitamin_a: 0, vitamin_c: 0, calcium: 0, iron: 0,
      glycemic_index: 'None'
    });
  };

  // Create flattened data with totals for rendering
  debug(loggingLevel, 'ReportsTables: Creating flattened food data with totals.');
  const foodDataWithTotals: (DailyFoodEntry & { isTotal?: boolean })[] = [];
  Object.keys(groupedFoodData)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    .forEach(date => {
      const entries = groupedFoodData[date];
      foodDataWithTotals.push(...entries);
      
      // Add total row
      const totals = calculateFoodDayTotal(entries);
      foodDataWithTotals.push({
        entry_date: date,
        meal_type: 'Total',
        quantity: 0,
        unit: '',
        isTotal: true,
        foods: {
          name: '',
          calories: totals.calories,
          protein: totals.protein,
          carbs: totals.carbs,
          fat: totals.fat,
          saturated_fat: totals.saturated_fat,
          polyunsaturated_fat: totals.polyunsaturated_fat,
          monounsaturated_fat: totals.monounsaturated_fat,
          trans_fat: totals.trans_fat,
          cholesterol: totals.cholesterol,
          sodium: totals.sodium,
          potassium: totals.potassium,
          dietary_fiber: totals.dietary_fiber,
          sugars: totals.sugars,
          vitamin_a: totals.vitamin_a,
          vitamin_c: totals.vitamin_c,
          calcium: totals.calcium,
          iron: totals.iron,
          glycemic_index: 'None',
          serving_size: 100
        },
        food_name: 'Total'
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
            <CardTitle>Food Diary Table</CardTitle>
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
                  <TableHead>Date</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead className="min-w-[250px]">Food</TableHead>
                  <TableHead>Quantity</TableHead>
                  {visibleNutrients.map(nutrient => {
                    // Create a human-friendly label and only show unit when available
                    const rawLabel = nutrient.replace(/_/g, ' ');
                    const toTitleCase = (s: string) => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    const label = nutrient === 'glycemic_index' ? 'Glycemic Index' : toTitleCase(rawLabel);
                    const unit = getNutrientUnit(nutrient);
                    return <TableHead key={nutrient}>{label}{unit ? ` (${unit})` : ''}</TableHead>;
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {foodDataWithTotals.map((entry, index) => {
                  const source = entry.calories ? entry : entry.foods;
                  const multiplier = entry.isTotal ? 1 : entry.quantity / (source.serving_size || 100);

                  return (
                    <TableRow key={index} className={entry.isTotal ? "bg-gray-50 dark:bg-gray-900 font-semibold border-t-2" : ""}>
                      <TableCell>{formatDateInUserTimezone(parseISO(entry.entry_date), dateFormat)}</TableCell>
                      <TableCell className="capitalize">{entry.meal_type}</TableCell>
                      <TableCell className="min-w-[250px]">
                        {!entry.isTotal && (
                          <div>
                            <div className="font-medium">{entry.food_name || entry.foods.name}</div>
                            {(entry.brand_name || entry.foods.brand) && <div className="text-sm text-gray-500">{entry.brand_name || entry.foods.brand}</div>}
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

                        const value = (source[nutrient as keyof typeof source] as number || 0) * multiplier;
                        return <TableCell key={nutrient}>{formatNutrientValue(value, nutrient)}</TableCell>
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
            <CardTitle>Exercise Entries Table</CardTitle>
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
              placeholder="Filter by exercise name..."
              value={exerciseNameFilter}
              onChange={(e) => setExerciseNameFilter(e.target.value)}
              className="max-w-sm"
            />
            <Input
              placeholder="Filter by set type..."
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
                  <TableHead onClick={() => requestSort('entry_date')}>Date</TableHead>
                  <TableHead onClick={() => requestSort('exercise_name')}>Exercise</TableHead>
                  <TableHead onClick={() => requestSort('set_number')}>Set</TableHead>
                  <TableHead onClick={() => requestSort('set_type')}>Type</TableHead>
                  <TableHead onClick={() => requestSort('reps')}>Reps</TableHead>
                  <TableHead onClick={() => requestSort('weight')}>Weight ({weightUnit})</TableHead>
                  <TableHead>Tonnage</TableHead>
                  <TableHead onClick={() => requestSort('duration')}>Duration (min)</TableHead>
                  <TableHead onClick={() => requestSort('rest_time')}>Rest (s)</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead onClick={() => requestSort('calories_burned')}>Calories Burned</TableHead>
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
                        <TableCell>{Math.round(entry.calories_burned)}</TableCell>
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
            <CardTitle>Body Measurements Table</CardTitle>
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
                  <TableHead>Date</TableHead>
                  <TableHead>Weight ({showWeightInKg ? 'kg' : 'lbs'})</TableHead>
                  <TableHead>Neck ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>Waist ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>Hips ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>Steps</TableHead>
                  <TableHead>Height ({showMeasurementsInCm ? 'cm' : 'inches'})</TableHead>
                  <TableHead>Body Fat %</TableHead>
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
                <CardTitle>{category.name} ({category.measurement_type})</CardTitle>
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
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Value ({category.measurement_type})</TableHead>
                      <TableHead>Notes</TableHead>
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
