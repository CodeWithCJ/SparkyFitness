import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ComponentProps } from 'react';
import FoodSearch from '@/components/FoodSearch/FoodSearch';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import { FOOD_SEARCH_DIALOG_CONTENT_CLASS } from '@/components/FoodSearch/foodSearchDialogLayout';
import MealCard from '@/pages/Diary/MealCard';
import type { DataProvider } from '@/types/settings';

// Issue #2126: the food search dialog uses the screen height on desktop.
// jsdom computes no layout, so these tests pin the structure; real-browser
// screenshots prove the pixels (spec food-search-desktop-height).

const mockEmpty: never[] = [];
const mockSearchData = { pages: [] };
const mockProviders: DataProvider[] = [
  {
    id: 'off-provider',
    name: 'Open Food Facts',
    provider_name: 'Open Food Facts',
    provider_type: 'openfoodfacts',
    is_active: true,
    categories: ['food'],
    app_key: '',
  },
  {
    id: 'usda-provider',
    name: 'USDA',
    provider_name: 'USDA',
    provider_type: 'usda',
    is_active: true,
    categories: ['food'],
    app_key: '',
  },
];
// Mutable so one test can switch on the All Providers view.
const mockPrefs = { allProvidersDefault: false };
// One By Source group with more results than it shows, so "Show all…" renders.
// Module-level so the hook returns stable references across renders.
const mockProviderResults = [
  {
    provider: mockProviders[0],
    items: mockEmpty,
    totalCount: 5,
    isLoading: false,
    isError: false,
    refetch: () => undefined,
  },
];
const mockAllProvidersSearch = {
  providerResults: mockProviderResults,
  anyLoading: false,
  isSearchActive: true,
  debouncedSearch: 'pizza',
};

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'account-a', activeUserId: 'profile-a' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    foodSearchAllProvidersDefault: mockPrefs.allProvidersDefault,
    itemDisplayLimit: 10,
    nutrientDisplayPreferences: mockEmpty,
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
    loggingLevel: 'ERROR',
    getDateRelationToToday: () => 'today',
    timeFormat: '24h',
  }),
}));
jest.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/hooks/Settings/useExternalProviderSettings', () => ({
  useExternalProvidersQuery: () => ({ data: mockProviders }),
}));
jest.mock('@/hooks/Foods/useFoods', () => ({
  useDatabaseFoodSearchQuery: () => ({
    data: mockSearchData,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useRecentAndTopFoodsQuery: () => ({ isLoading: false }),
}));
jest.mock('@/hooks/Foods/useMeals', () => ({
  mealSearchOptions: jest.fn(),
  useRecentAndTopMealsQuery: () => ({
    recentMeals: mockEmpty,
    topMeals: mockEmpty,
    isLoading: false,
  }),
}));
jest.mock('@/hooks/Foods/useFavorites', () => ({
  useFavoritesQuery: () => ({ data: undefined }),
}));
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => ({ data: mockEmpty }),
}));
jest.mock('@/hooks/Foods/useAllProvidersFoodSearch.ts', () => ({
  useAllProvidersFoodSearch: () => mockAllProvidersSearch,
}));
jest.mock('@/hooks/Diary/useFoodEntries', () => ({
  useCopyFoodEntriesFromYesterdayMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/api/Foods/foodService', () => ({
  searchBarcodeV2: jest.fn(),
  searchFoodsV2: jest.fn(),
}));
jest.mock('@/components/FoodSearch/FoodFormDialog', () => ({
  FoodFormDialog: () => null,
}));
jest.mock('@/components/FoodSearch/BarcodeScannerDialog', () => ({
  BarcodeScannerDialog: () => null,
}));

const renderWithClient = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );

const expectSharedDialogLayout = (dialog: HTMLElement) => {
  const tokens = FOOD_SEARCH_DIALOG_CONTENT_CLASS.split(/\s+/).filter(Boolean);
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) {
    expect(dialog).toHaveClass(token);
  }
};

describe('food search dialog layout (#2126)', () => {
  it('lets the results area scroll on tall windows instead of a fixed height cap', () => {
    renderWithClient(<FoodSearch onFoodSelect={jest.fn()} hideMealTab />);

    const results = screen.getByTestId('food-search-results');
    const classes = Array.from(results.classList);
    expect(classes.filter((c) => /(^|:)max-h-/.test(c))).toEqual([]);
    // From 37.5rem of viewport height the results area shrinks and scrolls;
    // the FoodSearch root must be a shrinkable flex column for that to work.
    expect(results).toHaveClass(
      '[@media(min-height:37.5rem)]:min-h-0',
      '[@media(min-height:37.5rem)]:overflow-y-auto'
    );
    expect(results.parentElement).toHaveClass(
      'flex',
      'flex-col',
      '[@media(min-height:37.5rem)]:min-h-0'
    );

    // The search field and the action buttons stay outside the scrolling area.
    expect(
      within(results).queryByPlaceholderText('Search for foods...')
    ).toBeNull();
    expect(
      within(results).queryByRole('button', { name: /scan barcode/i })
    ).toBeNull();
  });

  it('gives the Foods page dialog the shared food search dialog layout', () => {
    renderWithClient(
      <FoodSearchDialog
        open
        onOpenChange={jest.fn()}
        onFoodSelect={jest.fn()}
      />
    );

    expectSharedDialogLayout(screen.getByRole('dialog'));
  });

  it('gives the Diary meal dialog the same shared layout', () => {
    const totals = {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      dietary_fiber: 0,
    };
    const props: ComponentProps<typeof MealCard> = {
      meal: {
        name: 'Breakfast',
        type: 'breakfast',
        entries: [],
        selectedDate: '2026-11-06',
      },
      totals,
      selectedDate: '2026-11-06',
      onFoodSelect: jest.fn(),
      onEditEntry: jest.fn(),
      onRemoveEntry: jest.fn(),
      getEntryNutrition: () => totals,
      onCopyClick: jest.fn(),
      onCopyFamilyClick: jest.fn(),
      onConvertToMealClick: jest.fn(),
      energyUnit: 'kcal',
      convertEnergy: (value: number) => value,
      shouldOpenFoodSearch: true,
    };
    renderWithClient(<MealCard {...props} />);

    expectSharedDialogLayout(screen.getByRole('dialog'));
  });

  it('scrolls both the results area and the dialog back to the top on "Show all"', async () => {
    // Whichever element scrolls (the results area on tall windows, the
    // dialog on short ones) must return to the top when a By Source group
    // switches to the single-provider view.
    const trackScrollTop = (el: HTMLElement) => {
      let value = 200;
      Object.defineProperty(el, 'scrollTop', {
        configurable: true,
        get: () => value,
        set: (next: number) => {
          value = next;
        },
      });
      return () => value;
    };

    mockPrefs.allProvidersDefault = true;
    try {
      // The real dialog, so the test also covers the ancestry that
      // results.closest('[role="dialog"]') relies on.
      renderWithClient(
        <FoodSearchDialog
          open
          onOpenChange={jest.fn()}
          onFoodSelect={jest.fn()}
          hideMealTab
        />
      );

      fireEvent.change(screen.getByPlaceholderText('Search for foods...'), {
        target: { value: 'pizza' },
      });
      fireEvent.click(
        await screen.findByRole('button', { name: /Open Food Facts/ })
      );
      const showAll = await screen.findByRole('button', { name: /Show all/ });

      const resultsScrollTop = trackScrollTop(
        screen.getByTestId('food-search-results')
      );
      const dialogScrollTop = trackScrollTop(screen.getByRole('dialog'));

      fireEvent.click(showAll);

      expect(resultsScrollTop()).toBe(0);
      expect(dialogScrollTop()).toBe(0);
    } finally {
      mockPrefs.allProvidersDefault = false;
    }
  });
});
