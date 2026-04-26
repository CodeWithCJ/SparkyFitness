import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MealsLibraryScreen from '../../src/screens/MealsLibraryScreen';
import { useMealSearch, useMeals, useServerConnection } from '../../src/hooks';

jest.mock('../../src/hooks', () => ({
  useMeals: jest.fn(),
  useMealSearch: jest.fn(),
  useServerConnection: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUseMeals = useMeals as jest.MockedFunction<typeof useMeals>;
const mockUseMealSearch = useMealSearch as jest.MockedFunction<typeof useMealSearch>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function createMeal(id: string, name: string, calories: number) {
  return {
    id,
    user_id: 'user-1',
    name,
    description: null,
    is_public: false,
    serving_size: 1,
    serving_unit: 'serving',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    foods: [
      {
        id: `meal-food-${id}`,
        food_id: `food-${id}`,
        variant_id: `variant-${id}`,
        quantity: 1,
        unit: 'serving',
        food_name: `${name} food`,
        brand: null,
        serving_size: 1,
        serving_unit: 'serving',
        calories,
        protein: 1,
        carbs: 2,
        fat: 3,
      },
    ],
  };
}

describe('MealsLibraryScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;

  const route = {
    key: 'MealsLibrary-key',
    name: 'MealsLibrary' as const,
    params: undefined,
  };

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MealsLibraryScreen navigation={navigation} route={route} />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseMeals.mockReturnValue({
      meals: [],
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
  });

  it('lists meals and navigates to MealDetail when a meal is pressed', () => {
    mockUseMeals.mockReturnValue({
      meals: [
        createMeal('meal-1', 'Overnight Oats', 350),
        createMeal('meal-2', 'Protein Shake', 220),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('Meals')).toBeTruthy();
    expect(screen.getByText('Overnight Oats')).toBeTruthy();
    expect(screen.getByText('Protein Shake')).toBeTruthy();

    fireEvent.press(screen.getByText('Overnight Oats'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'MealDetail',
      expect.objectContaining({
        mealId: 'meal-1',
        initialMeal: expect.objectContaining({ name: 'Overnight Oats' }),
      }),
    );
  });

  it('renders search results when meal search is active', () => {
    mockUseMeals.mockReturnValue({
      meals: [createMeal('meal-1', 'Overnight Oats', 350)],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseMealSearch.mockReturnValue({
      searchResults: [createMeal('meal-2', 'Protein Shake', 220)],
      isSearching: false,
      isSearchActive: true,
      isSearchError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('Protein Shake')).toBeTruthy();
    expect(screen.queryByText('Overnight Oats')).toBeNull();
  });

  it('shows the no-server state', () => {
    mockUseServerConnection.mockReturnValue({
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('No server configured')).toBeTruthy();
    fireEvent.press(screen.getByText('Go to Settings'));
    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Settings' });
  });
});
