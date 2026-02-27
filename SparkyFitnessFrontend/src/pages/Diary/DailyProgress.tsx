import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, Zap, Utensils, Flame, Flag, Activity } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { usePreferences } from '@/contexts/PreferencesContext';
import { debug } from '@/utils/logging';

import {
  useDailyGoals,
  useDailyFoodIntake,
  useDailyExerciseStats,
  useDailySteps,
  useCalculatedBMR,
} from '@/hooks/Diary/useDailyProgress';
import { DailyProgressSkeleton } from './DailyProgressSkeleton';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { EnergyCircle } from './EnergyProgressCircle';

const DailyProgress = ({ selectedDate }: { selectedDate: string }) => {
  const { t } = useTranslation();
  const {
    loggingLevel,
    calorieGoalAdjustmentMode,
    exerciseCaloriePercentage,
    tdeeAllowNegativeAdjustment,
    activityLevel,
    energyUnit,
    convertEnergy,
  } = usePreferences();

  const ACTIVITY_MULTIPLIERS: Record<string, number> = {
    not_much: 1.2,
    light: 1.375,
    moderate: 1.55,
    heavy: 1.725,
  };

  const { data: goals, isLoading: loadingGoals } = useDailyGoals(selectedDate);
  const { data: foodData, isLoading: loadingFood } =
    useDailyFoodIntake(selectedDate);
  const { data: exerciseData, isLoading: loadingExercise } =
    useDailyExerciseStats(selectedDate);
  const { data: stepsData, isLoading: loadingSteps } =
    useDailySteps(selectedDate);
  const { bmr, includeInNet } = useCalculatedBMR();

  const isLoading =
    loadingGoals || loadingFood || loadingExercise || loadingSteps;

  if (isLoading) {
    return <DailyProgressSkeleton />;
  }
  const goalCalories = goals?.calories || 2000;
  const eatenCalories = foodData?.totals.calories || 0;

  const otherExerciseCalories = exerciseData?.otherCalories || 0;
  const activeCaloriesFromExercise = exerciseData?.activeCalories || 0;
  const stepsCalories = stepsData?.calories || 0;
  const dailySteps = stepsData?.steps || 0;

  let activeOrStepsCaloriesToAdd = 0;
  if (activeCaloriesFromExercise > 0) {
    activeOrStepsCaloriesToAdd = activeCaloriesFromExercise;
  } else {
    activeOrStepsCaloriesToAdd = stepsCalories;
  }

  const bmrCalories = includeInNet && bmr ? bmr : 0;

  const exerciseCaloriesBurned =
    otherExerciseCalories + activeOrStepsCaloriesToAdd;
  const totalCaloriesBurned = exerciseCaloriesBurned + bmrCalories;

  const netCalories = eatenCalories - totalCaloriesBurned;

  // For TDEE mode:
  // "SparkyFitness Burned" = TDEE (BMR × activity multiplier) — same every day, profile-based
  // (mirrors MFP's own burned number which is BMR scaled by activity level using METs).
  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel] ?? 1.2;
  const sparkyfitnessBurned = Math.round((bmr || 0) * activityMultiplier);

  // Project current device burn rate to end of day (mirrors MFP + Apple Watch behaviour).
  // We extrapolate based on how much of the day has elapsed.
  // Below 5% of the day (~72 min) we don't inflate the projection — just use current data.
  const now = new Date();
  const minutesSinceMidnight = now.getHours() * 60 + now.getMinutes();
  const dayFraction = minutesSinceMidnight / (24 * 60);
  const MIN_PROJECTION_FRACTION = 0.05;
  const projectedDeviceCalories =
    dayFraction >= MIN_PROJECTION_FRACTION && exerciseCaloriesBurned > 0
      ? Math.round(exerciseCaloriesBurned / dayFraction)
      : exerciseCaloriesBurned;
  const projectedBurn = (bmr || 0) + projectedDeviceCalories;

  // Adjustment = projected full-day burn minus the SparkyFitness baseline (TDEE).
  // Positive = device projects more activity than expected; negative = less active day.
  const rawTdeeAdjustment = projectedBurn - sparkyfitnessBurned;
  const tdeeAdjustment = tdeeAllowNegativeAdjustment
    ? rawTdeeAdjustment
    : Math.max(0, rawTdeeAdjustment);

  let caloriesRemaining = 0;
  if (calorieGoalAdjustmentMode === 'tdee') {
    // MFP-style: TDEE is fixed expected burn, adjustment = actual - TDEE
    caloriesRemaining = goalCalories - eatenCalories + tdeeAdjustment;
  } else if (calorieGoalAdjustmentMode === 'dynamic') {
    // 100% of all burned calories credited
    caloriesRemaining = goalCalories - netCalories;
  } else if (calorieGoalAdjustmentMode === 'percentage') {
    // Only earn back a percentage of exercise calories; BMR unchanged
    const adjustedExerciseBurned =
      exerciseCaloriesBurned * (exerciseCaloriePercentage / 100);
    const adjustedTotalBurned = adjustedExerciseBurned + bmrCalories;
    caloriesRemaining = goalCalories - (eatenCalories - adjustedTotalBurned);
  } else {
    // fixed: no exercise calories credited
    caloriesRemaining = goalCalories - eatenCalories;
  }

  // effectiveConsumed represents how much of the goal is "used up"
  const effectiveConsumed = goalCalories - caloriesRemaining;
  const calorieProgress = Math.max(0, (effectiveConsumed / goalCalories) * 100);

  // Calories credited back from exercise (MFP-style: how much exercise adds to your budget)
  const exerciseCredited = Math.max(
    0,
    caloriesRemaining - (goalCalories - eatenCalories)
  );

  // --- Display Conversion (to kJ or kcal) ---
  const display = {
    remaining: Math.round(convertEnergy(caloriesRemaining, 'kcal', energyUnit)),
    eaten: Math.round(convertEnergy(eatenCalories, 'kcal', energyUnit)),
    burnedTotal: Math.round(
      convertEnergy(totalCaloriesBurned, 'kcal', energyUnit)
    ),
    goal: Math.round(convertEnergy(goalCalories, 'kcal', energyUnit)),
    exerciseOther: Math.round(
      convertEnergy(otherExerciseCalories, 'kcal', energyUnit)
    ),
    exerciseActive: Math.round(
      convertEnergy(activeCaloriesFromExercise, 'kcal', energyUnit)
    ),
    steps: Math.round(convertEnergy(stepsCalories, 'kcal', energyUnit)),
    bmr: bmr ? Math.round(convertEnergy(bmr, 'kcal', energyUnit)) : 0,
    net: Math.round(convertEnergy(netCalories, 'kcal', energyUnit)),
    exerciseCredited: Math.round(
      convertEnergy(exerciseCredited, 'kcal', energyUnit)
    ),
    projectedBurn: Math.round(convertEnergy(projectedBurn, 'kcal', energyUnit)),
    sparkyfitnessBurned: Math.round(
      convertEnergy(sparkyfitnessBurned, 'kcal', energyUnit)
    ),
    tdeeAdjustment: Math.round(
      convertEnergy(tdeeAdjustment, 'kcal', energyUnit)
    ),
  };

  debug(loggingLevel, 'DailyProgress: Calculated values', {
    date: selectedDate,
    raw: { eatenCalories, totalCaloriesBurned, netCalories },
    display,
  });

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center space-x-2 text-base">
          <Target className="w-4 h-4 text-green-500" />
          <span className="dark:text-slate-300">
            {t('exercise.dailyProgress.dailyEnergyGoal', 'Daily Energy Goal')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-4">
          {/* Energy Circle */}
          <EnergyCircle
            remaining={display.remaining}
            progress={calorieProgress}
            unit={energyUnit}
          />
          {/* Energy Breakdown */}
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {/* Eaten */}
            <div className="space-y-1">
              <div className="flex items-center justify-center text-lg font-bold text-green-600">
                <Utensils className="w-4 h-4 mr-1" />
                {display.eaten}
              </div>
              <div className="text-xs text-gray-500">
                {t('exercise.dailyProgress.eaten', 'eaten')}{' '}
                {getEnergyUnitString(energyUnit)}
              </div>
            </div>

            {/* Burned (with Tooltip) */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="space-y-1 cursor-help">
                    <div className="flex items-center justify-center text-lg font-bold text-orange-600">
                      <Flame className="w-4 h-4 mr-1" />
                      {display.burnedTotal}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t('exercise.dailyProgress.burned', 'burned')}{' '}
                      {getEnergyUnitString(energyUnit)}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-black text-white text-xs p-2 rounded-md">
                  <p>
                    {t(
                      'exercise.dailyProgress.burnedEnergyBreakdown',
                      'Burned Energy Breakdown:'
                    )}
                  </p>

                  {otherExerciseCalories > 0 && (
                    <p>
                      {t(
                        'exercise.dailyProgress.otherExerciseCalories',
                        'Other Exercise: {{exerciseCalories}} {{energyUnit}}',
                        {
                          exerciseCalories: display.exerciseOther,
                          energyUnit: getEnergyUnitString(energyUnit),
                        }
                      )}
                    </p>
                  )}

                  {activeCaloriesFromExercise > 0 && (
                    <p>
                      {t(
                        'exercise.dailyProgress.activeCalories',
                        'Active Calories: {{activeCaloriesFromExercise}} {{energyUnit}}',
                        {
                          activeCaloriesFromExercise: display.exerciseActive,
                          energyUnit: getEnergyUnitString(energyUnit),
                        }
                      )}
                    </p>
                  )}

                  {stepsCalories > 0 && activeCaloriesFromExercise === 0 && (
                    <p>
                      {t(
                        'exercise.dailyProgress.stepsCalories',
                        'Steps: {{dailySteps}} = {{stepsCalories}} {{energyUnit}}',
                        {
                          dailySteps: dailySteps.toLocaleString(),
                          stepsCalories: display.steps,
                          energyUnit: getEnergyUnitString(energyUnit),
                        }
                      )}
                    </p>
                  )}

                  {bmr && (
                    <p>
                      {t(
                        'exercise.dailyProgress.bmrCalories',
                        'BMR: {{bmr}} {{energyUnit}}',
                        {
                          bmr: display.bmr,
                          energyUnit: getEnergyUnitString(energyUnit),
                        }
                      )}
                    </p>
                  )}

                  <p>
                    {t(
                      'exercise.dailyProgress.totalCaloriesBurned',
                      'Total: {{totalCaloriesBurned}} {{energyUnit}}',
                      {
                        totalCaloriesBurned: display.burnedTotal,
                        energyUnit: getEnergyUnitString(energyUnit),
                      }
                    )}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Goal */}
            <div className="space-y-1">
              <div className="flex items-center justify-center text-lg font-bold dark:text-slate-400 text-gray-900">
                <Flag className="w-4 h-4 mr-1" />
                {display.goal}
              </div>
              <div className="text-xs dark:text-slate-400 text-gray-500">
                {t('exercise.dailyProgress.goal', 'goal')}{' '}
                {getEnergyUnitString(energyUnit)}
              </div>
            </div>
          </div>

          {/* Detailed Burned Breakdown (Visible if data present) */}
          {(otherExerciseCalories > 0 || stepsCalories > 0 || bmr) && (
            <div className="text-center p-2 bg-blue-50 rounded-lg space-y-1">
              <div className="text-sm font-medium text-blue-700">
                {t(
                  'exercise.dailyProgress.energyBurnedBreakdownTitle',
                  'Energy Burned Breakdown'
                )}
              </div>

              {otherExerciseCalories > 0 && (
                <div className="text-xs text-blue-600">
                  {t(
                    'exercise.dailyProgress.otherExerciseCalories',
                    'Other Exercise: {{exerciseCalories}} {{energyUnit}}',
                    {
                      exerciseCalories: display.exerciseOther,
                      energyUnit: getEnergyUnitString(energyUnit),
                    }
                  )}
                </div>
              )}

              {activeCaloriesFromExercise > 0 && (
                <div className="text-xs text-blue-600">
                  {t(
                    'exercise.dailyProgress.activeCalories',
                    'Active Calories: {{activeCaloriesFromExercise}} {{energyUnit}}',
                    {
                      activeCaloriesFromExercise: display.exerciseActive,
                      energyUnit: getEnergyUnitString(energyUnit),
                    }
                  )}
                </div>
              )}

              {stepsCalories > 0 && activeCaloriesFromExercise === 0 && (
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3" />
                  {t(
                    'exercise.dailyProgress.stepsCalories',
                    'Steps: {{dailySteps}} = {{stepsCalories}} {{energyUnit}}',
                    {
                      dailySteps: dailySteps.toLocaleString(),
                      stepsCalories: display.steps,
                      energyUnit: getEnergyUnitString(energyUnit),
                    }
                  )}
                </div>
              )}

              {bmr && (
                <div className="text-xs text-blue-600">
                  {t(
                    'exercise.dailyProgress.bmrCalories',
                    'BMR: {{bmr}} {{energyUnit}}',
                    {
                      bmr: display.bmr,
                      energyUnit: getEnergyUnitString(energyUnit),
                    }
                  )}
                </div>
              )}
            </div>
          )}

          {/* Formula Bar */}
          {calorieGoalAdjustmentMode === 'tdee' ? (
            /* TDEE mode: MFP-style Expected / Actual / Adjustment */
            <div className="p-3 bg-orange-50 dark:bg-slate-700 rounded-lg space-y-1">
              <div className="flex items-center gap-1 mb-2">
                <Activity className="w-3 h-3 text-orange-400 shrink-0" />
                <span className="text-xs font-medium text-orange-600 dark:text-orange-400">
                  {t('exercise.dailyProgress.dailyBurn', 'Daily Burn')}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 dark:text-slate-400">
                  {t(
                    'exercise.dailyProgress.projectedBurn',
                    'Projected (Full Day)'
                  )}
                </span>
                <span className="font-semibold text-gray-800 dark:text-slate-200">
                  {display.projectedBurn} {getEnergyUnitString(energyUnit)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500 dark:text-slate-400">
                  {t(
                    'exercise.dailyProgress.sparkyfitnessBurned',
                    'SparkyFitness Burned'
                  )}
                </span>
                <span className="font-semibold text-orange-600">
                  {display.sparkyfitnessBurned}{' '}
                  {getEnergyUnitString(energyUnit)}
                </span>
              </div>
              <div className="border-t border-orange-200 dark:border-slate-600 pt-1 flex justify-between text-xs">
                <span className="text-gray-500 dark:text-slate-400">
                  {t('exercise.dailyProgress.adjustment', 'Adjustment')}
                </span>
                <span
                  className={`font-bold ${
                    tdeeAdjustment >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {tdeeAdjustment >= 0 ? '+' : ''}
                  {display.tdeeAdjustment} {getEnergyUnitString(energyUnit)}
                </span>
              </div>
            </div>
          ) : (
            /* Dynamic / Fixed / Percentage modes: original Net Energy box */
            <div className="text-center p-2 dark:bg-slate-300 bg-gray-50 rounded-lg">
              <div className="text-sm font-medium dark:text-black text-gray-700">
                {t(
                  'exercise.dailyProgress.netEnergy',
                  'Net Energy: {{netCalories}}',
                  {
                    netCalories: display.net,
                    energyUnit: getEnergyUnitString(energyUnit),
                  }
                )}
              </div>
              <div className="text-xs dark:text-black text-gray-600">
                {t(
                  'exercise.dailyProgress.netEnergyBreakdown',
                  '{{dailyIntakeCalories}} eaten - {{finalTotalCaloriesBurned}} burned',
                  {
                    dailyIntakeCalories: display.eaten,
                    finalTotalCaloriesBurned: display.burnedTotal,
                    energyUnit: getEnergyUnitString(energyUnit),
                  }
                )}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>
                {t('exercise.dailyProgress.dailyProgress', 'Daily Progress')}
              </span>
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
