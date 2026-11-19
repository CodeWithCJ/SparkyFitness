import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import MealCard from '@/pages/Diary/MealCard';
import type { FoodEntry } from '@/types/food';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    nutrientDisplayPreferences: ['desktop', 'mobile'].map((platform) => ({
      view_group: 'quick_info',
      platform,
      visible_nutrients: ['added_sugars'],
    })),
    loggingLevel: 'ERROR',
    getDateRelationToToday: () => 'today',
    timeFormat: '24h',
  }),
}));
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useCopyFoodEntriesFromYesterdayMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/components/AllergenBadges', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/FoodSearch/FoodSearch', () => ({
  __esModule: true,
  default: () => null,
}));

// The meal total is a distinct 5 g so it never matches the per-entry text.
const totals = {
  calories: 100,
  protein: 1,
  carbs: 1,
  fat: 1,
  dietary_fiber: 1,
  sugars: 1,
  caffeine_mg: 1,
  alcohol_g: 1,
  added_sugars: 5,
};

const renderEntry = (entryAddedSugars: number | null) => {
  const props: ComponentProps<typeof MealCard> = {
    meal: {
      name: 'Breakfast',
      type: 'breakfast',
      entries: [
        {
          id: 'a',
          food_name: 'Oats',
          meal_type: 'breakfast',
          entry_date: '2026-11-17',
          quantity: 1,
          unit: 'serving',
        } as FoodEntry,
      ],
      selectedDate: '2026-11-17',
    },
    totals,
    selectedDate: '2026-11-17',
    onFoodSelect: jest.fn(),
    onEditEntry: jest.fn(),
    onRemoveEntry: jest.fn(),
    getEntryNutrition: () => ({ ...totals, added_sugars: entryAddedSugars }),
    onCopyClick: jest.fn(),
    onCopyFamilyClick: jest.fn(),
    onConvertToMealClick: jest.fn(),
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <MealCard {...props} />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('MealCard per-entry added sugars', () => {
  it('shows unknown added sugars as a dash, not 0 g', () => {
    renderEntry(null);

    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.queryByText(/^0(\.0)?\s*g$/)).not.toBeInTheDocument();
  });

  it('shows a recorded zero as 0 g', () => {
    renderEntry(0);

    expect(screen.queryByText('–')).not.toBeInTheDocument();
    expect(screen.getAllByText(/^0\.0\s*g$/)).toHaveLength(1);
  });
});
