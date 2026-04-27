import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LibraryScreen from '../../src/screens/LibraryScreen';
import { useFoods, useRecentMeals, useServerConnection } from '../../src/hooks';

jest.mock('../../src/hooks', () => ({
  useFoods: jest.fn(),
  useRecentMeals: jest.fn(),
  useServerConnection: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUseFoods = useFoods as jest.MockedFunction<typeof useFoods>;
const mockUseRecentMeals = useRecentMeals as jest.MockedFunction<typeof useRecentMeals>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function createFood(id: string, name: string, calories: number) {
  return {
    id,
    name,
    brand: null,
    is_custom: false,
    default_variant: {
      id: `variant-${id}`,
      serving_size: 1,
      serving_unit: 'cup',
      calories,
      protein: 1,
      carbs: 2,
      fat: 3,
    },
  };
}

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

describe('LibraryScreen', () => {
  const navigation = {
    navigate: jest.fn(),
  } as any;

  const route = {
    key: 'Library-key',
    name: 'Library' as const,
    params: undefined,
  };

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <LibraryScreen navigation={navigation} route={route} />
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
    mockUseFoods.mockReturnValue({
      recentFoods: [],
      topFoods: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('shows a 3-item meals preview before foods and navigates from rows and View all', () => {
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [
        createMeal('m1', 'Breakfast Bowl', 350),
        createMeal('m2', 'Protein Plate', 420),
        createMeal('m3', 'Snack Box', 250),
        createMeal('m4', 'Dinner Combo', 600),
      ],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('Meals')).toBeTruthy();
    expect(screen.getByText('Foods')).toBeTruthy();
    expect(screen.getByText('Breakfast Bowl')).toBeTruthy();
    expect(screen.getByText('Protein Plate')).toBeTruthy();
    expect(screen.getByText('Snack Box')).toBeTruthy();
    expect(screen.queryByText('Dinner Combo')).toBeNull();

    fireEvent.press(screen.getByText('Breakfast Bowl'));
    expect(navigation.navigate).toHaveBeenNthCalledWith(
      1,
      'MealDetail',
      expect.objectContaining({
        mealId: 'm1',
        initialMeal: expect.objectContaining({ name: 'Breakfast Bowl' }),
      }),
    );

    fireEvent.press(screen.getAllByText('View all')[0]);
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, 'MealsLibrary');
  });

  it('shows a 3-item foods preview and navigates from rows and View all', () => {
    mockUseFoods.mockReturnValue({
      recentFoods: [
        createFood('1', 'Apple', 95),
        createFood('2', 'Banana', 105),
        createFood('3', 'Oats', 150),
        createFood('4', 'Yogurt', 120),
      ],
      topFoods: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('Foods')).toBeTruthy();
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Banana')).toBeTruthy();
    expect(screen.getByText('Oats')).toBeTruthy();
    expect(screen.queryByText('Yogurt')).toBeNull();

    fireEvent.press(screen.getByText('Apple'));
    expect(navigation.navigate).toHaveBeenNthCalledWith(
      1,
      'FoodDetail',
      expect.objectContaining({
        item: expect.objectContaining({
          id: '1',
          name: 'Apple',
          source: 'local',
        }),
      }),
    );

    fireEvent.press(screen.getAllByText('View all')[1]);
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, 'FoodsLibrary');
  });



  it('keeps the meals section visible when there are no recent meals', () => {
    const screen = renderScreen();

    expect(screen.getByText('Meals')).toBeTruthy();
    expect(screen.getByText('No recent meals yet')).toBeTruthy();

    fireEvent.press(screen.getAllByText('View all')[0]);
    expect(navigation.navigate).toHaveBeenCalledWith('MealsLibrary');
  });

  it('navigates to FoodForm in create-food mode when the Manual entry row is pressed', () => {
    const screen = renderScreen();

    expect(screen.getByText('Manual entry')).toBeTruthy();

    fireEvent.press(screen.getByText('Manual entry'));
    expect(navigation.navigate).toHaveBeenCalledWith('FoodForm', { mode: 'create-food' });
  });
});
