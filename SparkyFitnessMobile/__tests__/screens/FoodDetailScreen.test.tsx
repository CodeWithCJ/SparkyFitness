import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodDetailScreen from '../../src/screens/FoodDetailScreen';
import { useFoodVariants, useServerConnection } from '../../src/hooks';

jest.mock('../../src/hooks', () => ({
  useFoodVariants: jest.fn(),
  useServerConnection: jest.fn(),
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
    default: (props: any) => <View testID={`icon-${props.name}`} />,
  };
});

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, onSelect, renderTrigger, value }: any) => (
      <View>
        {renderTrigger?.({
          onPress: () => {},
          selectedOption: options.find((option: any) => option.value === value),
        })}
        {options.map((option: any) => (
          <Pressable key={option.value} onPress={() => onSelect(option.value)}>
            <Text>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<typeof useFoodVariants>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodDetailScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const route = {
    key: 'FoodDetail-key',
    name: 'FoodDetail' as const,
    params: {
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Sparky',
        servingSize: 1,
        servingUnit: 'cup',
        calories: 100,
        protein: 15,
        carbs: 6,
        fat: 0,
        variantId: 'variant-1',
        source: 'local' as const,
        originalItem: {
          id: 'food-1',
          name: 'Greek Yogurt',
        },
      },
    },
  };

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodDetailScreen navigation={navigation} route={route as any} />
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
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'cup',
          calories: 100,
          protein: 15,
          carbs: 6,
          fat: 0,
        },
        {
          id: 'variant-2',
          food_id: 'food-1',
          serving_size: 2,
          serving_unit: 'cup',
          calories: 200,
          protein: 30,
          carbs: 12,
          fat: 0,
        },
      ] as any,
      isLoading: false,
      isError: false,
    });
  });

  it('updates the displayed nutrition when the selected serving changes and logs the selected variant', async () => {
    const screen = renderScreen();

    expect(screen.getByText('Greek Yogurt')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();

    fireEvent.press(screen.getAllByText('2 cup (200 cal)')[0]);

    await waitFor(() => {
      expect(screen.getByText('200')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Log Food'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({
        item: expect.objectContaining({
          id: 'food-1',
          variantId: 'variant-2',
          calories: 200,
          servingSize: 2,
          servingUnit: 'cup',
        }),
      }),
    );
  });
});
