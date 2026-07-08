import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutPresetDetailScreen from '../../src/screens/WorkoutPresetDetailScreen';
import { usePreferences } from '../../src/hooks';
import { useStartLiveWorkout } from '../../src/hooks/useStartLiveWorkout';
import { loadActiveDraft } from '../../src/services/workoutDraftService';
import { buildPresetStartExercisesPayload } from '../../src/utils/workoutSession';
import type { WorkoutPreset, WorkoutPresetSet } from '../../src/types/workoutPresets';

jest.mock('../../src/hooks', () => ({
  usePreferences: jest.fn(),
  useProfile: jest.fn(() => ({ profile: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useDeleteWorkoutPreset: jest.fn(() => ({ confirmAndDelete: jest.fn(), isPending: false })),
}));

jest.mock('../../src/hooks/useStartLiveWorkout', () => ({
  useStartLiveWorkout: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/services/workoutDraftService', () => ({
  loadActiveDraft: jest.fn(),
  clearDraft: jest.fn(),
}));

const mockNavigation = {
  setOptions: jest.fn(),
  navigate: jest.fn(),
  goBack: jest.fn(),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  // useExerciseImageSource refreshes its cache on focus; a no-op keeps
  // rendering synchronous outside a NavigationContainer.
  useFocusEffect: jest.fn(),
}));

const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;
const mockLoadActiveDraft = loadActiveDraft as jest.MockedFunction<typeof loadActiveDraft>;
const mockUseStartLiveWorkout = useStartLiveWorkout as jest.MockedFunction<
  typeof useStartLiveWorkout
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

function buildSet(overrides: Partial<WorkoutPresetSet> = {}): WorkoutPresetSet {
  return {
    id: 'set-1',
    set_number: 1,
    set_type: 'normal',
    reps: null,
    weight: null,
    duration: null,
    rest_time: 60,
    notes: null,
    ...overrides,
  };
}

function buildPreset(overrides: Partial<WorkoutPreset> = {}): WorkoutPreset {
  return {
    id: 'preset-1',
    user_id: 'user-1',
    name: 'Push Day',
    description: 'Chest, shoulders, triceps',
    is_public: false,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    exercises: [],
    ...overrides,
  };
}

describe('WorkoutPresetDetailScreen', () => {
  const navigation = mockNavigation;
  const startLiveWorkout = jest.fn();

  const renderScreen = (preset: WorkoutPreset) => {
    const route = {
      key: 'WorkoutPresetDetail-key',
      name: 'WorkoutPresetDetail' as const,
      params: { preset },
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <WorkoutPresetDetailScreen navigation={navigation} route={route} />
        </SafeAreaProvider>
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'kg' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    mockLoadActiveDraft.mockResolvedValue(null);
    mockUseStartLiveWorkout.mockReturnValue({ startLiveWorkout, isStarting: false });
  });

  it('starts a live workout with the preset-built payload on Start workout', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet()],
        },
      ],
    });
    const screen = renderScreen(preset);

    fireEvent.press(screen.getByText('Start workout'));

    expect(startLiveWorkout).toHaveBeenCalledWith({
      name: 'Push Day',
      exercises: buildPresetStartExercisesPayload(preset),
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('navigates to WorkoutAdd with the preset and popCount=2 on Log past workout', async () => {
    const preset = buildPreset();
    const screen = renderScreen(preset);

    fireEvent.press(screen.getByText('Log past workout'));
    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('WorkoutAdd', {
        preset,
        popCount: 2,
      });
    });
    expect(startLiveWorkout).not.toHaveBeenCalled();
  });

  it('prompts to resume an active draft before logging a past preset workout', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockLoadActiveDraft.mockResolvedValue({
      type: 'workout',
      name: 'Draft',
      nameManuallySet: true,
      entryDate: '2026-06-23',
      exercises: [
        {
          clientId: 'draft-exercise',
          exerciseId: 'exercise-1',
          exerciseName: 'Bench Press',
          exerciseCategory: null,
          images: [],
          sets: [
            {
              clientId: 'draft-set',
              weight: '100',
              reps: '5',
              restTime: 90,
            },
          ],
        },
      ],
    });
    const screen = renderScreen(buildPreset());

    fireEvent.press(screen.getByText('Log past workout'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Draft in Progress',
        expect.any(String),
        expect.any(Array),
      );
    });

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((button) => button.text === 'Resume Draft')?.onPress?.();
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutAdd');
  });

  it('renders preset name, description, and exercise count', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet()],
        },
      ],
    });
    const screen = renderScreen(preset);

    // The name lives in the (native) header title now; the body keeps the
    // description, exercise count, and the exercise card.
    expect(navigation.setOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Push Day' }),
    );
    expect(screen.getByText('Chest, shoulders, triceps')).toBeTruthy();
    expect(screen.getByText('1 exercise')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });

  it('renders set weight/reps in the card table, expanded by default (kg)', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    // No expand tap needed — preset cards default expanded.
    expect(screen.getByText('KG')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('converts kg to lbs when the user prefers lbs', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'lbs' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    // 100kg → ~220.5 lbs
    expect(screen.getByText('LBS')).toBeTruthy();
    expect(screen.getByText('220.5')).toBeTruthy();
  });

  it('coerces st_lbs to lbs for display rather than passing it to weightFromKg', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'st_lbs' },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as any);
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100 })],
        },
      ],
    });
    const screen = renderScreen(preset);

    expect(screen.getByText('220.5')).toBeTruthy();
  });

  it('shows one exercise-level rest chip from the first set (mixed rest degrades to it)', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          sets: [
            buildSet({ id: 's-1', set_number: 1, reps: 5, weight: 100, rest_time: 45 }),
            buildSet({ id: 's-2', set_number: 2, reps: 5, weight: 100, rest_time: 90 }),
            buildSet({ id: 's-3', set_number: 3, reps: 5, weight: 100, rest_time: 120 }),
          ],
        },
      ],
    });
    const screen = renderScreen(preset);

    expect(screen.getByText('Rest · 45s')).toBeTruthy();
    expect(screen.queryByText('Rest · 1:30')).toBeNull();
    expect(screen.queryByText('Rest · 2:00')).toBeNull();
  });

  it('renders a superset rail on each grouped exercise', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 801,
          exercise_id: 'ex-1',
          exercise_name: 'Bench Press',
          image_url: null,
          superset_group: 1,
          sets: [buildSet({ id: 's-1' })],
        },
        {
          id: 802,
          exercise_id: 'ex-2',
          exercise_name: 'Bent-over Row',
          image_url: null,
          superset_group: 1,
          sets: [buildSet({ id: 's-2' })],
        },
        {
          id: 803,
          exercise_id: 'ex-3',
          exercise_name: 'Plank',
          image_url: null,
          superset_group: null,
          sets: [buildSet({ id: 's-3' })],
        },
      ],
    } as never);
    const screen = renderScreen(preset);

    expect(screen.getByTestId('superset-rail-801')).toBeTruthy();
    expect(screen.getByTestId('superset-rail-802')).toBeTruthy();
    expect(screen.queryByTestId('superset-rail-803')).toBeNull();
  });

  it('renders time-based (duration-only) sets as a duration string', () => {
    const preset = buildPreset({
      exercises: [
        {
          id: 'pe-1',
          exercise_id: 'ex-1',
          exercise_name: 'Plank',
          image_url: null,
          sets: [
            buildSet({ id: 's-1', set_number: 1, duration: 45 }),
            buildSet({ id: 's-2', set_number: 2, duration: 90 }),
          ],
        },
      ],
    });
    const screen = renderScreen(preset);

    expect(screen.getByText('45s')).toBeTruthy();
    expect(screen.getByText('1:30')).toBeTruthy();
  });
});
