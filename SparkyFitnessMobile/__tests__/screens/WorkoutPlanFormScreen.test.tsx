/**
 * Form screen coverage for the phase 2 flow: edit a weekly plan, add a
 * single exercise through the search-selection params, fill the set, save,
 * and inspect the payload handed to updateWorkoutPlanAsync. Regression
 * guards for the CI emulator journey reported in #1995 phase 2.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

afterAll(() => queryClient.clear());
import WorkoutPlanFormScreen from '../../src/screens/WorkoutPlanFormScreen';
import {
  useCreateWorkoutPlan,
  useUpdateWorkoutPlan,
  useWorkoutPresets,
} from '../../src/hooks';
import type { WorkoutPlanTemplate } from '../../src/types/workoutPlans';

jest.mock('../../src/hooks', () => ({
  useCreateWorkoutPlan: jest.fn(),
  usePreferences: jest.fn(() => ({
    preferences: { default_weight_unit: 'kg' },
  })),
  useUpdateWorkoutPlan: jest.fn(),
  useWorkoutPresets: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockCreate = useCreateWorkoutPlan as jest.MockedFunction<
  typeof useCreateWorkoutPlan
>;
const mockUpdate = useUpdateWorkoutPlan as jest.MockedFunction<
  typeof useUpdateWorkoutPlan
>;
const mockPresets = useWorkoutPresets as jest.MockedFunction<
  typeof useWorkoutPresets
>;

const updateWorkoutPlanAsync = jest.fn().mockResolvedValue({ id: 1 });
const createWorkoutPlanAsync = jest.fn().mockResolvedValue({ id: 1 });
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
};
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

let mockHeaderOptions: unknown;
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (options: unknown) => {
    mockHeaderOptions = options;
    return null;
  },
}));

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 1080, height: 1920 };

const template = {
  id: 1,
  user_id: 'u1',
  plan_name: 'Phase 2 Weekly Plan',
  description: 'Seeded active weekly plan for the #1995 phase 2 screenshots',
  start_date: '2026-11-13',
  end_date: null,
  is_active: false,
  schedule_type: 'weekly',
  entry_mode: 'prefill',
  assignments: [
    {
      id: 1,
      template_id: 1,
      day_of_week: 1,
      session_index: null,
      session_name: null,
      sort_order: 0,
      workout_preset_id: 1,
      workout_preset_name: 'Phase 2 Push Day',
      workout_preset_format: 'standard',
      exercise_id: null,
      exercise_name: null,
      modality: null,
      sets: [],
    },
  ],
} as unknown as WorkoutPlanTemplate;

const demoExercise = {
  id: '979bd8db-4607-4fac-8deb-39e6de45cbfe',
  name: 'Demo Goblet Squat',
  category: 'strength',
  equipment: ['bodyweight'],
  is_custom: true,
  source: 'custom',
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockReturnValue({
    updateWorkoutPlanAsync,
    isPending: false,
  } as ReturnType<typeof useUpdateWorkoutPlan>);
  mockCreate.mockReturnValue({
    createWorkoutPlanAsync,
    isPending: false,
  } as ReturnType<typeof useCreateWorkoutPlan>);
  mockPresets.mockReturnValue({
    presets: [],
    isLoading: false,
  } as unknown as ReturnType<typeof useWorkoutPresets>);
});

test('saving an edited plan keeps the preset and adds the exercise with its set', async () => {
  const { getByText, getByPlaceholderText, rerender } = render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <WorkoutPlanFormScreen
          navigation={mockNavigation}
          route={{
            key: 'form-key',
            name: 'WorkoutPlanForm' as const,
            params: { template },
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );

  // The search screen returns by setting params on this route.
  rerender(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <WorkoutPlanFormScreen
          navigation={mockNavigation}
          route={{
            key: 'form-key',
            name: 'WorkoutPlanForm' as const,
            params: {
              template,
              selectedExercise: demoExercise,
              selectionNonce: 1,
            },
          }}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );

  // The exercise must show up in the form.
  await waitFor(() => {
    expect(getByText('Demo Goblet Squat')).toBeTruthy();
  });

  fireEvent.changeText(getByPlaceholderText('Reps'), '12');

  (
    mockHeaderOptions as { right?: { onPress?: () => void } }
  ).right?.onPress?.();

  await waitFor(() => {
    expect(updateWorkoutPlanAsync).toHaveBeenCalled();
  });
  const payload = updateWorkoutPlanAsync.mock.calls[0][0] as Record<
    string,
    unknown
  >;
  const assignments = payload.assignments as Record<string, unknown>[];
  expect(assignments.length).toBe(2);
  expect(assignments[1].exercise_id).toBe(
    '979bd8db-4607-4fac-8deb-39e6de45cbfe'
  );
});
