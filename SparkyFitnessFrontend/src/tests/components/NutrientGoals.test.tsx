import { render, screen } from '@testing-library/react';
import { NutrientGoals } from '@/components/Onboarding/NutrientGoals';
import { ExpandedGoals } from '@/types/goals';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { label?: string; percentage?: number }) =>
      key === 'onboarding.nutrientGoalsLabelWithPercentage'
        ? `${options?.label} (${options?.percentage}%)`
        : `[${key}]`,
  }),
}));

jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: [] }),
}));

jest.mock('@/utils/nutritionCalculations', () => ({
  convertMlToSelectedUnit: (value: number) => value,
  convertSelectedUnitToMl: (value: number) => value,
}));

jest.mock('@/components/MealPercentageManager', () => () => (
  <div>meal distribution</div>
));

describe('NutrientGoals', () => {
  const renderGoals = (editedPlan: ExpandedGoals = {} as ExpandedGoals) =>
    render(
      <NutrientGoals
        convertEnergy={(value) => value}
        editedPlan={editedPlan}
        handlePercentagesChange={jest.fn()}
        localEnergyUnit="kcal"
        localWaterUnit="ml"
        memoizedInitialPercentages={{
          breakfast: 25,
          lunch: 25,
          dinner: 25,
          snacks: 25,
        }}
        setEditedPlan={jest.fn()}
        setLocalWaterUnit={jest.fn()}
      />
    );

  it('localizes section headings, fields, and water units', () => {
    renderGoals();

    expect(
      screen.getByRole('heading', {
        name: '[onboarding.nutrientGoalsDailyMacros]',
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('spinbutton', {
        name: '[onboarding.nutrientGoalsCarbohydrates]',
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: '[onboarding.nutrientGoalsWaterUnitMl]',
      })
    ).toBeTruthy();
  });

  it('preserves the calorie-based macronutrient percentage calculation', () => {
    renderGoals({
      calories: 2000,
      carbs: 250,
      dietary_fiber: 0,
    } as ExpandedGoals);

    expect(
      screen.getByText('[onboarding.nutrientGoalsCarbohydrates] (50%)')
    ).toBeTruthy();
  });
});
