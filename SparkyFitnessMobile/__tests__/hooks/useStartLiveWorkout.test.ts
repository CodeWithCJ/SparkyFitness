import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import Toast from 'react-native-toast-message';
import type { PresetSessionResponse } from '@workspace/shared';
import { useStartLiveWorkout } from '../../src/hooks/useStartLiveWorkout';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { createWorkout } from '../../src/services/api/exerciseApi';
import { invalidateExerciseCache } from '../../src/hooks/invalidateExerciseCache';
import { ensureNotificationPermission } from '../../src/services/notifications';
import { flushActiveWorkoutBeforeClear } from '../../src/hooks/useActiveWorkoutAutosave';
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
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteHaptic: jest.fn(),
}));

jest.mock('../../src/hooks/useActiveWorkoutAutosave', () => ({
  flushActiveWorkoutBeforeClear: jest.fn(async () => true),
}));

const mockCreateWorkout = createWorkout as jest.MockedFunction<typeof createWorkout>;
const mockInvalidate = invalidateExerciseCache as jest.MockedFunction<
  typeof invalidateExerciseCache
>;
const mockEnsurePermission = ensureNotificationPermission as jest.MockedFunction<
  typeof ensureNotificationPermission
>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;
const mockFlushBeforeClear = flushActiveWorkoutBeforeClear as jest.MockedFunction<
  typeof flushActiveWorkoutBeforeClear
>;

const EXERCISES = buildSingleExerciseStartPayload({ id: 'ex-1' });

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
  const navigation = { replace: jest.fn(), isFocused: jest.fn(() => focused) };
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
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockCreateWorkout.mockResolvedValue(makeSession());
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('creates a session for today, seeds the store, and replaces to ActiveWorkout', async () => {
    const { result, navigation, queryClient } = setup();

    await act(async () => {
      await result.current.startLiveWorkout({ name: 'Push Day', exercises: EXERCISES });
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

  it('defaults the name to the dated workout name when omitted', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.startLiveWorkout({ exercises: EXERCISES });
    });

    expect(mockCreateWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ name: defaultWorkoutName(getTodayDate()) }),
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

    expect(alertSpy).toHaveBeenCalledWith('No Server Connected', expect.any(String));
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
      'Replace current workout?',
      expect.stringContaining('workout in progress'),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Clear & Start' }),
      ]),
    );
    // Without confirming the prompt, nothing is created.
    expect(mockCreateWorkout).not.toHaveBeenCalled();
  });

  it('clears the in-progress workout and starts the new one when replace is confirmed', async () => {
    const { result, navigation } = setup();
    act(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    // Simulate tapping the destructive "Clear & Start" button.
    alertSpy.mockImplementation((_title, _message, buttons) => {
      const confirm = (buttons as { text: string; onPress?: () => void }[] | undefined)?.find(
        (b) => b.text === 'Clear & Start',
      );
      confirm?.onPress?.();
      return undefined as never;
    });

    await act(async () => {
      await result.current.startLiveWorkout({ name: 'Push Day', exercises: EXERCISES });
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
      expect.objectContaining({ type: 'error', text1: 'Nothing to start' }),
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
});
