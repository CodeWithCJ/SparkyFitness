import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { pressAction } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import MealAddScreen from '../../src/screens/MealAddScreen';
import { useCreateMeal, useMeal, useUpdateMeal } from '../../src/hooks';
import { consumePendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import type { Meal, MealIngredientDraft } from '../../src/types/meals';

const mockUseFocusEffect = jest.fn();
const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
  navigate: jest.fn(),
} as any;

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
    useNavigation: () => mockNavigation,
  };
});

jest.mock('../../src/hooks', () => ({
  useCreateMeal: jest.fn(),
  useMeal: jest.fn(),
  useUpdateMeal: jest.fn(),
}));

jest.mock('../../src/services/mealBuilderSelection', () => ({
  consumePendingMealIngredientSelection: jest.fn(),
}));

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

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
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

jest.mock('../../src/components/NutritionMacroCard', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ heading }: any) => <Text>{heading}</Text>,
  };
});

const mockUseCreateMeal = useCreateMeal as jest.MockedFunction<typeof useCreateMeal>;
const mockUseMeal = useMeal as jest.MockedFunction<typeof useMeal>;
const mockUseUpdateMeal = useUpdateMeal as jest.MockedFunction<typeof useUpdateMeal>;
const mockConsumePendingMealIngredientSelection =
  consumePendingMealIngredientSelection as jest.MockedFunction<
    typeof consumePendingMealIngredientSelection
  >;
const mockToast = Toast as unknown as { show: jest.Mock };

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildIngredient(
  overrides: Partial<MealIngredientDraft> = {},
): MealIngredientDraft {
  return {
    food_id: 'food-1',
    variant_id: 'variant-1',
    quantity: 1,
    unit: 'cup',
    food_name: 'Chicken',
    brand: 'Brand Co',
    serving_size: 1,
    serving_unit: 'cup',
    calories: 210,
    protein: 28,
    carbs: 0,
    fat: 7,
    ...overrides,
  };
}

function buildMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    user_id: 'user-1',
    name: 'Lunch Bowl',
    description: 'Tasty',
    is_public: true,
    serving_size: 1,
    serving_unit: 'serving',
    total_servings: 2,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    foods: [
      {
        id: 'meal-food-1',
        food_id: 'food-1',
        variant_id: 'variant-1',
        quantity: 1,
        unit: 'cup',
        food_name: 'Chicken',
        brand: 'Brand Co',
        serving_size: 1,
        serving_unit: 'cup',
        calories: 210,
        protein: 28,
        carbs: 0,
        fat: 7,
      },
    ],
    ...overrides,
  };
}

describe('MealAddScreen', () => {
  const navigation = mockNavigation;

  const route = {
    key: 'MealAdd-key',
    name: 'MealAdd' as const,
    params: undefined,
  };


  let focusCallback: (() => void) | undefined;
  const mockCreateMealAsync = jest.fn();
  const mockUpdateMealAsync = jest.fn();

  const renderScreen = (routeOverride: any = route) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MealAddScreen navigation={navigation} route={routeOverride} />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    focusCallback = undefined;
    mockUseFocusEffect.mockImplementation((callback) => {
      focusCallback = callback;
    });
    mockUseCreateMeal.mockReturnValue({
      createMeal: jest.fn(),
      createMealAsync: mockCreateMealAsync,
      isPending: false,
    });
    mockUseMeal.mockReturnValue({
      meal: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseUpdateMeal.mockReturnValue({
      updateMeal: jest.fn(),
      updateMealAsync: mockUpdateMealAsync,
      isPending: false,
    });
    mockConsumePendingMealIngredientSelection.mockReturnValue(null);
    mockCreateMealAsync.mockResolvedValue(undefined);
    mockUpdateMealAsync.mockResolvedValue(undefined);
  });

  it('shows an error when the meal name is missing and does not submit', () => {
    const screen = renderScreen();

    pressAction(screen, navigation, 'حفظ');

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'اسم الوجبة ناقص',
      text2: 'اكتب اسمًا للوجبة.',
    });
    expect(mockCreateMealAsync).not.toHaveBeenCalled();
  });

  it('shows an error when the total servings is invalid and does not submit', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('مثال: كبسة دجاج'), 'Lunch');
    // Default unit is 'serving', which hides the Serving Size input, so the
    // single placeholder="1" field on screen is Total Servings. Typing 0 here
    // trips total_servings validation.
    fireEvent.changeText(screen.getByPlaceholderText('١'), '0');
    pressAction(screen, navigation, 'حفظ');

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'عدد الحصص غير صحيح',
      text2: 'لازم يكون عدد الحصص أكبر من صفر.',
    });
    expect(mockCreateMealAsync).not.toHaveBeenCalled();
  });

  it('shows an error when there are no ingredients and does not submit', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('مثال: كبسة دجاج'), 'Lunch');
    pressAction(screen, navigation, 'حفظ');

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'الوجبة بدون مكوّنات',
      text2: 'أضف صنفًا غذائيًا واحدًا على الأقل قبل الحفظ.',
    });
    expect(mockCreateMealAsync).not.toHaveBeenCalled();
  });

  it('shows an error when an ingredient is missing a variant id and does not submit', () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({ variant_id: undefined as unknown as string }),
    } as any);
    act(() => {
      focusCallback?.();
    });

    fireEvent.changeText(screen.getByPlaceholderText('مثال: كبسة دجاج'), 'Lunch');
    pressAction(screen, navigation, 'حفظ');

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'بيانات أحد المكوّنات ناقصة',
      text2: 'أحد الأصناف ما له حصة محفوظة. احذفه وأضفه من جديد.',
    });
    expect(mockCreateMealAsync).not.toHaveBeenCalled();
  });

  it('submits the expected payload and navigates back for a valid meal', async () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient(),
    } as any);
    act(() => {
      focusCallback?.();
    });

    fireEvent.changeText(screen.getByPlaceholderText('مثال: كبسة دجاج'), '  My Meal  ');
    fireEvent.changeText(screen.getByPlaceholderText('ملاحظات عن الوجبة'), '  Tasty  ');
    fireEvent.changeText(screen.getByPlaceholderText('١'), '2');
    pressAction(screen, navigation, 'حفظ');

    await waitFor(() => {
      expect(mockCreateMealAsync).toHaveBeenCalledTimes(1);
    });

    const payload = mockCreateMealAsync.mock.calls[0][0];
    expect(payload).toEqual({
      name: 'My Meal',
      description: 'Tasty',
      is_public: false,
      // serving_unit defaults to 'serving' so serving_size is forced to 1.
      // The '2' the user typed goes into total_servings (the only input
      // visible in that mode).
      serving_size: 1,
      serving_unit: 'serving',
      total_servings: 2,
      foods: [
        {
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 1,
          unit: 'cup',
          food_name: 'Chicken',
          serving_size: 1,
          serving_unit: 'cup',
          calories: 210,
          protein: 28,
          carbs: 0,
          fat: 7,
        },
      ],
    });
    expect(payload.foods[0]).not.toHaveProperty('brand');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('rounds derived total servings for non-serving meals before submit', async () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient(),
    } as any);
    act(() => {
      focusCallback?.();
    });

    fireEvent.changeText(screen.getByPlaceholderText('مثال: كبسة دجاج'), 'My Meal');
    fireEvent.press(screen.getByText('مل'));

    await waitFor(() => {
      expect(screen.getByText(/الكمية الإجمالية \(مل\)/)).toBeTruthy();
      expect(screen.getByText(/حجم الحصة \(مل\)/)).toBeTruthy();
    });

    const numericInputs = screen.getAllByPlaceholderText('١');
    fireEvent.changeText(numericInputs[0], '1000');
    fireEvent.changeText(numericInputs[1], '333');
    pressAction(screen, navigation, 'حفظ');

    await waitFor(() => {
      expect(mockCreateMealAsync).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateMealAsync.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        serving_unit: 'ml',
        serving_size: 333,
        total_servings: 3.003003,
      })
    );
  });

  it('appends pending ingredients and replaces an edited ingredient by index', () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({ food_name: 'Chicken' }),
    } as any);
    act(() => {
      focusCallback?.();
    });
    expect(screen.getByText(/Chicken/)).toBeTruthy();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({
        food_id: 'food-2',
        variant_id: 'variant-2',
        food_name: 'Rice',
      }),
    } as any);
    act(() => {
      focusCallback?.();
    });
    expect(screen.getByText(/Rice/)).toBeTruthy();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({
        food_name: 'Salmon',
        food_id: 'food-3',
        variant_id: 'variant-3',
      }),
      ingredientIndex: 0,
    } as any);
    act(() => {
      focusCallback?.();
    });

    expect(screen.queryByText(/Chicken/)).toBeNull();
    expect(screen.getByText(/Salmon/)).toBeTruthy();
    expect(screen.getByText(/Rice/)).toBeTruthy();
  });

  it('preloads an existing meal in edit mode', () => {
    const meal = buildMeal();
    mockUseMeal.mockReturnValue({
      meal,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      ...route,
      params: { mode: 'edit', mealId: meal.id, initialMeal: meal },
    });

    if (Platform.OS !== 'ios') {
      // On iOS the "Edit Meal" title comes from the native stack header
      // (configured in App.tsx), so it is only rendered inline on Android.
      expect(screen.getByText('تعديل الوجبة')).toBeTruthy();
    }
    expect(screen.getByDisplayValue('Lunch Bowl')).toBeTruthy();
    expect(screen.getByDisplayValue('Tasty')).toBeTruthy();
    expect(screen.getByDisplayValue('٢')).toBeTruthy();
    expect(screen.getByText(/Chicken/)).toBeTruthy();
  });

  it('updates an existing meal without changing public visibility', async () => {
    const meal = buildMeal({ is_public: true });
    mockUseMeal.mockReturnValue({
      meal,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      ...route,
      params: { mode: 'edit', mealId: meal.id, initialMeal: meal },
    });

    fireEvent.changeText(screen.getByPlaceholderText('مثال: كبسة دجاج'), '  Edited Meal  ');
    pressAction(screen, navigation, 'حفظ');

    await waitFor(() => {
      expect(mockUpdateMealAsync).toHaveBeenCalledTimes(1);
    });

    const payload = mockUpdateMealAsync.mock.calls[0][0];
    expect(payload).toEqual({
      name: 'Edited Meal',
      description: 'Tasty',
      // Meal fixture is serving_size=1, total_servings=2 under the new model.
      serving_size: 1,
      serving_unit: 'serving',
      total_servings: 2,
      foods: [
        {
          food_id: 'food-1',
          variant_id: 'variant-1',
          quantity: 1,
          unit: 'cup',
          food_name: 'Chicken',
          serving_size: 1,
          serving_unit: 'cup',
          calories: 210,
          protein: 28,
          carbs: 0,
          fat: 7,
        },
      ],
    });
    expect(payload).not.toHaveProperty('is_public');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite local edits when returning with an ingredient selection', () => {
    const meal = buildMeal();
    mockUseMeal.mockReturnValue({
      meal,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    const screen = renderScreen({
      ...route,
      params: { mode: 'edit', mealId: meal.id, initialMeal: meal },
    });

    fireEvent.changeText(screen.getByPlaceholderText('مثال: كبسة دجاج'), 'Changed Name');
    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({
        food_id: 'food-2',
        variant_id: 'variant-2',
        food_name: 'Rice',
      }),
    } as any);

    act(() => {
      focusCallback?.();
    });

    expect(screen.getByDisplayValue('Changed Name')).toBeTruthy();
    expect(screen.getByText(/Rice/)).toBeTruthy();
  });

  it('renders numeric meal macros even when an ingredient draft has incomplete numeric data', () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({
        quantity: undefined as unknown as number,
        serving_size: undefined as unknown as number,
        calories: undefined as unknown as number,
        protein: undefined as unknown as number,
        carbs: undefined as unknown as number,
        fat: undefined as unknown as number,
      }),
    } as any);

    act(() => {
      focusCallback?.();
    });

    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getAllByText('٠ سعرة').length).toBeGreaterThan(0);
    expect(screen.getByText('٠ كوب')).toBeTruthy();
  });

  it('renders small converted-unit nutrition values without rounding them down to zero', () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({
        unit: 'mg',
        serving_unit: 'mg',
        calories: 0.0024,
        protein: 0.001,
        carbs: 0.0016,
        fat: 0.0004,
      }),
    } as any);

    act(() => {
      focusCallback?.();
    });

    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.getAllByText('٠٫٠٠٢٤ سعرة').length).toBeGreaterThan(0);
    expect(
      screen.getByText('٠٫٠٠١ غ بروتين · ٠٫٠٠١٦ غ كربوهيدرات · ٠٫٠٠٠٤ غ دهون'),
    ).toBeTruthy();
  });

  it('coerces numeric-string converted drafts and falls back to serving_unit when unit is blank', () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({
        quantity: '1' as unknown as number,
        unit: '' as unknown as string,
        serving_size: '1' as unknown as number,
        serving_unit: 'oz',
        calories: '120' as unknown as number,
        protein: '10' as unknown as number,
        carbs: '8' as unknown as number,
        fat: '4' as unknown as number,
      }),
    } as any);

    act(() => {
      focusCallback?.();
    });

    expect(screen.getAllByText('١٢٠ سعرة').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/بروتين/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/كربوهيدرات/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/دهون/).length).toBeGreaterThan(0);
    expect(screen.getByText('١ أونصة')).toBeTruthy();

    fireEvent.press(screen.getByText(/Chicken/));

    expect(navigation.navigate).toHaveBeenCalledWith('FoodEntryAdd', {
      item: expect.objectContaining({
        servingUnit: 'oz',
        servingSize: 1,
        calories: 120,
        protein: 10,
        carbs: 8,
        fat: 4,
      }),
      pickerMode: 'meal-builder',
      ingredientIndex: 0,
      returnDepth: 1,
      selectedVariantOverride: expect.any(Object),
    });
  });

  it('reopens meal ingredients with their active unit instead of the fallback serving unit', () => {
    const screen = renderScreen();

    mockConsumePendingMealIngredientSelection.mockReturnValueOnce({
      ingredient: buildIngredient({
        unit: 'oz',
        serving_unit: 'cup',
      }),
    } as any);

    act(() => {
      focusCallback?.();
    });

    fireEvent.press(screen.getByText(/Chicken/));

    expect(navigation.navigate).toHaveBeenCalledWith('FoodEntryAdd', {
      item: expect.objectContaining({
        servingUnit: 'oz',
        variantId: 'variant-1',
      }),
      pickerMode: 'meal-builder',
      ingredientIndex: 0,
      returnDepth: 1,
      selectedVariantOverride: expect.any(Object),
    });
  });
});
