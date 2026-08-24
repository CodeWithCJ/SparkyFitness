import React from 'react';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useIsFocused } from '@react-navigation/native';
import WorkoutCompleteScreen from '../../src/screens/WorkoutCompleteScreen';
import { getWorkout } from '../../src/services/api/exerciseApi';
import { getWorkoutPresetById } from '../../src/services/api/workoutPresetsApi';
import { getActiveServerConfig } from '../../src/services/storage';
import { useUpdateWorkoutPreset } from '../../src/hooks/useWorkoutPresetMutations';
import { fireSuccessHaptic } from '../../src/services/haptics';
import type { PresetSessionResponse } from '@workspace/shared';
import type { RootStackParamList } from '../../src/types/navigation';
import type {
  WorkoutPreset,
  WorkoutPresetSet,
} from '../../src/types/workoutPresets';
import i18n, { initializeI18n } from '../../src/localization/i18n';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: jest.fn(() => true),
}));

jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({
    preferences: { default_weight_unit: 'kg' },
  })),
}));

jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: jest.fn(() => ({ profile: { id: 'user-1' } })),
}));

jest.mock('../../src/hooks/useWorkoutPresetMutations', () => ({
  useUpdateWorkoutPreset: jest.fn(),
}));

jest.mock('../../src/hooks/useExerciseImageSource', () => ({
  useExerciseImageSource: jest.fn(() => ({
    getImageSource: jest.fn(() => null),
  })),
}));

jest.mock('../../src/hooks/useNavigationActionGuard', () => ({
  useNavigationActionGuard: jest.fn(() => ({
    runNavigationAction: jest.fn((action: () => void) => action()),
  })),
}));

jest.mock('../../src/services/api/exerciseApi', () => ({
  getWorkout: jest.fn(),
}));

jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  getWorkoutPresetById: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  ...jest.requireActual('../../src/services/storage'),
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
}));

const mockUseIsFocused = useIsFocused as jest.MockedFunction<
  typeof useIsFocused
>;
const mockGetPresetById = getWorkoutPresetById as jest.MockedFunction<
  typeof getWorkoutPresetById
>;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockUseUpdateWorkoutPreset =
  useUpdateWorkoutPreset as jest.MockedFunction<typeof useUpdateWorkoutPreset>;

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
      makeExercise('ex-b', 'Squat', [makeSet(201, { weight: 120, reps: 3 })], {
        notes: 'felt strong',
      }),
    ],
  };
}

const completedSetIds = { '101': 1_000, '102': 2_000, '201': 3_000 };

const baseParams: RootStackParamList['WorkoutComplete'] = {
  session: makeSession(),
  completedSetIds,
  prSetIds: { '201': true as const },
  startedAt: 0,
  finishedAt: new Date('2026-07-15T17:42:00').getTime(),
  sourcePresetId: null,
  sourceServerConfigId: null,
  plannedSetValues: {},
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
  const updatePresetAsync = jest.fn();

  beforeEach(async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    jest.clearAllMocks();
    // Never-resolving by default; calories-specific tests override.
    (getWorkout as jest.Mock).mockImplementation(() => new Promise(() => {}));
    mockUseIsFocused.mockReturnValue(true);
    mockUseUpdateWorkoutPreset.mockReturnValue({
      updatePresetAsync,
      isPending: false,
    });
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'config-1',
      url: 'https://example.com',
      apiKey: 'key',
    });
  });

  it('renders the hero with the partial set count and workout name', () => {
    const { getByText } = renderScreen();

    expect(getByText('Workout Complete')).toBeTruthy();
    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('3 of 4 sets')).toBeTruthy();
  });

  it('updates completion actions and personal record count when the mounted screen changes languages', async () => {
    const screen = renderScreen();

    expect(screen.getByText('Workout Complete')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('1 Personal Record')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    expect(screen.getByText('Trening ukończony')).toBeTruthy();
    expect(screen.getByText('Gotowe')).toBeTruthy();
    expect(screen.getByText('1 rekord osobisty')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByText('Workout Complete')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('1 Personal Record')).toBeTruthy();
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
      makeExercise('ex-a', 'Bench Press', [makeSet(101)], {
        duration_minutes: 14,
      }),
      makeExercise('ex-b', 'Squat', [makeSet(201)], { duration_minutes: 14 }),
      makeExercise(
        'ex-c',
        'Run',
        [
          makeSet(301, {
            reps: null,
            weight: null,
            duration: 1500,
            rest_time: 0,
            distance: 5,
          }),
        ],
        {
          duration_minutes: 25,
          exercise_snapshot: cardioSnapshot('x-ex-c', 'Run'),
        },
      ),
      makeExercise(
        'ex-d',
        'Walk',
        [
          makeSet(401, {
            reps: null,
            weight: null,
            duration: 300,
            rest_time: 0,
            distance: 0.5,
          }),
        ],
        {
          duration_minutes: 5,
          exercise_snapshot: cardioSnapshot('x-ex-d', 'Walk'),
        },
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

  it('localizes the English personal record count for multiple records', () => {
    const { getByText } = renderScreen({ prSetIds: { '101': true as const, '201': true as const } });

    expect(getByText('2 Personal Records')).toBeTruthy();
  });

  it.each([
    [1, '1 rekord osobisty'],
    [2, '2 rekordy osobiste'],
    [5, '5 rekordów osobistych'],
    [22, '22 rekordy osobiste'],
    [25, '25 rekordów osobistych'],
  ])('renders the Polish personal record plural for %s', async (count, expected) => {
    await i18n.changeLanguage('pl');
    const prSetIds: Record<string, true> = {};
    const session = makeSession();
    const sets = Array.from({ length: count as number }, (_, index) =>
      makeSet(10_000 + index, { weight: 100 + index }),
    );
    session.exercises = [makeExercise('ex-pr', 'Bench Press', sets)];
    const completedSetIdsForCase = Object.fromEntries(sets.map(set => [String(set.id), set.id]));
    Object.keys(completedSetIdsForCase).forEach(id => { prSetIds[id] = true; });
    const { getByText } = renderScreen({ session, completedSetIds: completedSetIdsForCase, prSetIds });

    expect(getByText(expected as string)).toBeTruthy();
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
      () => new Promise(res => (resolve = res)),
    );
    const { getByLabelText, findByText } = renderScreen();

    expect(getByLabelText('Calculating')).toBeTruthy();

    const refreshed = makeSession();
    refreshed.exercises = refreshed.exercises.map(e => ({
      ...e,
      calories_burned: 171,
    }));
    resolve!(refreshed);

    expect(await findByText(/342/)).toBeTruthy();
  });

  it('shows snapshot calories immediately when the flush already carried them', () => {
    const session = makeSession();
    session.exercises = session.exercises.map(e => ({
      ...e,
      calories_burned: 150,
    }));
    const { getByText, queryByLabelText } = renderScreen({ session });

    expect(getByText(/300/)).toBeTruthy();
    expect(queryByLabelText('Calculating')).toBeNull();
  });

  it('Done returns to the Diary tab', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Done'));

    expect(navigation.navigate).toHaveBeenCalledWith('Tabs', {
      screen: 'Diary',
    });
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
    refreshed.exercises = refreshed.exercises.map(e => ({
      ...e,
      calories_burned: 171,
    }));
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

  describe('update-preset prompt', () => {
    let alertSpy: jest.SpyInstance;

    function makePresetSet(
      id: number,
      setNumber: number,
      overrides: Partial<WorkoutPresetSet> = {},
    ): WorkoutPresetSet {
      return {
        id,
        set_number: setNumber,
        set_type: 'normal',
        reps: 5,
        weight: 100,
        duration: null,
        rest_time: 90,
        notes: null,
        ...overrides,
      };
    }

    /** Mirrors makeSession() exactly, so the canonicalized sides are equal. */
    function makeMatchingPreset(
      overrides: Partial<WorkoutPreset> = {},
    ): WorkoutPreset {
      return {
        id: 42,
        user_id: 'user-1',
        name: 'Push Day',
        description: null,
        is_public: false,
        exercises: [
          {
            id: 801,
            exercise_id: 'x-ex-a',
            image_url: null,
            exercise_name: 'Bench Press',
            category: 'Strength',
            superset_group: null,
            sets: [
              makePresetSet(901, 1),
              makePresetSet(902, 2, { set_type: 'warmup', weight: 60 }),
              makePresetSet(903, 3),
            ],
          },
          {
            id: 802,
            exercise_id: 'x-ex-b',
            image_url: null,
            exercise_name: 'Squat',
            category: 'Strength',
            superset_group: null,
            sets: [makePresetSet(904, 1, { reps: 3, weight: 120 })],
          },
        ],
        ...overrides,
      };
    }

    /** The matching preset with one weight off — the session deviates from it. */
    function makeDeviatingPreset(
      overrides: Partial<WorkoutPreset> = {},
    ): WorkoutPreset {
      const preset = makeMatchingPreset(overrides);
      preset.exercises[0].sets[0].weight = 95;
      return preset;
    }

    const promptParams = {
      sourcePresetId: 42,
      sourceServerConfigId: 'config-1',
    };

    /** Flush the config check → preset fetch → state set promise chain. */
    async function flushFetch() {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    function firePromptTimer() {
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
    }

    function alertButton(label: string): { onPress?: () => void } {
      const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
      const button = (call?.[2] ?? []).find(
        (b: { text?: string }) => b.text === label,
      );
      expect(button).toBeDefined();
      return button;
    }

    beforeEach(() => {
      jest.useFakeTimers();
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    });

    afterEach(() => {
      alertSpy.mockRestore();
      jest.useRealTimers();
    });

    it('prompts once on deviation and Update PUTs the built payload, then toasts', async () => {
      mockGetPresetById.mockResolvedValue(makeDeviatingPreset());
      updatePresetAsync.mockResolvedValue(makeMatchingPreset());
      renderScreen(promptParams);
      await flushFetch();
      firePromptTimer();

      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith(
        'Update preset?',
        expect.stringContaining('"Push Day"'),
        expect.arrayContaining([
          expect.objectContaining({ text: 'Keep Preset' }),
          expect.objectContaining({ text: 'Update' }),
        ]),
      );
      // One shot: nothing re-fires after the first alert.
      firePromptTimer();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        alertButton('Update').onPress?.();
      });

      expect(updatePresetAsync).toHaveBeenCalledWith({
        id: 42,
        // Exactly { exercises } — identity and sharing must not ride along.
        payload: {
          exercises: [
            expect.objectContaining({
              exercise_id: 'x-ex-a',
              sort_order: 0,
              sets: [
                expect.objectContaining({
                  set_number: 1,
                  weight: 100,
                  reps: 5,
                }),
                expect.objectContaining({
                  set_number: 2,
                  set_type: 'warmup',
                  weight: 60,
                }),
                expect.objectContaining({ set_number: 3, weight: 100 }),
              ],
            }),
            expect.objectContaining({ exercise_id: 'x-ex-b', sort_order: 1 }),
          ],
        },
      });
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'success',
        text1: 'Preset updated',
      });
    });

    it('shows no success toast and swallows the rejection when the update fails', async () => {
      mockGetPresetById.mockResolvedValue(makeDeviatingPreset());
      updatePresetAsync.mockRejectedValue(new Error('500'));
      renderScreen(promptParams);
      await flushFetch();
      firePromptTimer();

      await act(async () => {
        alertButton('Update').onPress?.();
      });

      expect(updatePresetAsync).toHaveBeenCalled();
      expect(Toast.show).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      );
    });

    it('does not prompt when the performed workout matches the preset', async () => {
      mockGetPresetById.mockResolvedValue(makeMatchingPreset());
      renderScreen(promptParams);
      await flushFetch();
      firePromptTimer();

      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not prompt for a preset the user does not own', async () => {
      mockGetPresetById.mockResolvedValue(
        makeDeviatingPreset({ user_id: 'someone-else' }),
      );
      renderScreen(promptParams);
      await flushFetch();
      firePromptTimer();

      expect(alertSpy).not.toHaveBeenCalled();
      expect(updatePresetAsync).not.toHaveBeenCalled();
    });

    it('does not fetch or prompt for a workout without a source preset', async () => {
      renderScreen();
      await flushFetch();
      firePromptTimer();

      expect(mockGetPresetById).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not prompt when the preset fetch fails (e.g. deleted mid-workout)', async () => {
      mockGetPresetById.mockRejectedValue(new Error('404'));
      renderScreen(promptParams);
      await flushFetch();
      firePromptTimer();

      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not fetch when the active server changed since the workout started', async () => {
      mockGetActiveServerConfig.mockResolvedValue({
        id: 'other-config',
        url: 'https://other.example.com',
        apiKey: 'key',
      });
      mockGetPresetById.mockResolvedValue(makeDeviatingPreset());
      renderScreen(promptParams);
      await flushFetch();
      firePromptTimer();

      expect(mockGetPresetById).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('holds the prompt while covered by a pushed screen and fires it on refocus', async () => {
      mockUseIsFocused.mockReturnValue(false);
      mockGetPresetById.mockResolvedValue(makeDeviatingPreset());
      const screen = renderScreen(promptParams);
      await flushFetch();
      firePromptTimer();

      expect(alertSpy).not.toHaveBeenCalled();

      mockUseIsFocused.mockReturnValue(true);
      screen.rerender(
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <QueryClientProvider client={new QueryClient()}>
            <WorkoutCompleteScreen
              navigation={navigation}
              route={
                {
                  key: 'WorkoutComplete-1',
                  name: 'WorkoutComplete',
                  params: { ...baseParams, ...promptParams },
                } as any
              }
            />
          </QueryClientProvider>
        </SafeAreaProvider>,
      );
      firePromptTimer();

      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('clears the pending prompt timer on unmount', async () => {
      mockGetPresetById.mockResolvedValue(makeDeviatingPreset());
      const screen = renderScreen(promptParams);
      await flushFetch();

      screen.unmount();
      firePromptTimer();

      expect(alertSpy).not.toHaveBeenCalled();
    });
  });
});
