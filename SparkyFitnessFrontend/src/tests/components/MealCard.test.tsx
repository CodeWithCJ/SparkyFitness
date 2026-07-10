import { render, screen } from '@testing-library/react';
import MealCard from '@/pages/Diary/MealCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'silent',
    nutrientDisplayPreferences: [],
    getDateRelationToToday: () => 'today',
  }),
}));

jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams()],
}));
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useCopyFoodEntriesFromYesterdayMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/components/FoodSearch/FoodSearch', () => () => null);
jest.mock('@/components/AllergenBadges', () => () => null);

describe('MealCard', () => {
  it('localizes the meal actions and empty state', () => {
    render(
      <MealCard
        meal={{
          name: 'Breakfast',
          type: 'breakfast',
          entries: [],
          selectedDate: '2026-07-10',
        }}
        totals={{
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          dietary_fiber: 0,
        }}
        selectedDate="2026-07-10"
        onFoodSelect={jest.fn()}
        onEditEntry={jest.fn()}
        onRemoveEntry={jest.fn()}
        getEntryNutrition={jest.fn()}
        onCopyClick={jest.fn()}
        onCopyFamilyClick={jest.fn()}
        onConvertToMealClick={jest.fn()}
        energyUnit="kcal"
        convertEnergy={(value) => value}
      />
    );

    expect(screen.getByText('[common.breakfast]')).toBeTruthy();
    expect(screen.getByText('[mealCard.empty]')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '[mealCard.addFoodAction]' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '[mealCard.copyToDateAction]' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: '[mealCard.copyWithFamilyAction]' })
    ).toBeTruthy();
  });
});
