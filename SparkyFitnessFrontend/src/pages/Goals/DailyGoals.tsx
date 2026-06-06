import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/NumericInput';
import MealPercentageManager from '@/components/MealPercentageManager';
import { Separator } from '@/components/ui/separator';

import { NUTRIENT_CONFIG } from '@/constants/goals';
import { NutrientInput } from './NutrientInput';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTranslation } from 'react-i18next';
import { useSaveGoalsMutation } from '@/hooks/Goals/useGoals';
import { useAuth } from '@/hooks/useAuth';
import { useCallback, useMemo, useState } from 'react';
import { ExpandedGoals } from '@/types/goals';
import { WaterAndExerciseFields } from './WaterAndExerciseFields';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { buildGoalsPayload, getMealPercentage } from '@/utils/goals';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const calculateGrams = (
  calories: number,
  percentage: number,
  nutrient: 'protein' | 'carbs' | 'fat'
) => {
  const factor = nutrient === 'fat' ? 9 : 4;
  return Math.round((calories * (percentage / 100)) / factor);
};

interface DailyGoalsProps {
  goals: ExpandedGoals;
  setGoals: React.Dispatch<React.SetStateAction<ExpandedGoals>>;
  visibleNutrients: string[];
  today: string;
}

export const DailyGoals = ({
  goals,
  setGoals,
  visibleNutrients,
  today,
}: DailyGoalsProps) => {
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: customNutrients } = useCustomNutrients();
  const { data: mealTypes = [] } = useMealTypes();

  const [macroInputType, setMacroInputType] = useState<'grams' | 'percentages'>(
    goals.protein_percentage !== null ? 'percentages' : 'grams'
  );

  const visibleMeals = useMemo(
    () => mealTypes.filter((m) => m.is_visible),
    [mealTypes]
  );

  const memoizedGoalsPercentages = useMemo(() => {
    const percentages: Record<string, number> = {};
    visibleMeals.forEach((meal) => {
      percentages[meal.name.toLowerCase()] = getMealPercentage(
        meal.name,
        goals
      );
    });
    return percentages;
  }, [goals, visibleMeals]);

  const currentMacroTotal = useMemo(() => {
    if (macroInputType === 'grams') return 100;
    return (
      (goals.protein_percentage || 0) +
      (goals.carbs_percentage || 0) +
      (goals.fat_percentage || 0)
    );
  }, [goals, macroInputType]);

  const isMacroValid = Math.round(currentMacroTotal) === 100;

  const { mutateAsync: saveGoalsService, isPending: saving } =
    useSaveGoalsMutation();

  const handleSaveGoals = async () => {
    if (!user) return;
    const finalGoals = { ...goals };
    if (macroInputType === 'percentages') {
      const cal = finalGoals.calories;
      finalGoals.protein = Math.round(
        (cal * (finalGoals.protein_percentage || 0)) / 100 / 4
      );
      finalGoals.carbs = Math.round(
        (cal * (finalGoals.carbs_percentage || 0)) / 100 / 4
      );
      finalGoals.fat = Math.round(
        (cal * (finalGoals.fat_percentage || 0)) / 100 / 9
      );
    } else {
      finalGoals.protein_percentage = null;
      finalGoals.carbs_percentage = null;
      finalGoals.fat_percentage = null;
    }
    await saveGoalsService({ date: today, goals: finalGoals, cascade: true });
  };

  const handleGoalsPercentagesChange = useCallback(
    (newPercentages: Record<string, number>) => {
      setGoals((prevGoals) => ({
        ...prevGoals,
        ...buildGoalsPayload(newPercentages, prevGoals),
      }));
    },
    [setGoals]
  );

  const isTotalPercentageValid = useMemo(() => {
    const total = visibleMeals.reduce(
      (sum, meal) => sum + getMealPercentage(meal.name, goals),
      0
    );
    return Math.round(total) === 100;
  }, [goals, visibleMeals]);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            {t(
              'goals.goalsSettings.dailyNutritionGoals',
              'Daily Nutrition Goals'
            )}
            <div className="text-sm font-normal text-gray-600 ml-2">
              {t(
                'goals.goalsSettings.changesCascadeInfo',
                '(Updates your daily goals for the next 6 months or until your next scheduled goal change)'
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Top section: Calories, Macros By toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div className="space-y-1.5">
              <Label htmlFor="calories">
                {t(
                  'nutrition.calories',
                  `Calories (${getEnergyUnitString(energyUnit)})`
                )}
              </Label>
              <NumericInput
                id="calories"
                step={1}
                value={Math.round(
                  convertEnergy(goals.calories, 'kcal', energyUnit)
                )}
                onValueChange={(val) =>
                  setGoals((prev) => ({
                    ...prev,
                    calories: convertEnergy(val ?? 0, energyUnit, 'kcal'),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Macros By</Label>
              <RadioGroup
                value={macroInputType}
                onValueChange={(v: 'grams' | 'percentages') =>
                  setMacroInputType(v)
                }
                className="flex h-10 items-center gap-4 border rounded-md px-3"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="grams" id="m-g" />
                  <Label htmlFor="m-g" className="text-xs cursor-pointer">
                    Grams
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="percentages" id="m-p" />
                  <Label htmlFor="m-p" className="text-xs cursor-pointer">
                    Percentages
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* Macro Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {(['protein', 'carbs', 'fat'] as const).map((m) => (
              <div key={m} className="space-y-1.5">
                <Label className="text-xs capitalize">
                  {t(m, m)} {macroInputType === 'grams' ? '(g)' : '(%)'}
                </Label>
                <NumericInput
                  step={0.1}
                  decimals={1}
                  min={0}
                  max={macroInputType === 'percentages' ? 100 : undefined}
                  value={
                    macroInputType === 'grams'
                      ? (goals[m] ?? 0)
                      : Number(
                          goals[`${m}_percentage` as keyof ExpandedGoals] ?? 0
                        )
                  }
                  onValueChange={(val) => {
                    setGoals((prev) => ({
                      ...prev,
                      [macroInputType === 'grams' ? m : `${m}_percentage`]:
                        val ?? 0,
                    }));
                  }}
                />
              </div>
            ))}
          </div>

          {macroInputType === 'percentages' && (
            <div className="space-y-2 mb-6">
              <div
                className={`text-sm font-medium text-right ${isMacroValid ? 'text-green-600' : 'text-destructive'}`}
              >
                Total: {currentMacroTotal}% {!isMacroValid && '(Must be 100%)'}
              </div>
              <div className="p-3 bg-muted/50 rounded-md text-xs text-muted-foreground grid grid-cols-3 gap-2">
                <span>
                  Protein:{' '}
                  {calculateGrams(
                    goals.calories,
                    goals.protein_percentage || 0,
                    'protein'
                  )}
                  g
                </span>
                <span>
                  Carbs:{' '}
                  {calculateGrams(
                    goals.calories,
                    goals.carbs_percentage || 0,
                    'carbs'
                  )}
                  g
                </span>
                <span>
                  Fat:{' '}
                  {calculateGrams(
                    goals.calories,
                    goals.fat_percentage || 0,
                    'fat'
                  )}
                  g
                </span>
              </div>
            </div>
          )}

          <Separator className="my-5" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Loop directly over the ordered array from settings, excluding calories and macros */}
            {visibleNutrients
              .filter(
                (key) => !['calories', 'protein', 'carbs', 'fat'].includes(key)
              )
              .map((key) => {
                // Validate standard or custom nutrient
                const isStandard = NUTRIENT_CONFIG.some((n) => n.id === key);
                const isCustom = customNutrients?.some((cn) => cn.name === key);

                if (!isStandard && !isCustom) return null;

                // Render nutrient input
                return (
                  <NutrientInput
                    key={key}
                    nutrientId={key}
                    state={goals}
                    setState={setGoals}
                    visibleNutrients={visibleNutrients}
                    customNutrients={customNutrients}
                  />
                );
              })}
          </div>

          <Separator className="my-5" />
          <WaterAndExerciseFields
            state={goals}
            setState={(val) => setGoals(val)}
          />

          <Separator className="my-6" />

          <h3 className="text-lg font-semibold mb-4">
            {t(
              'goals.goalsSettings.mealCalorieDistribution',
              'Meal Calorie Distribution'
            )}
          </h3>
          <MealPercentageManager
            initialPercentages={memoizedGoalsPercentages}
            totalCalories={goals.calories}
            onPercentagesChange={handleGoalsPercentagesChange}
          />

          <div className="mt-6">
            <Button
              onClick={handleSaveGoals}
              className="w-full"
              disabled={saving || !isTotalPercentageValid || !isMacroValid}
            >
              {saving
                ? t('goals.goalsSettings.saving', 'Saving...')
                : t('goals.goalsSettings.saveGoals', 'Save Goals')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
};
