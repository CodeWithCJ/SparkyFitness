import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import WorkoutPlanDetailScreen from '../../src/screens/WorkoutPlanDetailScreen';
import {
  useDeleteWorkoutPlan,
  usePreferences,
  useUpdateWorkoutPlan,
  useWorkoutPlans,
} from '../../src/hooks';
import type { WorkoutPlanTemplate } from '../../src/types/workoutPlans';

jest.mock('../../src/hooks', () => ({
  useDeleteWorkoutPlan: jest.fn(),
  usePreferences: jest.fn(),
  useServerConnection: jest.fn(() => ({ isConnected: true })),
  useUpdateWorkoutPlan: jest.fn(),
  useWorkoutPlans: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUsePlans = useWorkoutPlans as jest.MockedFunction<
  typeof useWorkoutPlans
>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockUseUpdate = useUpdateWorkoutPlan as jest.MockedFunction<
  typeof useUpdateWorkoutPlan
>;
const mockUseDelete = useDeleteWorkoutPlan as jest.MockedFunction<
  typeof useDeleteWorkoutPlan
>;

const deleteWorkoutPlanAsync = jest.fn();
const updateWorkoutPlanAsync = jest.fn();
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  isFocused: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

// The custom header bar does not render in tests; capture its options instead.
let mockHeaderOptions:
  { title: string; right?: { onPress?: () => void } } | undefined;
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (options: unknown) => {
    mockHeaderOptions = options as typeof mockHeaderOptions;
    return null;
  },
}));

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
  entry_mode: 'prompt',
  assignments: [
    {
      id: 'a1',
      template_id: 'plan-1',
      day_of_week: 1,
      session_index: null,
      sort_order: 0,
      workout_preset_id: '7',
      workout_preset_name: 'Push',
      exercise_id: null,
      sets: [],
    },
    {
      id: 'a2',
      template_id: 'plan-1',
      day_of_week: 1,
      session_index: null,
      sort_order: 1,
      workout_preset_id: null,
      workout_preset_name: null,
      exercise_id: '42',
      exercise_name: 'Goblet squat',
      sets: [
        {
          id: 's1',
          set_number: 1,
          reps: 8,
          weight: 20,
          duration: null,
          rest_time: 90,
          notes: null,
          set_type: null,
        },
      ],
    },
  ],
} as WorkoutPlanTemplate;

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <WorkoutPlanDetailScreen
        navigation={mockNavigation}
        route={{
          key: 'WorkoutPlanDetail-key',
          name: 'WorkoutPlanDetail' as const,
          params: { template: plan },
        }}
      />
    </SafeAreaProvider>
  );
}

describe('WorkoutPlanDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePlans.mockReturnValue({
      workoutPlans: [plan],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUsePreferences.mockReturnValue({
      preferences: null,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    mockUseUpdate.mockReturnValue({ updateWorkoutPlanAsync, isPending: false });
    mockUseDelete.mockReturnValue({ deleteWorkoutPlanAsync, isPending: false });
    updateWorkoutPlanAsync.mockResolvedValue({ ...plan });
    deleteWorkoutPlanAsync.mockResolvedValue(undefined);
  });

  test('renders sections, assignments and set summaries', () => {
    const screen = renderScreen();
    expect(screen.getByText('Monday')).toBeTruthy();
    expect(screen.getByText('Push')).toBeTruthy();
    expect(screen.getByText('Saved workout')).toBeTruthy();
    expect(screen.getByText('Goblet squat')).toBeTruthy();
    expect(screen.getByText('Single exercise')).toBeTruthy();
    expect(screen.getByText(/8 reps/)).toBeTruthy();
    expect(screen.getByText(/90 s rest/)).toBeTruthy();
  });

  test('collapses a section on tap', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Monday'));
    expect(screen.queryByText('Push')).toBeNull();
    fireEvent.press(screen.getByLabelText('Monday'));
    expect(screen.getByText('Push')).toBeTruthy();
  });

  test('toggling the switch sends a full payload and toasts diary changes', async () => {
    updateWorkoutPlanAsync.mockResolvedValue({
      ...plan,
      is_active: false,
      regenerated_entries: { removed: 2, created: 0 },
    });
    const screen = renderScreen();

    fireEvent(screen.getByLabelText('Active plan'), 'valueChange', false);

    await waitFor(() => {
      expect(updateWorkoutPlanAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: false,
          plan_name: 'Push pull legs',
        }),
        expect.any(String)
      );
    });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'success',
        text1: 'Plan deactivated',
        text2: 'Removed 2 upcoming sessions',
      })
    );
  });

  test('a regeneration failure shows an error toast without throwing', async () => {
    updateWorkoutPlanAsync.mockResolvedValue({
      ...plan,
      is_active: false,
      regeneration_failed: true,
    });
    const screen = renderScreen();

    fireEvent(screen.getByLabelText('Active plan'), 'valueChange', false);

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Saved, but refreshing the diary failed',
        })
      );
    });
  });

  test('confirms before deleting and goes back', async () => {
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
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  test('the header edit action opens the form with the live plan', () => {
    renderScreen();
    expect(mockHeaderOptions?.title).toBe('Push pull legs');
    mockHeaderOptions?.right?.onPress?.();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('WorkoutPlanForm', {
      template: plan,
    });
  });
});
