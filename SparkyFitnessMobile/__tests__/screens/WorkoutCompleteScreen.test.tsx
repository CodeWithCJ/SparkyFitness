import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkoutCompleteScreen from '../../src/screens/WorkoutCompleteScreen';
import { getWorkout } from '../../src/services/api/exerciseApi';
import { fireSuccessHaptic } from '../../src/services/haptics';
import type { PresetSessionResponse } from '@workspace/shared';

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({ preferences: { default_weight_unit: 'kg' } })),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({ getImageSource: jest.fn(() => null) })),
}));

jest.mock('../../src/hooks/useNavigationActionGuard', () => ({
  useNavigationActionGuard: jest.fn(() => ({
    runNavigationAction: jest.fn((action: () => void) => action()),
  })),
}));

jest.mock('../../src/services/api/exerciseApi', () => ({
  getWorkout: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
}));

function makeSet(id: number, overrides?: Record<string, unknown>) {
  return {
    id,
    set_number: 1,
    set_type: 'normal',
    reps: 5,
    weight: 100,
    duration: null,
    rest_time: 90,
    notes: null,
    rpe: null,
    completed_at: null,
    is_pr: false,
    ...overrides,
  };
}

function makeExercise(
  id: string,
  name: string,
  sets: ReturnType<typeof makeSet>[],
  overrides?: Record<string, unknown>,
) {
  return {
    id,
    exercise_id: `x-${id}`,
    duration_minutes: 20,
    calories_burned: 0,
    entry_date: '2026-07-15',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    superset_group: null,
    exercise_snapshot: {
      id: `x-${id}`,
      name,
      category: 'Strength',
      images: [],
      calories_per_hour: 400,
    },
    activity_details: [],
    sets,
    ...overrides,
  } as any;
}

/**
 * Bench: completed normal 100×5 (rpe 8) + completed warmup 60×5 + one skipped
 * set. Squat: one completed PR set 120×3 with an exercise note. Volume must
 * count the two completed working sets only: 500 + 360 = 860 kg.
 */
function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-07-15',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 40,
    activity_details: [],
    exercises: [
      makeExercise('ex-a', 'Bench Press', [
        makeSet(101, { rpe: 8 }),
        makeSet(102, { set_number: 2, set_type: 'warmup', weight: 60 }),
        makeSet(103, { set_number: 3 }),
      ]),
      makeExercise(
        'ex-b',
        'Squat',
        [makeSet(201, { weight: 120, reps: 3 })],
        { notes: 'felt strong' },
      ),
    ],
  };
}

const completedSetIds = { '101': 1_000, '102': 2_000, '201': 3_000 };

const baseParams = {
  session: makeSession(),
  completedSetIds,
  prSetIds: { '201': true as const },
  startedAt: 0,
  finishedAt: new Date('2026-07-15T17:42:00').getTime(),
};

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
} as any;

function renderScreen(paramOverrides?: Partial<typeof baseParams>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const route = {
    key: 'WorkoutComplete-1',
    name: 'WorkoutComplete',
    params: { ...baseParams, ...paramOverrides },
  } as any;
  return render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WorkoutCompleteScreen navigation={navigation} route={route} />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
}

describe('WorkoutCompleteScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Never-resolving by default; calories-specific tests override.
    (getWorkout as jest.Mock).mockImplementation(() => new Promise(() => {}));
  });

  it('renders the hero with the partial set count and workout name', () => {
    const { getByText } = renderScreen();

    expect(getByText('Workout Complete')).toBeTruthy();
    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('3 of 4 sets')).toBeTruthy();
  });

  it('says "All N sets" when every set was logged', () => {
    const { getByText } = renderScreen({
      completedSetIds: { ...completedSetIds, '103': 4_000 },
    });

    expect(getByText('4 sets')).toBeTruthy();
  });

  it('computes volume from completed working sets only and flags skips', () => {
    const { getByText } = renderScreen();

    // 100×5 + 120×3; the completed warmup and the skipped set contribute 0.
    expect(getByText(/860/)).toBeTruthy();
    expect(getByText(/1 skipped/)).toBeTruthy();
    // Per-exercise: Bench is partial, Squat complete.
    expect(getByText('2 of 3 sets')).toBeTruthy();
    expect(getByText('1 set · top 120 kg × 3')).toBeTruthy();
    expect(getByText('500 kg')).toBeTruthy();
    expect(getByText('360 kg')).toBeTruthy();
  });

  it('derives duration like the flush: cardio set sums + split, ignoring stale stamps', () => {
    const cardioSnapshot = (id: string, name: string) => ({
      id,
      name,
      category: 'Cardio',
      modality: 'duration_distance',
      images: [],
      calories_per_hour: 600,
    });
    const session = makeSession();
    // Two completed cardio efforts (25 + 5 min); the strength entries logged
    // nothing but carry stale 14-minute stamps that must not be counted.
    session.exercises = [
      makeExercise('ex-a', 'Bench Press', [makeSet(101)], { duration_minutes: 14 }),
      makeExercise('ex-b', 'Squat', [makeSet(201)], { duration_minutes: 14 }),
      makeExercise(
        'ex-c',
        'Run',
        [makeSet(301, { reps: null, weight: null, duration: 1500, rest_time: 0, distance: 5 })],
        { duration_minutes: 25, exercise_snapshot: cardioSnapshot('x-ex-c', 'Run') },
      ),
      makeExercise(
        'ex-d',
        'Walk',
        [makeSet(401, { reps: null, weight: null, duration: 300, rest_time: 0, distance: 0.5 })],
        { duration_minutes: 5, exercise_snapshot: cardioSnapshot('x-ex-d', 'Walk') },
      ),
    ];

    const { getByText } = renderScreen({
      session,
      completedSetIds: { '301': 60_000, '401': 120_000 },
      prSetIds: {},
      startedAt: 0,
    });

    expect(getByText('30 min')).toBeTruthy();
  });

  it('shows the records card with one row per PR set and fires the success haptic', () => {
    const { getByText } = renderScreen();

    expect(getByText('1 Personal Record')).toBeTruthy();
    expect(getByText('120 kg × 3')).toBeTruthy();
    expect(fireSuccessHaptic).toHaveBeenCalledTimes(1);
  });

  it('hides the records card entirely and skips the haptic without PRs', () => {
    const { queryByText } = renderScreen({ prSetIds: {} });

    expect(queryByText(/Personal Record/)).toBeNull();
    expect(fireSuccessHaptic).not.toHaveBeenCalled();
  });

  it('shows the average RPE row with the ramp label, hiding it when nothing logged one', () => {
    const { getByText } = renderScreen();
    // Only set 101 logged an RPE (8) → moderate on the app ramp.
    expect(getByText('Average RPE')).toBeTruthy();
    expect(getByText('Moderate')).toBeTruthy();
    expect(getByText('8')).toBeTruthy();

    const session = makeSession();
    session.exercises[0].sets[0].rpe = null;
    const { queryByText } = renderScreen({ session });
    expect(queryByText('Average RPE')).toBeNull();
  });

  it('shows the exercise note on its recap row', () => {
    const { getByText } = renderScreen();

    expect(getByText('“felt strong”')).toBeTruthy();
  });

  it('shimmers the calories tile until the post-save refetch lands', async () => {
    let resolve: (value: PresetSessionResponse) => void;
    (getWorkout as jest.Mock).mockImplementation(
      () => new Promise((res) => (resolve = res)),
    );
    const { getByLabelText, findByText } = renderScreen();

    expect(getByLabelText('Calculating')).toBeTruthy();

    const refreshed = makeSession();
    refreshed.exercises = refreshed.exercises.map((e) => ({ ...e, calories_burned: 171 }));
    resolve!(refreshed);

    expect(await findByText(/342/)).toBeTruthy();
  });

  it('shows snapshot calories immediately when the flush already carried them', () => {
    const session = makeSession();
    session.exercises = session.exercises.map((e) => ({ ...e, calories_burned: 150 }));
    const { getByText, queryByLabelText } = renderScreen({ session });

    expect(getByText(/300/)).toBeTruthy();
    expect(queryByLabelText('Calculating')).toBeNull();
  });

  it('Done returns to the Diary tab', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Done'));

    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Diary' });
  });

  it('Save as Preset opens the prefilled preset create form', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Save as Preset'));

    expect(navigation.navigate).toHaveBeenCalledWith('WorkoutPresetForm', {
      mode: 'create-preset',
      sourceSession: expect.objectContaining({ id: 'session-1' }),
    });
  });

  it('View Workout opens the workout detail, preferring the refetched session', async () => {
    const refreshed = makeSession();
    refreshed.exercises = refreshed.exercises.map((e) => ({ ...e, calories_burned: 171 }));
    (getWorkout as jest.Mock).mockResolvedValue(refreshed);
    const { getByText, findByText } = renderScreen();
    await findByText(/342/);

    fireEvent.press(getByText('View Workout'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('WorkoutDetail', {
        session: refreshed,
      });
    });
  });
});
