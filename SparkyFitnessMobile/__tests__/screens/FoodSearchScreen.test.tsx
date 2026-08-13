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
  useFavorites,
  useMealSearch,
  useMeals,
  usePreferences,
  useRecentMeals,
  useServerConnection,
  useTopMeals,
} from '../../src/hooks';
import type { Meal } from '../../src/types/meals';
import type { FoodItem } from '../../src/types/foods';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';
import {
  findHeaderItemByAccessibilityLabel,
  findHeaderMenuAction,
  pressHeaderMenuAction,
} from './helpers/nativeHeaderTestUtils';

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
    default: ({ name, accessibilityLabel }: any) => (
      <View testID={`icon-${name}`} accessibilityLabel={accessibilityLabel} />
    ),
  };
});

const mockFetchExternalFoodDetails = fetchExternalFoodDetails as jest.MockedFunction<typeof fetchExternalFoodDetails>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;
const mockUseExternalFoodSearch = useExternalFoodSearch as jest.MockedFunction<typeof useExternalFoodSearch>;
const mockUseExternalProviders = useExternalProviders as jest.MockedFunction<typeof useExternalProviders>;
const mockUseAllProvidersSearch = useAllProvidersSearch as jest.MockedFunction<typeof useAllProvidersSearch>;
const mockUseFoodSearch = useFoodSearch as jest.MockedFunction<typeof useFoodSearch>;
const mockUseFoods = useFoods as jest.MockedFunction<typeof useFoods>;
const mockUseFavorites = useFavorites as jest.MockedFunction<typeof useFavorites>;
const mockUseMealSearch = useMealSearch as jest.MockedFunction<typeof useMealSearch>;
const mockUseMeals = useMeals as jest.MockedFunction<typeof useMeals>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockUseRecentMeals = useRecentMeals as jest.MockedFunction<typeof useRecentMeals>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseTopMeals = useTopMeals as jest.MockedFunction<typeof useTopMeals>;

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

function buildFood(overrides: Partial<FoodItem> = {}): FoodItem {
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
    ...overrides,
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
    __resetAppPreferencesStoreForTests();
    mockUseServerConnection.mockReturnValue({ isConnected: true } as any);
    mockUsePreferences.mockReturnValue({ preferences: {} } as any);
    mockUseFoods.mockReturnValue({
      recentFoods: [],
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

  it('floats favorited foods to the top of Your Foods, and does so above the local cap', () => {
    // Eight results with the favorite ranked LAST by relevance. The local cap
    // (6) only bites when an online section also renders, so switch one on.
    // Ordering has to happen before the slice: order after it and the favorite,
    // sitting outside the cap, could never float up at all.
    const foods = Array.from({ length: 8 }, (_, i) =>
      buildFood({ id: `food-${i + 1}`, name: `Result ${i + 1} Food` }),
    );
    const favorite = foods[7];

    mockUseFoodSearch.mockReturnValue({
      searchResults: foods,
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);
    mockUseFavorites.mockReturnValue({
      favoriteFoods: [{ ...favorite, favorited_at: '2026-07-01T00:00:00.000Z' }],
      favoriteMeals: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseExternalProviders.mockReturnValue(fatSecretProvider);
    mockUseExternalFoodSearch.mockReturnValue(
      activeExternalSearch({ searchResults: [externalItem] }),
    );

    const screen = renderSearching();

    // The favorite is rendered first, ahead of the relevance-ordered rest.
    const rendered = screen
      .getAllByText(/^Result \d Food$/)
      .map((node) => node.props.children);
    expect(rendered[0]).toBe('Result 8 Food');
    expect(rendered.slice(1)).toEqual([
      'Result 1 Food',
      'Result 2 Food',
      'Result 3 Food',
      'Result 4 Food',
      'Result 5 Food',
    ]);
    // It took a slot inside the cap, so the last non-favorite is pushed out.
    expect(screen.queryByText('Result 6 Food')).toBeNull();
  });

  it('floats favorited meals to the top of Your Meals without moving them out of the section', () => {
    const plain = { ...buildMeal(), id: 'meal-1', name: 'Alpha Meal' };
    const favorite = { ...buildMeal(), id: 'meal-2', name: 'Zeta Meal' };

    mockUseMealSearch.mockReturnValue({
      searchResults: [plain, favorite],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });
    mockUseFavorites.mockReturnValue({
      favoriteFoods: [],
      favoriteMeals: [{ ...favorite, favorited_at: '2026-07-01T00:00:00.000Z' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);

    const screen = renderSearching();

    // Still under Your Meals — floated, not lifted into a group of its own.
    expect(screen.getByText('Your Meals')).toBeTruthy();
    const rendered = screen
      .getAllByText(/^(Alpha|Zeta) Meal$/)
      .map((node) => node.props.children);
    expect(rendered).toEqual(['Zeta Meal', 'Alpha Meal']);
  });

  it('marks favorited rows with a star in search results, where the FAVORITES header is gone', () => {
    // Once a query is typed there is no FAVORITES header, so ordering is the
    // only cue that an item is starred — and ordering is invisible unless you
    // already know the relevance order. The star is the signal; assert it lands
    // on exactly the favorited food and meal, and on nothing else.
    const plainFood = buildFood({ id: 'food-1', name: 'Plain Food' });
    const favFood = buildFood({ id: 'food-2', name: 'Starred Food' });
    const plainMeal = { ...buildMeal(), id: 'meal-1', name: 'Plain Meal' };
    const favMeal = { ...buildMeal(), id: 'meal-2', name: 'Starred Meal' };

    mockUseFoodSearch.mockReturnValue({
      searchResults: [plainFood, favFood],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);
    mockUseMealSearch.mockReturnValue({
      searchResults: [plainMeal, favMeal],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });
    mockUseFavorites.mockReturnValue({
      favoriteFoods: [{ ...favFood, favorited_at: '2026-07-01T00:00:00.000Z' }],
      favoriteMeals: [{ ...favMeal, favorited_at: '2026-07-01T00:00:00.000Z' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);

    const screen = renderSearching();

    // One star for the favorited food, one for the favorited meal — and none on
    // the two plain rows.
    expect(screen.getAllByLabelText('Favorite')).toHaveLength(2);
    expect(screen.getByText('Starred Food')).toBeTruthy();
    expect(screen.getByText('Starred Meal')).toBeTruthy();
  });

  it('renders verified badge for verified local foods in search results', () => {
    mockUseFoodSearch.mockReturnValue({
      searchResults: [buildFood({ provider_verified: true })],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);

    const screen = renderSearching();

    expect(screen.getByText('Grilled Chicken')).toBeTruthy();
    expect(screen.getByTestId('verified-badge')).toBeTruthy();
  });

  it('renders local provider portion units in search result rows', () => {
    mockUseFoodSearch.mockReturnValue({
      searchResults: [
        buildFood({
          default_variant: {
            id: 'variant-whole',
            serving_size: 1,
            serving_unit: 'whole',
            serving_description: '1 whole (20 g)',
            calories: 12,
            protein: 0,
            carbs: 3,
            fat: 0,
          },
        }),
      ],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);

    const screen = renderSearching();

    expect(screen.getByText('1 whole')).toBeTruthy();
  });

  it('forwards an optional mealTypeId param through to FoodEntryAdd', () => {
    mockUseMealSearch.mockReturnValue({
      searchResults: [buildMeal()],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });

    const withMealTypeRoute = {
      key: 'FoodSearch-key',
      name: 'FoodSearch' as const,
      params: { date: '2026-01-01', mealTypeId: 'custom-pw' },
    };
    const screen = renderSearching(withMealTypeRoute);

    fireEvent.press(screen.getByText('Lunch Bowl'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({
        mealTypeId: 'custom-pw',
      }),
    );
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

  // The Favorites section lives on the LANDING, so the meal-builder test below
  // (which types a query) never sees it — that gap is exactly how favorited
  // meals stayed visible in builder mode.
  function renderLanding(routeOverride: typeof route = route) {
    return render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodSearchScreen navigation={navigation} route={routeOverride} />
      </SafeAreaProvider>,
    );
  }

  const builderRoute = {
    key: 'FoodSearch-key',
    name: 'FoodSearch' as const,
    params: { pickerMode: 'meal-builder' as const },
  };

  function favoriteOneFoodAndOneMeal() {
    mockUseFavorites.mockReturnValue({
      favoriteFoods: [
        { ...buildFood({ id: 'food-1', name: 'Starred Food' }), favorited_at: '2026-07-01T00:00:00.000Z' },
      ],
      favoriteMeals: [
        { ...buildMeal(), id: 'meal-1', name: 'Starred Meal', favorited_at: '2026-07-02T00:00:00.000Z' },
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
  }

  it('withholds favorited MEALS from the Favorites landing in meal-builder mode', () => {
    // This picker cannot emit a meal ingredient (handleMealBuilderAdd rejects a
    // 'meal' source), and recent/top meals + meal search are already disabled
    // here. Without this, Favorites is the one surface that offers a meal and
    // then refuses it two screens later. Favorited FOODS must still show.
    favoriteOneFoodAndOneMeal();

    const screen = renderLanding(builderRoute);

    expect(screen.queryByText('Starred Meal')).toBeNull();
    expect(screen.getByText('Starred Food')).toBeTruthy();
  });

  it('shows favorited meals on the Favorites landing outside meal-builder mode', () => {
    // The control for the test above: the gate is scoped to builder mode, not a
    // blanket "favorites cannot hold meals".
    favoriteOneFoodAndOneMeal();

    const screen = renderLanding();

    expect(screen.getByText('Starred Meal')).toBeTruthy();
    expect(screen.getByText('Starred Food')).toBeTruthy();
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

  it('forwards the tapped row serving to the detail fetch so the preview keeps it', async () => {
    mockUseExternalProviders.mockReturnValue(fatSecretProvider);
    mockUseExternalFoodSearch.mockReturnValue(
      activeExternalSearch({ searchResults: [externalItem] }),
    );
    mockFetchExternalFoodDetails.mockResolvedValue(externalItem);

    const screen = renderSearching();

    fireEvent.press(screen.getByText('Cheddar Cheese'));

    await waitFor(() => {
      expect(mockFetchExternalFoodDetails).toHaveBeenCalledWith(
        'fatsecret',
        'ext-1',
        'p1',
        expect.objectContaining({ serving_size: 100, serving_unit: 'g' }),
      );
    });
  });

  it('persists an ownership filter chosen from the native overflow menu', () => {
    renderSearching();

    pressHeaderMenuAction(navigation, 'Mine');

    expect(useAppPreferencesStore.getState().foodSearchOwnershipFilter).toBe('mine');
  });

  it('checkmarks the active filter and badges the native menu button', () => {
    useAppPreferencesStore.setState({ foodSearchOwnershipFilter: 'mine' });

    renderSearching();

    expect(findHeaderMenuAction(navigation, 'Mine')?.state).toBe('on');
    expect(findHeaderMenuAction(navigation, 'All')?.state).toBe('off');
    const button = findHeaderItemByAccessibilityLabel(
      navigation,
      'More options, filtered to Mine',
    );
    // Dot badge: bullet glyph with foreground matched to background.
    expect(button?.badge?.value).toBe('•');
  });

  it('names the filter and offers Show All when it empties the search results', () => {
    useAppPreferencesStore.setState({ foodSearchOwnershipFilter: 'mine' });
    // The result belongs to no known owner, so the Mine filter hides it.
    mockUseFoodSearch.mockReturnValue({
      searchResults: [buildFood()],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
    } as any);

    const screen = renderSearching();

    expect(screen.getByText('No saved foods or meals found in Mine')).toBeTruthy();

    fireEvent.press(screen.getByText('Show All'));

    expect(useAppPreferencesStore.getState().foodSearchOwnershipFilter).toBe('all');
    expect(screen.getByText('Grilled Chicken')).toBeTruthy();
  });

  it('suppresses online results and disables the provider queries under Mine', () => {
    useAppPreferencesStore.setState({ foodSearchOwnershipFilter: 'mine' });
    mockUseExternalProviders.mockReturnValue(fatSecretProvider);
    mockUseExternalFoodSearch.mockReturnValue(
      activeExternalSearch({ searchResults: [externalItem] }),
    );

    const screen = renderSearching();

    // Online rows never mix into a Mine/Family view: provider results are
    // public catalog data, so the section is withheld even though the hook
    // (mocked here) still reports results.
    expect(screen.queryByText('Online Results')).toBeNull();
    expect(screen.queryByText('Cheddar Cheese')).toBeNull();
    // The queries themselves are disabled too, not just hidden.
    expect(mockUseExternalFoodSearch).toHaveBeenLastCalledWith(
      'chicken',
      'fatsecret',
      expect.objectContaining({ enabled: false }),
    );
    expect(mockUseAllProvidersSearch).toHaveBeenLastCalledWith(
      'chicken',
      expect.anything(),
      expect.objectContaining({ enabled: false }),
    );
  });

  it('keeps online results visible under the Public filter', () => {
    useAppPreferencesStore.setState({ foodSearchOwnershipFilter: 'public' });
    mockUseExternalProviders.mockReturnValue(fatSecretProvider);
    mockUseExternalFoodSearch.mockReturnValue(
      activeExternalSearch({ searchResults: [externalItem] }),
    );

    const screen = renderSearching();

    expect(screen.getByText('Online Results')).toBeTruthy();
    expect(screen.getByText('Cheddar Cheese')).toBeTruthy();
  });

  it('names the filter and offers Show All when it empties the landing', () => {
    useAppPreferencesStore.setState({ foodSearchOwnershipFilter: 'family' });

    const screen = renderLanding();

    expect(screen.getByText('No foods in Family')).toBeTruthy();

    fireEvent.press(screen.getByText('Show All'));

    expect(useAppPreferencesStore.getState().foodSearchOwnershipFilter).toBe('all');
    expect(screen.getByText('Search for a food or meal to log')).toBeTruthy();
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

  it('retries the meals queries as well as foods from the landing error state', () => {
    // An outage fails foods and meals together, so a retry that only refetches
    // foods would clear the error screen and leave the meals half empty.
    const refetchFoods = jest.fn();
    const refetchRecentMeals = jest.fn();
    const refetchTopMeals = jest.fn();
    mockUseFoods.mockReturnValue({
      recentFoods: [],
      topFoods: [],
      isLoading: false,
      isError: true,
      refetch: refetchFoods,
    } as any);
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [],
      isLoading: false,
      isError: true,
      refetch: refetchRecentMeals,
    } as any);
    mockUseTopMeals.mockReturnValue({
      topMeals: [],
      isLoading: false,
      isError: true,
      refetch: refetchTopMeals,
    } as any);

    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodSearchScreen navigation={navigation} route={route} />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByText('Retry'));

    expect(refetchFoods).toHaveBeenCalled();
    expect(refetchRecentMeals).toHaveBeenCalled();
    expect(refetchTopMeals).toHaveBeenCalled();
  });

  it('forwards mealTypeId through to the barcode scanner (FoodScan)', () => {
    const withMealTypeRoute = {
      key: 'FoodSearch-key',
      name: 'FoodSearch' as const,
      params: { date: '2026-01-01', mealTypeId: 'custom-pw' },
    };
    // Landing render (empty query) shows the Scan Food button.
    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodSearchScreen navigation={navigation} route={withMealTypeRoute} />
      </SafeAreaProvider>,
    );
    const scanButton = screen.getByLabelText('Scan Food');
    fireEvent.press(scanButton);
    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodScan',
      expect.objectContaining({
        date: '2026-01-01',
        mealTypeId: 'custom-pw',
      }),
    );
  });

});
