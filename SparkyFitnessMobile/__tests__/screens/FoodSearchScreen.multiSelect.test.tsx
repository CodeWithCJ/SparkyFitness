import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodSearchScreen from '../../src/screens/FoodSearchScreen';
import {
  useExternalFoodSearch,
  useExternalProviders,
  useAllProvidersSearch,
  useFoodSearch,
  useFoods,
  useFavorites,
  useMealSearch,
  useMeals,
  usePreferences,
  useRecentMeals,
  useServerConnection,
  useTopMeals,
} from '../../src/hooks';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import {
  __resetFoodSearchSelectionStoreForTests,
  useFoodSearchSelectionStore,
} from '../../src/stores/foodSearchSelectionStore';
import type { Meal } from '../../src/types/meals';
import type { FoodItem } from '../../src/types/foods';

// The barrel is mocked (and useFoodSearchSelection deliberately left out of
// the factory): the screen imports it directly, so the real hook runs — this
// suite exercises the real basket under the screen's wiring.
jest.mock('../../src/hooks', () => ({
  useExternalFoodSearch: jest.fn(),
  useExternalProviders: jest.fn(),
  useAllProvidersSearch: jest.fn(),
  useFoodSearch: jest.fn(),
  useFoods: jest.fn(),
  useFavorites: jest.fn(),
  useMealSearch: jest.fn(),
  useMeals: jest.fn(),
  usePreferences: jest.fn(),
  useRecentMeals: jest.fn(),
  useServerConnection: jest.fn(),
  useTopMeals: jest.fn(),
  useProfile: jest.fn(() => ({ profile: { id: 'user-1' }, isLoading: false })),
  useDebounce: (value: unknown) => value,
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name, accessibilityLabel }: any) => (
      <View testID={`icon-${name}`} accessibilityLabel={accessibilityLabel} />
    ),
  };
});

const mockUseExternalFoodSearch = useExternalFoodSearch as jest.MockedFunction<
  typeof useExternalFoodSearch
>;
const mockUseExternalProviders = useExternalProviders as jest.MockedFunction<
  typeof useExternalProviders
>;
const mockUseAllProvidersSearch = useAllProvidersSearch as jest.MockedFunction<
  typeof useAllProvidersSearch
>;
const mockUseFoodSearch = useFoodSearch as jest.MockedFunction<
  typeof useFoodSearch
>;
const mockUseFoods = useFoods as jest.MockedFunction<typeof useFoods>;
const mockUseFavorites = useFavorites as jest.MockedFunction<
  typeof useFavorites
>;
const mockUseMealSearch = useMealSearch as jest.MockedFunction<
  typeof useMealSearch
>;
const mockUseMeals = useMeals as jest.MockedFunction<typeof useMeals>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockUseRecentMeals = useRecentMeals as jest.MockedFunction<
  typeof useRecentMeals
>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;
const mockUseTopMeals = useTopMeals as jest.MockedFunction<typeof useTopMeals>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildFood(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    id: 'food-1',
    name: 'Greek Chicken',
    brand: null,
    is_custom: false,
    user_id: 'user-1',
    default_variant: {
      id: 'variant-1',
      serving_size: 100,
      serving_unit: 'g',
      calories: 120,
      protein: 20,
      carbs: 2,
      fat: 3,
    },
    ...overrides,
  } as FoodItem;
}

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
    foods: [],
  } as unknown as Meal;
}

describe('FoodSearchScreen multi-select', () => {
  const navigation = {
    setOptions: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  function renderLanding(routeParams?: Record<string, unknown>) {
    const route = {
      key: 'FoodSearch-key',
      name: 'FoodSearch' as const,
      params: routeParams as any,
    };
    return render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodSearchScreen navigation={navigation} route={route} />
      </SafeAreaProvider>
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    __resetFoodSearchSelectionStoreForTests();
    useAppPreferencesStore.setState({ foodSearchOwnershipFilter: 'all' });
    mockUseServerConnection.mockReturnValue({ isConnected: true } as any);
    mockUsePreferences.mockReturnValue({ preferences: {} } as any);
    mockUseFoods.mockReturnValue({
      recentFoods: [buildFood()],
      topFoods: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseFavorites.mockReturnValue({
      favoriteFoods: [],
      favoriteMeals: [],
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
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseTopMeals.mockReturnValue({
      topMeals: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
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
    mockUseExternalFoodSearch.mockReturnValue({
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
    } as any);
    mockUseAllProvidersSearch.mockReturnValue({
      providerResults: [],
      isSearchActive: false,
      anyLoading: false,
    } as any);
  });

  test('offers the Select toggle in log-entry mode', () => {
    const screen = renderLanding();
    expect(screen.getByLabelText('Select')).toBeTruthy();
  });

  test('hides the Select toggle in meal-builder mode', () => {
    const screen = renderLanding({
      date: '2026-09-16',
      pickerMode: 'meal-builder',
    });
    expect(screen.queryByLabelText('Select')).toBeNull();
  });

  test('a food row toggles selection instead of navigating in select mode', () => {
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));

    const row = screen.getByLabelText('Select Greek Chicken');
    expect(row.props.accessibilityState).toMatchObject({ checked: false });

    fireEvent.press(screen.getByText('Greek Chicken'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(row.props.accessibilityState).toMatchObject({ checked: true });

    fireEvent.press(screen.getByText('Greek Chicken'));
    expect(screen.queryByText('1 selected')).toBeNull();
    expect(row.props.accessibilityState).toMatchObject({ checked: false });
  });

  test('a meal row keeps single-tap navigation with a basket-preserving returnDepth', () => {
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [buildMeal()],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));

    fireEvent.press(screen.getByText('Lunch Bowl'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({ returnDepth: 1 })
    );
  });

  test('Select all adds the section foods to the basket', () => {
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));
    fireEvent.press(screen.getByLabelText('Select all'));

    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  test('Cancel keeps the basket and keeps single adds basket-preserving', () => {
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));
    fireEvent.press(screen.getByText('Greek Chicken'));
    expect(screen.getByText('1 selected')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Cancel'));
    // Basket survives exiting select mode.
    expect(screen.getByText('1 selected')).toBeTruthy();

    // Rows navigate again — but with a basket still present, the add must
    // return here (depth 1) rather than pop to the diary root, which would
    // unmount this screen and silently drop the basket.
    fireEvent.press(screen.getByText('Greek Chicken'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({ returnDepth: 1 })
    );
  });

  test('the basket survives typing a search and returning', () => {
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));
    fireEvent.press(screen.getByText('Greek Chicken'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Search foods...'),
      'chicken'
    );
    expect(screen.getByText('1 selected')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Search foods...'), '');
    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.getByLabelText('Select Greek Chicken')).toBeTruthy();
  });

  test('Select all on a mixed section adds only the food rows', () => {
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [buildMeal()],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));
    fireEvent.press(screen.getByLabelText('Select all'));

    expect(screen.getByText('1 selected')).toBeTruthy();
    expect(screen.queryByLabelText('Select Lunch Bowl')).toBeNull();
  });

  test('local search results join the basket in select mode', () => {
    mockUseFoodSearch.mockReturnValue({
      searchResults: [buildFood()],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));

    fireEvent.changeText(
      screen.getByPlaceholderText('Search foods...'),
      'greek'
    );

    // The local result row toggles selection instead of navigating.
    fireEvent.press(screen.getByText('Greek Chicken'));
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(screen.getByText('1 selected')).toBeTruthy();
  });

  test('the basket bar never appears in picker modes, even with a global basket', () => {
    // Maintainer review: the store is global, so a basket built in the
    // diary flow used to reappear — with Review — inside the meal-builder
    // picker, where it would write diary entries.
    useFoodSearchSelectionStore.getState().toggle(buildFood(), 50, undefined);

    const screen = renderLanding({
      date: '2026-09-18',
      pickerMode: 'meal-builder',
    });

    expect(screen.queryByText('1 selected')).toBeNull();
    expect(screen.queryByLabelText('Review')).toBeNull();
  });

  test('Clear empties the basket and hides the bar', () => {
    const screen = renderLanding();
    fireEvent.press(screen.getByLabelText('Select'));
    fireEvent.press(screen.getByText('Greek Chicken'));
    fireEvent.press(screen.getByLabelText('Clear'));

    expect(screen.queryByText('1 selected')).toBeNull();
  });
});
