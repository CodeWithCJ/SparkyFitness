import { Input } from '@/components/ui/input';
import { ExpandedGoals } from '@/types/goals';
import { OnboardingData } from '@/types/onboarding';
import { BasePlan } from '@/utils/nutritionCalculations';
import { useTranslation } from 'react-i18next';

export interface PersonalPlanHeaderProps {
  formData: OnboardingData;
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  editedPlan: ExpandedGoals | null;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
  localEnergyUnit: 'kcal' | 'kJ';
  plan: BasePlan | null;
  setEditedPlan: React.Dispatch<React.SetStateAction<ExpandedGoals | null>>;
  setLocalEnergyUnit: React.Dispatch<React.SetStateAction<'kcal' | 'kJ'>>;
}
export const PersonalPlanHeader = ({
  convertEnergy,
  editedPlan,
  getEnergyUnitString,
  localEnergyUnit,
  plan,
  setEditedPlan,
  setLocalEnergyUnit,
  formData,
}: PersonalPlanHeaderProps) => {
  const { t } = useTranslation();
  return (
    <>
      <div className="bg-card rounded-2xl p-6 mb-6 text-center border border-border">
        <div className="flex justify-center mb-6 bg-muted p-1 rounded-lg w-fit mx-auto">
          <button
            onClick={() => {
              if (localEnergyUnit !== 'kcal' && editedPlan?.calories) {
                setEditedPlan((prev) =>
                  prev
                    ? {
                        ...prev,
                        calories: Math.round(
                          convertEnergy(prev.calories, 'kJ', 'kcal')
                        ),
                      }
                    : null
                );
              }
              setLocalEnergyUnit('kcal');
            }}
            className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kcal' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t('settings.preferences.calories', 'Calories (kcal)')}
          </button>
          <button
            onClick={() => {
              if (localEnergyUnit !== 'kJ' && editedPlan?.calories) {
                setEditedPlan((prev) =>
                  prev
                    ? {
                        ...prev,
                        calories: Math.round(
                          convertEnergy(prev.calories, 'kcal', 'kJ')
                        ),
                      }
                    : null
                );
              }
              setLocalEnergyUnit('kJ');
            }}
            className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kJ' ? 'bg-green-600 text-white shadow-md' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t('settings.preferences.joules', 'Joules (kJ)')}
          </button>
        </div>

        <p className="text-muted-foreground uppercase text-sm font-bold tracking-wider mb-2">
          {t(
            'onboarding.personalPlan.dailyCalorieBudget',
            'Daily Calorie Budget'
          )}
        </p>
        <div className="text-6xl font-extrabold text-green-500 flex justify-center">
          <Input
            type="number"
            step={1}
            value={editedPlan?.calories ? editedPlan.calories.toFixed(0) : ''}
            onChange={(e) =>
              setEditedPlan((prev) =>
                prev ? { ...prev, calories: Number(e.target.value) } : null
              )
            }
            className="w-48 text-center bg-transparent border-none text-6xl text-green-500 font-extrabold focus-visible:ring-0 p-0 h-auto"
          />
        </div>
        <p className="text-xl text-foreground font-medium mt-1">
          {t('onboarding.personalPlan.perDay', '{{unit}} / day', {
            unit: getEnergyUnitString(localEnergyUnit),
          })}
        </p>

        <div className="mt-6 pt-6 border-t border-border flex justify-between text-sm text-muted-foreground">
          <span>
            {t('onboarding.personalPlan.baseBmr', 'Base BMR:')}{' '}
            {plan?.bmr &&
              Math.round(convertEnergy(plan.bmr, 'kcal', localEnergyUnit))}{' '}
            {getEnergyUnitString(localEnergyUnit)}
          </span>

          <span>
            {t('onboarding.personalPlan.calorieBuyback', 'Calorie Buyback:')}{' '}
            <span
              className={
                formData.addBurnedCalories
                  ? 'text-green-500'
                  : 'text-muted-foreground'
              }
            >
              {formData.addBurnedCalories
                ? t('onboarding.personalPlan.on', 'ON')
                : t('onboarding.personalPlan.off', 'OFF')}
            </span>
          </span>
        </div>
      </div>
    </>
  );
};
