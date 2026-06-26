import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MealDetailScreen from '../../src/screens/MealDetailScreen';
import { useDeleteMeal, useMeal, useProfile, useServerConnection } from '../../src/hooks';
import type { Meal } from '../../src/types/meals';

jest.mock('../../src/hooks', () => ({
  useDeleteMeal: jest.fn(),
  useMeal: jest.fn(),
  useProfile: jest.fn(),
  useServerConnection: jest.fn(),
  usePreferences: jest.fn(() => ({ preferences: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useCustomNutrients: jest.fn(() => ({ customNutrients: [], isLoading: false, isError: false, refetch: jest.fn() })),
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

const mockUseDeleteMeal = useDeleteMeal as jest.MockedFunction<typeof useDeleteMeal>;
const mockUseMeal = useMeal as jest.MockedFunction<typeof useMeal>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
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
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setOptions: jest.fn(),
  } as any;
  const route = {
    key: 'MealDetail-key',
    name: 'MealDetail' as const,
    params: {
      mealId: meal.id,
      initialMeal: meal,
    },
  };

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MealDetailScreen navigation={navigation} route={route} />
      </SafeAreaProvider>,
    );

  // On iOS the Edit action lives in the native header, applied via
  // navigation.setOptions({ unstable_headerRightItems }); pull it back out to
  // assert on the native item config.
  const getHeaderRightItems = () =>
    (navigation.setOptions as jest.Mock).mock.calls.at(-1)?.[0]?.unstable_headerRightItems;

  beforeEach(() => {
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
    expect(headerRightItems()).toEqual([
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

    const editItem = getHeaderRightItems()()[0];
    editItem.onPress();

    expect(navigation.navigate).toHaveBeenCalledWith('MealAdd', {
      mode: 'edit',
      mealId: 'meal-1',
      initialMeal: meal,
    });
  });

  it('hides edit and delete actions for meals owned by someone else', () => {
    mockUseProfile.mockReturnValue({
      profile: { id: 'user-2' } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    const screen = renderScreen();

    expect(getHeaderRightItems()).toBeUndefined();
    expect(screen.queryByText('Delete Meal')).toBeNull();
    expect(screen.getByText('Log Meal')).toBeTruthy();
  });

  it('triggers delete confirmation from the delete action', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Delete Meal'));

    expect(mockConfirmAndDelete).toHaveBeenCalledTimes(1);
  });
});
