import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MealPlanFormScreen from '../../src/screens/MealPlanFormScreen';
import { useCreateMealPlan, useUpdateMealPlan } from '../../src/hooks/useMealPlans';
import { useMeals } from '../../src/hooks/useMeals';
import { useMealTypes } from '../../src/hooks/useMealTypes';
import type { MealPlanTemplate } from '../../src/types/mealPlans';
import * as dateUtils from '../../src/utils/dateUtils';

jest.mock('../../src/hooks/useMealPlans', () => ({
  useCreateMealPlan: jest.fn(),
  useUpdateMealPlan: jest.fn(),
}));
jest.mock('../../src/hooks/useMeals', () => ({ useMeals: jest.fn() }));
jest.mock('../../src/hooks/useMealTypes', () => ({ useMealTypes: jest.fn() }));
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

const mockUseCreate = useCreateMealPlan as jest.MockedFunction<typeof useCreateMealPlan>;
const mockUseUpdate = useUpdateMealPlan as jest.MockedFunction<typeof useUpdateMealPlan>;
const mockUseMeals = useMeals as jest.MockedFunction<typeof useMeals>;
const mockUseMealTypes = useMealTypes as jest.MockedFunction<typeof useMealTypes>;
const createMealPlanAsync = jest.fn();
const updateMealPlanAsync = jest.fn();
const refetchMeals = jest.fn();
const refetchMealTypes = jest.fn();
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() };

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
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
  foods: [],
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

function renderScreen(params?: { template?: MealPlanTemplate; initialMeal?: typeof meal }) {
  const route = { key: 'MealPlanForm-key', name: 'MealPlanForm' as const, params };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MealPlanFormScreen navigation={mockNavigation} route={route} />
      </SafeAreaProvider>
    </QueryClientProvider>,
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
    createMealPlanAsync.mockResolvedValue({ id: 'plan-1' });
    updateMealPlanAsync.mockResolvedValue({ id: 'plan-1' });
  });

  test('prefills one serving when opened from meal details and creates the plan', async () => {
    const screen = renderScreen({ initialMeal: meal });

    await waitFor(() => expect(screen.getByDisplayValue('350')).toBeTruthy());
    expect(screen.getAllByText('Chicken and rice').length).toBeGreaterThan(0);
    expect(screen.getByText('g')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Meal plan name'), 'September prep');
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
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('keeps food assignments created on web unchanged while editing', async () => {
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
    expect(screen.getByText('Managed on web')).toBeTruthy();
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(updateMealPlanAsync).toHaveBeenCalledWith(
        expect.objectContaining({ assignments: [foodAssignment] }),
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });
  });

  test('keeps a partial localized decimal amount editable and saves its numeric value', async () => {
    const screen = renderScreen({ initialMeal: meal });

    await waitFor(() => expect(screen.getByDisplayValue('350')).toBeTruthy());
    fireEvent.changeText(screen.getByPlaceholderText('Meal plan name'), 'Half portion');
    fireEvent.changeText(screen.getByDisplayValue('350'), '0,');
    expect(screen.getByDisplayValue('0,')).toBeTruthy();
    fireEvent.changeText(screen.getByDisplayValue('0,'), '0,5');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(createMealPlanAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          assignments: [expect.objectContaining({ quantity: 0.5 })],
        }),
        expect.any(String),
      );
    });
    expect(createMealPlanAsync.mock.calls[0][0].assignments[0]).not.toHaveProperty('quantityText');
  });

  test('uses the client day at save time when midnight passes while the form is open', async () => {
    const day = jest.spyOn(dateUtils, 'toLocalDateString').mockReturnValue('2026-08-29');
    const screen = renderScreen({ initialMeal: meal });

    await waitFor(() => expect(screen.getByDisplayValue('350')).toBeTruthy());
    day.mockReturnValue('2026-08-30');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(createMealPlanAsync).toHaveBeenCalledWith(expect.any(Object), '2026-08-30');
    });
    day.mockRestore();
  });

  test('shows dependency load errors and retries both sources', async () => {
    mockUseMeals.mockReturnValue({
      meals: [],
      isLoading: false,
      isError: true,
      refetch: refetchMeals,
    });
    mockUseMealTypes.mockReturnValue({
      mealTypes: [],
      defaultMealTypeId: null,
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

  test('shows validation errors instead of submitting an incomplete plan', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Save'));

    expect(screen.getByText('Plan name is required.')).toBeTruthy();
    expect(screen.getByText('Add at least one complete meal assignment.')).toBeTruthy();
    expect(createMealPlanAsync).not.toHaveBeenCalled();
  });

  test('adds a reusable meal assignment to a new plan', () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Add meal'));

    expect(screen.getAllByText('Chicken and rice').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('350')).toBeTruthy();
  });
});
