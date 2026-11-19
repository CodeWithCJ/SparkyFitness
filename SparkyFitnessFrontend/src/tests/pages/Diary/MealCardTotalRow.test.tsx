import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import MealCard from '@/pages/Diary/MealCard';
import { DEFAULT_NUTRIENTS } from '@/constants/nutrients';
import type { FoodEntry } from '@/types/food';

// Mutable so a test can render the phone layout or show more nutrients.
const mockDevice = { isMobile: false };
const mockPrefs: {
  nutrientDisplayPreferences: {
    view_group: string;
    platform: string;
    visible_nutrients: string[];
  }[];
} = { nutrientDisplayPreferences: [] };

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    nutrientDisplayPreferences: mockPrefs.nutrientDisplayPreferences,
    loggingLevel: 'ERROR',
    getDateRelationToToday: () => 'today',
    timeFormat: '24h',
  }),
}));
jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => mockDevice.isMobile,
}));
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

const totals = {
  calories: 100,
  protein: 1,
  carbs: 1,
  fat: 1,
  dietary_fiber: 1,
  sugars: 1,
  caffeine_mg: 1,
  alcohol_g: 1,
};

const renderMeal = () => {
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
    getEntryNutrition: () => totals,
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

const showNutrients = (visible: string[]) => {
  mockPrefs.nutrientDisplayPreferences = ['desktop', 'mobile'].map(
    (platform) => ({
      view_group: 'quick_info',
      platform,
      visible_nutrients: visible,
    })
  );
};

describe('MealCard total row', () => {
  afterEach(() => {
    mockDevice.isMobile = false;
    mockPrefs.nutrientDisplayPreferences = [];
  });

  it.each([
    // Desktop: wide enough for "Kohlenhydrate" in text-xs on one line.
    [false, '92px'],
    [true, '80px'],
  ])(
    'gives every default nutrient a column (mobile: %s, at least %s)',
    (isMobile, minColumn) => {
      mockDevice.isMobile = isMobile;
      renderMeal();

      const grid = screen.getByTestId('meal-total-nutrients');
      expect(grid.style.gridTemplateColumns).toBe(
        `repeat(auto-fit, minmax(${minColumn}, 1fr))`
      );
      // Beside the title it takes the free space instead of a fixed share.
      expect(grid).toHaveClass('w-full', 'sm:flex-1', 'sm:min-w-0');
      expect(grid).not.toHaveClass('sm:w-[35%]');

      const cells = Array.from(grid.children);
      expect(cells).toHaveLength(DEFAULT_NUTRIENTS.length);
      for (const cell of cells) {
        expect(cell).toHaveClass('min-w-0', 'wrap-break-word');
      }
      for (const label of [
        'Calories',
        'Protein',
        'Carbohydrates',
        'Fat',
        'Dietary Fiber',
        'Sugars',
      ]) {
        expect(within(grid).getByText(label)).toBeInTheDocument();
      }
    }
  );

  it.each([
    // 6 x 92px + 5 x 8px
    [DEFAULT_NUTRIENTS, '592px'],
    // 8 x 92px + 7 x 8px, with caffeine and alcohol
    [[...DEFAULT_NUTRIENTS, 'caffeine_mg', 'alcohol_g'], '792px'],
  ])('lets %j fit in one desktop row (max width %s)', (visible, maxWidth) => {
    showNutrients(visible);
    renderMeal();

    const grid = screen.getByTestId('meal-total-nutrients');
    expect(grid.children).toHaveLength(visible.length);
    expect(grid.style.maxWidth).toBe(maxWidth);
    expect(grid).not.toHaveClass('sm:max-w-[37rem]');
  });

  it('keeps the phone layout capped as before', () => {
    mockDevice.isMobile = true;
    showNutrients([...DEFAULT_NUTRIENTS, 'caffeine_mg', 'alcohol_g']);
    renderMeal();

    const grid = screen.getByTestId('meal-total-nutrients');
    expect(grid.style.maxWidth).toBe('');
    expect(grid).toHaveClass('sm:max-w-[37rem]');
  });
});
