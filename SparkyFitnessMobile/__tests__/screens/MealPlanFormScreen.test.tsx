import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MealPlanFormScreen from '../../src/screens/MealPlanFormScreen';
import {
  useCreateMealPlan,
  useUpdateMealPlan,
} from '../../src/hooks/useMealPlans';
import { useMeals } from '../../src/hooks/useMeals';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import { useMealPlanNutrition } from '../../src/hooks/useMealPlanNutrition';
import { consumePendingMealPlanSelection } from '../../src/services/mealPlanSelection';
import type { MealPlanTemplate } from '../../src/types/mealPlans';
import * as dateUtils from '../../src/utils/dateUtils';

jest.mock('../../src/hooks/useMealPlans', () => ({
  useCreateMealPlan: jest.fn(),
  useUpdateMealPlan: jest.fn(),
}));
jest.mock('../../src/hooks/useMeals', () => ({ useMeals: jest.fn() }));
jest.mock('../../src/hooks/useMealTypes', () => ({ useMealTypes: jest.fn() }));
jest.mock('../../src/hooks/useMealPlanNutrition', () => ({
  useMealPlanNutrition: jest.fn(),
}));
jest.mock('../../src/services/mealPlanSelection', () => ({
  consumePendingMealPlanSelection: jest.fn(),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));
jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule = require('react');
  const MockCalendarSheet = ReactModule.forwardRef(() => null);
  return { __esModule: true, default: MockCalendarSheet };
});
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: jest.fn(() => false),
  useNativeIOSTabsActive: jest.fn(() => false),
}));

const mockUseCreate = useCreateMealPlan as jest.MockedFunction<
  typeof useCreateMealPlan
>;
const mockUseUpdate = useUpdateMealPlan as jest.MockedFunction<
  typeof useUpdateMealPlan
>;
const mockUseMeals = useMeals as jest.MockedFunction<typeof useMeals>;
const mockUseMealTypes = useMealTypes as jest.MockedFunction<
  typeof useMealTypes
>;
const mockUseMealPlanNutrition = useMealPlanNutrition as jest.MockedFunction<
  typeof useMealPlanNutrition
>;
const mockConsumePendingMealPlanSelection =
  consumePendingMealPlanSelection as jest.MockedFunction<
    typeof consumePendingMealPlanSelection
  >;
const createMealPlanAsync = jest.fn();
const updateMealPlanAsync = jest.fn();
const refetchMeals = jest.fn();
const refetchMealTypes = jest.fn();
const refetchNutrition = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) => callback(),
}));

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };
const meal = {
  id: 'meal-1',
  user_id: 'user-1',
  name: 'Chicken and rice',
  description: null,
  is_public: false,
  serving_size: 350,
  serving_unit: 'g',
  total_servings: 4,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  foods: [
    {
      id: 'meal-food-1',
      food_id: 'food-1',
      variant_id: 'variant-1',
      quantity: 400,
      unit: 'g',
      food_name: 'Chicken',
      brand: null,
      serving_size: 100,
      serving_unit: 'g',
      calories: 200,
      protein: 30,
      carbs: 10,
      fat: 5,
    },
  ],
};
const mealType = {
  id: 'lunch',
  name: 'Lunch',
  sort_order: 2,
  user_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  is_visible: true,
  show_in_quick_log: true,
};

function renderScreen(params?: {
  template?: MealPlanTemplate;
  initialMeal?: typeof meal;
}) {
  const route = {
    key: 'MealPlanForm-key',
    name: 'MealPlanForm' as const,
    params,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MealPlanFormScreen navigation={mockNavigation} route={route} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

describe('MealPlanFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCreate.mockReturnValue({ createMealPlanAsync, isPending: false });
    mockUseUpdate.mockReturnValue({ updateMealPlanAsync, isPending: false });
    mockUseMeals.mockReturnValue({
      meals: [meal],
      isLoading: false,
      isError: false,
      refetch: refetchMeals,
    });
    mockUseMealTypes.mockReturnValue({
      mealTypes: [mealType],
      defaultMealTypeId: 'lunch',
      isLoading: false,
      isError: false,
      refetch: refetchMealTypes,
    });
    mockUseMealPlanNutrition.mockImplementation((assignments) => ({
      resolveNutrition: (assignment) =>
        assignment.nutrition ??
        (assignment.item_type === 'food'
          ? { servingSize: 40, calories: 150, protein: 5, carbs: 27, fat: 3 }
          : undefined),
      isLoading: false,
      isError: false,
      refetch: refetchNutrition,
    }));
    mockConsumePendingMealPlanSelection.mockReturnValue(null);
    createMealPlanAsync.mockResolvedValue({ id: 'plan-1' });
    updateMealPlanAsync.mockResolvedValue({ id: 'plan-1' });
  });

  test('prefills one serving when opened from meal details and creates the plan', async () => {
    const screen = renderScreen({ initialMeal: meal });

    await waitFor(() => expect(screen.getByDisplayValue('350')).toBeTruthy());
    expect(screen.getAllByText('Chicken and rice').length).toBeGreaterThan(0);
    expect(screen.getByText('g')).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText('Meal plan name'),
      'September prep'
    );
    fireEvent.changeText(screen.getByDisplayValue('350'), '700');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(createMealPlanAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          plan_name: 'September prep',
          assignments: [
            expect.objectContaining({
              meal_id: 'meal-1',
              meal_type_id: 'lunch',
              day_of_week: 1,
              quantity: 700,
              unit: 'g',
            }),
          ],
        }),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      );
    });
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('edits food assignments created on web and saves the changed amount', async () => {
    const foodAssignment = {
      id: 'assignment-food',
      item_type: 'food' as const,
      day_of_week: 2,
      meal_type_id: 'lunch',
      meal_type: 'Lunch',
      food_id: 'food-1',
      food_name: 'Oats',
      variant_id: 'variant-1',
      quantity: 80,
      unit: 'g',
    };
    const template: MealPlanTemplate = {
      id: 'plan-1',
      user_id: 'user-1',
      plan_name: 'Existing plan',
      description: null,
      start_date: '2026-09-01',
      end_date: null,
      is_active: false,
      assignments: [foodAssignment],
    };
    const screen = renderScreen({ template });

    expect(screen.getByText('Oats')).toBeTruthy();
    expect(screen.queryByText('Managed on web')).toBeNull();
    fireEvent.changeText(screen.getByLabelText('Quantity for Oats'), '100');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(updateMealPlanAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          assignments: [
            expect.objectContaining({
              ...foodAssignment,
              quantity: 100,
            }),
          ],
        }),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
      );
    });
  });

  test('uses the selected day and meal type as the unified-search target', () => {
    const dinnerType = {
      ...mealType,
      id: 'dinner',
      name: 'Dinner',
      sort_order: 3,
    };
    mockUseMealTypes.mockReturnValue({
      mealTypes: [mealType, dinnerType],
      defaultMealTypeId: 'lunch',
      isLoading: false,
      isError: false,
      refetch: refetchMealTypes,
    });
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Wednesday'));
    fireEvent.press(screen.getByLabelText('Add food or meal to Dinner'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('FoodSearch', {
      pickerMode: 'meal-plan',
      mealPlanTarget: {
        dayOfWeek: 3,
        mealTypeId: 'dinner',
        mealTypeName: 'Dinner',
      },
    });
  });

  test('shows one day at a time with live nutrition totals and no date fields', () => {
    const template: MealPlanTemplate = {
      id: 'plan-1',
      user_id: 'user-1',
      plan_name: 'Existing plan',
      description: null,
      start_date: '2026-09-01',
      end_date: '2026-09-30',
      is_active: false,
      assignments: [
        {
          id: 'assignment-food',
          item_type: 'food',
          day_of_week: 2,
          meal_type_id: 'lunch',
          meal_type: 'Lunch',
          food_id: 'food-1',
          food_name: 'Oats',
          variant_id: 'variant-1',
          quantity: 80,
          unit: 'g',
        },
      ],
    };
    const screen = renderScreen({ template });

    expect(screen.getByLabelText('Daily Calories 300 kcal')).toBeTruthy();
    expect(screen.getByLabelText('Daily Protein 10 g')).toBeTruthy();
    expect(
      screen.getByLabelText(
        'Lunch total 300 kcal, 10 g protein, 54 g carbs, 6 g fat'
      )
    ).toBeTruthy();
    expect(screen.getByText('Oats')).toBeTruthy();
    expect(screen.queryByText('Start date')).toBeNull();
    expect(screen.queryByText('End date')).toBeNull();

    fireEvent.press(screen.getByText('Wednesday'));
    expect(screen.queryByText('Oats')).toBeNull();
    expect(screen.getByLabelText('Daily Calories 0 kcal')).toBeTruthy();
  });

  test('keeps assignment markers visible on unselected days', () => {
    const template: MealPlanTemplate = {
      id: 'plan-1',
      user_id: 'user-1',
      plan_name: 'Existing plan',
      description: null,
      start_date: '2026-09-01',
      end_date: null,
      is_active: false,
      assignments: [
        {
          item_type: 'food',
          day_of_week: 2,
          meal_type_id: 'lunch',
          food_id: 'food-1',
          food_name: 'Oats',
          variant_id: 'variant-1',
          quantity: 80,
          unit: 'g',
        },
        {
          item_type: 'meal',
          day_of_week: 3,
          meal_type_id: 'lunch',
          meal_id: 'meal-1',
          meal_name: 'Chicken and rice',
          quantity: 350,
          unit: 'g',
        },
      ],
    };
    const screen = renderScreen({ template });

    const dayIndicators = screen
      .UNSAFE_getAllByType(View)
      .filter(
        (view) =>
          typeof view.props.className === 'string' &&
          view.props.className.startsWith('w-1.5 h-1.5')
      );
    expect(
      dayIndicators.some((indicator) =>
        indicator.props.className.includes('bg-accent-primary')
      )
    ).toBe(true);
  });

  test('consumes a food or meal returned by unified search', () => {
    mockConsumePendingMealPlanSelection.mockReturnValueOnce({
      assignment: {
        item_type: 'food',
        day_of_week: 1,
        meal_type_id: 'lunch',
        meal_type: 'Lunch',
        food_id: 'food-2',
        food_name: 'Greek yogurt',
        variant_id: 'variant-2',
        quantity: 200,
        quantityText: '200',
        unit: 'g',
        nutrition: {
          servingSize: 100,
          calories: 60,
          protein: 10,
          carbs: 4,
          fat: 0,
        },
      },
    });

    const screen = renderScreen();

    expect(screen.getByText('Greek yogurt')).toBeTruthy();
    expect(screen.getByLabelText('Daily Calories 120 kcal')).toBeTruthy();
  });

  test.each([
    {
      label: 'food',
      replacement: {
        item_type: 'food' as const,
        day_of_week: 2,
        meal_type_id: 'lunch',
        meal_type: 'Lunch',
        food_id: 'food-2',
        food_name: 'Greek yogurt',
        variant_id: 'variant-exact',
        quantity: 200,
        quantityText: '200',
        unit: 'g',
        nutrition: {
          servingSize: 100,
          calories: 60,
          protein: 10,
          carbs: 4,
          fat: 0,
        },
      },
      expectedName: 'Greek yogurt',
      expectedIdentity: { food_id: 'food-2', variant_id: 'variant-exact' },
    },
    {
      label: 'meal',
      replacement: {
        item_type: 'meal' as const,
        day_of_week: 2,
        meal_type_id: 'lunch',
        meal_type: 'Lunch',
        meal_id: 'meal-2',
        meal_name: 'Bean bowl',
        quantity: 1,
        quantityText: '1',
        unit: 'serving',
        nutrition: {
          servingSize: 1,
          calories: 420,
          protein: 24,
          carbs: 50,
          fat: 12,
        },
      },
      expectedName: 'Bean bowl',
      expectedIdentity: { meal_id: 'meal-2' },
    },
  ])(
    'replaces an existing assignment with an exact $label selection',
    async ({ replacement, expectedName, expectedIdentity }) => {
      mockConsumePendingMealPlanSelection.mockReturnValueOnce({
        assignment: replacement,
        assignmentIndex: 0,
      });
      const template: MealPlanTemplate = {
        id: 'plan-1',
        user_id: 'user-1',
        plan_name: 'Existing plan',
        description: null,
        start_date: '2026-09-01',
        end_date: null,
        is_active: false,
        assignments: [
          {
            item_type: 'food',
            day_of_week: 2,
            meal_type_id: 'lunch',
            meal_type: 'Lunch',
            food_id: 'food-1',
            food_name: 'Oats',
            variant_id: 'variant-old',
            quantity: 80,
            unit: 'g',
          },
        ],
      };
      const screen = renderScreen({ template });

      expect(screen.queryByText('Oats')).toBeNull();
      expect(screen.getByText(expectedName)).toBeTruthy();
      fireEvent.press(screen.getByText('Save'));

      await waitFor(() => {
        expect(updateMealPlanAsync).toHaveBeenCalledWith(
          expect.objectContaining({
            assignments: [expect.objectContaining(expectedIdentity)],
          }),
          expect.any(String)
        );
      });
    }
  );

  test('opens unified search in replacement mode for an existing assignment', () => {
    const template: MealPlanTemplate = {
      id: 'plan-1',
      user_id: 'user-1',
      plan_name: 'Existing plan',
      description: null,
      start_date: '2026-09-01',
      end_date: null,
      is_active: false,
      assignments: [
        {
          item_type: 'food',
          day_of_week: 2,
          meal_type_id: 'lunch',
          meal_type: 'Lunch',
          food_id: 'food-1',
          food_name: 'Oats',
          variant_id: 'variant-old',
          quantity: 80,
          unit: 'g',
        },
      ],
    };
    const screen = renderScreen({ template });

    fireEvent.press(screen.getByLabelText('Replace Oats'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('FoodSearch', {
      pickerMode: 'meal-plan',
      mealPlanTarget: {
        dayOfWeek: 2,
        mealTypeId: 'lunch',
        mealTypeName: 'Lunch',
        assignmentIndex: 0,
      },
    });
  });

  test('keeps a partial localized decimal amount editable and saves its numeric value', async () => {
    const screen = renderScreen({ initialMeal: meal });

    await waitFor(() => expect(screen.getByDisplayValue('350')).toBeTruthy());
    fireEvent.changeText(
      screen.getByPlaceholderText('Meal plan name'),
      'Half portion'
    );
    fireEvent.changeText(screen.getByDisplayValue('350'), '0,');
    expect(screen.getByDisplayValue('0,')).toBeTruthy();
    fireEvent.changeText(screen.getByDisplayValue('0,'), '0,5');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(createMealPlanAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          assignments: [expect.objectContaining({ quantity: 0.5 })],
        }),
        expect.any(String)
      );
    });
    expect(
      createMealPlanAsync.mock.calls[0][0].assignments[0]
    ).not.toHaveProperty('quantityText');
  });

  test('uses the client day at save time when midnight passes while the form is open', async () => {
    const day = jest
      .spyOn(dateUtils, 'toLocalDateString')
      .mockReturnValue('2026-08-29');
    const screen = renderScreen({ initialMeal: meal });

    await waitFor(() => expect(screen.getByDisplayValue('350')).toBeTruthy());
    day.mockReturnValue('2026-08-30');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(createMealPlanAsync).toHaveBeenCalledWith(
        expect.objectContaining({ start_date: '2026-08-30' }),
        '2026-08-30'
      );
    });
    day.mockRestore();
  });

  test('shows a meal-library load error and retries both planning sources', async () => {
    mockUseMeals.mockReturnValue({
      meals: [],
      isLoading: false,
      isError: true,
      refetch: refetchMeals,
    });
    mockUseMealTypes.mockReturnValue({
      mealTypes: [mealType],
      defaultMealTypeId: 'lunch',
      isLoading: false,
      isError: false,
      refetch: refetchMealTypes,
    });
    const screen = renderScreen();

    expect(screen.getByText('Failed to load planning options')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => {
      expect(refetchMeals).toHaveBeenCalled();
      expect(refetchMealTypes).toHaveBeenCalled();
    });
  });

  test('keeps a newly selected assignment editable while nutrition hydration is loading', async () => {
    mockUseMealPlanNutrition.mockImplementation(() => ({
      resolveNutrition: (assignment) => assignment.nutrition,
      isLoading: true,
      isError: false,
      refetch: refetchNutrition,
    }));
    const screen = renderScreen({ initialMeal: meal });

    expect(screen.getByPlaceholderText('Meal plan name')).toBeTruthy();
    expect(
      screen.getByText(
        'Loading missing nutrition details. Totals may be incomplete.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('Loading planning options...')).toBeNull();
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => expect(createMealPlanAsync).toHaveBeenCalled());
  });

  test('keeps the editor available when nutrition hydration fails and retries inline', async () => {
    mockUseMealPlanNutrition.mockReturnValue({
      resolveNutrition: () => undefined,
      isLoading: false,
      isError: true,
      refetch: refetchNutrition,
    });
    const template: MealPlanTemplate = {
      id: 'plan-1',
      user_id: 'user-1',
      plan_name: 'Existing plan',
      description: null,
      start_date: '2026-09-01',
      end_date: null,
      is_active: false,
      assignments: [
        {
          item_type: 'food',
          day_of_week: 2,
          meal_type_id: 'lunch',
          food_id: 'food-1',
          food_name: 'Oats',
          variant_id: 'variant-1',
          quantity: 80,
          unit: 'g',
        },
      ],
    };
    const screen = renderScreen({ template });

    expect(screen.getByPlaceholderText('Meal plan name')).toBeTruthy();
    expect(
      screen.getByText(
        "Some nutrition details couldn't be loaded. Totals may be incomplete."
      )
    ).toBeTruthy();
    expect(screen.queryByText('Failed to load planning options')).toBeNull();
    fireEvent.press(screen.getByText('Retry'));
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(refetchNutrition).toHaveBeenCalled();
      expect(updateMealPlanAsync).toHaveBeenCalled();
    });
  });

  test('shows validation errors instead of submitting an incomplete plan', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Save'));

    expect(screen.getByText('Plan name is required.')).toBeTruthy();
    expect(
      screen.getByText('Add at least one complete meal assignment.')
    ).toBeTruthy();
    expect(createMealPlanAsync).not.toHaveBeenCalled();
  });

  test('allows a food-only plan when there are no reusable meals yet', () => {
    mockUseMeals.mockReturnValue({
      meals: [],
      isLoading: false,
      isError: false,
      refetch: refetchMeals,
    });
    const screen = renderScreen();

    expect(screen.getByPlaceholderText('Meal plan name')).toBeTruthy();
    expect(screen.getByLabelText('Add food or meal to Lunch')).toBeTruthy();
  });
});
