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
  localEnergyUnit: 'kcal' | 'kJ';
  plan: BasePlan | null;
  setEditedPlan: React.Dispatch<React.SetStateAction<ExpandedGoals | null>>;
  setLocalEnergyUnit: React.Dispatch<React.SetStateAction<'kcal' | 'kJ'>>;
}

export const PersonalPlanHeader = ({
  convertEnergy,
  editedPlan,
  localEnergyUnit,
  plan,
  setEditedPlan,
  setLocalEnergyUnit,
  formData,
}: PersonalPlanHeaderProps) => {
  const { t } = useTranslation();
  const energyUnitLabel = t(
    localEnergyUnit === 'kcal'
      ? 'onboarding.personalPlanKcalUnit'
      : 'onboarding.personalPlanKjUnit'
  );
  const bmrValue = plan
    ? Math.round(convertEnergy(plan.bmr, 'kcal', localEnergyUnit))
    : 0;

  const selectEnergyUnit = (unit: 'kcal' | 'kJ') => {
    if (unit !== localEnergyUnit && editedPlan?.calories) {
      setEditedPlan((previous) =>
        previous
          ? {
              ...previous,
              calories: Math.round(
                convertEnergy(previous.calories, localEnergyUnit, unit)
              ),
            }
          : null
      );
    }
    setLocalEnergyUnit(unit);
  };

  return (
    <section
      className="mb-6 rounded-2xl border border-border bg-card p-6 text-center"
      aria-labelledby="personal-plan-energy-heading"
    >
      <div
        className="mx-auto mb-6 grid w-full max-w-md grid-cols-2 rounded-lg bg-muted p-1"
        role="group"
        aria-label={t('onboarding.personalPlanEnergyUnitLabel')}
      >
        <button
          type="button"
          onClick={() => selectEnergyUnit('kcal')}
          className={`rounded-md px-3 py-2 text-sm transition-all ${
            localEnergyUnit === 'kcal'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={localEnergyUnit === 'kcal'}
        >
          {t('onboarding.personalPlanEnergyUnitKcal')}
        </button>
        <button
          type="button"
          onClick={() => selectEnergyUnit('kJ')}
          className={`rounded-md px-3 py-2 text-sm transition-all ${
            localEnergyUnit === 'kJ'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          aria-pressed={localEnergyUnit === 'kJ'}
        >
          {t('onboarding.personalPlanEnergyUnitKj')}
        </button>
      </div>

      <h2
        id="personal-plan-energy-heading"
        className="mb-2 text-sm font-bold text-muted-foreground"
      >
        {t('onboarding.personalPlanEnergyTarget')}
      </h2>
      <div className="flex justify-center text-6xl font-extrabold text-primary">
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={editedPlan?.calories ? editedPlan.calories.toFixed(0) : ''}
          onChange={(event) =>
            setEditedPlan((previous) =>
              previous
                ? { ...previous, calories: Number(event.target.value) }
                : null
            )
          }
          className="h-auto w-48 border-none bg-transparent p-0 text-center text-6xl font-extrabold text-primary focus-visible:ring-0"
          dir="ltr"
          aria-labelledby="personal-plan-energy-heading"
        />
      </div>
      <p className="mt-1 text-xl font-medium text-foreground">
        {t('onboarding.personalPlanPerDay', { unit: energyUnitLabel })}
      </p>

      <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6 text-sm sm:flex-row sm:justify-between sm:text-start">
        <div>
          <span className="block text-muted-foreground">
            {t('onboarding.personalPlanBmrLabel')}
          </span>
          <strong className="font-semibold text-foreground">
            {bmrValue} {energyUnitLabel}
          </strong>
        </div>

        <div>
          <span className="block text-muted-foreground">
            {t('onboarding.personalPlanExerciseCaloriesLabel')}
          </span>
          <strong
            className={
              formData.addBurnedCalories
                ? 'font-semibold text-primary'
                : 'font-semibold text-muted-foreground'
            }
          >
            {t(
              formData.addBurnedCalories
                ? 'onboarding.personalPlanEnabled'
                : 'onboarding.personalPlanDisabled'
            )}
          </strong>
        </div>
      </div>
    </section>
  );
};
