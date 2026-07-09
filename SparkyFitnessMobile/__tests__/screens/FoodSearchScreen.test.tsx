import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FoodSearchScreen from '../../src/screens/FoodSearchScreen';
import { fetchExternalFoodDetails } from '../../src/services/api/externalFoodSearchApi';
import { ApiError } from '../../src/services/api/errors';
import {
  useExternalFoodSearch,
  useExternalProviders,
  useAllProvidersSearch,
  useFoodSearch,
  useFoods,
  useMealSearch,
  useMeals,
  usePreferences,
  useServerConnection,
} from '../../src/hooks';
import type { Meal } from '../../src/types/meals';
import type { FoodItem } from '../../src/types/foods';

jest.mock('../../src/hooks', () => ({
  useExternalFoodSearch: jest.fn(),
  useExternalProviders: jest.fn(),
  useAllProvidersSearch: jest.fn(),
  useFoodSearch: jest.fn(),
  useFoods: jest.fn(),
  useMealSearch: jest.fn(),
  useMeals: jest.fn(),
  usePreferences: jest.fn(),
  useServerConnection: jest.fn(),
  useDebounce: (value: unknown) => value,
}));

jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  fetchExternalFoodDetails: jest.fn(),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

const mockFetchExternalFoodDetails = fetchExternalFoodDetails as jest.MockedFunction<typeof fetchExternalFoodDetails>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;
const mockUseExternalFoodSearch = useExternalFoodSearch as jest.MockedFunction<typeof useExternalFoodSearch>;
const mockUseExternalProviders = useExternalProviders as jest.MockedFunction<typeof useExternalProviders>;
const mockUseAllProvidersSearch = useAllProvidersSearch as jest.MockedFunction<typeof useAllProvidersSearch>;
const mockUseFoodSearch = useFoodSearch as jest.MockedFunction<typeof useFoodSearch>;
const mockUseFoods = useFoods as jest.MockedFunction<typeof useFoods>;
const mockUseMealSearch = useMealSearch as jest.MockedFunction<typeof useMealSearch>;
const mockUseMeals = useMeals as jest.MockedFunction<typeof useMeals>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildMeal(): Meal {
  return {
    id: 'meal-1',
    user_id: 'user-1',
    name: 'Lunch Bowl',
    description: null,
    is_public: false,
    serving_size: 1,
    serving_unit: 'serving',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    foods: [
      {
        id: 'meal-food-1',
        food_id: 'food-1',
        variant_id: 'variant-1',
        quantity: 1,
        unit: 'serving',
        food_name: 'Chicken',
        brand: null,
        serving_size: 1,
        serving_unit: 'serving',
        calories: 300,
        protein: 30,
        carbs: 20,
        fat: 10,
      },
    ],
  };
}

function buildFood(): FoodItem {
  return {
    id: 'food-1',
    name: 'Grilled Chicken',
    brand: 'House',
    default_variant: {
      id: 'variant-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 30,
      carbs: 0,
      fat: 8,
    },
  } as unknown as FoodItem;
}

const externalItem = {
  id: 'ext-1',
  name: 'Cheddar Cheese',
  brand: 'FatSecret Brand',
  source: 'fatsecret',
  serving_size: 100,
  serving_unit: 'g',
  calories: 400,
  protein: 25,
  carbs: 1,
  fat: 33,
} as any;

const fatSecretProvider = {
  providers: [{ id: 'p1', provider_type: 'fatsecret', provider_name: 'FatSecret' }],
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
} as any;

function activeExternalSearch(overrides: Record<string, unknown> = {}) {
  return {
    searchResults: [],
    isSearching: false,
    isSearchActive: true,
    isSearchError: false,
    searchErrorMessage: null,
    isProviderSupported: true,
    fetchNextPage: jest.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    ...overrides,
  } as any;
}

describe('FoodSearchScreen', () => {
  const navigation = {
    setOptions: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;
  const route = {
    key: 'FoodSearch-key',
    name: 'FoodSearch' as const,
    params: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseServerConnection.mockReturnValue({ isConnected: true } as any);
    mockUsePreferences.mockReturnValue({ preferences: {} } as any);
    mockUseFoods.mockReturnValue({
      recentFoods: [],
      topFoods: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseFoodSearch.mockReturnValue({
      searchResults: [],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);
    mockUseMeals.mockReturnValue({
      meals: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseMealSearch.mockReturnValue({
      searchResults: [],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });
    mockUseExternalProviders.mockReturnValue({
      providers: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseExternalFoodSearch.mockReturnValue(activeExternalSearch());
    mockUseAllProvidersSearch.mockReturnValue({
      providerResults: [],
      isSearchActive: false,
      anyLoading: false,
    } as any);
  });

  // Type a query so the screen enters search mode and renders the result sections.
  function renderSearching(routeOverride: typeof route = route, term = 'chicken') {
    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodSearchScreen navigation={navigation} route={routeOverride} />
      </SafeAreaProvider>,
    );
    fireEvent.changeText(screen.getByPlaceholderText('Search foods...'), term);
    return screen;
  }

  it('renders local foods, saved meals, and the online provider together in one search', () => {
    mockUseFoodSearch.mockReturnValue({
      searchResults: [buildFood()],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);
    mockUseMealSearch.mockReturnValue({
      searchResults: [buildMeal()],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });
    mockUseExternalProviders.mockReturnValue(fatSecretProvider);
    mockUseExternalFoodSearch.mockReturnValue(
      activeExternalSearch({ searchResults: [externalItem] }),
    );

    const screen = renderSearching();

    expect(screen.getByText('Your Foods')).toBeTruthy();
    expect(screen.getByText('Grilled Chicken')).toBeTruthy();
    expect(screen.getByText('Your Meals')).toBeTruthy();
    expect(screen.getByText('Lunch Bowl')).toBeTruthy();
    // The single default provider's results stream in under the External
    // Results header, with the provider name shown as the switchable source.
    expect(screen.getByText('Online Results')).toBeTruthy();
    expect(screen.getByText('FatSecret')).toBeTruthy();
    expect(screen.getByText('Cheddar Cheese')).toBeTruthy();
  });

  it('opens FoodEntryAdd when a saved-meal result is tapped', () => {
    mockUseMealSearch.mockReturnValue({
      searchResults: [buildMeal()],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });

    const screen = renderSearching();

    fireEvent.press(screen.getByText('Lunch Bowl'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({
        item: expect.objectContaining({
          id: 'meal-1',
          name: 'Lunch Bowl',
          source: 'meal',
        }),
      }),
    );
  });

  it('does not show saved meals in meal-builder mode', () => {
    mockUseMealSearch.mockReturnValue({
      searchResults: [buildMeal()],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });

    const builderRoute = {
      key: 'FoodSearch-key',
      name: 'FoodSearch' as const,
      params: { pickerMode: 'meal-builder' as const },
    };
    const screen = renderSearching(builderRoute);

    expect(screen.queryByText('Your Meals')).toBeNull();
    expect(screen.queryByText('Lunch Bowl')).toBeNull();
  });

  it('toasts the error but still opens partial info when an online detail fetch fails', async () => {
    mockUseExternalProviders.mockReturnValue(fatSecretProvider);
    mockUseExternalFoodSearch.mockReturnValue(
      activeExternalSearch({ searchResults: [externalItem] }),
    );
    mockFetchExternalFoodDetails.mockRejectedValue(
      new ApiError('Bad Gateway', 502, JSON.stringify({ error: 'FatSecret down' })),
    );

    const screen = renderSearching();

    fireEvent.press(screen.getByText('Cheddar Cheese'));

    await waitFor(() => {
      expect(mockToastShow).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text2: 'FatSecret down' }),
      );
    });
    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({
        item: expect.objectContaining({ id: 'ext-1', source: 'external' }),
      }),
    );
  });
});
