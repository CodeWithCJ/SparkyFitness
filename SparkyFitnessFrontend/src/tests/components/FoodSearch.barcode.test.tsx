import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FoodSearch from '@/components/FoodSearch/FoodSearch';
import { searchBarcodeV2, searchFoodsV2 } from '@/api/Foods/foodService';
import type { BarcodeLookupResponse } from '@workspace/shared';
import type { DataProvider } from '@/types/settings';

const mockEmpty: never[] = [];
const mockSearchData = { pages: [] };
const mockProviders: DataProvider[] = [
  {
    id: 'usda-provider',
    name: 'USDA',
    provider_name: 'USDA',
    provider_type: 'usda',
    is_active: true,
    categories: ['food'],
    app_key: '',
  },
  {
    id: 'off-provider',
    name: 'Open Food Facts',
    provider_name: 'Open Food Facts',
    provider_type: 'openfoodfacts',
    is_active: true,
    categories: ['food'],
    app_key: '',
  },
];

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'account-a', activeUserId: 'profile-a' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    foodSearchAllProvidersDefault: true,
    itemDisplayLimit: 10,
    nutrientDisplayPreferences: mockEmpty,
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
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
jest.mock('@/api/Foods/foodService', () => ({
  searchBarcodeV2: jest.fn(),
  searchFoodsV2: jest.fn(),
}));
jest.mock('@/components/FoodSearch/FoodResultCard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/FoodSearch/FoodFormDialog', () => ({
  FoodFormDialog: () => null,
}));
// Replace the camera boundary; search state and All Providers fan-out stay real.
jest.mock('@/components/FoodSearch/BarcodeScannerDialog', () => ({
  BarcodeScannerDialog: ({
    isOpen,
    onBarcodeDetected,
  }: {
    isOpen: boolean;
    onBarcodeDetected: (barcode: string) => void;
  }) =>
    isOpen ? (
      <button onClick={() => onBarcodeDetected('1234567890123')}>
        Detect barcode
      </button>
    ) : null,
}));

it('clears barcode loading when typed All Providers results replace a pending scan', async () => {
  let finishBarcode!: (value: BarcodeLookupResponse) => void;
  jest.mocked(searchBarcodeV2).mockReturnValue(
    new Promise<BarcodeLookupResponse>((resolve) => {
      finishBarcode = resolve;
    })
  );
  jest.mocked(searchFoodsV2).mockResolvedValue({
    foods: [],
    pagination: { page: 1, pageSize: 10, totalCount: 0, hasMore: false },
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { container } = render(
    <QueryClientProvider client={client}>
      <FoodSearch onFoodSelect={jest.fn()} hideMealTab />
    </QueryClientProvider>
  );
  try {
    expect(screen.getByText('All Providers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Scan Barcode' }));
    fireEvent.click(screen.getByRole('button', { name: 'Detect barcode' }));
    await waitFor(() => expect(searchBarcodeV2).toHaveBeenCalledTimes(1));
    expect(container.querySelector('svg.animate-spin')).not.toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Search for foods...'), {
      target: { value: 'yogurt' },
    });
    expect(await screen.findByText('Top Matches')).toBeInTheDocument();
    await waitFor(() => expect(searchFoodsV2).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(container.querySelector('svg.animate-spin')).toBeNull()
    );

    await act(async () => finishBarcode({ source: 'none', food: null }));
    expect(
      screen.queryByRole('region', { name: 'Barcode results' })
    ).toBeNull();
    expect(screen.getByPlaceholderText('Search for foods...')).toHaveValue(
      'yogurt'
    );
    expect(container.querySelector('svg.animate-spin')).toBeNull();
  } finally {
    client.clear();
  }
});
