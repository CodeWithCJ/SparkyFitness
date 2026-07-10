import { fireEvent, render, screen } from '@testing-library/react';
import MealPercentageManager from '@/components/MealPercentageManager';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { meal?: string }) =>
      options?.meal ? `[${key}:${options.meal}]` : `[${key}]`,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
  }),
}));

describe('MealPercentageManager', () => {
  it('localizes templates and keeps meal percentages within range', () => {
    const onPercentagesChange = jest.fn();

    render(
      <MealPercentageManager
        initialPercentages={{
          breakfast: 25,
          lunch: 25,
          dinner: 25,
          snacks: 25,
        }}
        onPercentagesChange={onPercentagesChange}
        totalCalories={2000}
      />
    );

    expect(
      screen.getByRole('combobox', {
        name: '[goals.mealDistribution.selectTemplate]',
      })
    ).toBeTruthy();
    expect(
      screen.getByText('[goals.mealDistribution.templates.even]')
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: '[goals.mealDistribution.lockMeal:[common.breakfast]]',
      })
    ).toBeTruthy();

    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: '[goals.mealDistribution.mealPercentage:[common.breakfast]]',
      }),
      { target: { value: '120' } }
    );

    expect(onPercentagesChange).toHaveBeenCalledWith(
      expect.objectContaining({ breakfast: 100 })
    );
  });
});
