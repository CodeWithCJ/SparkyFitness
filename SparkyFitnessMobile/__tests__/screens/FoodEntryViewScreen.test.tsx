import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { pressAction, expectActionPresent } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodEntryViewScreen from '../../src/screens/FoodEntryViewScreen';
import { useMealTypes } from '../../src/hooks';
import {
  useCreateFoodVariant,
  useFoodVariants,
} from '../../src/hooks/useFoodVariants';
import { useDeleteFoodEntry } from '../../src/hooks/useDeleteFoodEntry';
import { useUpdateFoodEntry } from '../../src/hooks/useUpdateFoodEntry';
import { useProfile } from '../../src/hooks/useProfile';

jest.mock('../../src/hooks', () => ({
  useMealTypes: jest.fn(),
  usePreferences: jest.fn(() => ({ preferences: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useCustomNutrients: jest.fn(() => ({ customNutrients: [], isLoading: false, isError: false, refetch: jest.fn() })),
}));

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useFoodVariants: jest.fn(),
  useCreateFoodVariant: jest.fn(),
}));

jest.mock('../../src/hooks/useDeleteFoodEntry', () => ({
  useDeleteFoodEntry: jest.fn(),
}));

jest.mock('../../src/hooks/useUpdateFoodEntry', () => ({
  useUpdateFoodEntry: jest.fn(),
}));

jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/FadeView', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children }: any) => <>{children}</>,
  };
});

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/ui/Button', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, onPress, disabled }: any) => (
      <Pressable onPress={disabled ? undefined : onPress}>
        {typeof children === 'string' ? <Text>{children}</Text> : children}
      </Pressable>
    ),
  };
});

jest.mock('../../src/components/StepperInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onChangeText, onBlur }: any) => (
      <TextInput
        testID="quantity-input"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
      />
    ),
  };
});

jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, value, onSelect, renderTrigger }: any) => (
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
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ renderTrigger }: any) => <View>{renderTrigger?.({ onPress: () => {} })}</View>,
  };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockCalendarSheet = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn() }));
    return <View testID="calendar-sheet" />;
  });
  MockCalendarSheet.displayName = 'MockCalendarSheet';
  return {
    __esModule: true,
    default: MockCalendarSheet,
  };
});

const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<typeof useFoodVariants>;
const mockUseCreateFoodVariant =
  useCreateFoodVariant as jest.MockedFunction<typeof useCreateFoodVariant>;
const mockUseDeleteFoodEntry =
  useDeleteFoodEntry as jest.MockedFunction<typeof useDeleteFoodEntry>;
const mockUseUpdateFoodEntry =
  useUpdateFoodEntry as jest.MockedFunction<typeof useUpdateFoodEntry>;
const mockUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodEntryViewScreen', () => {
  const navigation = {
    setOptions: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    replace: jest.fn(),
  } as any;

  const mockCreateVariant = jest.fn();
  const mockUpdateEntry = jest.fn();

  const baseEntry = {
    id: 'entry-1',
    food_id: 'food-1',
    variant_id: 'variant-1',
    user_id: 'user-1',
    meal_type: 'breakfast',
    meal_type_id: 'meal-1',
    quantity: 1,
    unit: 'cup',
    food_name: 'Greek Yogurt',
    brand_name: 'Sparky',
    entry_date: '2026-05-07',
    serving_size: 1,
    calories: 100,
    protein: 15,
    carbs: 6,
    fat: 0,
  };

  const renderScreen = (params?: Record<string, unknown>) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodEntryViewScreen
          navigation={navigation}
          route={{
            key: 'FoodEntryView-key',
            name: 'FoodEntryView',
            params: { entry: baseEntry, ...params },
          } as any}
        />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseMealTypes.mockReturnValue({
      mealTypes: [{ id: 'meal-1', name: 'breakfast', is_visible: true, sort_order: 1 }] as any,
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
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
      ] as any,
      isLoading: false,
      isError: false,
    });
    mockUseCreateFoodVariant.mockReturnValue({
      createVariant: mockCreateVariant,
      isPending: false,
    });
    mockUseDeleteFoodEntry.mockReturnValue({
      confirmAndDelete: jest.fn(),
      isPending: false,
      invalidateCache: jest.fn(),
    });
    mockUseUpdateFoodEntry.mockReturnValue({
      updateEntry: mockUpdateEntry,
      isPending: false,
      invalidateCache: jest.fn(),
    });
    mockUseProfile.mockReturnValue({
      profile: { id: 'user-1' } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  it('redirects to EditLoggedMeal when the entry has food_entry_meal_id', () => {
    renderScreen({ entry: { ...baseEntry, food_entry_meal_id: 'fem-99' } });
    expect(navigation.replace).toHaveBeenCalledWith('EditLoggedMeal', {
      foodEntryMealId: 'fem-99',
    });
  });

  it('does not redirect for a standalone food entry', () => {
    renderScreen();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('applies the unit returned from adjust nutrition and saves against that variant', async () => {
    const screen = renderScreen({
      adjustedValues: {
        name: 'Greek Yogurt',
        brand: 'Sparky',
        servingSize: '1',
        servingUnit: 'oz',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
        fiber: '',
        saturatedFat: '',
        sodium: '',
        sugars: '',
        transFat: '',
        potassium: '',
        calcium: '',
        iron: '',
        cholesterol: '',
        vitaminA: '',
        vitaminC: '',
      },
      adjustedUnitSelection: {
        kind: 'existing',
        variant: {
          id: 'variant-oz',
          food_id: 'food-1',
          serving_size: 1,
          serving_unit: 'oz',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      },
    });

    await waitFor(() => {
      expect(navigation.setParams).toHaveBeenCalledWith({
        adjustedValues: undefined,
        adjustedUnitSelection: undefined,
      });
    });

    expect(screen.getByText('1 serving · 1 cup per serving')).toBeTruthy();

    pressAction(screen, navigation, 'Edit');
    pressAction(screen, navigation, 'Done');

    expect(mockUpdateEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        variant_id: 'variant-oz',
        unit: 'oz',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
      }),
    );
    expect(screen.queryByText('Create Draft Unit')).toBeNull();
  });
});
