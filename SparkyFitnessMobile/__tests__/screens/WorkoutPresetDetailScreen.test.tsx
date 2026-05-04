import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutPresetDetailScreen from '../../src/screens/WorkoutPresetDetailScreen';
import { usePreferences } from '../../src/hooks';
import type { WorkoutPreset, WorkoutPresetSet } from '../../src/types/workoutPresets';

jest.mock('../../src/hooks', () => ({
  usePreferences: jest.fn(),
  useProfile: jest.fn(() => ({ profile: undefined, isLoading: false, isError: false, refetch: jest.fn() })),
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
  useDeleteWorkoutPreset: jest.fn(() => ({ confirmAndDelete: jest.fn(), isPending: false })),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockUsePreferences = usePreferences as jest.MockedFunction<typeof usePreferences>;

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
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
  } as any;

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
  });

  it('navigates to WorkoutAdd with the preset and popCount=2 on Start workout', () => {
    const preset = buildPreset();
    const screen = renderScreen(preset);

    fireEvent.press(screen.getByText('Start workout'));
    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutAdd', {
      preset,
      popCount: 2,
    });
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

    expect(screen.getByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Chest, shoulders, triceps')).toBeTruthy();
    expect(screen.getByText('1 exercise')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });

  it('formats reps × weight sets in the user’s weight unit (kg)', () => {
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

    expect(screen.getByText('5 × 100 kg')).toBeTruthy();
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
    expect(screen.getByText('5 × 220.5 lbs')).toBeTruthy();
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

    expect(screen.getByText('5 × 220.5 lbs')).toBeTruthy();
  });

  it('renders per-set rest_time so mixed-rest presets keep their accuracy', () => {
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
    expect(screen.getByText('Rest · 1:30')).toBeTruthy();
    expect(screen.getByText('Rest · 2:00')).toBeTruthy();
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
