import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO, addDays } from "date-fns"; // Import parseISO and addDays
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import DiaryTopControls from "./DiaryTopControls";
import MealCard from "./MealCard";
import ExerciseCard from "./ExerciseCard";
import EditFoodEntryDialog from "./EditFoodEntryDialog";
import EnhancedCustomFoodForm from "./EnhancedCustomFoodForm";
import FoodUnitSelector from "./FoodUnitSelector";
import CopyFoodEntryDialog from "./CopyFoodEntryDialog"; // Import the new dialog component
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import { calculateFoodEntryNutrition } from '@/utils/nutritionCalculations'; // Import the new utility function
import { toast } from "@/hooks/use-toast"; // Import toast
import {
  loadFoodEntries,
  loadGoals,
  addFoodEntry,
  removeFoodEntry,
  copyFoodEntries, // Import the new copy function
  copyFoodEntriesFromYesterday, // Import the new copy from yesterday function
} from '@/services/foodDiaryService';
import { Food, FoodVariant } from '@/types/food';
import { FoodEntry } from '@/types/food.d';
import { ExpandedGoals } from '@/types/goals';


import { Meal as MealType } from '@/types/meal'; // Import MealType from types/meal.d.ts

interface Meal {
  name: string;
  type: string;
  entries: FoodEntry[];
  targetCalories?: number;
  selectedDate?: string; // Add selectedDate as it's passed to MealCard
}

interface MealTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
}

interface FoodDiaryProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  refreshTrigger: number; // New prop for external refresh trigger
}

const FoodDiary = ({ selectedDate, onDateChange, refreshTrigger: externalRefreshTrigger }: FoodDiaryProps) => {
  const { activeUserId } = useActiveUser();
  const { formatDate, formatDateInUserTimezone, parseDateInUserTimezone, loggingLevel } = usePreferences();
  debug(loggingLevel, "FoodDiary component rendered for date:", selectedDate);
  const [date, setDate] = useState<Date>(new Date(selectedDate));
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [goals, setGoals] = useState<ExpandedGoals | null>(null);
  const [dayTotals, setDayTotals] = useState<MealTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 });
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>("");
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false); // State for copy dialog
  const [copySourceMealType, setCopySourceMealType] = useState<string>(""); // State to hold the meal type from which copy was initiated

  const currentUserId = activeUserId;
  debug(loggingLevel, "Current user ID:", currentUserId);

  useEffect(() => {
    debug(loggingLevel, "selectedDate useEffect triggered:", selectedDate);
    // Use parseDateInUserTimezone to correctly interpret the selectedDate string
    // based on the user's timezone, ensuring the date object reflects the intended calendar day.
    setDate(parseDateInUserTimezone(selectedDate));
  }, [selectedDate, parseDateInUserTimezone]); // Add parseDateInUserTimezone to dependency array

  const _calculateDayTotals = useCallback((entries: FoodEntry[]) => {
    debug(loggingLevel, "Calculating day totals for entries:", entries);
    const totals = entries.reduce((acc, entry) => {
      const entryNutrition = calculateFoodEntryNutrition(entry);
      acc.calories += entryNutrition.calories;
      acc.protein += entryNutrition.protein;
      acc.carbs += entryNutrition.carbs;
      acc.fat += entryNutrition.fat;
      acc.dietary_fiber += entryNutrition.dietary_fiber || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 });

    info(loggingLevel, "Day totals calculated:", totals);
    setDayTotals(totals);
  }, [loggingLevel]); // Dependencies for _calculateDayTotals

  const _loadFoodEntries = useCallback(async () => {
    debug(loggingLevel, "Loading food entries for date:", selectedDate);
    debug(loggingLevel, `Querying food_entries for user: ${currentUserId} and entry_date: ${selectedDate}`); // Added debug log
    try {
      const data = await loadFoodEntries(currentUserId, selectedDate); // Use imported loadFoodEntries
      info(loggingLevel, "Food entries loaded successfully:", data);
      setFoodEntries(data || []);
      _calculateDayTotals(data || []);
    } catch (err) {
      error(loggingLevel, "Error loading food entries:", err);
    }
  }, [currentUserId, selectedDate, loggingLevel, _calculateDayTotals]); // Dependencies for _loadFoodEntries

  const _loadGoals = useCallback(async () => {
    debug(loggingLevel, "Loading goals for date:", selectedDate);
    try {
      const goalData = await loadGoals(currentUserId, selectedDate); // Use imported loadGoals
      info(loggingLevel, 'Goals loaded successfully:', goalData);
      setGoals(goalData);
    } catch (err) {
      error(loggingLevel, 'Error loading goals:', err);
    }
  }, [currentUserId, selectedDate, loggingLevel]); // Dependencies for _loadGoals

  useEffect(() => {
    debug(loggingLevel, "currentUserId, selectedDate, externalRefreshTrigger useEffect triggered.", { currentUserId, selectedDate, externalRefreshTrigger });
    if (currentUserId) {
      _loadFoodEntries();
      _loadGoals();
    }
  }, [currentUserId, selectedDate, externalRefreshTrigger, _loadFoodEntries, _loadGoals]);

  const getEntryNutrition = useCallback((entry: FoodEntry): MealTotals => {
    debug(loggingLevel, "Calculating entry nutrition for entry:", entry);
    const nutrition = calculateFoodEntryNutrition(entry);
    debug(loggingLevel, "Calculated nutrition for entry:", nutrition);
    return nutrition;
  }, [loggingLevel]);

  const getMealData = useCallback((mealType: string): Meal => {
    debug(loggingLevel, "Getting meal data for meal type:", mealType);
    const mealNames = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
      snacks: "Snacks"
    };

    const entries = foodEntries.filter(entry => entry.meal_type === mealType);
    debug(loggingLevel, `Found ${entries.length} entries for meal type ${mealType}.`);

    return {
      name: mealNames[mealType as keyof typeof mealNames] || mealType,
      type: mealType,
      entries: entries,
      targetCalories: goals ? (goals.calories * (goals[`${mealType}_percentage`] || 0)) / 100 : 0
    };
  }, [foodEntries, goals, loggingLevel]);

  const handleDataChange = useCallback(() => {
    debug(loggingLevel, "Handling data change, triggering refresh.");
    _loadFoodEntries();
    _loadGoals();
    info(loggingLevel, "Dispatching foodDiaryRefresh event.");
    window.dispatchEvent(new CustomEvent('foodDiaryRefresh'));
  }, [debug, loggingLevel, _loadFoodEntries, _loadGoals, info]);

  const handleCopyClick = useCallback((mealType: string) => {
    setCopySourceMealType(mealType);
    setIsCopyDialogOpen(true);
    debug(loggingLevel, "Opening copy dialog for meal type:", mealType);
  }, [debug, loggingLevel]);

  const handleCopyFoodEntries = useCallback(async (targetDate: string, targetMealType: string) => {
    debug(loggingLevel, "Attempting to copy food entries.", { selectedDate, copySourceMealType, targetDate, targetMealType });
    try {
      await copyFoodEntries(selectedDate, copySourceMealType, targetDate, targetMealType);
      info(loggingLevel, "Food entries copied successfully.");
      toast({
        title: "Success",
        description: "Food entries copied successfully",
      });
      handleDataChange(); // Refresh data after copy
    } catch (err) {
      error(loggingLevel, "Error copying food entries:", err);
      toast({
        title: "Error",
        description: "Failed to copy food entries.",
        variant: "destructive",
      });
    } finally {
      setIsCopyDialogOpen(false);
    }
  }, [selectedDate, copySourceMealType, handleDataChange, info, loggingLevel, toast, error]);

  const handleCopyFromYesterday = useCallback(async (mealType: string) => {
    debug(loggingLevel, "Attempting to copy food entries from yesterday.", { selectedDate, mealType });
    try {
      await copyFoodEntriesFromYesterday(mealType, selectedDate);
      info(loggingLevel, "Food entries copied from yesterday successfully.");
      toast({
        title: "Success",
        description: "Food entries copied from yesterday successfully",
      });
      handleDataChange(); // Refresh data after copy
    } catch (err) {
      error(loggingLevel, "Error copying food entries from yesterday:", err);
      toast({
        title: "Error",
        description: "Failed to copy food entries from yesterday.",
        variant: "destructive",
      });
    }
  }, [selectedDate, handleDataChange, info, loggingLevel, toast, error]);

  const getMealTotals = useCallback((mealType: string): MealTotals => {
    debug(loggingLevel, "Calculating meal totals for meal type:", mealType);
    const entries = foodEntries.filter(entry => entry.meal_type === mealType);
    const totals = entries.reduce((acc, entry) => {
      const entryNutrition = getEntryNutrition(entry);
      acc.calories += entryNutrition.calories;
      acc.protein += entryNutrition.protein;
      acc.carbs += entryNutrition.carbs;
      acc.fat += entryNutrition.fat;
      acc.dietary_fiber += entryNutrition.dietary_fiber;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, dietary_fiber: 0 });
    debug(loggingLevel, `Calculated totals for ${mealType}:`, totals);
    return totals;
  }, [foodEntries, getEntryNutrition, loggingLevel]);

  const handleDateSelect = useCallback((newDate: Date | undefined) => {
    debug(loggingLevel, "Handling date select:", newDate);
    if (newDate) {
      setDate(newDate);
      const dateString = formatDateInUserTimezone(newDate, 'yyyy-MM-dd'); // Use formatDateInUserTimezone
      info(loggingLevel, "Date selected:", dateString);
      onDateChange(dateString);
    }
  }, [debug, loggingLevel, setDate, formatDateInUserTimezone, info, onDateChange]);

  const handlePreviousDay = useCallback(() => {
    debug(loggingLevel, "Handling previous day button click.");
    const previousDay = new Date(date);
    previousDay.setDate(previousDay.getDate() - 1);
    handleDateSelect(previousDay);
  }, [debug, loggingLevel, date, handleDateSelect]);

  const handleNextDay = useCallback(() => {
    debug(loggingLevel, "Handling next day button click.");
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    handleDateSelect(nextDay);
  }, [debug, loggingLevel, date, handleDateSelect]);

  const handleFoodSelect = useCallback((food: Food, mealType: string) => {
    debug(loggingLevel, "Handling food select:", { food, mealType });
    setSelectedFood(food);
    setSelectedMealType(mealType);
    setIsUnitSelectorOpen(true);
  }, [debug, loggingLevel, setSelectedFood, setSelectedMealType, setIsUnitSelectorOpen]);

  const handleFoodUnitSelect = useCallback(async (food: Food, quantity: number, unit: string, selectedVariant: FoodVariant) => {
    debug(loggingLevel, "Handling food unit select:", { food, quantity, unit, selectedVariant });
    try {
      await addFoodEntry({
        user_id: currentUserId,
        food_id: food.id,
        meal_type: selectedMealType,
        quantity: quantity,
        unit: unit,
        variant_id: selectedVariant.id, // Use selectedVariant.id
        entry_date: formatDateInUserTimezone(parseDateInUserTimezone(selectedDate), 'yyyy-MM-dd'),
      });
      info(loggingLevel, "Food entry added successfully.");
      toast({
        title: "Success",
        description: "Food entry added successfully",
      });
      handleDataChange();
    } catch (err) {
      error(loggingLevel, "Error adding food entry:", err);
    }
  }, [debug, loggingLevel, addFoodEntry, currentUserId, selectedMealType, formatDateInUserTimezone, parseDateInUserTimezone, selectedDate, info, toast, handleDataChange, error]);

  const handleRemoveEntry = useCallback(async (entryId: string) => {
    debug(loggingLevel, "Handling remove entry:", entryId);
    try {
      await removeFoodEntry(entryId);
      info(loggingLevel, "Food entry removed successfully.");
      toast({
        title: "Success",
        description: "Food entry removed successfully",
      });
      handleDataChange();
    } catch (err) {
      error(loggingLevel, "Error removing food entry:", err);
    }
  }, [debug, loggingLevel, removeFoodEntry, info, toast, handleDataChange, error]);

  const handleEditEntry = useCallback((entry: FoodEntry) => {
    debug(loggingLevel, "Handling edit food entry:", entry);
    setEditingEntry(entry);
  }, [debug, loggingLevel, setEditingEntry]);

  const handleEditFood = useCallback((food: Food) => {
    debug(loggingLevel, "Handling edit food, triggering data change for food:", food);
    // This function is called when a food item's details are edited from within MealCard.
    // It triggers a data refresh for the entire diary.
    handleDataChange();
  }, [debug, loggingLevel, handleDataChange]);



  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Food Diary</span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePreviousDay}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? formatDate(date) : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNextDay}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Top Controls Section */}
      {goals && (
        <>
          <DiaryTopControls
            selectedDate={selectedDate}
            onDateChange={onDateChange}
            dayTotals={dayTotals}
            goals={goals}
            onGoalsUpdated={handleDataChange}
            refreshTrigger={externalRefreshTrigger}
          />

          {/* Main Content - Meals and Exercise */}
          <div className="space-y-6">
            <MealCard
              meal={{ ...getMealData("breakfast"), selectedDate: selectedDate }}
              totals={getMealTotals("breakfast")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={handleRemoveEntry}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick} // Pass the new handler
              onCopyFromYesterday={handleCopyFromYesterday} // Pass the new handler
              key={`breakfast-${externalRefreshTrigger}`}
            />
            <MealCard
              meal={{ ...getMealData("lunch"), selectedDate: selectedDate }}
              totals={getMealTotals("lunch")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={handleRemoveEntry}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick} // Pass the new handler
              onCopyFromYesterday={handleCopyFromYesterday} // Pass the new handler
              key={`lunch-${externalRefreshTrigger}`}
            />
            <MealCard
              meal={{ ...getMealData("dinner"), selectedDate: selectedDate }}
              totals={getMealTotals("dinner")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={handleRemoveEntry}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick} // Pass the new handler
              onCopyFromYesterday={handleCopyFromYesterday} // Pass the new handler
              key={`dinner-${externalRefreshTrigger}`}
            />
            <MealCard
              meal={{ ...getMealData("snacks"), selectedDate: selectedDate }}
              totals={getMealTotals("snacks")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={handleRemoveEntry}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick} // Pass the new handler
              onCopyFromYesterday={handleCopyFromYesterday} // Pass the new handler
              key={`snacks-${externalRefreshTrigger}`}
            />

            {/* Exercise Section */}
            <ExerciseCard
              selectedDate={selectedDate}
              onExerciseChange={handleDataChange}
              key={`exercise-${externalRefreshTrigger}`}
            />
          </div>
        </>
      )}

      {/* Food Unit Selector Dialog */}
      {selectedFood && (
        <FoodUnitSelector
          food={selectedFood}
          open={isUnitSelectorOpen}
          onOpenChange={setIsUnitSelectorOpen}
          onSelect={handleFoodUnitSelect}
          showUnitSelector={true}
        />
      )}

      {/* Edit Food Entry Dialog */}
      {editingEntry && (
        <EditFoodEntryDialog
          entry={editingEntry}
          open={true}
          onOpenChange={(open) => !open && setEditingEntry(null)}
          onSave={handleDataChange}
        />
      )}

      {/* Copy Food Entry Dialog */}
      {isCopyDialogOpen && (
        <CopyFoodEntryDialog
          isOpen={isCopyDialogOpen}
          onClose={() => setIsCopyDialogOpen(false)}
          onCopy={handleCopyFoodEntries}
          sourceMealType={copySourceMealType}
        />
      )}
    </div>
  );
};

export default FoodDiary;
