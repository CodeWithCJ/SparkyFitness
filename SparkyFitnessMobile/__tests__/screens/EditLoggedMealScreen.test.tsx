import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { pressAction, expectActionPresent } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import EditLoggedMealScreen from '../../src/screens/EditLoggedMealScreen';
import { useFoodEntryMealDetails } from '../../src/hooks/useFoodEntryMealDetails';
import { useUpdateFoodEntryMeal } from '../../src/hooks/useUpdateFoodEntryMeal';
import { useDeleteFoodEntryMeal } from '../../src/hooks/useDeleteFoodEntryMeal';
import { useMealTypes } from '../../src/hooks';
import { consumePendingMealIngredientSelection } from '../../src/services/mealBuilderSelection';
import type { FoodEntryMeal, FoodEntryMealFood } from '../../src/types/foodEntryMeals';
import type { MealIngredientDraft } from '../../src/types/meals';

let focusCallback: (() => void) | undefined;
const mockUseFocusEffect = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useFocusEffect: (callback: () => void) => mockUseFocusEffect(callback),
  };
});

jest.mock('../../src/services/mealBuilderSelection', () => ({
  consumePendingMealIngredientSelection: jest.fn(),
}));

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
  usePreferences: jest.fn(() => ({ preferences: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
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

// Render the ingredient rows as plain buttons so the screen's edit/remove
// wiring can be exercised without the swipe gesture/Alert layer.
jest.mock('../../src/components/SwipeableIngredientRow', () => {
  const { Text, Pressable } = require('react-native');
  return {
    __esModule: true,
    default: ({ foodName, onPress, onConfirmDelete }: any) => (
      <>
        <Pressable testID={`edit-${foodName}`} onPress={onPress}>
          <Text>{foodName}</Text>
        </Pressable>
        <Pressable testID={`remove-${foodName}`} onPress={onConfirmDelete}>
          <Text>remove {foodName}</Text>
        </Pressable>
      </>
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
const mockConsume = consumePendingMealIngredientSelection as jest.MockedFunction<
  typeof consumePendingMealIngredientSelection
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const chicken: FoodEntryMealFood = {
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
};

const rice: FoodEntryMealFood = {
  food_id: 'food-2',
  food_name: 'Rice',
  variant_id: 'var-2',
  quantity: 150,
  unit: 'g',
  serving_size: 100,
  serving_unit: 'g',
  calories: 130,
  protein: 2.7,
  carbs: 28,
  fat: 0.3,
};

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
  foods: [chicken],
  calories: 200,
  protein: 30,
  carbs: 5,
  fat: 5,
};

const buildIngredient = (overrides: Partial<MealIngredientDraft> = {}): MealIngredientDraft => ({
  food_id: 'food-9',
  variant_id: 'var-9',
  quantity: 50,
  unit: 'g',
  brand: null,
  food_name: 'Almonds',
  serving_size: 100,
  serving_unit: 'g',
  calories: 579,
  protein: 21,
  carbs: 22,
  fat: 50,
  ...overrides,
});

describe('EditLoggedMealScreen', () => {
  const navigation = {
    setOptions: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
    push: jest.fn(),
    setParams: jest.fn(),
  } as any;

  const mockUpdateMeal = jest.fn();
  const mockConfirmAndDelete = jest.fn();
  const mockDeleteEntry = jest.fn();

  const mockMeal = (meal: FoodEntryMeal) =>
    mockUseFoodEntryMealDetails.mockReturnValue({
      meal,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    focusCallback = undefined;
    mockUseFocusEffect.mockImplementation((callback: () => void) => {
      focusCallback = callback;
    });
    mockConsume.mockReturnValue(null);
    mockMeal(baseMeal);
    mockUseUpdateFoodEntryMeal.mockReturnValue({
      updateMeal: mockUpdateMeal,
      isPending: false,
      invalidateCache: jest.fn(),
    });
    mockUseDeleteFoodEntryMeal.mockReturnValue({
      confirmAndDelete: mockConfirmAndDelete,
      deleteEntry: mockDeleteEntry,
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

    pressAction(screen, navigation, 'Save');

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
    // brand is a draft-only field and must not leak into the wire payload.
    expect(payload.foods[0]).not.toHaveProperty('brand');
  });

  it('scales component food quantities client-side when meal has no template', () => {
    mockMeal({ ...baseMeal, meal_template_id: null });

    const screen = renderScreen();
    fireEvent.changeText(screen.getByTestId('quantity-input'), '2');
    pressAction(screen, navigation, 'Save');

    const payload = mockUpdateMeal.mock.calls[0][0];
    expect(payload.meal_template_id).toBeNull();
    expect(payload.quantity).toBe(2);
    expect(payload.foods[0].quantity).toBe(200);
  });

  it('confirms deletion when the Delete Meal button is pressed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Delete Meal'));
    expect(mockConfirmAndDelete).toHaveBeenCalled();
  });

  it('disables Save when nothing has changed', () => {
    const screen = renderScreen();
    pressAction(screen, navigation, 'Save');
    expect(mockUpdateMeal).not.toHaveBeenCalled();
  });

  it('opens the meal-builder picker when Add Food is pressed', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByText('Add Food'));
    expect(navigation.push).toHaveBeenCalledWith('FoodSearch', { pickerMode: 'meal-builder' });
  });

  it('appends a food picked via the meal builder to the saved payload', () => {
    // Non-template so displayScale is 1 and the picked 50 g is stored as-is.
    mockMeal({ ...baseMeal, meal_template_id: null });
    const screen = renderScreen();

    mockConsume.mockReturnValueOnce({ ingredient: buildIngredient() });
    act(() => {
      focusCallback?.();
    });

    pressAction(screen, navigation, 'Save');

    const payload = mockUpdateMeal.mock.calls[0][0];
    expect(payload.foods).toHaveLength(2);
    expect(payload.foods[1]).toEqual(
      expect.objectContaining({ food_id: 'food-9', variant_id: 'var-9', quantity: 50, unit: 'g' }),
    );
  });

  it('navigates to the meal builder to edit an ingredient on row tap', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('edit-Chicken'));
    expect(navigation.navigate).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({ pickerMode: 'meal-builder', ingredientIndex: 0, returnDepth: 1 }),
    );
  });

  it('replaces an edited ingredient at its index on return', () => {
    // Non-template so displayScale is 1 and the edited 250 g is stored as-is.
    mockMeal({ ...baseMeal, meal_template_id: null });
    const screen = renderScreen();

    mockConsume.mockReturnValueOnce({
      ingredient: buildIngredient({ food_id: 'food-1', variant_id: 'var-1', food_name: 'Chicken', quantity: 250 }),
      ingredientIndex: 0,
    });
    act(() => {
      focusCallback?.();
    });

    pressAction(screen, navigation, 'Save');

    const payload = mockUpdateMeal.mock.calls[0][0];
    expect(payload.foods).toHaveLength(1);
    expect(payload.foods[0].quantity).toBe(250);
  });

  it('unscales a picked food by the servings multiplier before storing', () => {
    // Non-template, servings bumped to 2 -> displayScale 2. The picker returns
    // consumed amounts, so a 100 g pick is stored at base 50 and saved back to
    // the consumed 100 (base 50 x scaleFactor 2).
    mockMeal({ ...baseMeal, meal_template_id: null });
    const screen = renderScreen();
    fireEvent.changeText(screen.getByTestId('quantity-input'), '2');

    mockConsume.mockReturnValueOnce({ ingredient: buildIngredient({ quantity: 100 }) });
    act(() => {
      focusCallback?.();
    });

    pressAction(screen, navigation, 'Save');

    const payload = mockUpdateMeal.mock.calls[0][0];
    expect(payload.foods[1]).toEqual(expect.objectContaining({ food_id: 'food-9', quantity: 100 }));
  });

  it('stages removal of a non-last ingredient until Save (no immediate delete)', () => {
    mockMeal({ ...baseMeal, foods: [chicken, rice] });
    const screen = renderScreen();

    fireEvent.press(screen.getByTestId('remove-Rice'));

    expect(mockDeleteEntry).not.toHaveBeenCalled();

    pressAction(screen, navigation, 'Save');
    const payload = mockUpdateMeal.mock.calls[0][0];
    expect(payload.foods).toHaveLength(1);
    expect(payload.foods[0].food_id).toBe('food-1');
  });

  it('stages removal of the last ingredient instead of deleting the meal', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByTestId('remove-Chicken'));
    // No immediate server action; the meal entry is preserved.
    expect(mockDeleteEntry).not.toHaveBeenCalled();
    expect(mockConfirmAndDelete).not.toHaveBeenCalled();
    // An empty meal cannot be saved.
    pressAction(screen, navigation, 'Save');
    expect(mockUpdateMeal).not.toHaveBeenCalled();
  });

  it('scales a template meal to the consumed total on the nutrition card', () => {
    // baseMeal is template-linked: foods sum to 165 base cal, but meal.calories
    // is the consumed total (200). The card must show 200, not the base 165.
    const screen = renderScreen();
    expect(screen.getByText('200 calories')).toBeTruthy();
  });
});
