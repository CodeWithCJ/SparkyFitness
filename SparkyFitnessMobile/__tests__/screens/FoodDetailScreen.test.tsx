import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodDetailScreen from '../../src/screens/FoodDetailScreen';
import { useDeleteFood, useFoodVariants, useProfile, useServerConnection } from '../../src/hooks';
import { useCreateFoodVariant } from '../../src/hooks/useFoodVariants';

jest.mock('../../src/hooks', () => ({
  useDeleteFood: jest.fn(),
  useFoodVariants: jest.fn(),
  useProfile: jest.fn(),
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

jest.mock('../../src/components/FoodUnitSelectorSheet', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ variants, onSelect, renderTrigger }: any) => (
      <View>
        {renderTrigger?.({ onPress: () => {} })}
        {variants.map((variant: any, index: number) => (
          <Pressable
            key={variant.id ?? `variant-${index}`}
            onPress={() => onSelect({ kind: 'existing', variant })}
          >
            <Text>{`${variant.serving_size} ${variant.serving_unit} (${Math.round(variant.calories)} cal)`}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() =>
            onSelect({
              kind: 'draft',
              variant: {
                serving_size: 1,
                serving_unit: 'oz',
                calories: 120,
                protein: 10,
                carbs: 8,
                fat: 4,
              },
            })
          }
        >
          <Text>Create Draft Unit</Text>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useCreateFoodVariant: jest.fn(),
}));

const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<typeof useFoodVariants>;
const mockUseDeleteFood = useDeleteFood as jest.MockedFunction<typeof useDeleteFood>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;
const mockUseCreateFoodVariant =
  useCreateFoodVariant as jest.MockedFunction<typeof useCreateFoodVariant>;
const mockConfirmAndDelete = jest.fn();

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodDetailScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
  } as any;
  const mockCreateVariant = jest.fn();

  const baseItem = {
    id: 'food-1',
    name: 'Greek Yogurt',
    brand: 'Sparky',
    userId: 'user-1',
    sharedWithPublic: false,
    servingSize: 1,
    servingUnit: 'cup',
    calories: 100,
    protein: 15,
    carbs: 6,
    fat: 0,
    customNutrients: null,
    variantId: 'variant-1',
    source: 'local' as const,
    originalItem: {
      id: 'food-1',
      name: 'Greek Yogurt',
    },
  };

  const buildRoute = (itemOverrides: Record<string, unknown> = {}) => ({
    key: 'FoodDetail-key',
    name: 'FoodDetail' as const,
    params: {
      item: {
        ...baseItem,
        ...itemOverrides,
      },
    },
  });

  const renderScreen = (itemOverrides: Record<string, unknown> = {}) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodDetailScreen navigation={navigation} route={buildRoute(itemOverrides) as any} />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseProfile.mockReturnValue({
      profile: { id: 'user-1' } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseDeleteFood.mockReturnValue({
      confirmAndDelete: mockConfirmAndDelete,
      invalidateCaches: jest.fn(),
      isPending: false,
    });
    mockUseCreateFoodVariant.mockReturnValue({
      createVariant: mockCreateVariant,
      isPending: false,
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

  it('opens the edit form for owned foods using the selected variant values', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getAllByText('2 cup (200 cal)')[0]);
    fireEvent.press(screen.getByText('Edit'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodForm',
      expect.objectContaining({
        mode: 'edit-food',
        foodId: 'food-1',
        variantId: 'variant-2',
        initialValues: expect.objectContaining({
          name: 'Greek Yogurt',
          brand: 'Sparky',
          servingSize: '2',
          servingUnit: 'cup',
          calories: '200',
        }),
      }),
    );
  });

  it('hides edit and delete actions for public foods owned by another user', () => {
    const screen = renderScreen({
      userId: 'user-2',
      sharedWithPublic: true,
    });

    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete Food')).toBeNull();
  });

  it('shows delete for owned foods and triggers the delete hook', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Delete Food'));

    expect(mockConfirmAndDelete).toHaveBeenCalledTimes(1);
  });

  it('creates a converted local unit and carries it into log food navigation', async () => {
    mockCreateVariant.mockResolvedValue({
      id: 'variant-oz',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    });

    const screen = renderScreen();

    fireEvent.press(screen.getByText('Create Draft Unit'));

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledWith({
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        dietary_fiber: undefined,
        saturated_fat: undefined,
        polyunsaturated_fat: undefined,
        monounsaturated_fat: undefined,
        sodium: undefined,
        sugars: undefined,
        trans_fat: undefined,
        potassium: undefined,
        calcium: undefined,
        iron: undefined,
        cholesterol: undefined,
        vitamin_a: undefined,
        vitamin_c: undefined,
        glycemic_index: undefined,
        custom_nutrients: undefined,
      });
    });

    fireEvent.press(screen.getByText('Log Food'));

    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({
        item: expect.objectContaining({
          id: 'food-1',
          variantId: 'variant-oz',
          calories: 120,
          servingSize: 1,
          servingUnit: 'oz',
        }),
      }),
    );
  });
});
