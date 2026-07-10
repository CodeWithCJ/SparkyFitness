import { fireEvent, render, screen } from '@testing-library/react';
import { PersonalPlanHeader } from '@/components/Onboarding/PersonalPlanHeader';
import { ExpandedGoals } from '@/types/goals';
import { OnboardingData } from '@/types/onboarding';
import { BasePlan } from '@/utils/nutritionCalculations';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

describe('PersonalPlanHeader', () => {
  it('localizes the energy target and exposes accessible unit controls', () => {
    render(
      <PersonalPlanHeader
        formData={{ addBurnedCalories: true } as OnboardingData}
        convertEnergy={(value) => value}
        editedPlan={{ calories: 2000 } as ExpandedGoals}
        localEnergyUnit="kcal"
        plan={{ bmr: 1500 } as BasePlan}
        setEditedPlan={jest.fn()}
        setLocalEnergyUnit={jest.fn()}
      />
    );

    expect(
      screen.getByRole('heading', {
        name: '[onboarding.personalPlanEnergyTarget]',
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('spinbutton', {
        name: '[onboarding.personalPlanEnergyTarget]',
      })
    ).toBeTruthy();
    expect(
      screen
        .getByRole('button', {
          name: '[onboarding.personalPlanEnergyUnitKcal]',
        })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('converts the stored target when the energy unit changes', () => {
    const setEditedPlan = jest.fn();
    const setLocalEnergyUnit = jest.fn();

    render(
      <PersonalPlanHeader
        formData={{ addBurnedCalories: false } as OnboardingData}
        convertEnergy={(value, _fromUnit, toUnit) =>
          toUnit === 'kJ' ? value * 4 : value / 4
        }
        editedPlan={{ calories: 2000 } as ExpandedGoals}
        localEnergyUnit="kcal"
        plan={{ bmr: 1500 } as BasePlan}
        setEditedPlan={setEditedPlan}
        setLocalEnergyUnit={setLocalEnergyUnit}
      />
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: '[onboarding.personalPlanEnergyUnitKj]',
      })
    );

    const updatePlan = setEditedPlan.mock.calls[0]?.[0] as (
      previous: ExpandedGoals
    ) => ExpandedGoals;
    expect(updatePlan({ calories: 2000 } as ExpandedGoals).calories).toBe(8000);
    expect(setLocalEnergyUnit).toHaveBeenCalledWith('kJ');
  });
});
