import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import LibraryScreen from '../../src/screens/LibraryScreen';
import { useFoods, useServerConnection } from '../../src/hooks';

jest.mock('../../src/hooks', () => ({
  useFoods: jest.fn(),
  useServerConnection: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUseFoods = useFoods as jest.MockedFunction<typeof useFoods>;
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

    fireEvent.press(screen.getByText('View all'));
    expect(navigation.navigate).toHaveBeenNthCalledWith(2, 'FoodsLibrary');
  });

  it('keeps the foods section visible when there are no recent foods', () => {
    const screen = renderScreen();

    expect(screen.getByText('Foods')).toBeTruthy();
    expect(screen.getByText('No recent foods yet')).toBeTruthy();
    expect(screen.getByText('View all')).toBeTruthy();

    fireEvent.press(screen.getByText('View all'));
    expect(navigation.navigate).toHaveBeenCalledWith('FoodsLibrary');
  });

  it('navigates to FoodForm in create-food mode when the Create food row is pressed', () => {
    const screen = renderScreen();

    expect(screen.getByText('Manual entry')).toBeTruthy();

    fireEvent.press(screen.getByText('Create food'));
    expect(navigation.navigate).toHaveBeenCalledWith('FoodForm', { mode: 'create-food' });
  });
});
