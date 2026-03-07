import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Target,
  Zap,
  Utensils,
  Flame,
  Flag,
  Activity,
  Info,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { usePreferences } from '@/contexts/PreferencesContext';
import { debug } from '@/utils/logging';
import {
  resolveActiveOrStepsCalories,
  computeSparkyfitnessBurned,
  computeProjectedBurn,
  computeTdeeAdjustment,
  computeCaloriesRemaining,
  computeExerciseCredited,
  computeCalorieProgress,
} from '@/utils/calorieCalculations';

import {
  useDailyFoodIntake,
  useDailyExerciseStats,
  useDailySteps,
  useCalculatedBMR,
  useAdaptiveTdee,
} from '@/hooks/Diary/useDailyProgress';
import { DailyProgressSkeleton } from './DailyProgressSkeleton';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { EnergyCircle } from './EnergyProgressCircle';
import { useDailyGoals } from '@/hooks/Goals/useGoals';

const DailyProgress = ({ selectedDate }: { selectedDate: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    loggingLevel,
    calorieGoalAdjustmentMode,
    exerciseCaloriePercentage,
    tdeeAllowNegativeAdjustment,
    activityLevel,
    energyUnit,
    convertEnergy,
    weightUnit,
    convertWeight,
  } = usePreferences();

  const { bmr, includeInNet } = useCalculatedBMR();
  const { data: adaptiveTdeeData, isLoading: loadingAdaptiveTdee } =
    useAdaptiveTdee(selectedDate);

  const { data: goals, isLoading: loadingGoals } = useDailyGoals(selectedDate);
  const { data: foodData, isLoading: loadingFood } =
    useDailyFoodIntake(selectedDate);
  const { data: exerciseData, isLoading: loadingExercise } =
    useDailyExerciseStats(selectedDate);
  const { data: stepsData, isLoading: loadingSteps } =
    useDailySteps(selectedDate);

  const isLoading =
    loadingGoals ||
    loadingFood ||
    loadingExercise ||
    loadingSteps ||
    (calorieGoalAdjustmentMode === 'adaptive' && loadingAdaptiveTdee);

  if (isLoading) {
    return <DailyProgressSkeleton />;
  }
  const rawGoalCalories = goals?.calories || 2000;

  // Calculate the user's intended deficit/surplus from their manual goal vs predicted maintenance.
  // This allows us to apply the same intention to the adaptive TDEE.
  const sparkyfitnessBurned = computeSparkyfitnessBurned(
    bmr || 0,
    activityLevel
  );
  // Only calculate offset if BMR is available, otherwise fallback to 0.
  const calorieGoalOffset = bmr > 0 ? rawGoalCalories - sparkyfitnessBurned : 0;

  // If adaptive mode is on, we use the adaptive TDEE as the baseline and apply the offset.
  // We apply a 1200 kcal "Safety Floor" to ensure the goal never drops to dangerous levels.
  const goalCalories =
    calorieGoalAdjustmentMode === 'adaptive' && adaptiveTdeeData && bmr > 0
      ? Math.max(1200, Math.round(adaptiveTdeeData.tdee + calorieGoalOffset))
      : rawGoalCalories;

  const eatenCalories = foodData?.totals.calories || 0;

  const otherExerciseCalories = exerciseData?.otherCalories || 0;
  const activeCaloriesFromExercise = exerciseData?.activeCalories || 0;
  const stepsCalories = stepsData?.calories || 0;
  const dailySteps = stepsData?.steps || 0;

  const activeOrStepsCaloriesToAdd = resolveActiveOrStepsCalories(
    activeCaloriesFromExercise,
    stepsCalories
  );

  const bmrCalories = includeInNet && bmr ? bmr : 0;

  const exerciseCaloriesBurned =
    otherExerciseCalories + activeOrStepsCaloriesToAdd;
  const totalCaloriesBurned = exerciseCaloriesBurned + bmrCalories;

  const netCalories = eatenCalories - totalCaloriesBurned;

  const projectedBurn = computeProjectedBurn(bmr || 0, exerciseCaloriesBurned);
  const tdeeAdjustment = computeTdeeAdjustment(
    projectedBurn,
    sparkyfitnessBurned,
    tdeeAllowNegativeAdjustment
  );

  const caloriesRemaining = computeCaloriesRemaining({
    mode: calorieGoalAdjustmentMode,
    goalCalories,
    eatenCalories,
    netCalories,
    exerciseCaloriesBurned,
    bmrCalories,
    exerciseCaloriePercentage,
    tdeeAdjustment,
    adaptiveTdee: adaptiveTdeeData?.tdee,
  });

  const calorieProgress = computeCalorieProgress(
    goalCalories,
    caloriesRemaining
  );
  const exerciseCredited = computeExerciseCredited(
    caloriesRemaining,
    goalCalories,
    eatenCalories
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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2 text-base">
            <Target className="w-4 h-4 text-green-500" />
            <span className="dark:text-slate-300">
              {t('exercise.dailyProgress.dailyEnergyGoal', 'Daily Energy Goal')}
            </span>
          </CardTitle>
        </div>
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

          {/* Profile Setup Warning Alert (Visible if BMR is 0) */}
          {bmr === 0 && (
            <Alert variant="destructive" className="bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <div className="flex flex-col">
                <AlertTitle className="text-red-800 font-bold mb-1">
                  {t(
                    'exercise.dailyProgress.profileIncompleteTitle',
                    'Profile Incomplete'
                  )}
                </AlertTitle>
                <AlertDescription className="text-red-700 text-xs leading-relaxed">
                  {t(
                    'exercise.dailyProgress.profileIncompleteDesc',
                    'Weight, Height, and Age are missing. Calorie goals may be inaccurate.'
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-red-800 font-bold ml-1 underline decoration-2 underline-offset-2"
                    onClick={() => navigate('/settings')}
                  >
                    {t(
                      'exercise.dailyProgress.updateProfile',
                      'Update Profile'
                    )}
                  </Button>
                </AlertDescription>
              </div>
            </Alert>
          )}

          {/* Formula Bar */}
          {calorieGoalAdjustmentMode === 'adaptive' && adaptiveTdeeData && (
            <div className="p-3 bg-green-50 dark:bg-slate-700 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Activity className="w-3 h-3 text-green-500 shrink-0" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">
                    {t('exercise.dailyProgress.adaptiveTdee', 'Adaptive TDEE')}
                  </span>
                </div>
                <div
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    adaptiveTdeeData.confidence === 'HIGH'
                      ? 'bg-green-200 text-green-800'
                      : adaptiveTdeeData.confidence === 'MEDIUM'
                        ? 'bg-yellow-200 text-yellow-800'
                        : 'bg-red-200 text-red-800'
                  }`}
                >
                  {t(
                    `exercise.dailyProgress.confidence.${adaptiveTdeeData.confidence.toLowerCase()}`,
                    adaptiveTdeeData.confidence
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex flex-col">
                  <span className="text-gray-500 dark:text-slate-400">
                    {t('exercise.dailyProgress.weightTrend', 'Weight Trend')}
                  </span>
                  <span className="font-semibold text-gray-800 dark:text-slate-200">
                    {adaptiveTdeeData.weightTrend
                      ? `${convertWeight(adaptiveTdeeData.weightTrend, 'kg', weightUnit).toFixed(1)} ${t(`units.${weightUnit}`, weightUnit)}`
                      : t('common.calculating', 'Calculating...')}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-gray-500 dark:text-slate-400">
                    {t('exercise.dailyProgress.dataPoints', 'Data Points')}
                  </span>
                  <span className="font-semibold text-gray-800 dark:text-slate-200">
                    {adaptiveTdeeData.daysOfData || 0}{' '}
                    {t('exercise.dailyProgress.days', 'days')}
                  </span>
                </div>
              </div>

              {adaptiveTdeeData.isFallback && (
                <div className="flex items-start gap-1 mt-1 p-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded border border-yellow-200 dark:border-yellow-800">
                  <Info className="w-3 h-3 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                  <span className="text-[10px] text-yellow-700 dark:text-yellow-300">
                    {t(
                      'exercise.dailyProgress.fallbackReason',
                      'Using estimation: {{reason}}',
                      { reason: adaptiveTdeeData.fallbackReason }
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

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
