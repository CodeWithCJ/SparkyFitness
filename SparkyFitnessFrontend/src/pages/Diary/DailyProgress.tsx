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
import { computeExerciseCredited } from '@/utils/calorieCalculations';

import {
  useDailyExerciseStats,
  useDailySteps,
  useAdaptiveTdee,
  useDailySummary,
} from '@/hooks/Diary/useDailyProgress';
import { DailyProgressSkeleton } from './DailyProgressSkeleton';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { formatWeight } from '@/utils/numberFormatting';
import { EnergyCircle } from './EnergyProgressCircle';

const DailyProgress = ({ selectedDate }: { selectedDate: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    loggingLevel,
    calorieGoalAdjustmentMode,
    energyUnit,
    convertEnergy,
    weightUnit,
    bmrAlgorithm,
  } = usePreferences();

  const isLeanMassBmr =
    bmrAlgorithm === 'Katch-McArdle' || bmrAlgorithm === 'Cunningham';

  const { data: adaptiveTdeeData, isLoading: loadingAdaptiveTdee } =
    useAdaptiveTdee(selectedDate);

  const { data: exerciseData, isLoading: loadingExercise } =
    useDailyExerciseStats(selectedDate);
  const { data: stepsData, isLoading: loadingSteps } =
    useDailySteps(selectedDate);
  const {
    data: summaryData,
    isLoading: loadingSummary,
    isError: summaryError,
  } = useDailySummary(selectedDate);

  const isLoading =
    loadingExercise ||
    loadingSteps ||
    loadingSummary ||
    (calorieGoalAdjustmentMode === 'adaptive' && loadingAdaptiveTdee);

  if (isLoading) {
    return <DailyProgressSkeleton />;
  }

  if (summaryError || !summaryData?.calorieBalance) {
    return (
      <Card className="h-full">
        <CardContent className="pt-6 pb-4">
          <Alert variant="destructive" className="bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-800 font-bold mb-1">
              {t(
                'exercise.dailyProgress.summaryUnavailableTitle',
                'Daily summary unavailable'
              )}
            </AlertTitle>
            <AlertDescription className="text-red-700 text-xs leading-relaxed">
              {t(
                'exercise.dailyProgress.summaryUnavailableDesc',
                'Could not load your daily energy summary. Try refreshing the page.'
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Server-computed totals are the source of truth for the headline numbers
  // (goal, remaining, eaten, burned, net, progress, bmr). This keeps web in
  // sync with the mobile app and the daily-summary API, which scope BMR
  // inputs to the selected date and use timezone-aware age.
  const calorieBalance = summaryData.calorieBalance;
  const bmr = calorieBalance.bmr;
  const bmrSource = calorieBalance.bmrSource ?? 'formula';
  const exerciseSource = calorieBalance.exerciseSource;
  const tdeeProjection = calorieBalance.tdeeProjection;

  const goalCalories = calorieBalance.goal;
  const eatenCalories = calorieBalance.eaten;

  const otherExerciseCalories = exerciseData?.otherCalories || 0;
  const activeCaloriesFromExercise = exerciseData?.activeCalories || 0;
  const dailySteps = stepsData?.steps || 0;
  const activitySteps = exerciseData?.activitySteps || 0;
  const backgroundSteps = Math.max(0, dailySteps - activitySteps);
  const stepCalories = summaryData.stepCalories || 0;

  const totalCaloriesBurned = calorieBalance.burned;
  const netCalories = calorieBalance.net;

  const projectedBurn = tdeeProjection?.projectedBurn ?? 0;
  const sparkyfitnessBurned = tdeeProjection?.baselineBurn ?? 0;
  const tdeeAdjustment = tdeeProjection?.adjustment ?? 0;

  const caloriesRemaining = calorieBalance.remaining;
  const calorieProgress = calorieBalance.progress;
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
    steps: Math.round(convertEnergy(stepCalories, 'kcal', energyUnit)),
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

                  {exerciseSource === 'logged' && (
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

                  {exerciseSource === 'active' && (
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

                  {exerciseSource === 'steps' && (
                    <p>
                      {t(
                        'exercise.dailyProgress.stepsCalories',
                        'Steps: {{dailySteps}} = {{stepsCalories}} {{energyUnit}}',
                        {
                          dailySteps: backgroundSteps.toLocaleString(),
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
                      {bmrSource === 'external' &&
                        ` (${t('exercise.dailyProgress.bmrSourceExternal', 'from Health App')})`}
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
          {(exerciseSource !== 'none' || bmr) && (
            <div className="text-center p-2 bg-blue-50 rounded-lg space-y-1">
              <div className="text-sm font-medium text-blue-700">
                {t(
                  'exercise.dailyProgress.energyBurnedBreakdownTitle',
                  'Energy Burned Breakdown'
                )}
              </div>

              {exerciseSource === 'logged' && (
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

              {exerciseSource === 'active' && (
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

              {exerciseSource === 'steps' && (
                <div className="text-xs text-blue-600 flex items-center justify-center gap-1">
                  <Zap className="w-3 h-3" />
                  {t(
                    'exercise.dailyProgress.stepsCalories',
                    'Steps: {{dailySteps}} = {{stepsCalories}} {{energyUnit}}',
                    {
                      dailySteps: backgroundSteps.toLocaleString(),
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
                  {bmrSource === 'external' &&
                    ` (${t('exercise.dailyProgress.bmrSourceExternal', 'from Health App')})`}
                </div>
              )}
            </div>
          )}

          {/* Profile Setup Warning Alert (Visible if BMR is 0) */}
          {bmr === 0 && (
            <Alert variant="destructive" className="bg-red-50 border-red-200">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800 font-bold mb-1">
                {t(
                  'exercise.dailyProgress.profileIncompleteTitle',
                  'Profile Incomplete'
                )}
              </AlertTitle>
              <AlertDescription className="text-red-700 text-xs leading-relaxed flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-y-1 sm:gap-x-1">
                <span>
                  {isLeanMassBmr
                    ? t(
                        'exercise.dailyProgress.katchCunninghamMissingDesc',
                        'Weight and Body Fat Percentage are missing. Calorie goals may be inaccurate.'
                      )
                    : t(
                        'exercise.dailyProgress.profileIncompleteDesc',
                        'Weight, Height, and Age are missing. Calorie goals may be inaccurate.'
                      )}
                </span>
                <Button
                  variant="link"
                  size="sm"
                  className="p-0 h-auto text-red-800 font-bold underline decoration-2 underline-offset-2 whitespace-normal text-left justify-start"
                  onClick={() =>
                    isLeanMassBmr
                      ? navigate('/checkin')
                      : navigate('/settings?section=profile-information')
                  }
                >
                  {isLeanMassBmr
                    ? t(
                        'exercise.dailyProgress.enterMeasurements',
                        'Enter Measurements'
                      )
                    : t(
                        'exercise.dailyProgress.updateProfile',
                        'Update Profile'
                      )}
                </Button>
              </AlertDescription>
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
                      ? formatWeight(adaptiveTdeeData.weightTrend, weightUnit)
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

              <div className="pt-1 border-t border-green-200 dark:border-slate-600 flex justify-between items-center">
                <span className="text-[10px] text-gray-500 dark:text-slate-400">
                  {t('exercise.dailyProgress.expenditure', 'Expenditure')}
                </span>
                <span className="text-[11px] font-bold text-green-700 dark:text-green-400">
                  {Math.round(
                    convertEnergy(adaptiveTdeeData.tdee, 'kcal', energyUnit)
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </span>
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

          {calorieGoalAdjustmentMode === 'tdee' && tdeeProjection ? (
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
