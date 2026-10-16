import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import WorkoutPlansScreen from '../../src/screens/WorkoutPlansScreen';
import {
  useDeleteWorkoutPlan,
  useServerConnection,
  useWorkoutPlans,
} from '../../src/hooks';
import type { WorkoutPlanTemplate } from '../../src/types/workoutPlans';

jest.mock('../../src/hooks', () => ({
  useDeleteWorkoutPlan: jest.fn(),
  useServerConnection: jest.fn(),
  useWorkoutPlans: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUsePlans = useWorkoutPlans as jest.MockedFunction<
  typeof useWorkoutPlans
>;
const mockUseDelete = useDeleteWorkoutPlan as jest.MockedFunction<
  typeof useDeleteWorkoutPlan
>;
const mockUseConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;

const deleteWorkoutPlanAsync = jest.fn();
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
const route = {
  key: 'WorkoutPlans-key',
  name: 'WorkoutPlans' as const,
  params: undefined,
};
const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const plan = {
  id: 'plan-1',
  user_id: 'user-1',
  plan_name: 'Push pull legs',
  description: '',
  start_date: '2026-10-01',
  end_date: null,
  is_active: true,
  schedule_type: 'weekly',
  assignments: [],
} as WorkoutPlanTemplate;

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <WorkoutPlansScreen navigation={mockNavigation} route={route} />
    </SafeAreaProvider>
  );
}

describe('WorkoutPlansScreen', () => {
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
      workoutPlans: [plan],
      isLoading: false,
      isError: false,
      refetch,
    });
    mockUseDelete.mockReturnValue({ deleteWorkoutPlanAsync, isPending: false });
    deleteWorkoutPlanAsync.mockResolvedValue(undefined);
  });

  test('shows a plan and opens it for editing', () => {
    const screen = renderScreen();
    expect(screen.getByText('Push pull legs')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();

    fireEvent.press(screen.getByText('Push pull legs'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('WorkoutPlanForm', {
      template: plan,
    });
  });

  test('confirms before deleting a plan', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = renderScreen();

    fireEvent.press(screen.getByLabelText('Delete Push pull legs'));
    const buttons = alert.mock.calls[0][2];
    await buttons?.[1].onPress?.();

    await waitFor(() => {
      expect(deleteWorkoutPlanAsync).toHaveBeenCalledWith('plan-1');
    });
    expect(Toast.show).toHaveBeenCalledWith({
      type: 'success',
      text1: 'Workout plan deleted',
    });
  });

  test('offers plan creation from the empty state', () => {
    mockUsePlans.mockReturnValue({
      workoutPlans: [],
      isLoading: false,
      isError: false,
      refetch,
    });
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Create workout plan'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('WorkoutPlanForm');
  });

  test('retries after a loading error', () => {
    mockUsePlans.mockReturnValue({
      workoutPlans: [],
      isLoading: false,
      isError: true,
      refetch,
    });
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
