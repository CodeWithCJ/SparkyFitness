import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FoodFormScreen from '../../src/screens/FoodFormScreen';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import { useMealTypes, usePreferences } from '../../src/hooks';
import { useSaveFood } from '../../src/hooks/useSaveFood';
import { useAddFoodEntry } from '../../src/hooks/useAddFoodEntry';
import {
  useCreateFoodVariant,
  useFoodVariants,
} from '../../src/hooks/useFoodVariants';
import { setPendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import { updateFoodEntriesSnapshot } from '../../src/services/api/foodsApi';

const mockPop = jest.fn((count: number) => ({ type: 'POP', payload: { count } }));
const mockPopToTop = jest.fn(() => ({ type: 'POP_TO_TOP' }));
const mockFoodForm = jest.fn();
const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
} as any;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => mockNavigation,
    StackActions: {
      pop: (count: number) => mockPop(count),
      popToTop: () => mockPopToTop(),
    },
  };
});

jest.mock('../../src/hooks', () => ({
  useMealTypes: jest.fn(),
  usePreferences: jest.fn(),
}));

jest.mock('../../src/hooks/useSaveFood', () => ({
  useSaveFood: jest.fn(),
}));

jest.mock('../../src/hooks/useAddFoodEntry', () => ({
  useAddFoodEntry: jest.fn(),
}));

jest.mock('../../src/hooks/useFoodVariants', () => ({
  useCreateFoodVariant: jest.fn(),
  useFoodVariants: jest.fn(),
}));

jest.mock('../../src/services/mealBuilderSelection', () => ({
  setPendingMealIngredientSelection: jest.fn(),
}));

// The edit path writes through foodsApi directly (not a hook), so without this
// the save hits the real client, throws for lack of a server config, and never
// reaches the post-save prompt.
jest.mock('../../src/services/api/foodsApi', () => ({
  createFoodVariant: jest.fn(() => Promise.resolve({ id: 'variant-new' })),
  deleteFoodVariant: jest.fn(() => Promise.resolve()),
  updateFoodVariant: jest.fn(() => Promise.resolve({})),
  updateFood: jest.fn(() => Promise.resolve({})),
  updateFoodEntriesSnapshot: jest.fn(() => Promise.resolve()),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: jest.fn(),
    invalidateQueries: jest.fn(),
  }),
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

let mockSubmittedFoodFormData: any;
let mockUnitSelectionResult: any;
let mockEquivalentDraft: any[] = [];

jest.mock('../../src/components/FoodForm', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => {
      mockFoodForm(props);
      const { onSubmit, children, submitLabel = 'Add Food', unitSelector } = props;
      return (
        <View>
          {children}
          {unitSelector ? (
            <Pressable
              onPress={() => unitSelector.onUnitSelectionChange?.(mockUnitSelectionResult)}
            >
              <Text>Select Converted Unit</Text>
            </Pressable>
          ) : null}
          {props.equivalents ? (
            <Pressable onPress={() => props.equivalents.onChange(mockEquivalentDraft)}>
              <Text>Apply Equivalent Fixture</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => onSubmit(mockSubmittedFoodFormData)}>
            <Text>{submitLabel}</Text>
          </Pressable>
        </View>
      );
    },
  };
});

const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockUseSaveFood = useSaveFood as jest.MockedFunction<typeof useSaveFood>;
const mockUseAddFoodEntry = useAddFoodEntry as jest.MockedFunction<typeof useAddFoodEntry>;
const mockUseCreateFoodVariant =
  useCreateFoodVariant as jest.MockedFunction<typeof useCreateFoodVariant>;
const mockUseFoodVariants =
  useFoodVariants as jest.MockedFunction<typeof useFoodVariants>;
const mockSetPendingMealIngredientSelection =
  setPendingMealIngredientSelection as jest.MockedFunction<typeof setPendingMealIngredientSelection>;
const mockToast = Toast as unknown as { show: jest.Mock };

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

// The edit flow can raise two Alerts: "Save nutrition" (overwrite vs new
// variant) and, after a successful save, "Update past entries?". An
// unanswered Alert leaves a pending promise and the save never completes, so
// tests must answer both. Defaults are the non-destructive choices.
function answerSyncPrompt(choice: 'keep' | 'update' = 'keep') {
  return jest
    .spyOn(Alert, 'alert')
    .mockImplementation((title, _message, buttons) => {
      const list = (buttons ?? []) as { text?: string; onPress?: () => void }[];
      const press = (text: string) =>
        list.find((b) => b.text === text)?.onPress?.();

      if (title === 'Update past entries?') {
        press(choice === 'update' ? 'Update' : "Don't Update");
        return;
      }
      if (title === 'Save nutrition' || title === 'Zapisz wartości odżywcze') {
        press('Zaktualizuj istniejący');
        press('Update existing');
        return;
      }
      // Anything else: take the first non-cancel action so the flow proceeds.
      list.find((b) => b.text && b.text !== 'Cancel')?.onPress?.();
    });
}

describe('FoodFormScreen', () => {
  const navigation = mockNavigation;

  const mockSaveFoodAsync = jest.fn();
  const mockAddEntry = jest.fn();
  const mockInvalidateCache = jest.fn();
  const mockCreateVariant = jest.fn();

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

  beforeEach(async () => {
    await act(async () => { await initializeI18n('en'); await i18n.changeLanguage('en'); });
    jest.clearAllMocks();
    answerSyncPrompt('keep');
    mockFoodForm.mockClear();
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
    mockUnitSelectionResult = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'oz',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      },
    };
    mockUseMealTypes.mockReturnValue({
      mealTypes: [{ id: 'meal-1', name: 'breakfast', is_visible: true, sort_order: 1 }] as any,
      defaultMealTypeId: 'meal-1',
      isLoading: false,
      isError: false,
    });
    mockUsePreferences.mockReturnValue({
      preferences: {
        auto_scale_online_imports: false,
      } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseSaveFood.mockReturnValue({
      saveFood: jest.fn(),
      saveFoodAsync: mockSaveFoodAsync,
      isPending: false,
      isSaved: false,
    });
    mockUseCreateFoodVariant.mockReturnValue({
      createVariant: mockCreateVariant,
      isPending: false,
    });
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: false,
      isError: false,
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

  it('hides the logging block and the barcode field in meal-builder mode', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
      barcode: '0123456789',
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Meal')).toBeNull();
    expect(screen.queryByText('Save to Database')).toBeNull();
    expect(screen.queryByText('Barcode')).toBeNull();
    expect(screen.queryByText('Scan with camera')).toBeNull();
    expect(screen.queryByTestId('calendar-sheet')).toBeNull();
  });

  it('renders the logging controls and the barcode field with a pre-filled value in normal mode', () => {
    const screen = renderScreen({
      mode: 'create-food',
      barcode: '0123456789',
    });

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Meal')).toBeTruthy();
    expect(screen.getByText('Save to Database')).toBeTruthy();
    expect(screen.getByText('Barcode')).toBeTruthy();
    expect(screen.getByText('Scan with camera')).toBeTruthy();
    expect(screen.getByDisplayValue('0123456789')).toBeTruthy();
    expect(screen.getByText(/100 g per serving/)).toBeTruthy();
    expect(screen.getByTestId('calendar-sheet')).toBeTruthy();
  });

  it('renders the barcode field in library mode without the logging controls', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    expect(screen.queryByText('Date')).toBeNull();
    expect(screen.queryByText('Save to Database')).toBeNull();
    expect(screen.getByText('Barcode')).toBeTruthy();
    expect(screen.getByText('Scan with camera')).toBeTruthy();
  });

  it('saves a typed barcode with the new food in library mode', async () => {
    mockSaveFoodAsync.mockResolvedValue({ id: 'lib-food-1' });

    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    fireEvent.changeText(
      screen.getByPlaceholderText('012345678905'),
      '0123456789012',
    );
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      // Second argument is the optional image payload — undefined when the
      // user added no photos, which keeps the request plain JSON.
      expect(mockSaveFoodAsync).toHaveBeenCalledWith(
        expect.objectContaining({ barcode: '0123456789012' }),
        undefined,
      );
    });
  });

  it('blocks save and toasts when the barcode is not 8-14 digits', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    fireEvent.changeText(screen.getByPlaceholderText('012345678905'), '12345');
    fireEvent.press(screen.getByText('Save'));

    expect(mockSaveFoodAsync).not.toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: 'Invalid barcode' }),
    );
  });

  it('navigates to FoodScan in capture-barcode mode when Scan with camera is pressed', () => {
    const screen = renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    fireEvent.press(screen.getByText('Scan with camera'));

    expect(navigation.navigate).toHaveBeenCalledWith('FoodScan', {
      mode: 'capture-barcode',
      returnKey: 'FoodForm-key',
    });
  });

  it('enables auto scale for meal-builder and adjust-nutrition flows only', () => {
    renderScreen({
      mode: 'create-food',
      barcode: '0123456789',
    });

    const createModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(createModeCall?.showAutoScaleNutrition).toBe(false);

    renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    const mealBuilderCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(mealBuilderCall?.showAutoScaleNutrition).toBe(true);
    expect(mealBuilderCall?.initialAutoScaleNutritionEnabled).toBe(false);

    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
    });

    const adjustModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(adjustModeCall?.showAutoScaleNutrition).toBe(true);
    expect(adjustModeCall?.initialAutoScaleNutritionEnabled).toBe(false);
    expect(adjustModeCall?.submitLabel).toBe('Save');
  });

  it('passes a true auto-scale default through when the shared preference is enabled', () => {
    mockUsePreferences.mockReturnValue({
      preferences: {
        auto_scale_online_imports: true,
      } as any,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    const mealBuilderCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(mealBuilderCall?.showAutoScaleNutrition).toBe(true);
    expect(mealBuilderCall?.initialAutoScaleNutritionEnabled).toBe(true);

    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
    });

    const adjustModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(adjustModeCall?.showAutoScaleNutrition).toBe(true);
    expect(adjustModeCall?.initialAutoScaleNutritionEnabled).toBe(true);
  });

  it('keeps auto scale off until shared preferences finish loading', () => {
    mockUsePreferences.mockReturnValue({
      preferences: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    renderScreen({
      mode: 'create-food',
      pickerMode: 'meal-builder',
    });

    const mealBuilderCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(mealBuilderCall?.showAutoScaleNutrition).toBe(true);
    expect(mealBuilderCall?.initialAutoScaleNutritionEnabled).toBe(false);

    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
    });

    const adjustModeCall =
      mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(adjustModeCall?.showAutoScaleNutrition).toBe(true);
    expect(adjustModeCall?.initialAutoScaleNutritionEnabled).toBe(false);
  });

  it('passes unit selection through the adjust nutrition return flow', async () => {
    mockCreateVariant.mockResolvedValue({
      id: 'variant-oz',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'oz',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    });
    // Mimic FoodForm's behavior of updating form.servingUnit after the user
    // picks a different unit in the selector.
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingUnit: 'oz',
    };

    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
      availableUnitVariants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      ],
      selectedUnitSelection: {
        kind: 'existing',
        variant: {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      },
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    // Variant creation is deferred until submit.
    expect(mockCreateVariant).not.toHaveBeenCalled();

    // Phase F: "Save nutrition for future use" gates the variant POST in
    // adjust-entry-nutrition mode. Toggle it ON to keep the variant-creation
    // pathway under test; the no-toggle case has its own test below.
    fireEvent(
      screen.getByLabelText('Save nutrition for future use'),
      'valueChange',
      true,
    );
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledWith(
        expect.objectContaining({
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'oz',
          calories: 200,
          protein: 10,
          carbs: 20,
          fat: 5,
        }),
      );
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          params: {
            adjustedValues: mockSubmittedFoodFormData,
            adjustedUnitSelection: {
              kind: 'existing',
              variant: expect.objectContaining({
                id: 'variant-oz',
                serving_unit: 'oz',
              }),
            },
            adjustedCustomNutrients: null,
          },
        },
        source: 'FoodEntryAdd-key',
      }),
    );
  });

  it('ignores a second save press while adjust-nutrition writes are in flight', async () => {
    let resolveCreate: (variant: unknown) => void;
    mockCreateVariant.mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingUnit: 'oz',
    };

    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
      availableUnitVariants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      ],
      selectedUnitSelection: {
        kind: 'existing',
        variant: {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      },
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    fireEvent(
      screen.getByLabelText('Save nutrition for future use'),
      'valueChange',
      true,
    );

    fireEvent.press(screen.getByText('Save'));
    fireEvent.press(screen.getByText('Save'));

    // The second press must not start a second variant POST.
    expect(mockCreateVariant).toHaveBeenCalledTimes(1);

    resolveCreate!({
      id: 'variant-oz',
      food_id: 'food-1',
      serving_size: 100,
      serving_unit: 'oz',
      calories: 200,
      protein: 10,
      carbs: 20,
      fat: 5,
    });

    await waitFor(() => {
      expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    });
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockCreateVariant).toHaveBeenCalledTimes(1);
  });

  it('defers local manual-only unit creation until submit', async () => {
    mockUnitSelectionResult = {
      kind: 'draft',
      variant: {
        serving_size: 1,
        serving_unit: 'cup',
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      },
      requiresNutritionUpdate: true,
    };
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      servingSize: '1',
      servingUnit: 'cup',
      calories: '45',
      protein: '4',
      carbs: '6',
      fat: '1',
    };
    mockCreateVariant.mockResolvedValue({
      id: 'variant-cup',
      food_id: 'food-1',
      serving_size: 1,
      serving_unit: 'cup',
      calories: 45,
      protein: 4,
      carbs: 6,
      fat: 1,
    });

    const screen = renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
      availableUnitVariants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      ],
      selectedUnitSelection: {
        kind: 'existing',
        variant: {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      },
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    expect(mockCreateVariant).not.toHaveBeenCalled();

    // Phase F: variant POST gated on the "Save nutrition for future use"
    // toggle in adjust-entry-nutrition mode. Flip it ON to keep the
    // create-variant pathway under test.
    fireEvent(
      screen.getByLabelText('Save nutrition for future use'),
      'valueChange',
      true,
    );
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockCreateVariant).toHaveBeenCalledWith({
        food_id: 'food-1',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 45,
        protein: 4,
        carbs: 6,
        fat: 1,
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
        source: undefined,
        ai_confidence: undefined,
      });
    });

    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          params: {
            adjustedValues: mockSubmittedFoodFormData,
            adjustedUnitSelection: {
              kind: 'existing',
              variant: expect.objectContaining({
                id: 'variant-cup',
                serving_unit: 'cup',
              }),
            },
            adjustedCustomNutrients: null,
          },
        },
        source: 'FoodEntryAdd-key',
      }),
    );
  });

  // Phase F6 regression: the AI / manual unit-conversion draft persists as a
  // food_variants row ONLY when the user explicitly opts to "save for future
  // use" in the adjust-entry-nutrition flow. The entry itself still records
  // the chosen unit + nutrition inline.
  it(
    'skips the variant POST in adjust-entry-nutrition mode when the save-for-future-use toggle is off',
    async () => {
      mockUnitSelectionResult = {
        kind: 'draft',
        variant: {
          serving_size: 1,
          serving_unit: 'cup',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
        },
        requiresNutritionUpdate: true,
      };
      mockSubmittedFoodFormData = {
        ...mockSubmittedFoodFormData,
        servingSize: '1',
        servingUnit: 'cup',
        calories: '45',
        protein: '4',
        carbs: '6',
        fat: '1',
      };

      const screen = renderScreen({
        mode: 'adjust-entry-nutrition',
        initialValues: {
          name: 'Greek Yogurt',
          servingSize: '100',
          servingUnit: 'g',
          calories: '120',
        },
        returnTo: 'FoodEntryAdd',
        returnKey: 'FoodEntryAdd-key',
        foodId: 'food-1',
        variantId: 'variant-1',
        customNutrients: null,
        availableUnitVariants: [
          {
            id: 'variant-1',
            food_id: 'food-1',
            serving_size: 100,
            serving_unit: 'g',
            calories: 120,
            protein: 10,
            carbs: 8,
            fat: 4,
          },
        ],
        selectedUnitSelection: {
          kind: 'existing',
          variant: {
            id: 'variant-1',
            food_id: 'food-1',
            serving_size: 100,
            serving_unit: 'g',
            calories: 120,
            protein: 10,
            carbs: 8,
            fat: 4,
          },
        },
      });

      fireEvent.press(screen.getByText('Select Converted Unit'));
      // Toggle stays OFF — default state. No need to interact with it.
      fireEvent.press(screen.getByText('Save'));

      await waitFor(() => {
        expect(navigation.dispatch).toHaveBeenCalled();
      });
      // The defining assertion: no variant POST when the toggle is off.
      expect(mockCreateVariant).not.toHaveBeenCalled();
      // Draft unit selection still propagates back so the caller can display
      // the correct unit/nutrition ??? callers handle draft vs existing safely.
      expect(navigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            params: expect.objectContaining({
              adjustedUnitSelection: expect.objectContaining({ kind: 'draft' }),
            }),
          }),
        }),
      );
    },
  );

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

  it('enables the rich selector for imported create-food flows with a source serving', () => {
    renderScreen({
      mode: 'create-food',
      barcode: '0123456789',
      providerType: 'openfoodfacts',
      initialFood: {
        name: 'Imported Yogurt',
        brand: 'Brand Co',
        servingSize: '56',
        servingUnit: 'g',
        calories: '60',
        protein: '5',
        carbs: '7',
        fat: '1.5',
      },
    });

    const call = mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector?.variants).toEqual([
      expect.objectContaining({
        id: '__create-form-source-variant__',
        serving_size: 56,
        serving_unit: 'g',
        calories: 60,
      }),
    ]);
  });

  it('keeps the plain grouped picker for blank manual create-food flows', () => {
    renderScreen({
      mode: 'create-food',
      pickerMode: 'library',
    });

    const call = mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector).toBeUndefined();
  });

  it('enables the rich selector when editing a saved local food', () => {
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      ] as any,
      isLoading: false,
      isError: false,
    });

    renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {} as any,
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: null,
    });

    const call = mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector?.variants).toEqual([
      expect.objectContaining({
        id: 'variant-1',
        serving_unit: 'g',
      }),
    ]);
  });

  it('passes an incompatible draft selection through the unit selector in adjust mode', () => {
    renderScreen({
      mode: 'adjust-entry-nutrition',
      initialValues: {
        name: 'Greek Yogurt',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
      },
      returnTo: 'FoodEntryAdd',
      returnKey: 'FoodEntryAdd-key',
      availableUnitVariants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
      ],
      selectedUnitSelection: {
        kind: 'draft',
        variant: {
          serving_size: 1,
          serving_unit: 'cup',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
        },
        requiresNutritionUpdate: true,
      },
    });

    const call = mockFoodForm.mock.calls[mockFoodForm.mock.calls.length - 1]?.[0];
    expect(call?.unitSelector?.selectedSelection).toEqual(
      expect.objectContaining({
        kind: 'draft',
        requiresNutritionUpdate: true,
      }),
    );
  });

  it('returns the newly selected saved variant to the detail screen without mutating it', async () => {
    mockUnitSelectionResult = {
      kind: 'existing',
      variant: {
        id: 'variant-2',
        food_id: 'food-1',
        serving_size: 2,
        serving_unit: 'cup',
        calories: 200,
        protein: 30,
        carbs: 12,
        fat: 0,
      },
    };
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '2',
      servingUnit: 'cup',
      calories: '200',
      protein: '30',
      carbs: '12',
      fat: '0',
    };

    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
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

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {} as any,
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
      customNutrients: { omega3: 1 },
    });

    fireEvent.press(screen.getByText('Select Converted Unit'));
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(navigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: {
            params: expect.objectContaining({
              updatedSelectedVariantId: 'variant-2',
              updatedItem: expect.objectContaining({
                variantId: 'variant-2',
                calories: 200,
                servingSize: 2,
                servingUnit: 'cup',
              }),
            }),
          },
          source: 'FoodDetail-key',
        }),
      );
    });
    expect(mockCreateVariant).not.toHaveBeenCalled();
  });

  it('asks before touching past diary entries, and leaves them alone by default', async () => {
    // Diary entries hold a nutrition snapshot from when they were logged, so a
    // library edit must not silently rewrite history. Prompted on every save,
    // matching web, because one form saves nutrition, name, brand and photo
    // together.
    const alertSpy = answerSyncPrompt('keep');
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '999',
      protein: '10',
      carbs: '8',
      fat: '4',
    };

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {},
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
    });

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(navigation.goBack).toHaveBeenCalled();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Update past entries?',
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
    );
    // Declining must leave history untouched.
    expect(updateFoodEntriesSnapshot).not.toHaveBeenCalled();
  });

  it('syncs past entries only when the user opts in', async () => {
    answerSyncPrompt('update');
    mockUseFoodVariants.mockReturnValue({
      variants: [
        {
          id: 'variant-1',
          food_id: 'food-1',
          serving_size: 100,
          serving_unit: 'g',
          calories: 120,
          protein: 10,
          carbs: 8,
          fat: 4,
          is_default: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as any);
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '999',
      protein: '10',
      carbs: '8',
      fat: '4',
    };

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {},
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
    });

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      // Nutrition-only: this save left the food's photos alone, so the
      // prompt never offered to touch entry photos and must not sync them.
      expect(updateFoodEntriesSnapshot).toHaveBeenCalledWith(
        'food-1',
        undefined,
        false,
      );
    });
  });

  function buildEquivalentEditParams(count: number) {
    const variants = Array.from({ length: count + 1 }, (_, index) => ({
      id: `variant-${index}`,
      food_id: 'food-1',
      serving_size: index === 0 ? 100 : index + 1,
      serving_unit: index === 0 ? 'g' : `unit-${index}`,
      calories: 120,
      protein: 10,
      carbs: 8,
      fat: 4,
      is_default: index === 0,
    }));
    mockUseFoodVariants.mockReturnValue({ variants: variants as any, isLoading: false, isError: false });
    mockEquivalentDraft = variants.slice(1).map((variant: any, index) => ({
      ...variant,
      serving_size: variant.serving_size + 0.5 + index,
    }));
    return {
      mode: 'edit-food',
      item: { id: 'food-1', name: 'Greek Yogurt', brand: 'Brand Co', servingSize: 100, servingUnit: 'g', calories: 120, protein: 10, carbs: 8, fat: 4, source: 'local', originalItem: {} as any },
      initialValues: { name: 'Greek Yogurt', brand: 'Brand Co', servingSize: '100', servingUnit: 'g', calories: '120', protein: '10', carbs: '8', fat: '4' },
      returnKey: 'FoodDetail-key', foodId: 'food-1', variantId: 'variant-0', customNutrients: null,
    };
  }

  it.each([
    ['en', 0], ['en', 1], ['en', 2],
    ['pl', 0], ['pl', 1], ['pl', 2], ['pl', 5], ['pl', 22], ['pl', 25],
  ])('uses the real EditFood save path for %s with %i changed equivalent rows', async (language, count) => {
    const normalizedLanguage = language as 'en' | 'pl';
    const expected = normalizedLanguage === 'en'
      ? (count === 0 ? 'Saved' : `Saved · ${count} equivalent ${count === 1 ? 'unit' : 'units'} updated`)
      : count === 0 ? 'Zapisano' : count === 1
        ? 'Zapisano · zaktualizowano 1 równoważną jednostkę'
        : [2, 22].includes(count)
          ? `Zapisano · zaktualizowano ${count} równoważne jednostki`
          : `Zapisano · zaktualizowano ${count} równoważnych jednostek`;
    await act(async () => { await i18n.changeLanguage(normalizedLanguage); });
    const screen = renderScreen(buildEquivalentEditParams(count));
    if (count > 0) {
      await act(async () => { fireEvent.press(screen.getByText('Apply Equivalent Fixture')); });
    }
    await act(async () => { fireEvent.press(screen.getByText('Save')); });
    await waitFor(() => expect(mockToast.show).toHaveBeenCalledWith({ type: 'success', text1: expected }));
    screen.unmount();
    await act(async () => { await i18n.changeLanguage('en'); });
  });

  it('refuses to save edit-food submissions while the variants query is still loading', async () => {
    mockUseFoodVariants.mockReturnValue({
      variants: undefined,
      isLoading: true,
      isError: false,
    });
    mockSubmittedFoodFormData = {
      ...mockSubmittedFoodFormData,
      name: 'Greek Yogurt',
      brand: 'Brand Co',
      servingSize: '100',
      servingUnit: 'g',
      calories: '120',
      protein: '10',
      carbs: '8',
      fat: '4',
    };

    const screen = renderScreen({
      mode: 'edit-food',
      item: {
        id: 'food-1',
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: 100,
        servingUnit: 'g',
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
        source: 'local',
        originalItem: {} as any,
      },
      initialValues: {
        name: 'Greek Yogurt',
        brand: 'Brand Co',
        servingSize: '100',
        servingUnit: 'g',
        calories: '120',
        protein: '10',
        carbs: '8',
        fat: '4',
      },
      returnKey: 'FoodDetail-key',
      foodId: 'food-1',
      variantId: 'variant-1',
    });

    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockToast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' }),
      );
    });
    expect(mockCreateVariant).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });
});
