import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Target, Zap, Utensils, Flame, Flag } from "lucide-react"; // Added Utensils, Flame, Flag
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { GroupedExerciseEntry } from "@/services/exerciseEntryService"; // Corrected import path
import { getMostRecentMeasurement } from "@/services/checkInService";
import { FoodEntry } from "@/types/food"; // Import FoodEntry from src/types/food
import { Skeleton } from "./ui/skeleton";
import { getUserPreferences } from "@/services/preferenceService";
import { calculateBmr, BmrAlgorithm } from "@/services/bmrService";
import { userManagementService } from "@/services/userManagementService";

const DailyProgress = ({
  selectedDate,
  refreshTrigger,
}: {
  selectedDate: string;
  refreshTrigger?: number;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { loggingLevel, calorieGoalAdjustmentMode, energyUnit, convertEnergy } = usePreferences(); // Import calorieGoalAdjustmentMode, energyUnit, convertEnergy
  debug(
    loggingLevel,
    "DailyProgress: Component rendered for date:",
    selectedDate,
    "Calorie Goal Adjustment Mode:",
    calorieGoalAdjustmentMode,
    "Energy Unit:",
    energyUnit,
  );

  const { water_display_unit } = usePreferences(); // Add water_display_unit from preferences

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };

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
    calories: 2000, // Stored internally as kcal
    protein: 150,
    carbs: 250,
    fat: 67,
    water_goal_ml: 1920, // Default to 8 glasses * 240ml
  });
  const [dailyIntake, setDailyIntake] = useState({
    calories: 0, // Stored internally as kcal
    protein: 0,
    carbs: 0,
    fat: 0,
    water_ml: 0,
  });
  const [exerciseCalories, setExerciseCalories] = useState(0); // This will now store non-"Active Calories" exercise (kcal)
  const [activeCaloriesFromExercise, setActiveCaloriesFromExercise] = useState(0); // New state for "Active Calories" (kcal)
  const [stepsCalories, setStepsCalories] = useState(0); // (kcal)
  const [dailySteps, setDailySteps] = useState(0);
  const [bmr, setBmr] = useState<number | null>(null); // (kcal)
  const [includeBmrInNetCalories, setIncludeBmrInNetCalories] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentUserId = activeUserId || user?.id;
  debug(loggingLevel, "DailyProgress: Current user ID:", currentUserId);

  useEffect(() => {
    debug(
      loggingLevel,
      "DailyProgress: currentUserId, selectedDate, refreshTrigger useEffect triggered.",
      { currentUserId, selectedDate, refreshTrigger, calorieGoalAdjustmentMode },
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
  }, [currentUserId, selectedDate, refreshTrigger, loggingLevel, calorieGoalAdjustmentMode, energyUnit]);

  // Convert steps to calories (roughly 0.04 calories per step for average person)
  const convertStepsToCalories = (steps: number): number => {
    debug(loggingLevel, "DailyProgress: Converting steps to calories:", steps);
    return Math.round(steps * 0.04); // Returns kcal
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
        calories: goalsData.calories || 2000, // Assume backend always provides kcal
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
            const nutrition = calculateFoodEntryNutrition(entry); // Assumes nutrition is in kcal
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
          calories: Math.round(totals.calories), // Still kcal internally
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
        const exerciseData: GroupedExerciseEntry[] = await getExerciseEntriesForDate(selectedDate); // Update type
        info(
          loggingLevel,
          `DailyProgress: Fetched ${exerciseData.length} exercise entries.`,
        );

        let activeCaloriesFromExercise = 0;
        let otherExerciseCalories = 0;

        exerciseData.forEach(groupedEntry => {
          if (groupedEntry.type === 'preset' && groupedEntry.exercises) {
            groupedEntry.exercises.forEach(entry => {
              // Assume calories_burned from backend is always kcal
              if (entry.exercise_snapshot?.name === 'Active Calories') {
                activeCaloriesFromExercise += Number(entry.calories_burned || 0);
              } else {
                otherExerciseCalories += Number(entry.calories_burned || 0);
              }
            });
          } else if (groupedEntry.type === 'individual') {
            // Assume calories_burned from backend is always kcal
            if (groupedEntry.exercise_snapshot?.name === 'Active Calories') {
              activeCaloriesFromExercise += Number(groupedEntry.calories_burned || 0);
            } else {
              otherExerciseCalories += Number(groupedEntry.calories_burned || 0);
            }
          }
        });

        info(
          loggingLevel,
          "DailyProgress: Active Calories from Exercise entries:",
          activeCaloriesFromExercise,
        );
        info(
          loggingLevel,
          "DailyProgress: Other Exercise Calories:",
          otherExerciseCalories,
        );
        setExerciseCalories(otherExerciseCalories); // Store other exercise calories here (kcal)
        setActiveCaloriesFromExercise(activeCaloriesFromExercise); // Set the new state variable (kcal)
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
          ); // Returns kcal
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

      // Load BMR
      debug(loggingLevel, "DailyProgress: Fetching user preferences for BMR...");
      try {
        const prefs = await getUserPreferences(loggingLevel);
        if (prefs && currentUserId) {
          setIncludeBmrInNetCalories(prefs.include_bmr_in_net_calories || false);
          const [mostRecentWeight, mostRecentHeight, mostRecentBodyFat, userProfile] = await Promise.all([
            getMostRecentMeasurement('weight'),
            getMostRecentMeasurement('height'),
            getMostRecentMeasurement('body_fat_percentage'),
            userManagementService.getUserProfile(currentUserId)
          ]);

          const age = userProfile?.date_of_birth ? new Date().getFullYear() - new Date(userProfile.date_of_birth).getFullYear() : 0;
          const gender = userProfile?.gender;

          if (prefs.bmr_algorithm && mostRecentWeight?.weight && mostRecentHeight?.height && age && gender) {
            try {
              const bmrValue = calculateBmr(
                prefs.bmr_algorithm as BmrAlgorithm,
                mostRecentWeight.weight,
                mostRecentHeight.height,
                age,
                gender,
                mostRecentBodyFat?.body_fat_percentage
              );
              setBmr(bmrValue); // bmrValue is in kcal
            } catch (bmrError) {
              error(loggingLevel, "DailyProgress: Error calculating BMR:", bmrError);
              setBmr(null);
            }
          } else {
            warn(loggingLevel, "DailyProgress: Missing data for BMR calculation.", {
              bmr_algorithm: prefs.bmr_algorithm,
              weight: mostRecentWeight?.weight,
              height: mostRecentHeight?.height,
              age,
              gender
            });
            setBmr(null);
          }
        }
      } catch (err) {
        error(loggingLevel, "DailyProgress: Error loading BMR data:", err);
        setBmr(null);
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

  // Calculate total calories burned based on user's refined logic:
  // Sum all exercise calories *except* those explicitly categorized as "Active Calories".
  // Then, add either the "Active Calories" (if present and greater than 0) or the "stepsCalories" (if "Active Calories" are 0 or not present).
  let totalOtherExerciseCaloriesBurned = Math.round(Number(exerciseCalories)); // This now holds 'otherExerciseCalories'

  let activeOrStepsCaloriesToAdd = 0;
  if (activeCaloriesFromExercise > 0) {
    activeOrStepsCaloriesToAdd = Math.round(Number(activeCaloriesFromExercise));
    info(
      loggingLevel,
      "DailyProgress: Including Active Calories from exercise entries:",
      activeOrStepsCaloriesToAdd,
    );
  } else {
    activeOrStepsCaloriesToAdd = Math.round(Number(stepsCalories));
    info(
      loggingLevel,
      "DailyProgress: No Active Calories from exercise entries, including Step Calories:",
      activeOrStepsCaloriesToAdd,
    );
  }

  const totalCaloriesBurned = totalOtherExerciseCaloriesBurned + activeOrStepsCaloriesToAdd;
  info(
    loggingLevel,
    "DailyProgress: Total calories burned (Other Exercise + Active/Steps):",
    totalCaloriesBurned,
  );

  const bmrCalories = includeBmrInNetCalories && bmr ? bmr : 0;
  const finalTotalCaloriesBurned = totalCaloriesBurned + bmrCalories;

  let netCalories: number;
  let caloriesRemaining: number;

  if (calorieGoalAdjustmentMode === 'dynamic') {
    // Dynamic Goal: burned calories are added to the daily calorie goal
    // Formula: Remaining = Goal + Burned - Eaten
    // Effectively, netCalories in this context is Eaten - Burned
    netCalories = Math.round(dailyIntake.calories) - finalTotalCaloriesBurned;
    caloriesRemaining = dailyGoals.calories - netCalories;
  } else {
    // Fixed Goal: daily calorie goal remains constant regardless of exercise
    // Formula: Remaining = Goal - Eaten
    netCalories = Math.round(dailyIntake.calories); // Only eaten calories count towards net
    caloriesRemaining = dailyGoals.calories - dailyIntake.calories;
  }
  
  const calorieProgress = Math.max(
    0,
    (netCalories / dailyGoals.calories) * 100,
  );
  debug(loggingLevel, "DailyProgress: Calculated progress values:", {
    totalCaloriesBurned,
    netCalories,
    caloriesRemaining,
    calorieProgress,
    calorieGoalAdjustmentMode,
  });

  // Convert all displayed energy values to the user's preferred unit
  const displayedCaloriesRemaining = Math.round(convertEnergy(caloriesRemaining, 'kcal', energyUnit));
  const displayedDailyIntakeCalories = Math.round(convertEnergy(dailyIntake.calories, 'kcal', energyUnit));
  const displayedTotalCaloriesBurned = Math.round(convertEnergy(totalCaloriesBurned, 'kcal', energyUnit));
  const displayedDailyGoalCalories = Math.round(convertEnergy(dailyGoals.calories, 'kcal', energyUnit));
  const displayedExerciseCalories = Math.round(convertEnergy(exerciseCalories, 'kcal', energyUnit));
  const displayedActiveCaloriesFromExercise = Math.round(convertEnergy(activeCaloriesFromExercise, 'kcal', energyUnit));
  const displayedStepsCalories = Math.round(convertEnergy(stepsCalories, 'kcal', energyUnit));
  const displayedBmr = bmr ? Math.round(convertEnergy(bmr, 'kcal', energyUnit)) : 0;
  const displayedFinalTotalCaloriesBurned = Math.round(convertEnergy(finalTotalCaloriesBurned, 'kcal', energyUnit));
  const displayedNetCalories = Math.round(convertEnergy(netCalories, 'kcal', energyUnit));


  info(loggingLevel, "DailyProgress: Rendering daily progress card.");
  return (
    <Card className="h-full ">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-base">
          <Target className="w-4 h-4 text-green-500" />
          <span className="dark:text-slate-300">{t('exercise.dailyProgress.dailyEnergyGoal', 'Daily Energy Goal')}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-4">
          {/* Energy Circle - Reduced size */}
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
                  {displayedCaloriesRemaining}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('exercise.dailyProgress.remaining', 'remaining')} {getEnergyUnitString(energyUnit)}
                </div>
              </div>
            </div>
          </div>

          {/* Energy Breakdown - Compact */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="space-y-1">
              <div className="flex items-center justify-center text-lg font-bold text-green-600">
                <Utensils className="w-4 h-4 mr-1" />
                {displayedDailyIntakeCalories}
              </div>
              <div className="text-xs text-gray-500">{t('exercise.dailyProgress.eaten', 'eaten')} {getEnergyUnitString(energyUnit)}</div>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center text-lg font-bold text-orange-600">
                      <Flame className="w-4 h-4 mr-1" />
                      {displayedTotalCaloriesBurned}
                    </div>
                    <div className="text-xs text-gray-500">{t('exercise.dailyProgress.burned', 'burned')} {getEnergyUnitString(energyUnit)}</div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white text-xs p-2 rounded-md">
                  <p>{t('exercise.dailyProgress.burnedEnergyBreakdown', 'Burned Energy Breakdown:')}</p>
                  {exerciseCalories > 0 && (
                    <p>{t('exercise.dailyProgress.otherExerciseCalories', 'Other Exercise: {{exerciseCalories}} {{energyUnit}}', { exerciseCalories: displayedExerciseCalories, energyUnit: getEnergyUnitString(energyUnit) })}</p>
                  )}
                  {activeCaloriesFromExercise > 0 && (
                    <p>{t('exercise.dailyProgress.activeCalories', 'Active Calories: {{activeCaloriesFromExercise}} {{energyUnit}}', { activeCaloriesFromExercise: displayedActiveCaloriesFromExercise, energyUnit: getEnergyUnitString(energyUnit) })}</p>
                  )}
                  {stepsCalories > 0 && activeCaloriesFromExercise === 0 && (
                    <p>{t('exercise.dailyProgress.stepsCalories', 'Steps: {{dailySteps}} = {{stepsCalories}} {{energyUnit}}', { dailySteps: dailySteps.toLocaleString(), stepsCalories: displayedStepsCalories, energyUnit: getEnergyUnitString(energyUnit) })}</p>
                  )}
                  {bmr && !isNaN(bmr) && (
                    <p>{t('exercise.dailyProgress.bmrCalories', 'BMR: {{bmr}} {{energyUnit}}', { bmr: displayedBmr, energyUnit: getEnergyUnitString(energyUnit) })}</p>
                  )}
                  <p>{t('exercise.dailyProgress.totalCaloriesBurned', 'Total: {{totalCaloriesBurned}} {{energyUnit}}', { totalCaloriesBurned: displayedTotalCaloriesBurned, energyUnit: getEnergyUnitString(energyUnit) })}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="space-y-1 ">
              <div className="flex items-center justify-center text-lg font-bold dark:text-slate-400 text-gray-900">
                <Flag className="w-4 h-4 mr-1" />
                {displayedDailyGoalCalories}
              </div>
              <div className="text-xs dark:text-slate-400 text-gray-500 ">
                {t('exercise.dailyProgress.goal', 'goal')} {getEnergyUnitString(energyUnit)}
              </div>
            </div>
          </div>

          {/* Energy Burned Breakdown - More compact */}
          {(exerciseCalories > 0 || stepsCalories > 0 || bmr) && (
            <div className="text-center p-2 bg-blue-50 rounded-lg space-y-1">
              <div className="text-sm font-medium text-blue-700">
                {t('exercise.dailyProgress.energyBurnedBreakdownTitle', 'Energy Burned Breakdown')}
              </div>
              {exerciseCalories > 0 && (
                <div className="text-xs text-blue-600">
                  {t('exercise.dailyProgress.otherExerciseCalories', 'Other Exercise: {{exerciseCalories}} {{energyUnit}}', { exerciseCalories: displayedExerciseCalories, energyUnit: getEnergyUnitString(energyUnit) })}
                </div>
              )}
              {activeCaloriesFromExercise > 0 && (
                <div className="text-xs text-blue-600">
                  {t('exercise.dailyProgress.activeCalories', 'Active Calories: {{activeCaloriesFromExercise}} {{energyUnit}}', { activeCaloriesFromExercise: displayedActiveCaloriesFromExercise, energyUnit: getEnergyUnitString(energyUnit) })}
                </div>
              )}
              {stepsCalories > 0 && activeCaloriesFromExercise === 0 && (
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3" />
                  {t('exercise.dailyProgress.stepsCalories', 'Steps: {{dailySteps}} = {{stepsCalories}} {{energyUnit}}', { dailySteps: dailySteps.toLocaleString(), stepsCalories: displayedStepsCalories, energyUnit: getEnergyUnitString(energyUnit) })}
                </div>
              )}
              {bmr && !isNaN(bmr) && (
                <div className="text-xs text-blue-600">
                  {t('exercise.dailyProgress.bmrCalories', 'BMR: {{bmr}} {{energyUnit}}', { bmr: displayedBmr, energyUnit: getEnergyUnitString(energyUnit) })}
                </div>
              )}
            </div>
          )}

          {/* Net Energy Display - Compact */}
          <div className="text-center p-2 dark:bg-slate-300 bg-gray-50 rounded-lg">
            <div className="text-sm font-medium dark:text-black text-gray-700 ">
              {t('exercise.dailyProgress.netEnergy', 'Net Energy: {{netCalories}}', { netCalories: displayedNetCalories, energyUnit: getEnergyUnitString(energyUnit) })}
            </div>
            <div className="text-xs dark:text-black text-gray-600">
              {displayedDailyIntakeCalories} eaten - {displayedFinalTotalCaloriesBurned}{" "}
              {t('exercise.dailyProgress.netEnergyBreakdown', '{{dailyIntakeCalories}} eaten - {{finalTotalCaloriesBurned}} burned', { dailyIntakeCalories: displayedDailyIntakeCalories, finalTotalCaloriesBurned: displayedFinalTotalCaloriesBurned, energyUnit: getEnergyUnitString(energyUnit) })}
            </div>
          </div>

          {/* Progress Bar - Compact */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{t('exercise.dailyProgress.dailyProgress', 'Daily Progress')}</span>
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
