import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { pressAction, pressActionByAccessibilityLabel } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FoodEntryAddScreen from '../../src/screens/FoodEntryAddScreen';
import { useMealTypes } from '../../src/hooks';
import {
  useCreateFoodVariant,
  useFoodVariants,
} from '../../src/hooks/useFoodVariants';
import { useSaveFood } from '../../src/hooks/useSaveFood';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import { useAddFoodEntryMeal } from '../../src/hooks/useAddFoodEntryMeal';
import { setPendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import { buildMealIngredientDraft } from '../../src/utils/mealBuilderDraft';

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
  usePreferences: jest.fn(() => ({ preferences: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
}));

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useFoodVariants: jest.fn(),
  useCreateFoodVariant: jest.fn(),
}));

jest.mock('../../src/hooks/useSaveFood', () => ({
  useSaveFood: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntry', () => ({
  useAddFoodEntry: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntryMeal', () => ({
  useAddFoodEntryMeal: jest.fn(),
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

jest.mock('../../src/components/FoodUnitSelectorSheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
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
const mockUseCreateFoodVariant =
  useCreateFoodVariant as jest.MockedFunction<typeof useCreateFoodVariant>;
const mockUseSaveFood = useSaveFood as jest.MockedFunction<typeof useSaveFood>;
const mockUseAddFoodEntry = useAddFoodEntry as jest.MockedFunction<typeof useAddFoodEntry>;
const mockUseAddFoodEntryMeal =
  useAddFoodEntryMeal as jest.MockedFunction<typeof useAddFoodEntryMeal>;
const mockSetPendingMealIngredientSelection =
  setPendingMealIngredientSelection as jest.MockedFunction<typeof setPendingMealIngredientSelection>;
const mockBuildMealIngredientDraft =
  buildMealIngredientDraft as jest.MockedFunction<typeof buildMealIngredientDraft>;
const mockToast = Toast as unknown as { show: jest.Mock };

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodEntryAddScreen', () => {
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    setParams: jest.fn(),
    dispatch: jest.fn(),
    setOptions: jest.fn(),
  } as any;

  const mockSaveFoodAsync = jest.fn();
  const mockAddEntry = jest.fn();
  const mockAddEntryAsync = jest.fn();
  const mockInvalidateCache = jest.fn();
  const mockAddMeal = jest.fn();
  const mockInvalidateMealCache = jest.fn();
  const mockCreateVariant = jest.fn();

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
    mockUseFoodVariants.mockImplementation((foodId, options) => ({
      variants:
        foodId === 'food-1' && options?.enabled !== false
          ? ([
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
            ] as any)
          : undefined,
      isLoading: false,
      isError: false,
    }));
    mockUseCreateFoodVariant.mockReturnValue({
      createVariant: mockCreateVariant,
      isPending: false,
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
      addEntryAsync: async (input: any) => {
        mockAddEntryAsync(input);
        options?.onSuccess?.({ entry_date: '2026-04-23' } as any);
        return { id: 'entry-1' } as any;
      },
      isPending: false,
      invalidateCache: mockInvalidateCache,
    }));
    mockUseAddFoodEntryMeal.mockReturnValue({
      addMeal: mockAddMeal,
      isPending: false,
      invalidateCache: mockInvalidateMealCache,
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

  it('preserves converted nutrition when first adding an external converted unit to a meal', async () => {
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
    mockCreateVariant.mockResolvedValue({
      id: 'saved-variant-oz',
      food_id: 'saved-food-1',
      serving_size: '1',
      serving_unit: 'oz',
      calories: undefined,
      protein: undefined,
      carbs: undefined,
      fat: undefined,
    });

    const screen = renderScreen({
      item: baseExternalItem,
      pickerMode: 'meal-builder',
      adjustedValues: {
        name: 'Protein Bar',
        brand: 'Remote Brand',
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
        kind: 'draft',
        variant: {
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

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledTimes(1);
    });

    expect(mockSetPendingMealIngredientSelection).toHaveBeenCalledWith({
      ingredient: expect.objectContaining({
        food_id: 'saved-food-1',
        variant_id: 'saved-variant-oz',
        quantity: 1,
        unit: 'oz',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      }),
      ingredientIndex: undefined,
    });
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
    mockBuildMealIngredientDraft.mockImplementationOnce(() => {
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

    fireEvent.press(screen.getByText('Add Meal'));

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

  it('dispatches addMeal when logging a meal item (not addEntry)', () => {
    mockUseFoodVariants.mockReturnValueOnce({
      variants: [],
      isLoading: false,
      isError: false,
    } as any);

    const screen = renderScreen({
      item: baseMealItem,
      date: '2026-05-15',
    });

    fireEvent.press(screen.getByText('Add Meal'));

    expect(mockAddMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_template_id: 'meal-1',
        meal_type: 'breakfast',
        meal_type_id: 'meal-1',
        entry_date: '2026-05-15',
        name: 'Breakfast Meal',
        quantity: 1,
        unit: 'serving',
      }),
    );
    expect(mockAddMeal.mock.calls[0][0]).not.toHaveProperty('foods');
    expect(mockAddEntry).not.toHaveBeenCalled();
  });

  it('preserves numeric-string meal quantities and serving units when reopening an ingredient draft', () => {
    const screen = renderScreen({
      item: {
        ...baseLocalItem,
        originalItem: {
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: '2.5',
          unit: '',
          serving_unit: 'oz',
          calories: '120',
          protein: '10',
          carbs: '8',
          fat: '4',
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
    expect(screen.getByText(/· 1 cup per serving/)).toBeTruthy();

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

  it('keeps converted local units in the adjust flow and logs the returned variant', async () => {
    const screen = renderScreen({
      item: baseLocalItem,
      date: '2026-04-23',
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

    fireEvent.press(screen.getByText('Add Food'));

    expect(mockAddEntry).toHaveBeenCalledWith({
      saveFoodPayload: undefined,
      createEntryPayload: expect.objectContaining({
        meal_type_id: 'meal-1',
        quantity: 1,
        unit: 'oz',
        entry_date: '2026-04-23',
        food_id: 'food-1',
        variant_id: 'variant-oz',
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
      }),
    });
    expect(screen.queryByText('Create Draft Unit')).toBeNull();
  });

  it('switches a saved external draft unit into the local logging flow', async () => {
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
    mockCreateVariant.mockResolvedValue({
      id: 'saved-variant-oz',
      food_id: 'saved-food-1',
      serving_size: 1,
      serving_unit: 'oz',
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
    });

    const screen = renderScreen({
      item: baseExternalItem,
      date: '2026-04-23',
      adjustedValues: {
        name: 'Protein Bar',
        brand: 'Remote Brand',
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
        kind: 'draft',
        variant: {
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

    expect(screen.getByText(/1 oz per serving/)).toBeTruthy();

    pressActionByAccessibilityLabel(screen, navigation, 'Save Food');

    await waitFor(() => {
      expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledWith({
        food_id: 'saved-food-1',
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

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntry).toHaveBeenCalledWith({
        saveFoodPayload: undefined,
        createEntryPayload: {
          meal_type_id: 'meal-1',
          quantity: 1,
          unit: 'oz',
          entry_date: '2026-04-23',
          food_id: 'saved-food-1',
          variant_id: 'saved-variant-oz',
        },
      });
    });
    expect(mockSaveFoodAsync).toHaveBeenCalledTimes(1);
    expect(mockAddEntryAsync).not.toHaveBeenCalled();
  });

  it('chains save and create-variant when an external converted unit is selected', async () => {
    const screen = renderScreen({
      item: baseExternalItem,
      date: '2026-04-23',
      adjustedValues: {
        name: 'Protein Bar',
        brand: 'Remote Brand',
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
        kind: 'draft',
        variant: {
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

    fireEvent.press(screen.getByText('Add Food'));

    await waitFor(() => {
      expect(mockAddEntryAsync).toHaveBeenCalledWith({
        saveFoodPayload: {
          name: 'Protein Bar',
          brand: 'Remote Brand',
          serving_size: 1,
          serving_unit: 'bar',
          calories: 200,
          protein: 20,
          carbs: 22,
          fat: 7,
          dietary_fiber: undefined,
          saturated_fat: undefined,
          sodium: undefined,
          sugars: undefined,
          trans_fat: undefined,
          potassium: undefined,
          calcium: undefined,
          iron: undefined,
          cholesterol: undefined,
          vitamin_a: undefined,
          vitamin_c: undefined,
        },
        saveThenCreateVariantPayload: {
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
        },
        createEntryPayload: {
          meal_type_id: 'meal-1',
          quantity: 1,
          unit: 'oz',
          entry_date: '2026-04-23',
        },
      });
    });
  });

  describe('draft adjustedUnitSelection handling', () => {
    // Use a stable variants array so the useFoodVariants mock doesn't create a
    // new array reference on every render (which would cause the adjustedUnitSelection
    // useEffect to loop via the localUnitVariants dependency).
    const stableVariants = [
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
    ];

    beforeEach(() => {
      mockUseFoodVariants.mockImplementation((foodId, options) => ({
        variants:
          foodId === 'food-1' && options?.enabled !== false
            ? (stableVariants as any)
            : undefined,
        isLoading: false,
        isError: false,
      }));
    });

    const draftAdjustedValues = {
      name: 'Greek Yogurt',
      brand: 'Sparky',
      servingSize: '30',
      servingUnit: 'mg',
      calories: '50',
      protein: '5',
      carbs: '3',
      fat: '2',
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

    it('preserves real selectedVariantId for local foods when draft is returned', async () => {
      // Regression: draft branch was calling setSelectedVariantId(draftId) for
      // local foods, poisoning save payloads with a non-persisted variant ID.
      const screen = renderScreen({
        item: baseLocalItem,
        date: '2026-04-23',
        adjustedValues: draftAdjustedValues,
        adjustedUnitSelection: {
          kind: 'draft',
          variant: {
            id: 'FORM_DRAFT_UNIT_ID',
            serving_size: 30,
            serving_unit: 'mg',
            calories: 50,
            protein: 5,
            carbs: 3,
            fat: 2,
          },
        },
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith({
          adjustedValues: undefined,
          adjustedUnitSelection: undefined,
        });
      });

      fireEvent.press(screen.getByText('Add Food'));

      await waitFor(() => {
        expect(mockAddEntry).toHaveBeenCalledWith(
          expect.objectContaining({
            createEntryPayload: expect.objectContaining({
              variant_id: 'variant-1', // real persisted ID, not 'FORM_DRAFT_UNIT_ID'
            }),
          }),
        );
      });
    });

    it('updates selectedVariantId for external foods when draft is returned', async () => {
      // External foods don't have persisted variant IDs, so draft ID update is correct.
      const screen = renderScreen({
        item: baseExternalItem,
        date: '2026-04-23',
        adjustedValues: {
          ...draftAdjustedValues,
          name: 'Protein Bar',
          brand: 'Remote Brand',
        },
        adjustedUnitSelection: {
          kind: 'draft',
          variant: {
            id: 'EXTERNAL_DRAFT_VARIANT_ID',
            serving_size: 30,
            serving_unit: 'mg',
            calories: 50,
            protein: 5,
            carbs: 3,
            fat: 2,
          },
        },
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith({
          adjustedValues: undefined,
          adjustedUnitSelection: undefined,
        });
      });

      // For external foods the screen should render without crash
      expect(screen.getByText('Add Food')).toBeTruthy();
    });

    it('passes displayValues-based selectedUnitSelection when re-opening AdjustNutrition after draft return', async () => {
      // After receiving a draft unit back, re-opening AdjustNutrition should pass
      // selectedUnitSelection whose variant nutrition matches the current displayValues
      // (the adjusted values), not the original DB variant's nutrition.
      const screen = renderScreen({
        item: baseLocalItem,
        date: '2026-04-23',
        adjustedValues: draftAdjustedValues,
        adjustedUnitSelection: {
          kind: 'draft',
          variant: {
            id: undefined,
            serving_size: 30,
            serving_unit: 'mg',
            calories: 50,
            protein: 5,
            carbs: 3,
            fat: 2,
          },
        },
      });

      await waitFor(() => {
        expect(navigation.setParams).toHaveBeenCalledWith({
          adjustedValues: undefined,
          adjustedUnitSelection: undefined,
        });
      });

      // Find and press the nutrition edit (pencil) button
      if (Platform.OS === 'ios') {
        pressAction(screen, navigation, 'Edit');
      } else {
        const editButtons = screen.queryAllByTestId('icon-pencil');
        expect(editButtons.length).toBeGreaterThan(0);
        fireEvent.press(editButtons[0]);
      }
      expect(navigation.navigate).toHaveBeenCalledWith(
        'FoodForm',
        expect.objectContaining({
          selectedUnitSelection: expect.objectContaining({
            variant: expect.objectContaining({
              serving_unit: 'mg',
              calories: 50,
            }),
          }),
        }),
      );
    });
  });
});
