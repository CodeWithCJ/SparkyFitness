import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MealDetailScreen from '../../src/screens/MealDetailScreen';
import { useDeleteMeal, useFavorites, useMeal, useProfile, useServerConnection, useToggleFavorite } from '../../src/hooks';
import type { Meal } from '../../src/types/meals';

jest.mock('../../src/hooks', () => ({
  useDeleteMeal: jest.fn(),
  useMeal: jest.fn(),
  useProfile: jest.fn(),
  useServerConnection: jest.fn(),
  useUpdateMeal: jest.fn(() => ({ updateMeal: jest.fn(), isPending: false })),
  usePreferences: jest.fn(() => ({ preferences: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useCustomNutrients: jest.fn(() => ({ customNutrients: [], isLoading: false, isError: false, refetch: jest.fn() })),
  useFavorites: jest.fn(() => ({ favoriteFoods: [], favoriteMeals: [], isLoading: false, isError: false, refetch: jest.fn() })),
  useToggleFavorite: jest.fn(() => ({ toggleFavorite: jest.fn(), isPending: false })),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
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

jest.mock('../../src/components/NutritionMacroCard', () => {
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ calories, heading }: any) => (
      <View>
        {heading ? <Text>{heading}</Text> : null}
        <Text>{Math.round(calories)} calories</Text>
      </View>
    ),
  };
});

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseDeleteMeal = useDeleteMeal as jest.MockedFunction<typeof useDeleteMeal>;
const mockUseMeal = useMeal as jest.MockedFunction<typeof useMeal>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseFavorites = useFavorites as jest.MockedFunction<typeof useFavorites>;
const mockUseToggleFavorite = useToggleFavorite as jest.MockedFunction<typeof useToggleFavorite>;
const mockConfirmAndDelete = jest.fn();

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    user_id: 'user-1',
    name: 'Lunch Bowl',
    description: 'Chicken and rice',
    is_public: false,
    serving_size: 2,
    serving_unit: 'servings',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    foods: [
      {
        id: 'meal-food-1',
        food_id: 'food-1',
        variant_id: 'variant-1',
        quantity: 2,
        unit: 'serving',
        food_name: 'Chicken',
        brand: null,
        serving_size: 1,
        serving_unit: 'serving',
        calories: 200,
        protein: 30,
        carbs: 0,
        fat: 6,
      },
    ],
    ...overrides,
  };
}

describe('MealDetailScreen', () => {
  const meal = buildMeal();
  const navigation = mockNavigation;
  const route = {
    key: 'MealDetail-key',
    name: 'MealDetail' as const,
    params: {
      mealId: meal.id,
      initialMeal: meal,
    },
  };

  let queryClient: QueryClient;

  const renderScreen = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <MealDetailScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );

  // On iOS the Edit action lives in the native header, applied via
  // navigation.setOptions({ unstable_headerRightItems }); pull it back out to
  // assert on the native item config.
  const getHeaderRightItems = () =>
    (navigation.setOptions as jest.Mock).mock.calls.at(-1)?.[0]?.unstable_headerRightItems;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    jest.clearAllMocks();
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseProfile.mockReturnValue({
      profile: { id: 'user-1' } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseMeal.mockReturnValue({
      meal,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseFavorites.mockReturnValue({
      favoriteFoods: [],
      favoriteMeals: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockUseToggleFavorite.mockReturnValue({
      toggleFavorite: jest.fn(),
      isPending: false,
    });
    mockUseDeleteMeal.mockReturnValue({
      confirmAndDelete: mockConfirmAndDelete,
      isPending: false,
    });
  });

  it('shows owner edit and delete actions', () => {
    const screen = renderScreen();

    expect(screen.getByText('Lunch Bowl')).toBeTruthy();
    expect(screen.getByText('Per serving')).toBeTruthy();
    expect(screen.getByText('Delete Meal')).toBeTruthy();

    const headerRightItems = getHeaderRightItems();
    expect(headerRightItems).toBeTruthy();
    // Favorite star first (accent button), then the owner-gated Edit action.
    expect(headerRightItems()).toEqual([
      expect.objectContaining({
        type: 'button',
        identifier: 'meal-detail-favorite',
        accessibilityLabel: 'Add to favorites',
        sharesBackground: true,
      }),
      expect.objectContaining({
        type: 'button',
        identifier: 'meal-detail-share',
        sharesBackground: true,
      }),
      expect.objectContaining({
        type: 'button',
        label: 'Edit',
        identifier: 'meal-detail-edit',
        sharesBackground: true,
      }),
    ]);
  });

  it('logs the meal from the detail screen', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Log Meal'));

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

  it('opens MealAdd in edit mode for owners', () => {
    renderScreen();

    // [0] is the favorite star, [1] is the share toggle, [2] is the edit action.
    const editItem = getHeaderRightItems()()[2];
    editItem.onPress();

    expect(navigation.navigate).toHaveBeenCalledWith('MealAdd', {
      mode: 'edit',
      mealId: 'meal-1',
      initialMeal: meal,
    });
  });

  it('hides edit and delete but keeps the favorite star for non-owners', () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'user-2' } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    // A non-owner can still favorite an accessible meal (access is verified
    // server-side on add), so the star remains while Edit/Delete drop out.
    expect(getHeaderRightItems()()).toEqual([
      expect.objectContaining({ identifier: 'meal-detail-favorite' }),
    ]);
    expect(screen.queryByText('Delete Meal')).toBeNull();
    expect(screen.getByText('Log Meal')).toBeTruthy();
  });

  it('triggers delete confirmation from the delete action', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Delete Meal'));

    expect(mockConfirmAndDelete).toHaveBeenCalledTimes(1);
  });

  it('toggles the meal favorite from the header star', () => {
    const toggleFavorite = jest.fn();
    mockUseToggleFavorite.mockReturnValue({ toggleFavorite, isPending: false });

    renderScreen();

    const favItem = getHeaderRightItems()().find(
      (item: { identifier?: string }) => item.identifier === 'meal-detail-favorite',
    );
    expect(favItem?.accessibilityLabel).toBe('Add to favorites');

    favItem.onPress();
    expect(toggleFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'meal', id: 'meal-1', isFavorite: false }),
    );
  });

  it('shows the starred state when the meal is a favorite', () => {
    mockUseFavorites.mockReturnValue({
      favoriteFoods: [],
      favoriteMeals: [{ id: 'meal-1' }],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);

    renderScreen();

    const favItem = getHeaderRightItems()().find(
      (item: { identifier?: string }) => item.identifier === 'meal-detail-favorite',
    );
    expect(favItem?.accessibilityLabel).toBe('Remove from favorites');
  });
});
