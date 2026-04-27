import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodSearchScreen from '../../src/screens/FoodSearchScreen';
import {
  useExternalFoodSearch,
  useExternalProviders,
  useFoodSearch,
  useFoods,
  useMealSearch,
  useMeals,
  usePreferences,
  useServerConnection,
} from '../../src/hooks';
import type { Meal } from '../../src/types/meals';

jest.mock('../../src/hooks', () => ({
  useExternalFoodSearch: jest.fn(),
  useExternalProviders: jest.fn(),
  useFoodSearch: jest.fn(),
  useFoods: jest.fn(),
  useMealSearch: jest.fn(),
  useMeals: jest.fn(),
  usePreferences: jest.fn(),
  useServerConnection: jest.fn(),
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

const mockUseExternalFoodSearch = useExternalFoodSearch as jest.MockedFunction<typeof useExternalFoodSearch>;
const mockUseExternalProviders = useExternalProviders as jest.MockedFunction<typeof useExternalProviders>;
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

describe('FoodSearchScreen', () => {
  const navigation = {
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
      isSearchActive: false,
      isSearchError: false,
    } as any);
    mockUseMeals.mockReturnValue({
      meals: [buildMeal()],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseMealSearch.mockReturnValue({
      searchResults: [],
      isSearching: false,
      isSearchActive: false,
      isSearchError: false,
      refetch: jest.fn(),
    });
    mockUseExternalProviders.mockReturnValue({
      providers: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseExternalFoodSearch.mockReturnValue({
      searchResults: [],
      isSearching: false,
      isSearchActive: false,
      isSearchError: false,
      isProviderSupported: true,
      fetchNextPage: jest.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
    } as any);
  });

  it('keeps meal rows as quick-log picks', () => {
    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodSearchScreen navigation={navigation} route={route} />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByText('Meals'));
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
});
