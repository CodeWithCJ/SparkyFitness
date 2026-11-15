import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import type { PresetSessionResponse } from '@workspace/shared';
import {
  __resetLiveWorkoutStartForTests,
  armWatchForActiveSession,
  syncWatchIntervalTiming,
  useStartLiveWorkout,
} from '../../src/hooks/useStartLiveWorkout';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { createWorkout } from '../../src/services/api/exerciseApi';
import { invalidateExerciseCache } from '../../src/hooks/invalidateExerciseCache';
import { ensureNotificationPermission } from '../../src/services/notifications';
import { flushActiveWorkoutBeforeClear } from '../../src/hooks/useActiveWorkoutAutosave';
import { getActiveServerConfig } from '../../src/services/storage';
import { serverConnectionQueryKey } from '../../src/hooks/queryKeys';
import { defaultWorkoutName } from '../../src/hooks/useWorkoutForm';
import { getTodayDate } from '../../src/utils/dateUtils';
import { buildSingleExerciseStartPayload } from '../../src/utils/workoutSession';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  createWorkout: jest.fn(),
}));

jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

jest.mock('../../src/services/notifications', () => ({
  ensureNotificationPermission: jest.fn(async () => true),
  maybePromptForExactAlarmPermission: jest.fn(async () => undefined),
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteCue: jest.fn(),
}));

jest.mock('../../src/hooks/useActiveWorkoutAutosave', () => ({
  flushActiveWorkoutBeforeClear: jest.fn(async () => true),
}));

jest.mock('../../src/services/storage', () => ({
  ...jest.requireActual('../../src/services/storage'),
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    startWorkout: jest.fn(),
    updateIntervalTiming: jest.fn(),
  },
}));

const mockWatch = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { startWorkout: jest.Mock; updateIntervalTiming: jest.Mock };
  }
).default;
const mockStartWorkout = mockWatch.startWorkout;
const mockUpdateIntervalTiming = mockWatch.updateIntervalTiming;

const mockCreateWorkout = createWorkout as jest.MockedFunction<
  typeof createWorkout
>;
const mockInvalidate = invalidateExerciseCache as jest.MockedFunction<
  typeof invalidateExerciseCache
>;
const mockEnsurePermission =
  ensureNotificationPermission as jest.MockedFunction<
    typeof ensureNotificationPermission
  >;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;
const mockFlushBeforeClear =
  flushActiveWorkoutBeforeClear as jest.MockedFunction<
    typeof flushActiveWorkoutBeforeClear
  >;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

const EXERCISES = buildSingleExerciseStartPayload({
  id: 'ex-1',
  modality: null,
  category: null,
});

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: getTodayDate(),
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 0,
    activity_details: [],
    exercises: [
      {
        id: 'ex-uuid-1',
        exercise_id: 'ex-1',
        duration_minutes: 0,
        calories_burned: 0,
        entry_date: getTodayDate(),
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          calories_per_hour: 400,
          images: [],
        } as any,
        activity_details: [],
        sets: [
          {
            id: 101,
            set_number: 1,
            set_type: 'normal',
            reps: null,
            weight: null,
            duration: null,
            rest_time: 90,
            notes: null,
            rpe: null,
          },
        ],
      } as any,
    ],
  };
}

function setup({ connected = true, focused = true } = {}) {
  const queryClient = createTestQueryClient();
  if (connected) queryClient.setQueryData(serverConnectionQueryKey, true);
  const navigation = {
    replace: jest.fn(),
    navigate: jest.fn(),
    isFocused: jest.fn(() => focused),
  };
  const { result } = renderHook(() => useStartLiveWorkout(navigation), {
    wrapper: createQueryWrapper(queryClient),
  });
  return { result, navigation, queryClient };
}

describe('useStartLiveWorkout', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
    __resetLiveWorkoutStartForTests();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCreateWorkout.mockResolvedValue(makeSession());
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('creates a session for today, seeds the store, and replaces to ActiveWorkout', async () => {
    const { result, navigation, queryClient } = setup();

    await act(async () => {
      await result.current.startLiveWorkout({
        name: 'Push Day',
        exercises: EXERCISES,
      });
    });

    expect(mockCreateWorkout).toHaveBeenCalledWith({
      name: 'Push Day',
      entry_date: getTodayDate(),
      source: 'sparky',
      exercises: EXERCISES,
    });
    expect(mockInvalidate).toHaveBeenCalledWith(queryClient, getTodayDate());
    expect(mockEnsurePermission).toHaveBeenCalled();

    const store = useActiveWorkoutStore.getState();
    expect(store.sessionId).toBe('session-1');
    expect(store.createdByLiveStart).toBe(true);
    expect(navigation.replace).toHaveBeenCalledWith('ActiveWorkout');
  });

  it('lets only one caller create a session when the phone and the watch start together', async () => {
    let resolveCreate: (session: PresetSessionResponse) => void = () =>
      undefined;
    mockCreateWorkout.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        })
    );
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(serverConnectionQueryKey, true);
    const navigation = {
      replace: jest.fn(),
      navigate: jest.fn(),
      isFocused: jest.fn(() => false),
    };
    const phone = renderHook(() => useStartLiveWorkout(navigation), {
      wrapper: createQueryWrapper(queryClient),
    });
    const watch = renderHook(() => useStartLiveWorkout(navigation), {
      wrapper: createQueryWrapper(queryClient),
    });

    let phoneDone: Promise<void> = Promise.resolve();
    act(() => {
      phoneDone = phone.result.current.startLiveWorkout({
        name: 'Push Day',
        exercises: EXERCISES,
      });
    });
    await act(async () => {
      await watch.result.current.startLiveWorkout({
        name: 'Pull Day',
        exercises: EXERCISES,
      });
    });
    expect(mockCreateWorkout).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveCreate(makeSession());
      await phoneDone;
    });
    expect(mockCreateWorkout).toHaveBeenCalledTimes(1);
    expect(useActiveWorkoutStore.getState().sessionId).toBe('session-1');
  });

  it('arms the watch with the interval format, cap, and start time', async () => {
    const { result } = setup();
    const before = Date.now();

    await act(async () => {
      await result.current.startLiveWorkout({
        name: 'Push Day',
        exercises: EXERCISES,
        workoutFormat: 'amrap',
        timeCapSeconds: 720,
      });
    });

    expect(mockStartWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        workoutFormat: 'amrap',
        timeCapSeconds: 720,
        startedAt: expect.any(String),
        armedAt: expect.any(String),
        capEndsAt: expect.any(String),
      })
    );
    const payload = mockStartWorkout.mock.calls[0][0];
    const startedAt = Date.parse(payload.startedAt as string);
    expect(startedAt).toBeGreaterThanOrEqual(before);
    expect(startedAt).toBeLessThanOrEqual(Date.now());
    // The phone leads the cap with a 5s countdown, so 0:00 is cap + 5s.
    expect(Date.parse(payload.capEndsAt as string) - startedAt).toBe(
      (720 + 5) * 1000
    );
    // The arm time the phone's later target updates are tagged with.
    expect(useActiveWorkoutStore.getState().watchArmedAt).toBe(
      Date.parse(payload.armedAt as string)
    );
  });

  it('freezes the watch cap on pause and sends the pause length on resume', () => {
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    syncWatchIntervalTiming({
      paused: true,
      pausedAtMs: Date.parse('2026-09-25T15:00:00.000Z'),
    });
    const paused = mockUpdateIntervalTiming.mock.calls.at(-1)?.[0];
    expect(paused).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        paused: true,
        pausedAt: '2026-09-25T15:00:00.000Z',
        excludedPauseMs: 0,
      })
    );

    syncWatchIntervalTiming({ paused: false, pauseDurationMs: 12_000 });
    const resumed = mockUpdateIntervalTiming.mock.calls.at(-1)?.[0];
    expect(resumed).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        paused: false,
        excludedPauseMs: 12_000,
        revision: (paused.revision as number) + 1,
      })
    );
    expect(resumed.pausedAt).toBeUndefined();
    expect(useActiveWorkoutStore.getState().watchIntervalRevision).toBe(
      resumed.revision
    );
    expect(useActiveWorkoutStore.getState().watchExcludedPauseMs).toBe(12_000);

    syncWatchIntervalTiming({ paused: false, pauseDurationMs: -5_000 });
    const afterRollback = mockUpdateIntervalTiming.mock.calls.at(-1)?.[0];
    expect(afterRollback.excludedPauseMs).toBe(12_000);
    expect(afterRollback.revision).toBe((resumed.revision as number) + 1);
    expect(useActiveWorkoutStore.getState().watchIntervalRevision).toBe(
      afterRollback.revision
    );
  });

  it('tells the watch when the store pauses and resumes', () => {
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession(), {
        workoutFormat: 'amrap',
        timeCapSeconds: 60,
      });
      useActiveWorkoutStore.getState().pauseInterval();
    });

    expect(mockUpdateIntervalTiming).toHaveBeenCalledWith(
      expect.objectContaining({ paused: true, sessionId: 'session-1' })
    );

    act(() => {
      useActiveWorkoutStore.getState().resumeInterval();
    });

    expect(mockUpdateIntervalTiming).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paused: false,
        sessionId: 'session-1',
      })
    );
  });

  it('strips planned weight/reps/duration from the create payload and seeds them as the store plan', async () => {
    const { result } = setup();
    const plannedExercises = [
      {
        ...EXERCISES[0],
        sets: [{ ...EXERCISES[0].sets[0], weight: 80, reps: 5, duration: 90 }],
      },
    ];

    await act(async () => {
      await result.current.startLiveWorkout({
        name: 'Push Day',
        exercises: plannedExercises,
      });
    });

    // Sets are created empty — the plan is an assumption, not a result.
    expect(mockCreateWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [
          expect.objectContaining({
            sets: [
              expect.objectContaining({
                weight: null,
                reps: null,
                duration: null,
                distance: null,
              }),
            ],
          }),
        ],
      })
    );
    // The plan lands keyed to the created session's set ids for placeholders.
    expect(useActiveWorkoutStore.getState().plannedSetValues).toEqual({
      '101': { weight: 80, reps: 5, duration: 90, distance: null },
    });
  });

  it('marks the store plan to show before last session when "Use planned values as placeholders" is on (#3417)', async () => {
    useAppPreferencesStore.getState().setPlannedValuesAsPlaceholders(true);
    try {
      const { result } = setup();
      const plannedExercises = [
        {
          ...EXERCISES[0],
          sets: [{ ...EXERCISES[0].sets[0], weight: 110, reps: 5 }],
        },
      ];

      await act(async () => {
        await result.current.startLiveWorkout({
          name: 'Push Day',
          exercises: plannedExercises,
        });
      });

      expect(useActiveWorkoutStore.getState().plannedSetValues).toEqual({
        '101': {
          weight: 110,
          reps: 5,
          duration: null,
          distance: null,
          preferOverHistory: true,
        },
      });
    } finally {
      __resetAppPreferencesStoreForTests();
    }
  });

  it('forwards the source preset link with the active server config id into the store', async () => {
    const { result } = setup();
    mockGetActiveServerConfig.mockResolvedValue({
      id: 'config-1',
      url: 'https://example.com',
      apiKey: 'key',
    });

    await act(async () => {
      await result.current.startLiveWorkout({
        name: 'Push Day',
        exercises: EXERCISES,
        sourcePresetId: 42,
      });
    });

    const store = useActiveWorkoutStore.getState();
    expect(store.sourcePresetId).toBe(42);
    expect(store.sourceServerConfigId).toBe('config-1');
    // Also tags the created session server-side (recentSessions stats
    // scoping), independent of the client-supplied exercises.
    expect(mockCreateWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ workout_preset_id: 42 })
    );
  });

  it('leaves the source preset link null for starts without a preset', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(mockGetActiveServerConfig).not.toHaveBeenCalled();
    expect(useActiveWorkoutStore.getState().sourcePresetId).toBeNull();
    expect(useActiveWorkoutStore.getState().sourceServerConfigId).toBeNull();
    expect(mockCreateWorkout).toHaveBeenCalledWith(
      expect.not.objectContaining({ workout_preset_id: expect.anything() })
    );
  });

  it('defaults the name to the dated workout name when omitted', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(mockCreateWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ name: defaultWorkoutName(getTodayDate()) })
    );
  });

  it('seeds the store before dispatching the replace', async () => {
    const { result, navigation } = setup();
    let sessionIdAtReplace: string | null = null;
    navigation.replace.mockImplementation(() => {
      sessionIdAtReplace = useActiveWorkoutStore.getState().sessionId;
    });

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(sessionIdAtReplace).toBe('session-1');
  });

  it('alerts and does not create when no server is connected', async () => {
    const { result, navigation } = setup({ connected: false });

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'No Server Connected',
      expect.any(String)
    );
    expect(mockCreateWorkout).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('alerts and does not create when another workout is in progress', async () => {
    const { result } = setup();
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Workout in progress',
      expect.stringContaining('workout in progress'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Go to Workout' }),
        expect.objectContaining({ text: 'Clear & Start' }),
      ])
    );
    // Without confirming the prompt, nothing is created.
    expect(mockCreateWorkout).not.toHaveBeenCalled();
  });

  it('navigates to the active workout without creating or clearing when "Go to Workout" is chosen', async () => {
    const { result, navigation } = setup();
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    alertSpy.mockImplementation((_title, _message, buttons) => {
      const goTo = (
        buttons as { text: string; onPress?: () => void }[] | undefined
      )?.find((b) => b.text === 'Go to Workout');
      goTo?.onPress?.();
      return undefined as never;
    });

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(navigation.navigate).toHaveBeenCalledWith('ActiveWorkout');
    expect(mockCreateWorkout).not.toHaveBeenCalled();
    expect(mockFlushBeforeClear).not.toHaveBeenCalled();
    // The in-progress session survives untouched.
    expect(useActiveWorkoutStore.getState().sessionId).toBe('session-1');
  });

  it('clears the in-progress workout and starts the new one when replace is confirmed', async () => {
    const { result, navigation } = setup();
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    // Simulate tapping the destructive "Clear & Start" button.
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const confirm = (
        buttons as { text: string; onPress?: () => void }[] | undefined
      )?.find((b) => b.text === 'Clear & Start');
      confirm?.onPress?.();
      return undefined as never;
    });

    await act(async () => {
      await result.current.startLiveWorkout({
        name: 'Push Day',
        exercises: EXERCISES,
      });
    });

    await waitFor(() => expect(mockCreateWorkout).toHaveBeenCalled());
    expect(mockFlushBeforeClear).toHaveBeenCalled();
    expect(navigation.replace).toHaveBeenCalledWith('ActiveWorkout');
  });

  it('toasts and does not create for an empty exercises payload', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: [] });
    });

    expect(mockToastShow).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text1: 'Nothing to start' })
    );
    expect(mockCreateWorkout).not.toHaveBeenCalled();
  });

  it('leaves the store untouched and re-enables on create failure', async () => {
    const { result, navigation } = setup();
    mockCreateWorkout.mockRejectedValue(new Error('500'));

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(navigation.replace).not.toHaveBeenCalled();
    expect(useActiveWorkoutStore.getState().sessionId).toBeNull();
    expect(useActiveWorkoutStore.getState().createdByLiveStart).toBe(false);
    expect(result.current.isStarting).toBe(false);
  });

  it('ignores a re-entrant call while a create is in flight', async () => {
    const { result } = setup();
    let resolveCreate!: (session: PresetSessionResponse) => void;
    const pendingCreate = new Promise<PresetSessionResponse>((resolve) => {
      resolveCreate = resolve;
    });
    mockCreateWorkout.mockReturnValue(pendingCreate);

    await act(async () => {
      // The in-flight lock engages synchronously before the create await, so
      // the second call must be ignored even though the first hasn't resolved.
      const first = result.current.startLiveWorkout({ exercises: EXERCISES });
      const second = result.current.startLiveWorkout({ exercises: EXERCISES });
      resolveCreate(makeSession());
      await Promise.all([first, second]);
    });

    expect(mockCreateWorkout).toHaveBeenCalledTimes(1);
  });

  it('skips the replace when the calling screen lost focus, but still seeds the store', async () => {
    const { result, navigation } = setup({ focused: false });

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(useActiveWorkoutStore.getState().sessionId).toBe('session-1');
    expect(useActiveWorkoutStore.getState().createdByLiveStart).toBe(true);
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('tells the watch which exercises are a superset, and ignores a group of one', () => {
    const base = makeSession().exercises[0];
    const exercise = (
      id: string,
      name: string,
      supersetGroup: number | null,
      setIds: number[]
    ) =>
      ({
        ...base,
        id,
        superset_group: supersetGroup,
        exercise_snapshot: { ...base.exercise_snapshot, name },
        sets: setIds.map((setId, index) => ({
          ...base.sets[0],
          id: setId,
          set_number: index + 1,
        })),
      }) as typeof base;

    act(() => {
      useActiveWorkoutStore.getState().startWorkout({
        ...makeSession(),
        exercises: [
          exercise('bench', 'Bench Press', 1, [1, 2]),
          exercise('row', 'Barbell Row', 1, [3, 4]),
          exercise('curl', 'Curl', 9, [5]),
          exercise('squat', 'Squat', 2, [6]),
          exercise('lunge', 'Lunge', 2, [7]),
        ],
      });
    });

    armWatchForActiveSession(
      ((key: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? key) as never
    );

    expect(mockStartWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        exercises: [
          expect.objectContaining({ name: 'Bench Press', supersetRun: 0 }),
          expect.objectContaining({ name: 'Barbell Row', supersetRun: 0 }),
          expect.objectContaining({ name: 'Curl', supersetRun: null }),
          expect.objectContaining({ name: 'Squat', supersetRun: 1 }),
          expect.objectContaining({ name: 'Lunge', supersetRun: 1 }),
        ],
        setOrder: ['1', '3', '2', '4', '5', '6', '7'],
      })
    );
  });
});
