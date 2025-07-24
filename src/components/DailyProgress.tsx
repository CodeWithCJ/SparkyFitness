import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { usePreferences } from "@/contexts/PreferencesContext";
import { debug, info, warn, error } from "@/utils/logging";
import { format, parseISO, addDays } from "date-fns"; // Import format, parseISO, and addDays from date-fns
import { calculateFoodEntryNutrition } from "@/utils/nutritionCalculations"; // Import the new utility function
import {
  getGoalsForDate,
  getFoodEntriesForDate,
  getExerciseEntriesForDate,
  getCheckInMeasurementsForDate,
  Goals,
  ExerciseEntry,
  CheckInMeasurement,
} from "@/services/dailyProgressService";
import { FoodEntry } from "@/types/food"; // Import FoodEntry from src/types/food
import { Skeleton } from "./ui/skeleton";

const DailyProgress = ({
  selectedDate,
  refreshTrigger,
}: {
  selectedDate: string;
  refreshTrigger?: number;
}) => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { loggingLevel } = usePreferences();
  debug(
    loggingLevel,
    "DailyProgress: Component rendered for date:",
    selectedDate,
  );

  const { water_display_unit } = usePreferences(); // Add water_display_unit from preferences

  // Helper functions for unit conversion
  const convertMlToSelectedUnit = (
    ml: number | null | undefined,
    unit: "ml" | "oz" | "liter",
  ): number => {
    const safeMl = typeof ml === "number" && !isNaN(ml) ? ml : 0;
    switch (unit) {
      case "oz":
        return safeMl / 29.5735;
      case "liter":
        return safeMl / 1000;
      case "ml":
      default:
        return safeMl;
    }
  };

  const [dailyGoals, setDailyGoals] = useState({
    calories: 2000,
    protein: 150,
    carbs: 250,
    fat: 67,
    water_goal_ml: 1920, // Default to 8 glasses * 240ml
  });
  const [dailyIntake, setDailyIntake] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    water_ml: 0,
  });
  const [exerciseCalories, setExerciseCalories] = useState(0);
  const [stepsCalories, setStepsCalories] = useState(0);
  const [dailySteps, setDailySteps] = useState(0);
  const [loading, setLoading] = useState(true);

  const currentUserId = activeUserId || user?.id;
  debug(loggingLevel, "DailyProgress: Current user ID:", currentUserId);

  useEffect(() => {
    debug(
      loggingLevel,
      "DailyProgress: currentUserId, selectedDate, refreshTrigger useEffect triggered.",
      { currentUserId, selectedDate, refreshTrigger },
    );
    if (currentUserId) {
      loadGoalsAndIntake();
    }

    const handleRefresh = () => {
      info(
        loggingLevel,
        "DailyProgress: Received refresh event, triggering data reload.",
      );
      loadGoalsAndIntake();
    };

    window.addEventListener("foodDiaryRefresh", handleRefresh);
    window.addEventListener("measurementsRefresh", handleRefresh);

    return () => {
      window.removeEventListener("foodDiaryRefresh", handleRefresh);
      window.removeEventListener("measurementsRefresh", handleRefresh);
    };
  }, [currentUserId, selectedDate, refreshTrigger, loggingLevel]);

  // Convert steps to calories (roughly 0.04 calories per step for average person)
  const convertStepsToCalories = (steps: number): number => {
    debug(loggingLevel, "DailyProgress: Converting steps to calories:", steps);
    return Math.round(steps * 0.04);
  };

  const loadGoalsAndIntake = async () => {
    info(
      loggingLevel,
      "DailyProgress: Loading goals and intake for date:",
      selectedDate,
    );
    try {
      setLoading(true);

      // Use the database function to get goals for the selected date
      debug(loggingLevel, "DailyProgress: Fetching goals...");
      const goalsData = await getGoalsForDate(selectedDate);
      info(
        loggingLevel,
        "DailyProgress: Goals loaded successfully:",
        goalsData,
      );
      setDailyGoals({
        calories: goalsData.calories || 2000,
        protein: goalsData.protein || 150,
        carbs: goalsData.carbs || 250,
        fat: goalsData.fat || 67,
        water_goal_ml: goalsData.water_goal_ml || 1920, // Default to 8 glasses * 240ml
      });

      // Load daily intake from food entries
      debug(
        loggingLevel,
        "DailyProgress: Fetching food entries for intake calculation...",
      );
      try {
        const entriesData = await getFoodEntriesForDate(selectedDate);
        info(
          loggingLevel,
          `DailyProgress: Fetched ${entriesData.length} food entries for intake.`,
        );
        const totals = entriesData.reduce(
          (acc, entry) => {
            const nutrition = calculateFoodEntryNutrition(entry);
            acc.calories += nutrition.calories;
            acc.protein += nutrition.protein;
            acc.carbs += nutrition.carbs;
            acc.fat += nutrition.fat;
            acc.water_ml += nutrition.water_ml;
            return acc;
          },
          { calories: 0, protein: 0, carbs: 0, fat: 0, water_ml: 0 },
        );

        info(loggingLevel, "DailyProgress: Daily intake calculated:", totals);
        setDailyIntake({
          calories: Math.round(totals.calories),
          protein: Math.round(totals.protein),
          carbs: Math.round(totals.carbs),
          fat: Math.round(totals.fat),
          water_ml: Math.round(totals.water_ml),
        });
      } catch (err: any) {
        error(
          loggingLevel,
          "DailyProgress: Error loading food entries for intake:",
          err,
        );
      }

      // Load exercise calories burned
      debug(loggingLevel, "DailyProgress: Fetching exercise entries...");
      try {
        const exerciseData = await getExerciseEntriesForDate(selectedDate);
        info(
          loggingLevel,
          `DailyProgress: Fetched ${exerciseData.length} exercise entries.`,
        );
        const totalExerciseCalories = exerciseData.reduce(
          (sum, entry) => sum + Number(entry.calories_burned),
          0,
        );
        info(
          loggingLevel,
          "DailyProgress: Total exercise calories burned:",
          totalExerciseCalories,
        );
        setExerciseCalories(totalExerciseCalories);
      } catch (err: any) {
        error(
          loggingLevel,
          "DailyProgress: Error loading exercise entries:",
          err,
        );
        setExerciseCalories(0);
      }

      // Load daily steps from body measurements
      debug(loggingLevel, "DailyProgress: Fetching daily steps...");
      try {
        const stepsData = await getCheckInMeasurementsForDate(selectedDate);
        if (stepsData && stepsData.steps) {
          info(
            loggingLevel,
            "DailyProgress: Daily steps loaded:",
            stepsData.steps,
          );
          setDailySteps(stepsData.steps);
          const stepsCaloriesBurned = convertStepsToCalories(
            Number(stepsData.steps),
          );
          info(
            loggingLevel,
            "DailyProgress: Calories burned from steps:",
            stepsCaloriesBurned,
          );
          setStepsCalories(stepsCaloriesBurned);
        } else {
          info(loggingLevel, "DailyProgress: No daily steps found.");
          setDailySteps(0);
          setStepsCalories(0);
        }
      } catch (err: any) {
        error(loggingLevel, "DailyProgress: Error loading daily steps:", err);
        setDailySteps(0);
        setStepsCalories(0);
      }
      info(
        loggingLevel,
        "DailyProgress: Goals and intake loaded successfully.",
      );
    } catch (err: any) {
      error(loggingLevel, "DailyProgress: Error in loadGoalsAndIntake:", err);
    } finally {
      setLoading(false);
      debug(loggingLevel, "DailyProgress: Loading state set to false.");
    }
  };

  if (loading) {
    debug(loggingLevel, "DailyProgress: Displaying loading message.");
    return (
      <div>
        <Card className="h-full">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center space-x-2 text-base">
              <Skeleton className="w-4 h-4 rounded-full" />
              <Skeleton className="h-4 w-48" />
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="relative w-32 h-32 rounded-full bg-gray-200 dark:bg-slate-700 flex items-center justify-center">
                  <div className="absolute inset-0 flex flex-col items-center justify-center space-y-1">
                    <Skeleton className="h-6 w-12" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="space-y-1">
                  <Skeleton className="h-6 w-12 mx-auto" />
                  <Skeleton className="h-3 w-16 mx-auto" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-6 w-12 mx-auto" />
                  <Skeleton className="h-3 w-16 mx-auto" />
                </div>
                <div className="space-y-1">
                  <Skeleton className="h-6 w-12 mx-auto" />
                  <Skeleton className="h-3 w-16 mx-auto" />
                </div>
              </div>

              <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-slate-800 space-y-1">
                <Skeleton className="h-4 w-full mx-auto" />
                <Skeleton className="h-3 w-full mx-auto" />
                <Skeleton className="h-3 w-full mx-auto" />
              </div>

              <div className="text-center p-2 rounded-lg bg-gray-100 dark:bg-slate-800">
                <Skeleton className="h-4 w-full mx-auto" />
                <Skeleton className="h-3 w-full mx-auto mt-1" />
              </div>

              {/* <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-2 w-full" />
              </div> */}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate net calories (food calories - exercise calories - steps calories)
  // Calculate total calories burned: prioritize exerciseCalories if present, otherwise use stepsCalories.
  // This prevents double-counting when both active calories and steps are recorded.
  let totalCaloriesBurned = 0;
  if (exerciseCalories > 0) {
    totalCaloriesBurned = Math.round(Number(exerciseCalories));
    info(
      loggingLevel,
      "DailyProgress: Prioritizing Active Calories for total burned:",
      totalCaloriesBurned,
    );
  } else {
    totalCaloriesBurned = Math.round(Number(stepsCalories));
    info(
      loggingLevel,
      "DailyProgress: No Active Calories, using Step Calories for total burned:",
      totalCaloriesBurned,
    );
  }
  const netCalories = Math.round(dailyIntake.calories) - totalCaloriesBurned;
  const caloriesRemaining = dailyGoals.calories - netCalories;
  const calorieProgress = Math.max(
    0,
    (netCalories / dailyGoals.calories) * 100,
  );
  debug(loggingLevel, "DailyProgress: Calculated progress values:", {
    totalCaloriesBurned,
    netCalories,
    caloriesRemaining,
    calorieProgress,
  });

  info(loggingLevel, "DailyProgress: Rendering daily progress card.");
  return (
    <Card className="h-full ">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-base">
          <Target className="w-4 h-4 text-green-500" />
          <span className="dark:text-slate-300">Daily Calorie Goal</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-4">
          {/* Calorie Circle - Reduced size */}
          <div className="flex items-center justify-center">
            <div className="relative w-32 h-32">
              <svg
                className="w-32 h-32 transform -rotate-90"
                viewBox="0 0 36 36"
              >
                <path
                  className="text-gray-200 dark:text-slate-400"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="transparent"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-green-500"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="transparent"
                  strokeDasharray={`${Math.min(calorieProgress, 100)}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-xl font-bold text-gray-900 dark:text-gray-50">
                  {Math.round(caloriesRemaining)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  remaining
                </div>
              </div>
            </div>
          </div>

          {/* Calorie Breakdown - Compact */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="space-y-1">
              <div className="text-lg font-bold text-green-600">
                {Math.round(dailyIntake.calories)}
              </div>
              <div className="text-xs text-gray-500">eaten</div>
            </div>
            <div className="space-y-1">
              <div className="text-lg font-bold text-orange-600">
                {totalCaloriesBurned}
              </div>
              <div className="text-xs text-gray-500">burned</div>
            </div>
            <div className="space-y-1 ">
              <div className="text-lg font-bold dark:text-slate-400 text-gray-900">
                {dailyGoals.calories}
              </div>
              <div className="text-xs dark:text-slate-400 text-gray-500 ">
                goal
              </div>
            </div>
          </div>

          {/* Calories Burned Breakdown - More compact */}
          {(exerciseCalories > 0 || stepsCalories > 0) && (
            <div className="text-center p-2 bg-blue-50 rounded-lg space-y-1">
              <div className="text-sm font-medium text-blue-700">
                Calories Burned Breakdown
              </div>
              {exerciseCalories > 0 && (
                <div className="text-xs text-blue-600">
                  Exercise: {Math.round(exerciseCalories)} cal
                </div>
              )}
              {stepsCalories > 0 && (
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3" />
                  Steps: {dailySteps.toLocaleString()} = {stepsCalories} cal
                </div>
              )}
            </div>
          )}

          {/* Net Calories Display - Compact */}
          <div className="text-center p-2 dark:bg-slate-300 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium dark:text-black text-gray-700 ">
              Net Calories: {Math.round(netCalories)}
            </div>
            <div className="text-xs dark:text-black text-gray-600">
              {Math.round(dailyIntake.calories)} eaten - {totalCaloriesBurned}{" "}
              burned
            </div>
          </div>

          {/* Progress Bar - Compact */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>Daily Progress</span>
              <span>{Math.round(calorieProgress)}%</span>
            </div>
            <Progress value={calorieProgress} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DailyProgress;
