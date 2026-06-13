import { useState, useEffect } from 'react';
import { BmrAlgorithm } from '@/services/bmrService';
import { BodyFatAlgorithm } from '@/services/bodyCompositionService';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Save,
  Flame,
  UtensilsCrossed,
  Target,
  Sparkles,
  Percent,
  TrendingDown,
  ShieldAlert,
  Info,
  ChevronDown,
  Calculator,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/PreferencesContext';
import { error as logError } from '@/utils/logging';
import { useTranslation } from 'react-i18next';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  VitaminCalculationAlgorithm,
  SugarCalculationAlgorithm,
  FatBreakdownAlgorithmLabels,
  MineralCalculationAlgorithmLabels,
  VitaminCalculationAlgorithmLabels,
  SugarCalculationAlgorithmLabels,
} from '@/types/nutrientAlgorithms';
import {
  useDiaryInvalidation,
  useDailyProgressInvalidation,
} from '@/hooks/useInvalidateKeys';
import { useAuth } from '@/hooks/useAuth';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import {
  useCalculatedBMR,
  useAdaptiveTdee,
  useMostRecentBodyFatQuery,
} from '@/hooks/Diary/useDailyProgress';
import { useDiaryGoals } from '@/hooks/Diary/useFoodEntries';
import {
  computeCalorieTarget,
  todayInZone,
  ACTIVITY_MULTIPLIERS,
  getGoalModeDeficit,
  GoalMode,
  GoalModeCalculationMethod,
  calculateBmr,
  calculateAge,
} from '@workspace/shared';

const CalculationSettings = () => {
  const { t } = useTranslation();
  const invalidateDiary = useDiaryInvalidation();
  const {
    energyUnit,
    setEnergyUnit,
    bmrAlgorithm: contextBmrAlgorithm,
    bodyFatAlgorithm: contextBodyFatAlgorithm,
    includeBmrInNetCalories: contextIncludeBmrInNetCalories,
    showNetCarbs: contextShowNetCarbs,
    fatBreakdownAlgorithm: contextFatBreakdownAlgorithm,
    mineralCalculationAlgorithm: contextMineralCalculationAlgorithm,
    vitaminCalculationAlgorithm: contextVitaminCalculationAlgorithm,
    sugarCalculationAlgorithm: contextSugarCalculationAlgorithm,
    saveAllPreferences,
    calorieGoalAdjustmentMode: contextCalorieGoalAdjustmentMode,
    exerciseCaloriePercentage: contextExerciseCaloriePercentage,
    tdeeAllowNegativeAdjustment: contextTdeeAllowNegativeAdjustment,
    activityLevel: contextActivityLevel,
    goalMode: contextGoalMode,
    goalModeCalculationMethod: contextGoalModeCalculationMethod,
    goalModeCustomPercentage: contextGoalModeCustomPercentage,
    weightUnit,
    timezone,
    convertWeight,
    convertEnergy,
    getEnergyUnitString,
    loggingLevel,
  } = usePreferences();

  const invalidateDailyProgress = useDailyProgressInvalidation();
  const [calorieGoalAdjustmentMode, setCalorieGoalAdjustmentMode] = useState<
    'dynamic' | 'fixed' | 'percentage' | 'tdee' | 'adaptive'
  >(contextCalorieGoalAdjustmentMode || 'dynamic');
  const [exerciseCaloriePercentage, setExerciseCaloriePercentage] =
    useState<number>(contextExerciseCaloriePercentage ?? 100);
  const [tdeeAllowNegativeAdjustment, setTdeeAllowNegativeAdjustment] =
    useState<boolean>(contextTdeeAllowNegativeAdjustment ?? false);
  const [activityLevel, setActivityLevel] = useState<
    'not_much' | 'light' | 'moderate' | 'heavy'
  >(contextActivityLevel || 'not_much');
  const [goalMode, setGoalMode] = useState<GoalMode>(
    contextGoalMode || 'maintain'
  );
  const [goalModeCalculationMethod, setGoalModeCalculationMethod] =
    useState<GoalModeCalculationMethod>(
      contextGoalModeCalculationMethod || 'manual'
    );
  const [goalModeCustomPercentage, setGoalModeCustomPercentage] =
    useState<number>(contextGoalModeCustomPercentage ?? 0);

  const [bmrAlgorithm, setBmrAlgorithm] = useState<BmrAlgorithm>(
    contextBmrAlgorithm || BmrAlgorithm.MIFFLIN_ST_JEOR
  );
  const [bodyFatAlgorithm, setBodyFatAlgorithm] = useState<BodyFatAlgorithm>(
    contextBodyFatAlgorithm || BodyFatAlgorithm.US_NAVY
  );
  const [includeBmrInNetCalories, setIncludeBmrInNetCalories] = useState(
    contextIncludeBmrInNetCalories || false
  );
  const [showNetCarbs, setShowNetCarbs] = useState(
    contextShowNetCarbs || false
  );
  const [fatBreakdownAlgorithm, setFatBreakdownAlgorithm] =
    useState<FatBreakdownAlgorithm>(
      contextFatBreakdownAlgorithm || FatBreakdownAlgorithm.AHA_GUIDELINES
    );
  const [mineralCalculationAlgorithm, setMineralCalculationAlgorithm] =
    useState<MineralCalculationAlgorithm>(
      contextMineralCalculationAlgorithm ||
        MineralCalculationAlgorithm.RDA_STANDARD
    );
  const [vitaminCalculationAlgorithm, setVitaminCalculationAlgorithm] =
    useState<VitaminCalculationAlgorithm>(
      contextVitaminCalculationAlgorithm ||
        VitaminCalculationAlgorithm.RDA_STANDARD
    );
  const [sugarCalculationAlgorithm, setSugarCalculationAlgorithm] =
    useState<SugarCalculationAlgorithm>(
      contextSugarCalculationAlgorithm ||
        SugarCalculationAlgorithm.WHO_GUIDELINES
    );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // When context preferences are loaded, update local state
    if (contextBmrAlgorithm) {
      setBmrAlgorithm(contextBmrAlgorithm);
    }
    if (contextBodyFatAlgorithm) {
      setBodyFatAlgorithm(contextBodyFatAlgorithm);
    }
    if (contextIncludeBmrInNetCalories !== undefined) {
      setIncludeBmrInNetCalories(contextIncludeBmrInNetCalories);
    }
    if (contextShowNetCarbs !== undefined) {
      setShowNetCarbs(contextShowNetCarbs);
    }
    if (contextFatBreakdownAlgorithm) {
      setFatBreakdownAlgorithm(contextFatBreakdownAlgorithm);
    }
    if (contextMineralCalculationAlgorithm) {
      setMineralCalculationAlgorithm(contextMineralCalculationAlgorithm);
    }
    if (contextVitaminCalculationAlgorithm) {
      setVitaminCalculationAlgorithm(contextVitaminCalculationAlgorithm);
    }
    if (contextSugarCalculationAlgorithm) {
      setSugarCalculationAlgorithm(contextSugarCalculationAlgorithm);
    }
    if (contextCalorieGoalAdjustmentMode) {
      setCalorieGoalAdjustmentMode(contextCalorieGoalAdjustmentMode);
    }
    if (contextExerciseCaloriePercentage !== undefined) {
      setExerciseCaloriePercentage(contextExerciseCaloriePercentage);
    }
    if (contextTdeeAllowNegativeAdjustment !== undefined) {
      setTdeeAllowNegativeAdjustment(contextTdeeAllowNegativeAdjustment);
    }
    if (contextActivityLevel) {
      setActivityLevel(contextActivityLevel);
    }
    if (contextGoalMode) {
      setGoalMode(contextGoalMode);
    }
    if (contextGoalModeCalculationMethod) {
      setGoalModeCalculationMethod(contextGoalModeCalculationMethod);
    }
    if (contextGoalModeCustomPercentage !== undefined) {
      setGoalModeCustomPercentage(contextGoalModeCustomPercentage);
    }
    // Since preferences are loaded by the PreferencesProvider at a higher level,
    // we can assume they are available by the time this component renders.
    // Set isLoading to false after initial render with context values.
    setIsLoading(false);
  }, [
    contextBmrAlgorithm,
    contextBodyFatAlgorithm,
    contextIncludeBmrInNetCalories,
    contextShowNetCarbs,
    contextFatBreakdownAlgorithm,
    contextMineralCalculationAlgorithm,
    contextVitaminCalculationAlgorithm,
    contextSugarCalculationAlgorithm,
    contextCalorieGoalAdjustmentMode,
    contextExerciseCaloriePercentage,
    contextTdeeAllowNegativeAdjustment,
    contextActivityLevel,
    contextGoalMode,
    contextGoalModeCalculationMethod,
    contextGoalModeCustomPercentage,
  ]);

  // Reset calculation method and custom percentage when Goal Mode is 'maintain' to avoid stale values
  useEffect(() => {
    if (goalMode === 'maintain') {
      setGoalModeCalculationMethod('manual');
      setGoalModeCustomPercentage(0);
    }
  }, [goalMode]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveAllPreferences({
        bmrAlgorithm,
        bodyFatAlgorithm,
        includeBmrInNetCalories,
        showNetCarbs,
        energyUnit, // Ensure energyUnit is included in saving
        fatBreakdownAlgorithm: fatBreakdownAlgorithm,
        mineralCalculationAlgorithm: mineralCalculationAlgorithm,
        vitaminCalculationAlgorithm: vitaminCalculationAlgorithm,
        sugarCalculationAlgorithm: sugarCalculationAlgorithm,
        calorieGoalAdjustmentMode: calorieGoalAdjustmentMode,
        exerciseCaloriePercentage: exerciseCaloriePercentage,
        tdeeAllowNegativeAdjustment: tdeeAllowNegativeAdjustment,
        activityLevel: activityLevel,
        goalMode: goalMode,
        goalModeCalculationMethod: goalModeCalculationMethod,
        goalModeCustomPercentage: goalModeCustomPercentage,
      });
      invalidateDiary();
      invalidateDailyProgress();
      toast({
        title: t('calculationSettings.saveSuccess', 'Success'),
        description: t(
          'calculationSettings.saveSuccessDesc',
          'Calculation settings saved successfully!'
        ),
      });
    } catch (error) {
      logError(loggingLevel, 'Failed to save user preferences:', error);
      toast({
        title: t('calculationSettings.saveError', 'Error'),
        description: t(
          'calculationSettings.saveErrorDesc',
          'Failed to save calculation settings.'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnergyUnitChange = async (unit: 'kcal' | 'kJ') => {
    try {
      setEnergyUnit(unit);
      toast({
        title: t('calculationSettings.energyUnitSaveSuccess', 'Success'),
        description: t(
          'calculationSettings.energyUnitSaveSuccessDesc',
          'Energy unit updated successfully.'
        ),
      });
    } catch (error) {
      logError(loggingLevel, 'Failed to update energy unit:', error);
      toast({
        title: t('calculationSettings.energyUnitSaveError', 'Error'),
        description: t(
          'calculationSettings.energyUnitSaveErrorDesc',
          'Failed to update energy unit.'
        ),
        variant: 'destructive',
      });
    }
  };

  // Live Preview Math
  const { bmr, weight: weightKg, height: heightCm } = useCalculatedBMR();
  const todayStr = todayInZone(timezone || 'UTC');
  const { data: adaptiveTdeeData } = useAdaptiveTdee(todayStr);
  const { data: goalsData } = useDiaryGoals(todayStr, false);

  const { user } = useAuth();
  const { data: userProfile } = useProfileQuery(user?.id);
  const { data: bodyFatData } = useMostRecentBodyFatQuery();

  const bodyFat = bodyFatData?.body_fat_percentage;
  const gender = (userProfile?.gender || 'male') as 'male' | 'female';
  const age = userProfile?.date_of_birth
    ? calculateAge(userProfile.date_of_birth, timezone)
    : 30;

  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel] || 1.2;
  const rawManualGoal = goalsData?.calories ?? 2000;
  const currentGoalBase =
    goalModeCalculationMethod === 'manual'
      ? rawManualGoal
      : Math.round(bmr > 0 ? bmr * activityMultiplier : 2000);

  const previewResult = computeCalorieTarget({
    goalMode,
    calculationMethod: goalModeCalculationMethod,
    customPercentage: goalModeCustomPercentage,
    bmr,
    activityLevelMultiplier: activityMultiplier,
    adaptiveTdee: adaptiveTdeeData ? adaptiveTdeeData.tdee : null,
    adaptiveTdeeFallback: adaptiveTdeeData ? adaptiveTdeeData.isFallback : true,
    adaptiveTdeeDaysOfData: adaptiveTdeeData
      ? (adaptiveTdeeData.daysOfData ?? 0)
      : 0,
    weightKg: weightKg || 70,
    heightCm: heightCm || 170,
    age,
    gender,
    bodyFatPercentage: bodyFat,
    bmrAlgorithm,
    currentGoalCalories: currentGoalBase,
    calculateBmrFn: calculateBmr,
  });

  const formatProjectedLoss = (kgVal: number) => {
    if (weightUnit === 'lbs') {
      const lbsVal = convertWeight(kgVal, 'kg', 'lbs');
      return `${lbsVal.toFixed(1)} lbs`;
    }
    if (weightUnit === 'st_lbs') {
      const lbsVal = convertWeight(kgVal, 'kg', 'lbs');
      const stones = Math.floor(lbsVal / 14);
      const lbs = (lbsVal % 14).toFixed(1);
      return stones > 0 ? `${stones} st ${lbs} lbs` : `${lbs} lbs`;
    }
    return `${kgVal.toFixed(2)} kg`;
  };

  if (isLoading) {
    return <div>{t('common.loading', 'Loading...')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="bmr-algorithm">
            {t('calculationSettings.bmrAlgorithm', 'BMR Algorithm')}
          </Label>
          <Select
            value={bmrAlgorithm}
            onValueChange={(value: BmrAlgorithm) => setBmrAlgorithm(value)}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t(
                  'calculationSettings.selectBmrAlgorithm',
                  'Select BMR Algorithm'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {Object.values(BmrAlgorithm).map((alg) => (
                <SelectItem key={alg} value={alg}>
                  {alg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              'calculationSettings.bmrAlgorithmHint',
              'Select the formula used to calculate your Basal Metabolic Rate.'
            )}
          </p>
        </div>

        <div>
          <Label htmlFor="bodyfat-algorithm">
            {t('calculationSettings.bodyFatAlgorithm', 'Body Fat Algorithm')}
          </Label>
          <Select
            value={bodyFatAlgorithm}
            onValueChange={(value: BodyFatAlgorithm) =>
              setBodyFatAlgorithm(value)
            }
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t(
                  'calculationSettings.selectBodyFatAlgorithm',
                  'Select Body Fat Algorithm'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {Object.values(BodyFatAlgorithm).map((alg) => (
                <SelectItem key={alg} value={alg}>
                  {alg}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              'calculationSettings.bodyFatAlgorithmHint',
              'Select the formula used to estimate body fat percentage from measurements.'
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="include-bmr"
          checked={includeBmrInNetCalories}
          onCheckedChange={(checked) =>
            setIncludeBmrInNetCalories(Boolean(checked))
          }
        />
        <div className="grid gap-1.5 leading-none">
          <Label
            htmlFor="include-bmr"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            {t(
              'calculationSettings.includeBmrInNetCalories',
              'Include BMR in Net Calories'
            )}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t(
              'calculationSettings.includeBmrInNetCaloriesHint',
              'When enabled, your BMR will be subtracted from your daily net calorie total.'
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="show-net-carbs"
          checked={showNetCarbs}
          onCheckedChange={(checked) => setShowNetCarbs(Boolean(checked))}
        />
        <div className="grid gap-1.5 leading-none">
          <Label
            htmlFor="show-net-carbs"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            {t(
              'calculationSettings.showNetCarbs',
              'Show net carbs (carbs minus fiber)'
            )}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t(
              'calculationSettings.showNetCarbsHint',
              'When enabled, carbohydrate summaries display total carbs minus dietary fiber.'
            )}
          </p>
        </div>
      </div>

      {/* Energy Unit Toggle */}
      <div className="grid gap-2">
        <Label htmlFor="energy-unit">
          {t('calculationSettings.energyUnitLabel', 'Energy Unit')}
        </Label>
        <Select value={energyUnit} onValueChange={handleEnergyUnitChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue
              placeholder={t(
                'calculationSettings.selectEnergyUnitPlaceholder',
                'Select energy unit'
              )}
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="kcal">
              kcal ({t('calculationSettings.calories', 'Calories')})
            </SelectItem>
            <SelectItem value="kJ">
              kJ ({t('calculationSettings.joules', 'Joules')})
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {t(
            'calculationSettings.energyUnitHint',
            'Choose your preferred unit for displaying energy values (e.g., calories, kilojoules).'
          )}
        </p>
      </div>

      {/* Calorie Goal Adjustment mode */}
      <div className="pt-4 border-t">
        <Label className="text-base font-semibold mb-2 block">
          {t(
            'settings.calorieGoalAdjustment.title',
            'Daily Calorie Goal Adjustment'
          )}
        </Label>
        <RadioGroup
          value={calorieGoalAdjustmentMode}
          onValueChange={(
            value: 'dynamic' | 'fixed' | 'percentage' | 'tdee' | 'adaptive'
          ) => setCalorieGoalAdjustmentMode(value)}
          className="flex flex-col space-y-2 mb-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="adaptive" id="adaptive-goal" />
            <Label htmlFor="adaptive-goal" className="cursor-pointer">
              <span className="font-medium">
                {t(
                  'settings.calorieGoalAdjustment.adaptiveGoal',
                  'Adaptive TDEE'
                )}
                :
              </span>{' '}
              {t(
                'settings.calorieGoalAdjustment.adaptiveGoalDescription',
                "The 'Gold Standard'. SparkyFitness calculates your TDEE by correlating your actual weight changes with your calorie intake over the last 35 days. It 'learns' your unique metabolism."
              )}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dynamic" id="dynamic-goal" />
            <Label htmlFor="dynamic-goal" className="cursor-pointer">
              <span className="font-medium">
                {t(
                  'settings.calorieGoalAdjustment.dynamicGoal',
                  'Dynamic Goal'
                )}
                :
              </span>{' '}
              {t(
                'settings.calorieGoalAdjustment.dynamicGoalDescription',
                'Your calorie goal will dynamically adjust based on your daily activity level (e.g., exercise, steps). This is ideal for active individuals or those whose activity levels vary daily.'
              )}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="fixed" id="fixed-goal" />
            <Label htmlFor="fixed-goal" className="cursor-pointer">
              <span className="font-medium">
                {t('settings.calorieGoalAdjustment.fixedGoal', 'Fixed Goal')}:
              </span>{' '}
              {t(
                'settings.calorieGoalAdjustment.fixedGoalDescription',
                'Your calorie goal will remain fixed, regardless of your daily activity. This is suitable for individuals with consistent activity levels or those who prefer a stable target.'
              )}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="percentage" id="percentage-goal" />
            <Label htmlFor="percentage-goal" className="cursor-pointer">
              <span className="font-medium">
                {t(
                  'settings.calorieGoalAdjustment.percentageGoal',
                  'Percentage Earn-Back'
                )}
                :
              </span>{' '}
              {t(
                'settings.calorieGoalAdjustment.percentageGoalDescription',
                'Only earn back a set percentage of your exercise calories. For example, 50% creates a safety buffer to avoid overeating from over-estimated burns.'
              )}
            </Label>
          </div>
          {calorieGoalAdjustmentMode === 'percentage' && (
            <div className="ml-6 flex items-center gap-3">
              <Percent className="w-4 h-4 text-muted-foreground" />
              <Label
                htmlFor="exercise-calorie-percentage"
                className="text-sm whitespace-nowrap"
              >
                {t(
                  'settings.calorieGoalAdjustment.percentageLabel',
                  'Earn-back percentage:'
                )}
              </Label>
              <Input
                id="exercise-calorie-percentage"
                type="number"
                min={0}
                max={100}
                value={exerciseCaloriePercentage}
                onChange={(e) => {
                  const val = Math.min(
                    100,
                    Math.max(0, Number(e.target.value))
                  );
                  setExerciseCaloriePercentage(val);
                }}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="tdee" id="tdee-goal" />
            <Label htmlFor="tdee-goal" className="cursor-pointer">
              <span className="font-medium">
                {t(
                  'settings.calorieGoalAdjustment.tdeeGoal',
                  'Device Projection'
                )}
                :
              </span>{' '}
              {t(
                'settings.calorieGoalAdjustment.tdeeGoalDescription',
                'Like MyFitnessPal with Apple Watch. SparkyFitness projects your full-day burn by extrapolating your current device data to midnight. The adjustment = projection − TDEE.'
              )}
            </Label>
          </div>
          {(calorieGoalAdjustmentMode === 'tdee' ||
            calorieGoalAdjustmentMode === 'adaptive') && (
            <div className="ml-6 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Label
                  htmlFor="activity-level"
                  className="text-sm whitespace-nowrap"
                >
                  {t(
                    'settings.calorieGoalAdjustment.activityLevel',
                    'Activity level:'
                  )}
                </Label>
                <Select
                  value={activityLevel}
                  onValueChange={(
                    value: 'not_much' | 'light' | 'moderate' | 'heavy'
                  ) => setActivityLevel(value)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_much">
                      {t(
                        'settings.calorieGoalAdjustment.activityNotMuch',
                        'Sedentary (×1.2)'
                      )}
                    </SelectItem>
                    <SelectItem value="light">
                      {t(
                        'settings.calorieGoalAdjustment.activityLight',
                        'Lightly active (×1.375)'
                      )}
                    </SelectItem>
                    <SelectItem value="moderate">
                      {t(
                        'settings.calorieGoalAdjustment.activityModerate',
                        'Moderately active (×1.55)'
                      )}
                    </SelectItem>
                    <SelectItem value="heavy">
                      {t(
                        'settings.calorieGoalAdjustment.activityHeavy',
                        'Very active (×1.725)'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {calorieGoalAdjustmentMode === 'adaptive' && (
                <p className="text-[10px] text-muted-foreground italic mt-[-4px]">
                  💡{' '}
                  {t(
                    'settings.calorieGoalAdjustment.adaptiveActivityHint',
                    'In Adaptive mode, this setting acts as a fallback until you have enough tracking data.'
                  )}
                </p>
              )}
              {calorieGoalAdjustmentMode === 'tdee' && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="tdee-allow-negative"
                    checked={tdeeAllowNegativeAdjustment}
                    onCheckedChange={(checked) =>
                      setTdeeAllowNegativeAdjustment(Boolean(checked))
                    }
                  />
                  <Label
                    htmlFor="tdee-allow-negative"
                    className="text-sm cursor-pointer"
                  >
                    {t(
                      'settings.calorieGoalAdjustment.allowNegativeAdjustment',
                      'Allow negative adjustment (penalise for burning less than TDEE)'
                    )}
                  </Label>
                </div>
              )}
            </div>
          )}
        </RadioGroup>

        {/* Dynamic Calculation Explanation Box */}
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200 font-semibold">
            <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>
              {t(
                'settings.calculationExplanation.title',
                'How your calories will be calculated'
              )}
            </span>
          </div>

          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 bg-orange-100 dark:bg-orange-900/40 rounded-lg">
                <Flame className="w-4 h-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {t(
                    'settings.calculationExplanation.burnedTitle',
                    'Burned Calories'
                  )}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  {includeBmrInNetCalories
                    ? t(
                        'settings.calculationExplanation.burnedBmr',
                        'Activity + BMR (Your base metabolism)'
                      )
                    : t(
                        'settings.calculationExplanation.burnedActivity',
                        'Activity (Exercise & Steps only)'
                      )}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 bg-green-100 dark:bg-green-900/40 rounded-lg">
                <UtensilsCrossed className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {t('settings.calculationExplanation.netTitle', 'Net Energy')}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  {t(
                    'settings.calculationExplanation.netFormula',
                    'Eaten - Total Burned'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-0.5 p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                <Target className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {t(
                    'settings.calculationExplanation.remainingTitle',
                    'Remaining Calories'
                  )}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  {calorieGoalAdjustmentMode === 'dynamic'
                    ? t(
                        'settings.calculationExplanation.remainingDynamic',
                        'Daily Goal - Net Energy (Your goal grows as you move)'
                      )
                    : calorieGoalAdjustmentMode === 'percentage'
                      ? t(
                          'settings.calculationExplanation.remainingPercentage',
                          'Daily Goal - (Eaten - {{pct}}% of Exercise Burned)',
                          { pct: exerciseCaloriePercentage }
                        )
                      : calorieGoalAdjustmentMode === 'tdee'
                        ? t(
                            'settings.calculationExplanation.remainingTdee',
                            'Daily Goal − Eaten + (Projected Full Day − TDEE)'
                          )
                        : calorieGoalAdjustmentMode === 'adaptive'
                          ? t(
                              'settings.calculationExplanation.remainingAdaptive',
                              'Daily Goal - Eaten (Goal is your adjusted Adaptive TDEE)'
                            )
                          : t(
                              'settings.calculationExplanation.remainingFixed',
                              'Daily Goal - Eaten (Activity does not change your budget)'
                            )}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2 text-xs text-blue-700/70 dark:text-blue-300/60 italic border-t border-blue-100 dark:border-blue-800">
            {calorieGoalAdjustmentMode === 'dynamic'
              ? t(
                  'settings.calculationExplanation.dynamicFootnote',
                  '* Ideal for fueling workouts and active recovery.'
                )
              : calorieGoalAdjustmentMode === 'percentage'
                ? t(
                    'settings.calculationExplanation.percentageFootnote',
                    '* Creates a safety buffer to avoid overeating from over-estimated calorie burns.'
                  )
                : calorieGoalAdjustmentMode === 'tdee'
                  ? t(
                      'settings.calculationExplanation.tdeeFootnote',
                      '* Projection converges with actual at midnight. Requires BMR to be calculable and a device syncing steps or active calories.'
                    )
                  : calorieGoalAdjustmentMode === 'adaptive'
                    ? t(
                        'settings.calculationExplanation.adaptiveFootnote',
                        '* Dynamically adjusts your Daily Goal based on your actual metabolism. Needs consistent food and weight tracking for high accuracy.'
                      )
                    : t(
                        'settings.calculationExplanation.fixedFootnote',
                        '* Ideal for strict caloric deficits and weight management.'
                      )}
          </div>
        </div>
      </div>

      {/* Goal Mode Selection Section */}
      <div className="pt-4 border-t">
        <Label className="text-base font-semibold mb-1 block">
          {t('settings.goalMode.title', 'Goal Mode')}
        </Label>
        <p className="text-sm text-muted-foreground mb-4">
          {t(
            'settings.goalMode.subtitle',
            'Adjust your daily calorie target based on your body composition goal.'
          )}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <Label htmlFor="goal-mode-select">
              {t('settings.goalMode.goalModeLabel', 'Goal Mode')}
            </Label>
            <Select
              value={goalMode}
              onValueChange={(value: GoalMode) => {
                setGoalMode(value);
              }}
            >
              <SelectTrigger id="goal-mode-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maintain">
                  {t('settings.goalMode.modeMaintain', 'Maintain (0%)')}
                </SelectItem>
                <SelectItem value="recomp">
                  {t(
                    'settings.goalMode.modeRecomp',
                    'Body Recomposition (-10%)'
                  )}
                </SelectItem>
                <SelectItem value="cut">
                  {t('settings.goalMode.modeCut', 'Cut (-15%)')}
                </SelectItem>
                <SelectItem value="high_cut">
                  {t('settings.goalMode.modeHighCut', 'High Cut (-20%)')}
                </SelectItem>
                <SelectItem value="manual">
                  {t('settings.goalMode.modeManual', 'Manual (Custom %)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="calculation-method-select">
              {t(
                'settings.goalMode.calculationMethodLabel',
                'Calculation Method'
              )}
            </Label>
            <Select
              value={goalModeCalculationMethod}
              onValueChange={(value: GoalModeCalculationMethod) =>
                setGoalModeCalculationMethod(value)
              }
              disabled={goalMode === 'maintain'}
            >
              <SelectTrigger
                id="calculation-method-select"
                className={goalMode === 'maintain' ? 'opacity-50' : ''}
                disabled={goalMode === 'maintain'}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adaptive">
                  {t('settings.goalMode.methodAdaptive', 'Adaptive')}
                </SelectItem>
                <SelectItem value="manual">
                  {t('settings.goalMode.methodManual', 'Manual')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Custom Percentage Input (visible only for Manual mode) */}
        {goalMode === 'manual' && (
          <div className="mb-4 flex items-center gap-3">
            <Percent className="w-4 h-4 text-muted-foreground" />
            <Label htmlFor="goal-mode-custom-percentage" className="text-sm">
              {t(
                'settings.goalMode.customPercentageLabel',
                'Custom deficit percentage:'
              )}
            </Label>
            <Input
              id="goal-mode-custom-percentage"
              type="number"
              min={0}
              max={40}
              value={goalModeCustomPercentage}
              onChange={(e) => {
                const val = Math.min(40, Math.max(0, Number(e.target.value)));
                setGoalModeCustomPercentage(val);
              }}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        )}

        {/* Live Preview & Diagnostics Callouts */}
        <div className="space-y-3">
          {/* Live Preview Panel */}
          <div className="p-4 bg-muted/30 dark:bg-muted/5 border border-border rounded-xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('settings.goalMode.livePreview', 'Live Preview Calculation')}
            </p>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Estimated TDEE:</span>{' '}
                <span className="font-semibold">
                  {Math.round(
                    convertEnergy(
                      previewResult.baselineTdee,
                      'kcal',
                      energyUnit
                    )
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </span>
              </div>
              <div className="hidden md:block text-muted-foreground">→</div>
              <div>
                <span className="text-muted-foreground">Applied Deficit:</span>{' '}
                <span className="font-semibold text-red-600 dark:text-red-400">
                  -
                  {Math.round(
                    convertEnergy(
                      previewResult.appliedDeficit,
                      'kcal',
                      energyUnit
                    )
                  )}{' '}
                  {getEnergyUnitString(energyUnit)} (
                  {Math.round(
                    getGoalModeDeficit(goalMode, goalModeCustomPercentage) * 100
                  )}
                  %)
                </span>
              </div>
              <div className="hidden md:block text-muted-foreground">→</div>
              <div>
                <span className="text-muted-foreground">
                  Daily Calorie Target:
                </span>{' '}
                <span className="font-bold text-base text-primary">
                  {Math.round(
                    convertEnergy(previewResult.finalTarget, 'kcal', energyUnit)
                  )}{' '}
                  {getEnergyUnitString(energyUnit)}
                </span>
              </div>
            </div>

            {/* Projected Weekly Loss Rate */}
            {goalMode !== 'maintain' && (
              <div className="pt-2 border-t border-border/40 text-xs flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">
                    Projected weekly loss:
                  </span>
                  <span className="font-semibold">
                    ~{formatProjectedLoss(previewResult.projectedWeeklyLossKg)}
                  </span>
                  <span className="text-muted-foreground">/ week</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">Rate:</span>
                  <span
                    className={`font-semibold px-2 py-0.5 rounded-full text-[10px] ${
                      previewResult.lossSafetyZone === 'green'
                        ? 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300'
                        : previewResult.lossSafetyZone === 'yellow'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                    }`}
                  >
                    {previewResult.projectedWeeklyLossPercent.toFixed(2)}% of
                    body weight / week
                  </span>
                </div>
              </div>
            )}

            {/* Detailed Calculation Breakdown */}
            <div className="pt-3 border-t border-border/40 space-y-2.5">
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-muted-foreground/80" />
                    <span>How your target is calculated</span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180 text-muted-foreground/60" />
                </summary>

                <div className="mt-3 space-y-3 pl-1 text-[11px] text-muted-foreground/90 leading-relaxed border-l border-border/60 ml-1.5">
                  {/* Step 1: BMR/RMR Calculation */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-medium text-foreground/85">
                      <span>1. Basal Metabolic Rate (BMR)</span>
                      <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px]">
                        {bmrAlgorithm}
                      </span>
                    </div>
                    <p className="text-muted-foreground/70">
                      {bmrAlgorithm === 'Katch-McArdle' ? (
                        bodyFat && bodyFat > 0 ? (
                          <>
                            Formula: 370 + 21.6 × LBM (where LBM = weight × (1 -
                            BF/100))
                            <br />
                            Math: 370 + 21.6 × ({(weightKg || 70).toFixed(1)} kg
                            × (1 - {bodyFat.toFixed(1)}/100))
                          </>
                        ) : (
                          <span className="text-amber-500 font-medium">
                            Katch-McArdle requires body fat percentage. Enter
                            body fat or select another algorithm.
                          </span>
                        )
                      ) : bmrAlgorithm === 'Cunningham' ? (
                        bodyFat && bodyFat > 0 ? (
                          <>
                            Formula: 500 + 22 × LBM (where LBM = weight × (1 -
                            BF/100))
                            <br />
                            Math: 500 + 22 × ({(weightKg || 70).toFixed(1)} kg ×
                            (1 - {bodyFat.toFixed(1)}/100))
                          </>
                        ) : (
                          <span className="text-amber-500 font-medium">
                            Cunningham requires body fat percentage. Enter body
                            fat or select another algorithm.
                          </span>
                        )
                      ) : bmrAlgorithm === 'Revised Harris-Benedict' ? (
                        gender === 'male' ? (
                          <>
                            Formula: 13.397 × weight + 4.799 × height - 5.677 ×
                            age + 88.362
                            <br />
                            Math: 13.397 × {(weightKg || 70).toFixed(1)} + 4.799
                            × {(heightCm || 170).toFixed(1)} - 5.677 × {age} +
                            88.362
                          </>
                        ) : (
                          <>
                            Formula: 9.247 × weight + 3.098 × height - 4.33 ×
                            age + 447.593
                            <br />
                            Math: 9.247 × {(weightKg || 70).toFixed(1)} + 3.098
                            × {(heightCm || 170).toFixed(1)} - 4.33 × {age} +
                            447.593
                          </>
                        )
                      ) : bmrAlgorithm === 'Oxford' ? (
                        gender === 'male' ? (
                          <>
                            Formula: 14.2 × weight + 593
                            <br />
                            Math: 14.2 × {(weightKg || 70).toFixed(1)} + 593
                          </>
                        ) : (
                          <>
                            Formula: 10.9 × weight + 677
                            <br />
                            Math: 10.9 × {(weightKg || 70).toFixed(1)} + 677
                          </>
                        )
                      ) : (
                        <>
                          Formula (Mifflin-St Jeor): 10 × weight (kg) + 6.25 ×
                          height (cm) - 5 × age + offset (
                          {gender === 'male' ? '+5' : '-161'})
                          <br />
                          Math: 10 × {(weightKg || 70).toFixed(1)} + 6.25 ×{' '}
                          {(heightCm || 170).toFixed(1)} - 5 × {age}{' '}
                          {gender === 'male' ? '+ 5' : '- 161'}
                        </>
                      )}
                    </p>
                    <div className="flex justify-between items-center bg-muted/20 dark:bg-muted/10 p-1.5 rounded mt-1">
                      <span>Resting Metabolism (RMR/BMR):</span>
                      <span className="font-semibold text-foreground">
                        {Math.round(
                          convertEnergy(previewResult.rmr, 'kcal', energyUnit)
                        )}{' '}
                        {getEnergyUnitString(energyUnit)}
                      </span>
                    </div>
                  </div>

                  {/* Step 2: Baseline TDEE */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-medium text-foreground/85">
                      <span>2. Baseline TDEE</span>
                      <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px] capitalize">
                        {goalModeCalculationMethod} Method
                      </span>
                    </div>
                    <div className="text-muted-foreground/70">
                      {goalModeCalculationMethod === 'adaptive' ? (
                        previewResult.insufficientHistory ? (
                          <>
                            Insufficient history (&lt;14 days). Using fallback
                            estimate:
                            <br />
                            Math: BMR (
                            {Math.round(
                              convertEnergy(
                                previewResult.rmr,
                                'kcal',
                                energyUnit
                              )
                            )}{' '}
                            {getEnergyUnitString(energyUnit)}) × activity
                            multiplier ({activityMultiplier.toFixed(3)})
                          </>
                        ) : (
                          <>
                            Based on your calculated Adaptive TDEE (metabolism
                            trend over past 14+ days).
                          </>
                        )
                      ) : (
                        <>
                          Based on your manually configured Daily Calorie Goal.
                        </>
                      )}
                    </div>
                    <div className="flex justify-between items-center bg-muted/20 dark:bg-muted/10 p-1.5 rounded mt-1">
                      <span>Baseline Burn (TDEE):</span>
                      <span className="font-semibold text-foreground">
                        {Math.round(
                          convertEnergy(
                            previewResult.baselineTdee,
                            'kcal',
                            energyUnit
                          )
                        )}{' '}
                        {getEnergyUnitString(energyUnit)}
                      </span>
                    </div>
                  </div>

                  {/* Step 3: Deficit */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-medium text-foreground/85">
                      <span>3. Applied Deficit</span>
                      <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px] capitalize">
                        {goalMode} Deficit
                      </span>
                    </div>
                    <p className="text-muted-foreground/70">
                      Math:{' '}
                      {Math.round(
                        convertEnergy(
                          previewResult.baselineTdee,
                          'kcal',
                          energyUnit
                        )
                      )}{' '}
                      {getEnergyUnitString(energyUnit)} TDEE ×{' '}
                      {Math.round(
                        getGoalModeDeficit(goalMode, goalModeCustomPercentage) *
                          100
                      )}
                      % Deficit
                    </p>
                    <div className="flex justify-between items-center bg-muted/20 dark:bg-muted/10 p-1.5 rounded mt-1 text-red-600 dark:text-red-400">
                      <span>Deficit Amount:</span>
                      <span className="font-semibold">
                        -
                        {Math.round(
                          convertEnergy(
                            previewResult.appliedDeficit,
                            'kcal',
                            energyUnit
                          )
                        )}{' '}
                        {getEnergyUnitString(energyUnit)}
                      </span>
                    </div>
                  </div>

                  {/* Step 4: Safety Floors */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-medium text-foreground/85">
                      <span>4. Safety Floors Check</span>
                      <span className="px-1.5 py-0.5 bg-muted dark:bg-muted/10 rounded text-[10px]">
                        Safety Caps
                      </span>
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground/70">
                      <li>
                        RMR Floor:{' '}
                        {Math.round(
                          convertEnergy(previewResult.rmr, 'kcal', energyUnit)
                        )}{' '}
                        {getEnergyUnitString(energyUnit)}
                      </li>
                      <li>
                        Clinical Absolute Floor (for biological {gender}):{' '}
                        {Math.round(
                          convertEnergy(
                            previewResult.absoluteFloorValue,
                            'kcal',
                            energyUnit
                          )
                        )}{' '}
                        {getEnergyUnitString(energyUnit)}
                      </li>
                      <li>
                        Effective Safety Floor:{' '}
                        {Math.round(
                          convertEnergy(
                            Math.max(
                              previewResult.rmr,
                              previewResult.absoluteFloorValue
                            ),
                            'kcal',
                            energyUnit
                          )
                        )}{' '}
                        {getEnergyUnitString(energyUnit)}
                      </li>
                    </ul>
                    <div className="flex justify-between items-center bg-muted/20 dark:bg-muted/10 p-1.5 rounded mt-1">
                      <span>Safety Floor Outcome:</span>
                      <span className="font-semibold text-foreground">
                        {goalModeCalculationMethod === 'adaptive' ? (
                          previewResult.target <
                          Math.max(
                            previewResult.rmr,
                            previewResult.absoluteFloorValue
                          ) ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              Target raised to Safety Floor
                            </span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              Target remains above Safety Floor
                            </span>
                          )
                        ) : previewResult.target <
                          Math.max(
                            previewResult.rmr,
                            previewResult.absoluteFloorValue
                          ) ? (
                          <span className="text-red-500 font-semibold">
                            Below safety limits (Warning triggers)
                          </span>
                        ) : (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            Target remains above Safety Floor
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </div>

          {/* Coaching Tip */}
          {goalMode !== 'maintain' && (
            <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/15 border border-emerald-100 dark:border-emerald-900/50 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold text-sm">
                <TrendingDown className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Coaching Recommendations</span>
              </div>
              <p className="text-xs text-emerald-700 dark:text-emerald-400/90 leading-relaxed">
                {goalMode === 'recomp' &&
                  'Perfect for building muscle while burning body fat. Aim for 1.6–2.2g of protein per kg of body weight daily, and keep a consistent resistance training program.'}
                {goalMode === 'cut' &&
                  'Ideal deficit for steady fat loss while preserving lean mass. Focus on a high protein intake (2.0–2.4g/kg of body weight) and monitor energy and recovery levels.'}
                {goalMode === 'high_cut' &&
                  'Aggressive deficit for fast fat loss. To prevent muscle loss, consume 2.2–2.5g of protein per kg of body weight, prioritize sleep, and consider returning to maintenance every 6–8 weeks.'}
                {goalMode === 'manual' &&
                  'Custom deficit. Deficits of 10–20% are generally recommended. Ensure your protein targets are adjusted upwards to safe-guard lean muscle tissue.'}
              </p>
            </div>
          )}

          {/* Warning callouts */}
          {goalMode !== 'maintain' &&
            goalModeCalculationMethod === 'manual' &&
            previewResult.isBelowRmr &&
            !previewResult.isBelowAbsoluteFloor && (
              <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl flex gap-3 text-sm text-amber-800 dark:text-amber-300">
                <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    Safety Alert: Calorie target below minimum metabolism
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400/80 leading-relaxed">
                    Your calorie target is below your estimated minimum
                    metabolism (RMR). This may not be sustainable long-term.
                    Consider selecting a less aggressive Goal Mode or switching
                    to the Adaptive method.
                  </p>
                </div>
              </div>
            )}

          {/* Absolute Floor Danger Callout */}
          {goalMode !== 'maintain' &&
            goalModeCalculationMethod === 'manual' &&
            previewResult.isBelowAbsoluteFloor && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl flex gap-3 text-sm text-red-800 dark:text-red-300">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    Critical Health Alert: Calorie target below absolute floor
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400/80 leading-relaxed">
                    Your calorie target is below the clinical absolute safety
                    floor of{' '}
                    {energyUnit === 'kcal'
                      ? `${previewResult.absoluteFloorValue} kcal`
                      : `${Math.round(convertEnergy(previewResult.absoluteFloorValue, 'kcal', 'kJ'))} kJ`}
                    /day. Deficits below this level are generally not
                    recommended without direct medical supervision.
                  </p>
                </div>
              </div>
            )}

          {/* Extreme weight loss rate callout */}
          {goalMode !== 'maintain' &&
            previewResult.lossSafetyZone === 'red' && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl flex gap-3 text-sm text-red-800 dark:text-red-300">
                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Unsafe Weight Loss Rate</p>
                  <p className="text-xs text-red-700 dark:text-red-400/80 leading-relaxed">
                    Losing more than 1.5% of body weight per week is considered
                    excessive. This rate dramatically increases risks of severe
                    muscle loss, lethargy, hormonal imbalances, and nutritional
                    deficiencies. Please choose a less aggressive goal mode.
                  </p>
                </div>
              </div>
            )}

          {/* Adaptive History Info Banner */}
          {goalMode !== 'maintain' &&
            goalModeCalculationMethod === 'adaptive' &&
            previewResult.insufficientHistory && (
              <div className="p-4 bg-blue-50/50 dark:bg-blue-950/15 border border-blue-100 dark:border-blue-900/50 rounded-xl flex gap-3 text-sm text-blue-800 dark:text-blue-300">
                <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-xs">
                    Awaiting Adaptive TDEE Calibration
                  </p>
                  <p className="text-xs text-blue-700/90 dark:text-blue-400/80 leading-relaxed">
                    Sparky's Adaptive TDEE engine requires at least 14 days of
                    consistent tracking to calculate your metabolism accurately
                    (currently using fallback estimates). To speed up
                    calibration:
                  </p>
                  <ul className="list-disc pl-4 text-xs text-blue-700/80 dark:text-blue-400/70 space-y-0.5 mt-1">
                    <li>Log weight at least 3-4 times per week.</li>
                    <li>Log food intake daily (&gt;200 kcal/day).</li>
                  </ul>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Nutrient Calculation Algorithms */}
      <div className="border-t pt-4 mt-4">
        <h3 className="text-lg font-semibold mb-4">
          Nutrient Calculation Algorithms
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fat-breakdown-algorithm">
              Fat Breakdown Algorithm
            </Label>
            <Select
              value={fatBreakdownAlgorithm}
              onValueChange={(value: FatBreakdownAlgorithm) =>
                setFatBreakdownAlgorithm(value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Fat Breakdown Algorithm" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(FatBreakdownAlgorithm).map((alg) => (
                  <SelectItem key={alg} value={alg}>
                    {FatBreakdownAlgorithmLabels[alg]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              How to distribute dietary fat into saturated, poly, mono, and
              trans fats.
            </p>
          </div>

          <div>
            <Label htmlFor="mineral-calculation-algorithm">
              Mineral Calculation Algorithm
            </Label>
            <Select
              value={mineralCalculationAlgorithm}
              onValueChange={(value: MineralCalculationAlgorithm) =>
                setMineralCalculationAlgorithm(value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Mineral Algorithm" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(MineralCalculationAlgorithm).map((alg) => (
                  <SelectItem key={alg} value={alg}>
                    {MineralCalculationAlgorithmLabels[alg]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Algorithm for calculating sodium, potassium, calcium, iron, and
              cholesterol targets.
            </p>
          </div>

          <div>
            <Label htmlFor="vitamin-calculation-algorithm">
              Vitamin Calculation Algorithm
            </Label>
            <Select
              value={vitaminCalculationAlgorithm}
              onValueChange={(value: VitaminCalculationAlgorithm) =>
                setVitaminCalculationAlgorithm(value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Vitamin Algorithm" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(VitaminCalculationAlgorithm).map((alg) => (
                  <SelectItem key={alg} value={alg}>
                    {VitaminCalculationAlgorithmLabels[alg]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Algorithm for calculating Vitamin A and C targets.
            </p>
          </div>

          <div>
            <Label htmlFor="sugar-calculation-algorithm">
              Sugar Calculation Algorithm
            </Label>
            <Select
              value={sugarCalculationAlgorithm}
              onValueChange={(value: SugarCalculationAlgorithm) =>
                setSugarCalculationAlgorithm(value)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Sugar Algorithm" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(SugarCalculationAlgorithm).map((alg) => (
                  <SelectItem key={alg} value={alg}>
                    {SugarCalculationAlgorithmLabels[alg]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              Maximum sugar intake as a percentage of total calories.
            </p>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isSaving}>
        <Save className="h-4 w-4 mr-2" />
        {isSaving
          ? t('common.saving', 'Saving...')
          : t('common.savePreferences', 'Save Preferences')}
      </Button>
    </div>
  );
};

export default CalculationSettings;
