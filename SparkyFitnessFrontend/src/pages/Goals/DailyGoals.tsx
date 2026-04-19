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
import { useCallback, useMemo } from 'react';
import { ExpandedGoals } from '@/types/goals';
import { WaterAndExerciseFields } from './WaterAndExerciseFields';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { useMealTypes } from '@/hooks/Diary/useMealTypes';
import { buildGoalsPayload, getMealPercentage } from '@/utils/goals';

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

  const { mutateAsync: saveGoalsService, isPending: saving } =
    useSaveGoalsMutation();

  const handleSaveGoals = async () => {
    if (!user) return;
    await saveGoalsService({ date: today, goals, cascade: true });
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
                '(Changes cascade for 6 months from today or until your next future goal)'
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Loop directly over the ordered array from settings */}
            {visibleNutrients.map((key) => {
              // 1. Handle Calories Explicitly
              if (key === 'calories') {
                return (
                  <div key="calories" className="space-y-1.5">
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
                        setGoals({
                          ...goals,
                          calories: convertEnergy(val ?? 0, energyUnit, 'kcal'),
                        })
                      }
                    />
                  </div>
                );
              }

              // 2. Validate standard or custom nutrient
              const isStandard = NUTRIENT_CONFIG.some((n) => n.id === key);
              const isCustom = customNutrients?.some((cn) => cn.name === key);

              if (!isStandard && !isCustom) return null;

              // 3. Render nutrient input
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
              disabled={saving || !isTotalPercentageValid}
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
