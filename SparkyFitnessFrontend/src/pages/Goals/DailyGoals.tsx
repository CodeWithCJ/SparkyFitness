import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  const memoizedGoalsPercentages = useMemo(
    () => ({
      breakfast: goals.breakfast_percentage,
      lunch: goals.lunch_percentage,
      dinner: goals.dinner_percentage,
      snacks: goals.snacks_percentage,
    }),
    [
      goals.breakfast_percentage,
      goals.lunch_percentage,
      goals.dinner_percentage,
      goals.snacks_percentage,
    ]
  );
  const { mutateAsync: saveGoalsService, isPending: saving } =
    useSaveGoalsMutation();
  const handleSaveGoals = async () => {
    if (!user) return;

    await saveGoalsService({ date: today, goals, cascade: true });
  };

  const handleGoalsPercentagesChange = useCallback(
    (newPercentages: {
      breakfast: number;
      lunch: number;
      dinner: number;
      snacks: number;
    }) => {
      setGoals((prevGoals) => ({
        ...prevGoals,
        breakfast_percentage: newPercentages.breakfast,
        lunch_percentage: newPercentages.lunch,
        dinner_percentage: newPercentages.dinner,
        snacks_percentage: newPercentages.snacks,
      }));
    },
    [setGoals]
  );
  const isTotalPercentageValid =
    goals.breakfast_percentage +
      goals.lunch_percentage +
      goals.dinner_percentage +
      goals.snacks_percentage ===
    100;
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
            {/* Primary Macros */}
            {visibleNutrients.includes('calories') && (
              <div className="space-y-1.5">
                <Label htmlFor="calories">
                  {t(
                    'goals.goalsSettings.calories',
                    `Calories (${getEnergyUnitString(energyUnit)})`
                  )}
                </Label>
                <Input
                  id="calories"
                  type="number"
                  value={Math.round(
                    convertEnergy(goals.calories, 'kcal', energyUnit)
                  )}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      calories: convertEnergy(
                        Number(e.target.value),
                        energyUnit,
                        'kcal'
                      ),
                    })
                  }
                />
              </div>
            )}
            {NUTRIENT_CONFIG.map((f) => (
              <NutrientInput
                key={f.id}
                field={f}
                state={goals}
                setState={setGoals}
                visibleNutrients={visibleNutrients}
              />
            ))}
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
