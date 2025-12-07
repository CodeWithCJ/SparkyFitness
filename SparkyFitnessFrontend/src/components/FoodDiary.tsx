import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, parseISO, addDays } from "date-fns";
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
import CopyFoodEntryDialog from "./CopyFoodEntryDialog";
import ConvertToMealDialog from "./ConvertToMealDialog";
import ExerciseSearch from "./ExerciseSearch";
import EditMealFoodEntryDialog from "./EditMealFoodEntryDialog";
import LogMealDialog from "./LogMealDialog";
import { debug, info, warn, error } from "@/utils/logging";
import { calculateFoodEntryNutrition } from "@/utils/nutritionCalculations";
import { toast } from "@/hooks/use-toast";
import {
  loadFoodEntries,
  loadGoals,
  createFoodEntry, // Replaced addFoodEntry
  removeFoodEntry,
  copyFoodEntries,
  copyFoodEntriesFromYesterday,
  getFoodEntryMealsByDate, // New import
  deleteFoodEntryMeal, // New import
  getFoodEntryMealWithComponents, // Import the new function
  createFoodEntryMeal, // Add this import
} from "@/services/foodEntryService"; // ALL food related services now from foodEntryService
import { Food, FoodVariant, GlycemicIndex } from "@/types/food";
import { Meal as MealType, FoodEntryMeal } from "@/types/meal"; // Added FoodEntryMeal
import { FoodEntry } from "@/types/food";
import { ExpandedGoals } from "@/types/goals";
import { Exercise } from "@/services/exerciseSearchService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PresetExercise, WorkoutPreset } from "@/types/workout";
import AddExerciseDialog from "./AddExerciseDialog";
import AddWorkoutPresetDialog from "./AddWorkoutPresetDialog";


interface MealTotals {
  calories: number; // Stored internally as kcal
  protein: number;
  carbs: number;
  fat: number;
  dietary_fiber: number;
  sugars: number;
  sodium: number;
  cholesterol: number;
  saturated_fat: number;
  trans_fat: number;
  potassium: number;
  vitamin_a: number;
  vitamin_c: number;
  iron: number;
  calcium: number;
}

interface FoodDiaryProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  refreshTrigger: number;
  initialExercisesToLog?: PresetExercise[];
  onExercisesLogged: () => void;
}

const FoodDiary = ({
  selectedDate,
  onDateChange,
  refreshTrigger: externalRefreshTrigger,
  initialExercisesToLog,
  onExercisesLogged,
}: FoodDiaryProps) => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const {
    formatDate,
    formatDateInUserTimezone,
    parseDateInUserTimezone,
    loggingLevel,
    energyUnit,
    convertEnergy,
  } = usePreferences();
  debug(loggingLevel, "FoodDiary component rendered for date:", selectedDate);
  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };
  const [date, setDate] = useState<Date>(new Date(selectedDate));
  const [foodEntries, setFoodEntries] = useState<FoodEntry[]>([]);
  const [foodEntryMeals, setFoodEntryMeals] = useState<FoodEntryMeal[]>([]); // New state for logged meals
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const [editingFoodEntryMeal, setEditingFoodEntryMeal] = useState<FoodEntryMeal | null>(null); // State for editing logged meal entry
  const [goals, setGoals] = useState<ExpandedGoals | null>(null);
  const [dayTotals, setDayTotals] = useState<MealTotals>({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    dietary_fiber: 0,
    sugars: 0,
    sodium: 0,
    cholesterol: 0,
    saturated_fat: 0,
    trans_fat: 0,
    potassium: 0,
    vitamin_a: 0,
    vitamin_c: 0,
    iron: 0,
    calcium: 0,
  });
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string>("");
  const [isUnitSelectorOpen, setIsUnitSelectorOpen] = useState(false);
  const [isLogMealDialogOpen, setIsLogMealDialogOpen] = useState(false);
  const [selectedMealTemplate, setSelectedMealTemplate] = useState<MealType | null>(null);
  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [copySourceMealType, setCopySourceMealType] = useState<string>("");
  const [isConvertToMealDialogOpen, setIsConvertToMealDialogOpen] = useState(false);
  const [convertToMealSourceMealType, setConvertToMealSourceMealType] = useState<string>("");
  const [exercisesToLogFromPreset, setExercisesToLogFromPreset] = useState<PresetExercise[]>([]);

  const currentUserId = activeUserId;
  debug(loggingLevel, "Current user ID:", currentUserId);

  useEffect(() => {
    debug(loggingLevel, "selectedDate useEffect triggered:", selectedDate);
    setDate(parseDateInUserTimezone(selectedDate));
  }, [selectedDate, parseDateInUserTimezone]);

  const normalizeGlycemicIndex = useCallback((value: any): GlycemicIndex => {
    if (value === null || value === undefined || value === '' || value === '0.0' || value === 0) {
      return 'None';
    }
    const validGlycemicIndexes: GlycemicIndex[] = ['None', 'Very Low', 'Low', 'Medium', 'High', 'Very High'];
    if (validGlycemicIndexes.includes(value as GlycemicIndex)) {
      return value as GlycemicIndex;
    }
    return 'None';
  }, []);

  const _calculateDayTotals = useCallback(
    (entries: FoodEntry[], meals: FoodEntryMeal[]) => {
      debug(loggingLevel, "Calculating day totals for entries and meals:", { entries, meals });

      const combinedItems: { nutrition: MealTotals, meal_type: string }[] = [];

      entries.forEach(entry => {
        const entryNutrition = calculateFoodEntryNutrition(entry); // Assumes this returns kcal
        combinedItems.push({ nutrition: entryNutrition, meal_type: entry.meal_type });
      });

      meals.forEach(meal => {
        // For FoodEntryMeal, its aggregated nutritional data is directly available (assumed to be in kcal)
        combinedItems.push({
          nutrition: {
            calories: (meal.calories || 0) * (meal.quantity || 1), // kcal
            protein: (meal.protein || 0) * (meal.quantity || 1),
            carbs: (meal.carbs || 0) * (meal.quantity || 1),
            fat: (meal.fat || 0) * (meal.quantity || 1),
            dietary_fiber: (meal.dietary_fiber || 0) * (meal.quantity || 1),
            sugars: (meal.sugars || 0) * (meal.quantity || 1),
            sodium: (meal.sodium || 0) * (meal.quantity || 1),
            cholesterol: (meal.cholesterol || 0) * (meal.quantity || 1),
            saturated_fat: (meal.saturated_fat || 0) * (meal.quantity || 1),
            trans_fat: (meal.trans_fat || 0) * (meal.quantity || 1),
            potassium: (meal.potassium || 0) * (meal.quantity || 1),
            vitamin_a: (meal.vitamin_a || 0) * (meal.quantity || 1),
            vitamin_c: (meal.vitamin_c || 0) * (meal.quantity || 1),
            iron: (meal.iron || 0) * (meal.quantity || 1),
            calcium: (meal.calcium || 0) * (meal.quantity || 1),
          },
          meal_type: meal.meal_type
        });
      });

      const totals = combinedItems.reduce(
        (acc, item) => {
          Object.keys(acc).forEach((key) => {
            acc[key as keyof MealTotals] +=
              item.nutrition[key as keyof MealTotals] || 0;
          });
          return acc;
        },
        {
          calories: 0, // kcal
          protein: 0,
          carbs: 0,
          fat: 0,
          dietary_fiber: 0,
          sugars: 0,
          sodium: 0,
          cholesterol: 0,
          saturated_fat: 0,
          trans_fat: 0,
          potassium: 0,
          vitamin_a: 0,
          vitamin_c: 0,
          iron: 0,
          calcium: 0,
        },
      );

      info(loggingLevel, "Day totals calculated:", totals);
      setDayTotals(totals);
    },
    [loggingLevel],
  );

  const _loadFoodEntriesAndMeals = useCallback(async () => {
    debug(loggingLevel, "Loading food entries and meals for date:", selectedDate);
    if (!currentUserId) return;

    try {
      // Fetch standalone food entries
      const fetchedFoodEntries = await loadFoodEntries(currentUserId, selectedDate);
      const processedFoodEntries = (fetchedFoodEntries || []).map(entry => ({
        ...entry,
        glycemic_index: normalizeGlycemicIndex(entry.glycemic_index)
      }));
      // Filter out entries that are components of food_entry_meals (i.e., food_entry_meal_id is NOT NULL)
      const standaloneFoodEntries = processedFoodEntries.filter(entry => !entry.food_entry_meal_id);
      setFoodEntries(standaloneFoodEntries);
      debug(loggingLevel, "Processed standalone food entries:", standaloneFoodEntries);


      // Fetch logged meal entries with components
      const fetchedFoodEntryMeals = await getFoodEntryMealsByDate(currentUserId, selectedDate);
      setFoodEntryMeals(fetchedFoodEntryMeals || []);
      debug(loggingLevel, "Fetched food entry meals with components:", fetchedFoodEntryMeals);

      _calculateDayTotals(standaloneFoodEntries, fetchedFoodEntryMeals);

    } catch (err) {
      error(loggingLevel, "Error loading food entries or meals:", err);
    }
  }, [currentUserId, selectedDate, loggingLevel, _calculateDayTotals, normalizeGlycemicIndex]);


  const _loadGoals = useCallback(async () => {
    debug(loggingLevel, "Loading goals for date:", selectedDate);
    try {
      const goalData = await loadGoals(currentUserId, selectedDate);
      info(loggingLevel, "Goals loaded successfully:", goalData);
      setGoals(goalData);
    } catch (err) {
      error(loggingLevel, "Error loading goals:", err);
    }
  }, [currentUserId, selectedDate, loggingLevel]);

  useEffect(() => {
    debug(
      loggingLevel,
      "currentUserId, selectedDate, externalRefreshTrigger useEffect triggered.",
      { currentUserId, selectedDate, externalRefreshTrigger },
    );
    if (currentUserId) {
      _loadFoodEntriesAndMeals();
      _loadGoals();
    }
  }, [
    currentUserId,
    selectedDate,
    externalRefreshTrigger,
    _loadFoodEntriesAndMeals,
    _loadGoals,
  ]);

  const getEntryNutrition = useCallback(
    (item: FoodEntry | FoodEntryMeal): MealTotals => {
      debug(loggingLevel, "Calculating entry nutrition for item:", item);
      let nutrition: MealTotals;
      if ('foods' in item) { // It's a FoodEntryMeal, use its aggregated properties (assumed to be in kcal)
        const quantity = item.quantity || 1;
        nutrition = {
          calories: (item.calories || 0) * quantity, // kcal
          protein: (item.protein || 0) * quantity,
          carbs: (item.carbs || 0) * quantity,
          fat: (item.fat || 0) * quantity,
          dietary_fiber: (item.dietary_fiber || 0) * quantity,
          sugars: (item.sugars || 0) * quantity,
          sodium: (item.sodium || 0) * quantity,
          cholesterol: (item.cholesterol || 0) * quantity,
          saturated_fat: (item.saturated_fat || 0) * quantity,
          trans_fat: (item.trans_fat || 0) * quantity,
          potassium: (item.potassium || 0) * quantity,
          vitamin_a: (item.vitamin_a || 0) * quantity,
          vitamin_c: (item.vitamin_c || 0) * quantity,
          iron: (item.iron || 0) * quantity,
          calcium: (item.calcium || 0) * quantity,
        };
      } else { // It's a FoodEntry
        nutrition = calculateFoodEntryNutrition(item); // Assumes this returns kcal
      }
      debug(loggingLevel, "Calculated nutrition for item:", nutrition);
      return nutrition;
    },
    [loggingLevel],
  );

  const getMealData = useCallback(
    (mealType: string): { name: string; type: string; entries: (FoodEntry | FoodEntryMeal)[]; targetCalories: number } => {
      debug(loggingLevel, "Getting meal data for meal type:", mealType);
      const mealNames = {
        breakfast: t("common.breakfast", "Breakfast"),
        lunch: t("common.lunch", "Lunch"),
        dinner: t("common.dinner", "Dinner"),
        snacks: t("common.snacks", "Snacks"),
      };

      // Filter both standalone food entries and food entry meals
      const entries = foodEntries.filter(
        (entry) => entry.meal_type === mealType,
      );
      const meals = foodEntryMeals.filter(
        (meal) => meal.meal_type === mealType,
      );

      const combinedEntries: (FoodEntry | FoodEntryMeal)[] = [...entries, ...meals];

      debug(
        loggingLevel,
        `Found ${combinedEntries.length} items for meal type ${mealType}.`,
      );

      return {
        name: mealNames[mealType as keyof typeof mealNames] || mealType,
        type: mealType,
        entries: combinedEntries,
        targetCalories: goals
          ? (goals.calories * (goals[`${mealType}_percentage`] || 0)) / 100 // goals.calories is in kcal
          : 0,
      };
    },
    [foodEntries, foodEntryMeals, goals, loggingLevel, t],
  );

  const handleDataChange = useCallback(() => {
    debug(loggingLevel, "Handling data change, triggering refresh.");
    _loadFoodEntriesAndMeals();
    _loadGoals();
    info(loggingLevel, "Dispatching foodDiaryRefresh event.");
    window.dispatchEvent(new CustomEvent("foodDiaryRefresh"));
  }, [debug, loggingLevel, _loadFoodEntriesAndMeals, _loadGoals, info]);

  const handleCopyClick = useCallback(
    (mealType: string) => {
      setCopySourceMealType(mealType);
      setIsCopyDialogOpen(true);
      debug(loggingLevel, "Opening copy dialog for meal type:", mealType);
    },
    [debug, loggingLevel],
  );

  const handleCopyFoodEntries = useCallback(
    async (targetDate: string, targetMealType: string) => {
      debug(loggingLevel, "Attempting to copy food entries.", {
        selectedDate,
        copySourceMealType,
        targetDate,
        targetMealType,
      });
      try {
        await copyFoodEntries(
          selectedDate,
          copySourceMealType,
          targetDate,
          targetMealType,
        );
        info(loggingLevel, "Food entries copied successfully.");
        toast({
          title: t("foodDiary.success", "Success"),
          description: t("foodDiary.entryCopied", "Food entries copied successfully"),
        });
        handleDataChange();
      } catch (err) {
        error(loggingLevel, "Error copying food entries:", err);
        toast({
          title: t("foodDiary.error", "Error"),
          description: t("foodDiary.entryCopyError", "Failed to copy food entries."),
          variant: "destructive",
        });
      } finally {
        setIsCopyDialogOpen(false);
      }
    },
    [
      selectedDate,
      copySourceMealType,
      handleDataChange,
      info,
      loggingLevel,
      toast,
      error,
    ],
  );

  const handleCopyFromYesterday = useCallback(
    async (mealType: string) => {
      debug(loggingLevel, "Attempting to copy food entries from yesterday.", {
        selectedDate,
        mealType,
      });
      try {
        await copyFoodEntriesFromYesterday(mealType, selectedDate);
        info(loggingLevel, "Food entries copied from yesterday successfully.");
        toast({
          title: t("foodDiary.success", "Success"),
          description: t("foodDiary.copiedFromYesterday", "Food entries copied from yesterday successfully"),
        });
        handleDataChange();
      } catch (err) {
        error(loggingLevel, "Error copying food entries from yesterday:", err);
        toast({
          title: t("foodDiary.error", "Error"),
          description: t("foodDiary.copyFromYesterdayError", "Failed to copy food entries from yesterday."),
          variant: "destructive",
        });
      }
    },
    [selectedDate, handleDataChange, info, loggingLevel, toast, error],
  );

  const getMealTotals = useCallback(
    (mealType: string): MealTotals => {
      debug(loggingLevel, "Calculating meal totals for meal type:", mealType);

      const entries = foodEntries.filter(
        (entry) => entry.meal_type === mealType,
      );
      const meals = foodEntryMeals.filter(
        (meal) => meal.meal_type === mealType,
      );

      const combinedItems: (FoodEntry | FoodEntryMeal)[] = [...entries, ...meals];


      const totals = combinedItems.reduce(
        (acc, item) => {
          const itemNutrition = getEntryNutrition(item);
          Object.keys(acc).forEach((key) => {
            acc[key as keyof MealTotals] +=
              itemNutrition[key as keyof MealTotals] || 0;
          });
          return acc;
        },
        {
          calories: 0, // kcal
          protein: 0,
          carbs: 0,
          fat: 0,
          dietary_fiber: 0,
          sugars: 0,
          sodium: 0,
          cholesterol: 0,
          saturated_fat: 0,
          trans_fat: 0,
          potassium: 0,
          vitamin_a: 0,
          vitamin_c: 0,
          iron: 0,
          calcium: 0,
        },
      );
      debug(loggingLevel, `Calculated totals for ${mealType}:`, totals);
      return totals;
    },
    [foodEntries, foodEntryMeals, getEntryNutrition, loggingLevel],
  );

  const handleDateSelect = useCallback(
    (newDate: Date | undefined) => {
      debug(loggingLevel, "Handling date select:", newDate);
      if (newDate) {
        setDate(newDate);
        const dateString = formatDateInUserTimezone(newDate, "yyyy-MM-dd");
        info(loggingLevel, "Date selected:", dateString);
        onDateChange(dateString);
      }
    },
    [
      debug,
      loggingLevel,
      setDate,
      formatDateInUserTimezone,
      info,
      onDateChange,
    ],
  );

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

  const handleFoodSelect = useCallback(
    async (item: Food | MealType, mealType: string) => {
      if ('is_custom' in item) { // It's a Food
        debug(loggingLevel, "Handling food select:", { food: item, mealType });
        setSelectedFood(item as Food);
        setSelectedMealType(mealType);
        setIsUnitSelectorOpen(true);
      } else { // It's a Meal Template (not FoodEntryMeal)
        debug(loggingLevel, "Handling meal template select:", { meal: item, mealType });
        const mealTemplate = item as MealType; // cast as Meal (MealType in grep was likely alias or similar, strictly Meal interface is better)
        setSelectedMealTemplate(mealTemplate);
        setSelectedMealType(mealType);
        setIsLogMealDialogOpen(true);
      }
    },
    [
      debug,
      loggingLevel,
      setSelectedFood,
      setSelectedMealType,
      setIsUnitSelectorOpen,
      selectedDate, // Added selectedDate to dependencies
      formatDateInUserTimezone, // Added to dependencies for clarity
      parseDateInUserTimezone, // Added to dependencies for clarity
    ],
  );

  const handleFoodUnitSelect = useCallback(
    async (
      food: Food,
      quantity: number,
      unit: string,
      selectedVariant: FoodVariant,
    ) => {
      debug(loggingLevel, "Handling food unit select:", {
        food,
        quantity,
        unit,
        selectedVariant,
      });
      try {
        await createFoodEntry({
          user_id: currentUserId,
          food_id: food.id,
          meal_type: selectedMealType,
          quantity: quantity,
          unit: unit,
          variant_id: selectedVariant.id,
          entry_date: formatDateInUserTimezone(
            parseDateInUserTimezone(selectedDate),
            "yyyy-MM-dd",
          ),
        });
        info(loggingLevel, "Food entry added successfully.");
        toast({
          title: t("foodDiary.success", "Success"),
          description: t("foodDiary.entryAdded", "Food entry added successfully"),
        });
        handleDataChange();
      } catch (err) {
        error(loggingLevel, "Error adding food entry:", err);
      }
    },
    [
      debug,
      loggingLevel,
      createFoodEntry,
      currentUserId,
      selectedMealType,
      formatDateInUserTimezone,
      parseDateInUserTimezone,
      selectedDate,
      info,
      toast,
      handleDataChange,
      error,
      selectedDate, // Added selectedDate to dependencies
      formatDateInUserTimezone, // Added to dependencies for clarity
      parseDateInUserTimezone, // Added to dependencies for clarity
    ],
  );

  const handleRemoveEntry = useCallback(
    async (itemId: string, itemType: 'foodEntry' | 'foodEntryMeal') => {
      debug(loggingLevel, "Handling remove entry:", { itemId, itemType });
      try {
        if (itemType === 'foodEntryMeal') {
          await deleteFoodEntryMeal(itemId); // userId is handled by backend RLS
          info(loggingLevel, `Food entry meal ${itemId} removed successfully.`);
        } else {
          await removeFoodEntry(itemId);
          info(loggingLevel, `Food entry ${itemId} removed successfully.`);
        }
        toast({
          title: t("foodDiary.success", "Success"),
          description: t("foodDiary.entryRemoved", "Food entry removed successfully"),
        });
        handleDataChange();
      } catch (err) {
        error(loggingLevel, "Error removing food entry:", err);
      }
    },
    [
      debug,
      loggingLevel,
      removeFoodEntry,
      deleteFoodEntryMeal, // Added new dependency
      info,
      toast,
      handleDataChange,
      error,
    ],
  );

  const handleEditEntry = useCallback(
    (entry: FoodEntry | FoodEntryMeal) => {
      debug(loggingLevel, "handleEditEntry called with entry:", entry);
      if (!currentUserId) {
        error(loggingLevel, "currentUserId is undefined when trying to edit entry.");
        toast({
          title: t("foodDiary.error", "Error"),
          description: t("foodDiary.userNotFound", "User not found, cannot edit entry."),
          variant: "destructive",
        });
        return;
      }

      if ((entry as FoodEntryMeal).foods !== undefined) { // It's a FoodEntryMeal based on 'foods' property
        setEditingFoodEntryMeal(entry as FoodEntryMeal);
        setEditingEntry(null);
      } else { // It's a FoodEntry (standalone or part of a meal)
        setEditingEntry(entry as FoodEntry);
        setEditingFoodEntryMeal(null);
      }
    },
    [debug, loggingLevel, currentUserId, setEditingEntry, setEditingFoodEntryMeal, t, info, warn, error, toast],
  );

  const handleEditFood = useCallback(
    (food: Food) => {
      debug(
        loggingLevel,
        "Handling edit food, triggering data change for food:",
        food,
      );
      handleDataChange();
    },
    [debug, loggingLevel, handleDataChange],
  );

  const handleExerciseAdded = useCallback(() => {
    debug(loggingLevel, "Exercise added, triggering data change.");
    handleDataChange();
  }, [debug, loggingLevel, handleDataChange]);

  const handleWorkoutPresetSelected = useCallback((preset: WorkoutPreset) => {
    debug(loggingLevel, "Workout preset selected:", preset);
    // TODO: Fix this type mismatch
    // setExercisesToLogFromPreset(preset.exercises.map(e => ({...e, reps: e.reps || null, weight: e.weight || null})) || []);
  }, [debug, loggingLevel]);

  const handleConvertToMealClick = useCallback(
    (mealType: string) => {
      setConvertToMealSourceMealType(mealType);
      setIsConvertToMealDialogOpen(true);
      debug(loggingLevel, "Opening Convert to Meal dialog for meal type:", mealType);
    },
    [debug, loggingLevel],
  );

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <Card className="dark:text-slate-300">
        <CardHeader>
          <div className="flex flex-col space-y-4 items-center sm:flex-row sm:justify-between sm:space-y-0">
            <CardTitle className="text-xl font-semibold ">{t("foodDiary.title", "Food Diary")}</CardTitle>
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
                      !date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? formatDate(date) : <span>{t("foodDiary.pickADate", "Pick a Date")}</span>}
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
          </div>
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
            energyUnit={energyUnit}
            convertEnergy={convertEnergy}
          />

          {/* Main Content - Meals and Exercise */}
          <div className="space-y-6">
            <MealCard
              meal={{ ...getMealData("breakfast"), selectedDate: selectedDate }}
              totals={getMealTotals("breakfast")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={(itemId, itemType) => handleRemoveEntry(itemId, itemType)}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick}
              onCopyFromYesterday={handleCopyFromYesterday}
              onConvertToMealClick={handleConvertToMealClick}
              energyUnit={energyUnit}
              convertEnergy={convertEnergy}
              key={`breakfast-${externalRefreshTrigger}`}
            />
            <MealCard
              meal={{ ...getMealData("lunch"), selectedDate: selectedDate }}
              totals={getMealTotals("lunch")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={(itemId, itemType) => handleRemoveEntry(itemId, itemType)}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick}
              onCopyFromYesterday={handleCopyFromYesterday}
              onConvertToMealClick={handleConvertToMealClick}
              energyUnit={energyUnit}
              convertEnergy={convertEnergy}
              key={`lunch-${externalRefreshTrigger}`}
            />
            <MealCard
              meal={{ ...getMealData("dinner"), selectedDate: selectedDate }}
              totals={getMealTotals("dinner")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={(itemId, itemType) => handleRemoveEntry(itemId, itemType)}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick}
              onCopyFromYesterday={handleCopyFromYesterday}
              onConvertToMealClick={handleConvertToMealClick}
              energyUnit={energyUnit}
              convertEnergy={convertEnergy}
              key={`dinner-${externalRefreshTrigger}`}
            />
            <MealCard
              meal={{ ...getMealData("snacks"), selectedDate: selectedDate }}
              totals={getMealTotals("snacks")}
              onFoodSelect={handleFoodSelect}
              onEditEntry={handleEditEntry}
              onEditFood={handleEditFood}
              onRemoveEntry={(itemId, itemType) => handleRemoveEntry(itemId, itemType)}
              getEntryNutrition={getEntryNutrition}
              onMealAdded={handleDataChange}
              onCopyClick={handleCopyClick}
              onCopyFromYesterday={handleCopyFromYesterday}
              onConvertToMealClick={handleConvertToMealClick}
              energyUnit={energyUnit}
              convertEnergy={convertEnergy}
              key={`snacks-${externalRefreshTrigger}`}
            />

            {/* Exercise Section */}
            <ExerciseCard
              selectedDate={selectedDate}
              onExerciseChange={handleDataChange}
              initialExercisesToLog={initialExercisesToLog}
              onExercisesLogged={onExercisesLogged}
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

      {/* Edit Meal Food Entry Dialog */}
      {editingFoodEntryMeal && (
        <EditMealFoodEntryDialog
          foodEntry={editingFoodEntryMeal}
          open={true}
          onOpenChange={(open) => !open && setEditingFoodEntryMeal(null)}
          onSave={handleDataChange}
        />
      )}

      <LogMealDialog
        mealTemplate={selectedMealTemplate}
        open={isLogMealDialogOpen}
        onOpenChange={setIsLogMealDialogOpen}
        date={formatDateInUserTimezone(
          parseDateInUserTimezone(selectedDate),
          "yyyy-MM-dd",
        )}
        mealType={selectedMealType}
        onSave={() => {
          handleDataChange();
          info(loggingLevel, "Meal logged successfully via dialog.");
        }}
      />

      {/* Convert to Meal Dialog */}
      {isConvertToMealDialogOpen && (
        <ConvertToMealDialog
          isOpen={isConvertToMealDialogOpen}
          onClose={() => setIsConvertToMealDialogOpen(false)}
          selectedDate={formatDateInUserTimezone(date, "yyyy-MM-dd")}
          mealType={convertToMealSourceMealType}
          onMealCreated={handleDataChange}
        />
      )}
    </div>
  );
};

export default FoodDiary;
