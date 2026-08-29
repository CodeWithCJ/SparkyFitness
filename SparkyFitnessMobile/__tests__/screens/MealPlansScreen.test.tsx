import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MealPlansScreen from '../../src/screens/MealPlansScreen';
import {
  useDeleteMealPlan,
  useDuplicateMealPlan,
  useMealPlans,
} from '../../src/hooks/useMealPlans';
import { useServerConnection } from '../../src/hooks/useServerConnection';
import Toast from 'react-native-toast-message';
import * as dateUtils from '../../src/utils/dateUtils';

jest.mock('../../src/hooks/useMealPlans', () => ({
  useDeleteMealPlan: jest.fn(),
  useDuplicateMealPlan: jest.fn(),
  useMealPlans: jest.fn(),
}));

jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUsePlans = useMealPlans as jest.MockedFunction<typeof useMealPlans>;
const mockUseDuplicate = useDuplicateMealPlan as jest.MockedFunction<typeof useDuplicateMealPlan>;
const mockUseDelete = useDeleteMealPlan as jest.MockedFunction<typeof useDeleteMealPlan>;
const mockUseConnection = useServerConnection as jest.MockedFunction<typeof useServerConnection>;

const duplicateMealPlanAsync = jest.fn();
const deleteMealPlanAsync = jest.fn();
const refetch = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));
const route = { key: 'MealPlans-key', name: 'MealPlans' as const, params: undefined };
const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const plan = {
  id: 'plan-1',
  user_id: 'user-1',
  plan_name: 'Weekday prep',
  description: 'Lunch boxes',
  start_date: '2026-09-01',
  end_date: '2026-09-30',
  is_active: true,
  assignments: [
    {
      id: 'assignment-1',
      item_type: 'meal' as const,
      day_of_week: 1,
      meal_type_id: 'lunch',
      meal_type: 'Lunch',
      meal_id: 'meal-1',
      meal_name: 'Chicken and rice',
      quantity: 350,
      unit: 'g',
    },
  ],
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <MealPlansScreen navigation={mockNavigation} route={route} />
    </SafeAreaProvider>,
  );
}

describe('MealPlansScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUsePlans.mockReturnValue({
      mealPlans: [plan],
      isLoading: false,
      isError: false,
      refetch,
    });
    mockUseDuplicate.mockReturnValue({ duplicateMealPlanAsync, isPending: false });
    mockUseDelete.mockReturnValue({ deleteMealPlanAsync, isPending: false });
    duplicateMealPlanAsync.mockResolvedValue({ ...plan, id: 'plan-copy' });
    deleteMealPlanAsync.mockResolvedValue(undefined);
  });

  test('shows plan state and opens it for editing', () => {
    const screen = renderScreen();

    expect(screen.getByText('Weekday prep')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Mon · Lunch · Chicken and rice · 350 g')).toBeTruthy();

    fireEvent.press(screen.getByText('Weekday prep'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MealPlanForm', { template: plan });
  });

  test('duplicates a plan', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Duplicate Weekday prep'));

    await waitFor(() => {
      expect(duplicateMealPlanAsync).toHaveBeenCalledWith(
        'plan-1',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });
  });

  test('uses the client day at action time when midnight passes on the list', async () => {
    const day = jest.spyOn(dateUtils, 'toLocalDateString').mockReturnValue('2026-08-29');
    const screen = renderScreen();

    day.mockReturnValue('2026-08-30');
    fireEvent.press(screen.getByLabelText('Duplicate Weekday prep'));

    await waitFor(() => {
      expect(duplicateMealPlanAsync).toHaveBeenCalledWith('plan-1', '2026-08-30');
    });
    day.mockRestore();
  });

  test('confirms before deleting a plan', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Delete Weekday prep'));
    const buttons = alert.mock.calls[0][2];
    await buttons?.[1].onPress?.();

    await waitFor(() => {
      expect(deleteMealPlanAsync).toHaveBeenCalledWith(
        'plan-1',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      );
    });
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Meal plan deleted',
    });
  });

  test('offers plan creation from the empty state', () => {
    mockUsePlans.mockReturnValue({
      mealPlans: [],
      isLoading: false,
      isError: false,
      refetch,
    });
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Create meal plan'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('MealPlanForm');
  });

  test('retries after a loading error', () => {
    mockUsePlans.mockReturnValue({
      mealPlans: [],
      isLoading: false,
      isError: true,
      refetch,
    });
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
