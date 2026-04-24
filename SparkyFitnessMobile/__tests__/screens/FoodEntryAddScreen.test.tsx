import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FoodEntryAddScreen from '../../src/screens/FoodEntryAddScreen';
import { useMealTypes } from '../../src/hooks';
import { useFoodVariants } from '../../src/hooks/useFoodVariants';
import { useSaveFood } from '../../src/hooks/useSaveFood';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { setPendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import {
  buildMealIngredientDraft,
  buildMealIngredientDraftFromSavedFood,
} from '../../src/utils/mealBuilderDraft';

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

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  useMealTypes: jest.fn(),
}));

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useFoodVariants: jest.fn(),
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

jest.mock('../../src/components/ui/Button', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, onPress, disabled, accessibilityLabel }: any) => (
      <Pressable
        onPress={disabled ? undefined : onPress}
        accessibilityLabel={accessibilityLabel}
      >
        {children}
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

jest.mock('../../src/components/FoodNutritionSummary', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <Text>{name}</Text>,
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

jest.mock('../../src/utils/mealBuilderDraft', () => {
  const actual = jest.requireActual('../../src/utils/mealBuilderDraft');
  return {
    ...actual,
    buildMealIngredientDraft: jest.fn(actual.buildMealIngredientDraft),
    buildMealIngredientDraftFromSavedFood: jest.fn(actual.buildMealIngredientDraftFromSavedFood),
  };
});

const { useQuery } = jest.requireMock('@tanstack/react-query') as { useQuery: jest.Mock };
const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockUseFoodVariants = useFoodVariants as jest.MockedFunction<typeof useFoodVariants>;
const mockUseSaveFood = useSaveFood as jest.MockedFunction<typeof useSaveFood>;
const mockUseAddFoodEntry = useAddFoodEntry as jest.MockedFunction<typeof useAddFoodEntry>;
const mockSetPendingMealIngredientSelection =
  setPendingMealIngredientSelection as jest.MockedFunction<typeof setPendingMealIngredientSelection>;
const mockBuildMealIngredientDraft =
  buildMealIngredientDraft as jest.MockedFunction<typeof buildMealIngredientDraft>;
const mockBuildMealIngredientDraftFromSavedFood =
  buildMealIngredientDraftFromSavedFood as jest.MockedFunction<
    typeof buildMealIngredientDraftFromSavedFood
  >;
const mockToast = Toast as unknown as { show: jest.Mock };

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodEntryAddScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    dispatch: jest.fn(),
  } as any;

  const mockSaveFoodAsync = jest.fn();
  const mockAddEntry = jest.fn();
  const mockInvalidateCache = jest.fn();

  const baseLocalItem = {
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
  };

  const baseExternalItem = {
    id: 'external-1',
    name: 'Protein Bar',
    brand: 'Remote Brand',
    servingSize: 1,
    servingUnit: 'bar',
    calories: 200,
    protein: 20,
    carbs: 22,
    fat: 7,
    source: 'external' as const,
    originalItem: {
      id: 'external-1',
      name: 'Protein Bar',
    },
  };

  const baseMealItem = {
    id: 'meal-1',
    name: 'Breakfast Meal',
    brand: null,
    servingSize: 1,
    servingUnit: 'serving',
    calories: 450,
    protein: 25,
    carbs: 40,
    fat: 18,
    source: 'meal' as const,
    originalItem: {
      id: 'meal-1',
      name: 'Breakfast Meal',
      foods: [],
    },
  };

  const renderScreen = (params: any) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodEntryAddScreen
          navigation={navigation}
          route={{
            key: 'FoodEntryAdd-key',
            name: 'FoodEntryAdd',
            params,
          } as any}
        />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
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
    mockUseSaveFood.mockReturnValue({
      saveFood: jest.fn(),
      saveFoodAsync: mockSaveFoodAsync,
      isPending: false,
      isSaved: false,
    });
    mockUseAddFoodEntry.mockReturnValue({
      addEntry: mockAddEntry,
      isPending: false,
      invalidateCache: mockInvalidateCache,
    });
  });

  it('stores a pending ingredient and pops back for local foods in meal-builder mode', async () => {
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'meal-builder',
      returnDepth: 2,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
        ingredient: expect.objectContaining({
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 1,
          unit: 'cup',
        }),
        ingredientIndex: undefined,
      });
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP',
      payload: { count: 2 },
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('saves external foods first and then stores the ingredient draft in meal-builder mode', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Protein Bar',
      brand: 'Remote Brand',
      is_custom: false,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
      returnDepth: 3,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
      ingredient: expect.objectContaining({
        food_id: 'saved-food-1',
        variant_id: 'saved-variant-1',
        quantity: 1,
      }),
      ingredientIndex: undefined,
    });
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'POP',
      payload: { count: 3 },
    });
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('does not pop when saving an external food fails and relies on the save-food toast', async () => {
    mockSaveFoodAsync.mockImplementation(async () => {
      mockToast.show({
        type: 'error',
        text1: 'Failed to save food',
        text2: 'Please try again.',
      });
      throw new Error('save failed');
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
      returnDepth: 1,
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Failed to save food',
      text2: 'Please try again.',
    });
    expect(mockToast.show).not.toHaveBeenCalledWith({
      type: 'error',
      text1: 'Failed to add food',
      text2: 'Please try again.',
    });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('shows a fallback toast when draft building fails after an external save succeeds', async () => {
    mockSaveFoodAsync.mockResolvedValue({
      id: 'saved-food-1',
      name: 'Protein Bar',
      brand: 'Remote Brand',
      is_custom: false,
      default_variant: {
        id: 'saved-variant-1',
        serving_size: 1,
        serving_unit: 'bar',
        calories: 200,
        protein: 20,
        carbs: 22,
        fat: 7,
      },
    });
    mockBuildMealIngredientDraftFromSavedFood.mockImplementationOnce(() => {
      throw new Error('bad draft');
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Failed to add food',
      text2: 'Please try again.',
    });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('shows an error when a meal is selected in meal-builder mode', () => {
    const screen = renderScreen({
      item: baseMealItem,
      pickerMode: 'meal-builder',
    });

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Meals not supported here',
      text2: 'Select a food instead of another meal.',
    });
  });

  it('hides diary-only controls in meal-builder mode', () => {
    const screen = renderScreen({
      item: baseLocalItem,
      pickerMode: 'meal-builder',
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Meal')).toBeNull();
  });

  it('preserves the saved quantity when editing a meal ingredient draft', () => {
    const screen = renderScreen({
      item: {
        ...baseLocalItem,
        originalItem: {
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 2.5,
        },
      },
      pickerMode: 'meal-builder',
    });

    expect(screen.getByDisplayValue('2.5')).toBeTruthy();
  });

  it('keeps the normal log-entry path and diary controls outside meal-builder mode', () => {
    const screen = renderScreen({
      item: baseLocalItem,
      date: '2026-04-23',
    });

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Meal')).toBeTruthy();

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockAddEntry).toHaveBeenCalledWith({
      saveFoodPayload: undefined,
      createEntryPayload: {
        meal_type_id: 'meal-1',
        quantity: 1,
        unit: 'cup',
        entry_date: '2026-04-23',
        food_id: 'food-1',
        variant_id: 'variant-1',
      },
    });
    expect(mockSetPendingMealIngredientSelection).not.toHaveBeenCalled();
  });
});
