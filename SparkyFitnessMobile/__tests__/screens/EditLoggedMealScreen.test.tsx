import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import EditLoggedMealScreen from '../../src/screens/EditLoggedMealScreen';
import { useFoodEntryMealDetails } from '../../src/hooks/useFoodEntryMealDetails';
import { useUpdateFoodEntryMeal } from '../../src/hooks/useUpdateFoodEntryMeal';
import { useDeleteFoodEntryMeal } from '../../src/hooks/useDeleteFoodEntryMeal';
import { useMealTypes } from '../../src/hooks';
import type { FoodEntryMeal } from '../../src/types/foodEntryMeals';

jest.mock('../../src/hooks/useFoodEntryMealDetails', () => ({
  useFoodEntryMealDetails: jest.fn(),
}));

jest.mock('../../src/hooks/useUpdateFoodEntryMeal', () => ({
  useUpdateFoodEntryMeal: jest.fn(),
}));

jest.mock('../../src/hooks/useDeleteFoodEntryMeal', () => ({
  useDeleteFoodEntryMeal: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  useMealTypes: jest.fn(),
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
    default: ({ calories }: any) => (
      <View>
        <Text>{Math.round(calories)} calories</Text>
      </View>
    ),
  };
});

jest.mock('../../src/components/FormInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((props: any, ref: any) => (
      <TextInput
        ref={ref}
        testID="meal-name-input"
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
      />
    )),
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
  const { View, Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ options, onSelect, renderTrigger, value }: any) => (
      <View>
        {renderTrigger?.({
          onPress: () => {},
          selectedOption: options.find((o: any) => o.value === value),
        })}
        {options.map((opt: any) => (
          <Pressable key={opt.value} onPress={() => onSelect(opt.value)} testID={`mealtype-${opt.value}`}>
            <Text>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((_p: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn() }));
      return <View />;
    }),
  };
});

const mockUseFoodEntryMealDetails = useFoodEntryMealDetails as jest.MockedFunction<typeof useFoodEntryMealDetails>;
const mockUseUpdateFoodEntryMeal = useUpdateFoodEntryMeal as jest.MockedFunction<typeof useUpdateFoodEntryMeal>;
const mockUseDeleteFoodEntryMeal = useDeleteFoodEntryMeal as jest.MockedFunction<typeof useDeleteFoodEntryMeal>;
const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const baseMeal: FoodEntryMeal = {
  id: 'fem-1',
  user_id: 'user-1',
  meal_template_id: 'tpl-1',
  meal_type: 'breakfast',
  meal_type_id: 'mt-breakfast',
  entry_date: '2026-05-15',
  name: 'My Meal',
  description: null,
  quantity: 1,
  unit: 'serving',
  foods: [
    {
      food_id: 'food-1',
      food_name: 'Chicken',
      variant_id: 'var-1',
      quantity: 100,
      unit: 'g',
      serving_size: 100,
      serving_unit: 'g',
      calories: 165,
      protein: 31,
      carbs: 0,
      fat: 4,
    },
  ],
  calories: 200,
  protein: 30,
  carbs: 5,
  fat: 5,
};

describe('EditLoggedMealScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
  } as any;

  const mockUpdateMeal = jest.fn();
  const mockConfirmAndDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFoodEntryMealDetails.mockReturnValue({
      meal: baseMeal,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as any);
    mockUseUpdateFoodEntryMeal.mockReturnValue({
      updateMeal: mockUpdateMeal,
      isPending: false,
      invalidateCache: jest.fn(),
    });
    mockUseDeleteFoodEntryMeal.mockReturnValue({
      confirmAndDelete: mockConfirmAndDelete,
      deleteEntry: jest.fn(),
      isPending: false,
      invalidateCache: jest.fn(),
    });
    mockUseMealTypes.mockReturnValue({
      mealTypes: [
        { id: 'mt-breakfast', name: 'breakfast', is_visible: true, sort_order: 1 },
        { id: 'mt-lunch', name: 'lunch', is_visible: true, sort_order: 2 },
      ] as any,
      defaultMealTypeId: 'mt-breakfast',
      isLoading: false,
      isError: false,
    });
  });

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <EditLoggedMealScreen
          navigation={navigation}
          route={{ key: 'k', name: 'EditLoggedMeal', params: { foodEntryMealId: 'fem-1' } } as any}
        />
      </SafeAreaProvider>,
    );

  it('saves merged payload (name, meal_type, meal_type_id, foods) on Save', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByTestId('meal-name-input'), 'Updated Meal Name');
    fireEvent.changeText(screen.getByTestId('quantity-input'), '2');
    fireEvent.press(screen.getByTestId('mealtype-mt-lunch'));

    fireEvent.press(screen.getByText('Save'));

    expect(mockUpdateMeal).toHaveBeenCalledTimes(1);
    const payload = mockUpdateMeal.mock.calls[0][0];
    expect(payload.name).toBe('Updated Meal Name');
    expect(payload.quantity).toBe(2);
    expect(payload.meal_type).toBe('lunch');
    expect(payload.meal_type_id).toBe('mt-lunch');
    expect(payload.meal_template_id).toBe('tpl-1');
    expect(payload.foods).toEqual([
      expect.objectContaining({
        food_id: 'food-1',
        variant_id: 'var-1',
        quantity: 100,
        unit: 'g',
      }),
    ]);
  });

  it('confirms deletion when the Delete Meal button is pressed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Delete Meal'));
    expect(mockConfirmAndDelete).toHaveBeenCalled();
  });

  it('disables Save when nothing has changed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Save'));
    expect(mockUpdateMeal).not.toHaveBeenCalled();
  });
});
