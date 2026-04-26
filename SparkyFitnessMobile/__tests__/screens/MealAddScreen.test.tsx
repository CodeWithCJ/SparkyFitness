import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import MealAddScreen from '../../src/screens/MealAddScreen';
import { useCreateMeal, useMeal, useUpdateMeal } from '../../src/hooks';
import { consumePendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import type { Meal, MealIngredientDraft } from '../../src/types/meals';

const mockUseFocusEffect = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
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
    serving_size: 2,
    serving_unit: 'serving',
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
  const navigation = {
    goBack: jest.fn(),
    push: jest.fn(),
    navigate: jest.fn(),
  } as any;

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

    fireEvent.press(screen.getByText('Save Meal'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Missing meal name',
      text2: 'Please enter a name for your meal.',
    });
    expect(mockCreateMealAsync).not.toHaveBeenCalled();
  });

  it('shows an error when the serving size is invalid and does not submit', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Chicken Rice Bowl'), 'Lunch');
    fireEvent.changeText(screen.getByPlaceholderText('1'), '0');
    fireEvent.press(screen.getByText('Save Meal'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Invalid serving size',
      text2: 'Serving size must be greater than zero.',
    });
    expect(mockCreateMealAsync).not.toHaveBeenCalled();
  });

  it('shows an error when there are no ingredients and does not submit', () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Chicken Rice Bowl'), 'Lunch');
    fireEvent.press(screen.getByText('Save Meal'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'No ingredients yet',
      text2: 'Add at least one food before saving this meal.',
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

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Chicken Rice Bowl'), 'Lunch');
    fireEvent.press(screen.getByText('Save Meal'));

    expect(mockToast.show).toHaveBeenCalledWith({
      type: 'error',
      text1: 'Missing ingredient data',
      text2: 'One of the selected foods is missing a serving variant. Please re-add it.',
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

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Chicken Rice Bowl'), '  My Meal  ');
    fireEvent.changeText(screen.getByPlaceholderText('Notes about this meal'), '  Tasty  ');
    fireEvent.changeText(screen.getByPlaceholderText('1'), '2');
    fireEvent.press(screen.getByText('Save Meal'));

    await waitFor(() => {
      expect(mockCreateMealAsync).toHaveBeenCalledTimes(1);
    });

    const payload = mockCreateMealAsync.mock.calls[0][0];
    expect(payload).toEqual({
      name: 'My Meal',
      description: 'Tasty',
      is_public: false,
      serving_size: 2,
      serving_unit: 'serving',
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

    expect(screen.getByText('Edit Meal')).toBeTruthy();
    expect(screen.getByDisplayValue('Lunch Bowl')).toBeTruthy();
    expect(screen.getByDisplayValue('Tasty')).toBeTruthy();
    expect(screen.getByDisplayValue('2')).toBeTruthy();
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

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Chicken Rice Bowl'), '  Edited Meal  ');
    fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdateMealAsync).toHaveBeenCalledTimes(1);
    });

    const payload = mockUpdateMealAsync.mock.calls[0][0];
    expect(payload).toEqual({
      name: 'Edited Meal',
      description: 'Tasty',
      serving_size: 2,
      serving_unit: 'serving',
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

    fireEvent.changeText(screen.getByPlaceholderText('e.g. Chicken Rice Bowl'), 'Changed Name');
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
});
