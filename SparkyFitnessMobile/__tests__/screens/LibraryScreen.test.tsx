import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LibraryScreen from '../../src/screens/LibraryScreen';
import { useFoods, useMeals, useRecentMeals, useServerConnection, useSuggestedExercises } from '../../src/hooks';
import { fetchExercisesCount } from '../../src/services/api/exerciseApi';
import { fetchFoodsPage } from '../../src/services/api/foodsApi';
import { fetchWorkoutPresetsPage } from '../../src/services/api/workoutPresetsApi';

jest.mock('../../src/hooks', () => ({
  useFoods: jest.fn(),
  useMeals: jest.fn(),
  useRecentMeals: jest.fn(),
  useServerConnection: jest.fn(),
  useSuggestedExercises: jest.fn(),
}));

jest.mock('../../src/services/api/foodsApi', () => ({
  fetchFoodsPage: jest.fn(),
}));

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExercisesCount: jest.fn(),
}));

jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  fetchWorkoutPresetsPage: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUseFoods = useFoods as jest.MockedFunction<typeof useFoods>;
const mockUseMeals = useMeals as jest.MockedFunction<typeof useMeals>;
const mockUseRecentMeals = useRecentMeals as jest.MockedFunction<typeof useRecentMeals>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseSuggestedExercises = useSuggestedExercises as jest.MockedFunction<typeof useSuggestedExercises>;
const mockFetchFoodsPage = fetchFoodsPage as jest.MockedFunction<typeof fetchFoodsPage>;
const mockFetchExercisesCount = fetchExercisesCount as jest.MockedFunction<typeof fetchExercisesCount>;
const mockFetchWorkoutPresetsPage = fetchWorkoutPresetsPage as jest.MockedFunction<typeof fetchWorkoutPresetsPage>;

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

  const renderScreen = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <LibraryScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  };

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
    mockUseMeals.mockReturnValue({
      meals: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseSuggestedExercises.mockReturnValue({
      recentExercises: [],
      topExercises: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockFetchFoodsPage.mockResolvedValue({
      foods: [],
      pagination: { page: 1, pageSize: 1, totalCount: 0, hasMore: false },
    });
    mockFetchExercisesCount.mockResolvedValue(0);
    mockFetchWorkoutPresetsPage.mockResolvedValue({
      presets: [],
      pagination: { page: 1, pageSize: 1, totalCount: 0, hasMore: false },
    });
  });

  it('shows meals, foods, and exercises totals', async () => {
    mockUseMeals.mockReturnValue({
      meals: [createMeal('m1', 'A', 100), createMeal('m2', 'B', 200)] as any,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockFetchFoodsPage.mockResolvedValue({
      foods: [],
      pagination: { page: 1, pageSize: 1, totalCount: 448, hasMore: true },
    });
    mockFetchExercisesCount.mockResolvedValue(17);

    const screen = renderScreen();

    expect(screen.getByText('Meals')).toBeTruthy();
    expect(screen.getByText('Foods')).toBeTruthy();
    expect(screen.getByText('Exercises')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('448')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('17')).toBeTruthy());
  });

  it('navigates to MealsLibrary when the Meals row is pressed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Meals'));
    expect(navigation.navigate).toHaveBeenCalledWith('MealsLibrary');
  });

  it('navigates to FoodsLibrary when the Foods row is pressed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Foods'));
    expect(navigation.navigate).toHaveBeenCalledWith('FoodsLibrary');
  });

  it('shows a single combined Recent list of up to 4 items mixing meals and foods', () => {
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [
        createMeal('m1', 'Breakfast Bowl', 350),
        createMeal('m2', 'Protein Plate', 420),
        createMeal('m3', 'Snack Box', 250),
        createMeal('m4', 'Dinner Combo', 600),
      ] as any,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseFoods.mockReturnValue({
      recentFoods: [
        createFood('1', 'Apple', 95),
        createFood('2', 'Banana', 105),
      ] as any,
      topFoods: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('Recent')).toBeTruthy();
    // Interleaved: meal, food, meal, food → 4 items total.
    expect(screen.getByText('Breakfast Bowl')).toBeTruthy();
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Protein Plate')).toBeTruthy();
    expect(screen.getByText('Banana')).toBeTruthy();
    // Beyond the 4-item cap.
    expect(screen.queryByText('Snack Box')).toBeNull();
    expect(screen.queryByText('Dinner Combo')).toBeNull();
  });

  it('navigates from a recent meal row to MealDetail', () => {
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [createMeal('m1', 'Breakfast Bowl', 350)] as any,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen();
    fireEvent.press(screen.getByText('Breakfast Bowl'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'MealDetail',
      expect.objectContaining({
        mealId: 'm1',
        initialMeal: expect.objectContaining({ name: 'Breakfast Bowl' }),
      }),
    );
  });

  it('navigates from a recent food row to FoodDetail', () => {
    mockUseFoods.mockReturnValue({
      recentFoods: [createFood('1', 'Apple', 95)] as any,
      topFoods: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();
    fireEvent.press(screen.getByText('Apple'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodDetail',
      expect.objectContaining({
        item: expect.objectContaining({ id: '1', name: 'Apple', source: 'local' }),
      }),
    );
  });

  it('shows the empty state when there are no recent items', () => {
    const screen = renderScreen();
    expect(screen.getByText('No recent items yet')).toBeTruthy();
  });

  it('navigates to ExercisesLibrary when the Exercises browse row is pressed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Exercises'));
    expect(navigation.navigate).toHaveBeenCalledWith('ExercisesLibrary');
  });

  it('navigates to WorkoutPresetsLibrary when the Workout presets row is pressed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Workout presets'));
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPresetsLibrary');
  });

  it('shows the workout presets count from the API', async () => {
    mockFetchWorkoutPresetsPage.mockResolvedValue({
      presets: [],
      pagination: { page: 1, pageSize: 1, totalCount: 9, hasMore: true },
    });

    const screen = renderScreen();

    await waitFor(() => expect(screen.getByText('9')).toBeTruthy());
  });

  it('renders recent exercises in the combined Recent list and navigates to ExerciseDetail on press', () => {
    const exercise = {
      id: 'ex-1',
      name: 'Bench Press',
      category: 'strength',
      equipment: ['barbell'],
      primary_muscles: ['chest'],
      secondary_muscles: ['triceps'],
      calories_per_hour: 300,
      source: 'sparky',
      images: [],
    };
    mockUseSuggestedExercises.mockReturnValue({
      recentExercises: [exercise],
      topExercises: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('Recent')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();

    fireEvent.press(screen.getByText('Bench Press'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'ExerciseDetail',
      expect.objectContaining({ item: expect.objectContaining({ id: 'ex-1' }) }),
    );
  });

  it('interleaves meals, foods, and exercises in the combined Recent list', () => {
    mockUseRecentMeals.mockReturnValue({
      recentMeals: [createMeal('m1', 'Breakfast Bowl', 350)] as any,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseFoods.mockReturnValue({
      recentFoods: [createFood('1', 'Apple', 95)] as any,
      topFoods: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseSuggestedExercises.mockReturnValue({
      recentExercises: [
        {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'strength',
          equipment: ['barbell'],
          primary_muscles: ['chest'],
          secondary_muscles: ['triceps'],
          calories_per_hour: 300,
          source: 'sparky',
          images: [],
        },
      ],
      topExercises: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(screen.getByText('Breakfast Bowl')).toBeTruthy();
    expect(screen.getByText('Apple')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });

  it('navigates to FoodForm in create-food mode when the Food create tile is pressed', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Food'));
    expect(navigation.navigate).toHaveBeenCalledWith('FoodForm', {
      mode: 'create-food',
      pickerMode: 'library',
    });
  });

  it('navigates to ExerciseForm in create-exercise mode when the Exercise create tile is pressed', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Exercise'));
    expect(navigation.navigate).toHaveBeenCalledWith('ExerciseForm', {
      mode: 'create-exercise',
    });
  });
});
