import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FoodFormScreen from '../../src/screens/FoodFormScreen';
import { useMealTypes } from '../../src/hooks';
import { useSaveFood } from '../../src/hooks/useSaveFood';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { setPendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';

const mockPop = jest.fn((count: number) => ({ type: 'POP', payload: { count } }));
const mockPopToTop = jest.fn(() => ({ type: 'POP_TO_TOP' }));

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    StackActions: {
      pop: (count: number) => mockPop(count),
      popToTop: () => mockPopToTop(),
    },
  };
});

jest.mock('../../src/hooks', () => ({
  useMealTypes: jest.fn(),
}));

jest.mock('../../src/hooks/useSaveFood', () => ({
  useSaveFood: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntry', () => ({
  useAddFoodEntry: jest.fn(),
}));

jest.mock('../../src/services/mealBuilderSelection', () => ({
  setPendingMealIngredientSelection: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/StepperInput', () => {
  const React = require('react');
  const { TextInput } = require('react-native');
  return {
    __esModule: true,
    default: ({ value, onChangeText, onBlur }: any) => (
      <TextInput
        testID="form-quantity-input"
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

jest.mock('../../src/components/CalendarSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef((_props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ present: jest.fn() }));
      return <View testID="calendar-sheet" />;
    }),
  };
});

let mockSubmittedFoodFormData: any;

jest.mock('../../src/components/FoodForm', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ onSubmit, children, submitLabel = 'Add Food' }: any) => (
      <View>
        {children}
        <Pressable onPress={() => onSubmit(mockSubmittedFoodFormData)}>
          <Text>{submitLabel}</Text>
        </Pressable>
      </View>
    ),
  };
});

const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockUseSaveFood = useSaveFood as jest.MockedFunction<typeof useSaveFood>;
const mockUseAddFoodEntry = useAddFoodEntry as jest.MockedFunction<typeof useAddFoodEntry>;
const mockSetPendingMealIngredientSelection =
  setPendingMealIngredientSelection as jest.MockedFunction<typeof setPendingMealIngredientSelection>;
const mockToast = Toast as unknown as { show: jest.Mock };

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodFormScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    dispatch: jest.fn(),
  } as any;

  const mockSaveFoodAsync = jest.fn();
  const mockAddEntry = jest.fn();
  const mockInvalidateCache = jest.fn();

  const renderScreen = (params: any) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodFormScreen
          navigation={navigation}
          route={{
            key: 'FoodForm-key',
            name: 'FoodForm',
            params,
          } as any}
        />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmittedFoodFormData = {
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '200',
      protein: '10',
      carbs: '20',
      fat: '5',
      fiber: '',
      saturatedFat: '',
      transFat: '',
      sodium: '',
      sugars: '',
      potassium: '',
      cholesterol: '',
      calcium: '',
      iron: '',
      vitaminA: '',
      vitaminC: '',
    };
    mockUseMealTypes.mockReturnValue({
      mealTypes: [{ id: 'meal-1', name: 'breakfast', is_visible: true, sort_order: 1 }] as any,
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
    });
    mockUseSaveFood.mockReturnValue({
      saveFood: jest.fn(),
      saveFoodAsync: mockSaveFoodAsync,
      isPending: false,
      isSaved: false,
    });
    mockUseAddFoodEntry.mockImplementation((options) => ({
      addEntry: (input: any) => {
        mockAddEntry(input);
        options?.onSuccess?.({ entry_date: '2026-04-23' } as any);
      },
      isPending: false,
      invalidateCache: mockInvalidateCache,
    }));
  });

  it('saves a custom food, stores a pending ingredient draft, and pops back in meal-builder mode', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Custom Meal Food',
      brand: 'Brand Co',
      is_custom: true,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 100,
        serving_unit: 'g',
        calories: 200,
        protein: 10,
        carbs: 20,
        fat: 5,
      },
    });

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
      ingredient: expect.objectContaining({
        food_id: 'saved-food-1',
        variant_id: 'saved-variant-1',
        quantity: 100,
        unit: 'g',
      }),
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP',
      payload: { count: 2 },
    });
  });

  it('keeps the normal save-and-log flow outside meal-builder mode and pops to top on success', async () => {
    const screen = renderScreen({
      mode: 'create-food',
      date: '2026-04-23',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith({
        saveFoodPayload: expect.objectContaining({
          name: 'Custom Meal Food',
          brand: 'Brand Co',
          serving_size: 100,
          serving_unit: 'g',
          is_custom: true,
          is_quick_food: false,
          is_default: true,
          barcode: null,
          provider_type: null,
        }),
        createEntryPayload: {
          meal_type_id: 'meal-1',
          quantity: 100,
          unit: 'g',
          entry_date: '2026-04-23',
        },
      });
    });
    expect(mockInvalidateCache).toHaveBeenCalledWith('2026-04-23');
    expect(navigation.dispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP' });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
  });

  it('hides the logging block in meal-builder mode', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
      barcode: '0123456789',
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Meal')).toBeNull();
    expect(screen.queryByText('Save to Database')).toBeNull();
    expect(screen.queryByText('Barcode will be saved.')).toBeNull();
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
  });

  it('renders the logging controls in normal mode', () => {
    const screen = renderScreen({
      mode: 'create-food',
      barcode: '0123456789',
    });

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Meal')).toBeTruthy();
    expect(screen.getByText('Save to Database')).toBeTruthy();
    expect(screen.getByText('Barcode will be saved.')).toBeTruthy();
    expect(screen.getByTestId('calendar-sheet')).toBeTruthy();
  });

  it('blocks submit when the name is missing', () => {
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: '   ',
    };

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Missing name',
      text2: 'Please enter a food name.',
    });
    expect(mockSaveFoodAsync).not.toHaveBeenCalled();
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('blocks submit when the serving size is invalid', () => {
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingSize: '0',
    };

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Invalid serving size',
      text2: 'Serving size must be greater than zero.',
    });
    expect(mockSaveFoodAsync).not.toHaveBeenCalled();
    expect(mockAddEntry).not.toHaveBeenCalled();
  });
});
