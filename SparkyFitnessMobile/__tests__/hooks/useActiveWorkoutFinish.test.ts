import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { flushActiveWorkoutBeforeClear } from '../../src/hooks/useActiveWorkoutAutosave';
import { useActiveWorkoutFinish } from '../../src/hooks/useActiveWorkoutFinish';
import { queueActiveWorkoutForUpload } from '../../src/offline/workoutHandOver';
import { ApiError } from '../../src/services/api/errors';
import { updateWorkout } from '../../src/services/api/exerciseApi';
import { checkServerConnection } from '../../src/services/api/healthDataApi';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  getWorkout: jest.fn(),
  updateWorkout: jest.fn(),
}));

jest.mock('../../src/services/api/healthDataApi', () => ({
  checkServerConnection: jest.fn(),
}));

jest.mock('../../src/offline/workoutHandOver', () => ({
  queueActiveWorkoutForUpload: jest.fn(),
}));

const session: PresetSessionResponse = {
  id: 'session-1',
  type: 'preset',
  entry_date: '2026-11-25',
  workout_preset_id: null,
  name: 'Workout',
  description: null,
  notes: null,
  source: 'sparky',
  status: 'in_progress',
  revision: 1,
  total_duration_minutes: 0,
  exercises: [],
  activity_details: [],
};

const nextSession = { ...session, id: 'session-2' };
let queryClient: QueryClient;

function switchWorkouts() {
  useActiveWorkoutStore.setState({
    sessionId: nextSession.id,
    session: nextSession,
  });
}

function setup() {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const flush = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
  const safeGoBack = jest.fn();
  const navigation = { replace: jest.fn() };
  const { result } = renderHook(
    () =>
      useActiveWorkoutFinish({
        navigation,
        session,
        completedSetIds: {},
        flush,
        durationSheetRef: { current: null },
        safeGoBack,
      }),
    { wrapper: createQueryWrapper(queryClient) }
  );
  return { alert, flush, navigation, result, safeGoBack };
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = createTestQueryClient();
  __resetActiveWorkoutStoreForTests();
  useActiveWorkoutStore.setState({ sessionId: session.id, session });
  jest.mocked(updateWorkout).mockResolvedValue(session);
  jest.mocked(checkServerConnection).mockResolvedValue(true);
});

afterEach(() => {
  queryClient.clear();
  jest.restoreAllMocks();
});

it('finishes once when manual confirmation and automatic completion overlap', async () => {
  const { alert, flush, result, safeGoBack } = setup();
  act(() => result.current.handleConfirmEnd());
  const confirm = alert.mock.lastCall?.[2]?.find(
    (button) => button.style === 'default'
  )?.onPress;
  expect(confirm).toBeDefined();

  await act(async () => {
    confirm?.();
    await result.current.handleFinish();
  });
  await act(async () => {
    await result.current.handleFinish();
  });

  expect(flush).toHaveBeenCalledTimes(1);
  expect(updateWorkout).toHaveBeenCalledTimes(1);
  expect(useActiveWorkoutStore.getState().sessionId).toBeNull();
  expect(safeGoBack).toHaveBeenCalledTimes(1);
});

it.each(['flush', 'finish stamp'])(
  'lets Retry finish once after a failed %s',
  async (failure) => {
    const { alert, flush, result, safeGoBack } = setup();
    if (failure === 'flush') {
      flush.mockResolvedValueOnce(false);
    } else {
      jest
        .mocked(updateWorkout)
        .mockRejectedValueOnce(new Error('Save failed'));
    }

    await act(async () => {
      await result.current.handleFinish();
    });
    const retry = alert.mock.lastCall?.[2]?.[0]?.onPress;
    expect(retry).toBeDefined();
    expect(useActiveWorkoutStore.getState().sessionId).toBe(session.id);
    expect(safeGoBack).not.toHaveBeenCalled();

    await act(async () => {
      retry?.();
      await result.current.handleFinish();
    });

    expect(flush).toHaveBeenCalledTimes(2);
    expect(updateWorkout).toHaveBeenCalledTimes(failure === 'flush' ? 1 : 2);
    expect(useActiveWorkoutStore.getState().sessionId).toBeNull();
    expect(safeGoBack).toHaveBeenCalledTimes(1);
  }
);

it.each(['flushing sets', 'stamping the finish'])(
  'leaves the next workout active when the session changes while %s',
  async (phase) => {
    const { flush, result, safeGoBack } = setup();
    const changesDuringFlush = phase === 'flushing sets';
    if (changesDuringFlush) {
      flush.mockImplementationOnce(async () => {
        switchWorkouts();
        return true;
      });
    } else {
      jest.mocked(updateWorkout).mockImplementationOnce(async () => {
        switchWorkouts();
        return session;
      });
    }

    await act(async () => {
      await result.current.handleFinish();
    });

    expect(updateWorkout).toHaveBeenCalledTimes(changesDuringFlush ? 0 : 1);
    if (!changesDuringFlush) {
      expect(updateWorkout).toHaveBeenCalledWith(session.id, expect.anything());
    }
    expect(useActiveWorkoutStore.getState().sessionId).toBe(nextSession.id);
    expect(safeGoBack).not.toHaveBeenCalled();
  }
);

it.each(['checking the connection', 'queuing the workout'])(
  'leaves the next workout active when the session changes while %s',
  async (phase) => {
    const { alert, flush, result, safeGoBack } = setup();
    flush.mockResolvedValueOnce(false);
    const changesBeforeQueue = phase === 'checking the connection';
    jest.mocked(checkServerConnection).mockImplementationOnce(async () => {
      if (changesBeforeQueue) switchWorkouts();
      return false;
    });
    if (!changesBeforeQueue) {
      jest
        .mocked(queueActiveWorkoutForUpload)
        .mockImplementationOnce(async () => {
          switchWorkouts();
          return 'queued';
        });
    }

    await act(async () => {
      await result.current.handleFinish();
    });

    expect(queueActiveWorkoutForUpload).toHaveBeenCalledTimes(
      changesBeforeQueue ? 0 : 1
    );
    expect(useActiveWorkoutStore.getState().sessionId).toBe(nextSession.id);
    expect(alert).not.toHaveBeenCalled();
    expect(safeGoBack).not.toHaveBeenCalled();
  }
);

describe('a video set logged while the finish stamp is in flight', () => {
  const videoExerciseId = 'video-entry';
  const videoSession: PresetSessionResponse = {
    ...session,
    exercises: [
      {
        id: videoExerciseId,
        exercise_id: 'video-exercise',
        duration_minutes: 0,
        calories_burned: 0,
        entry_date: session.entry_date,
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        exercise_snapshot: null,
        activity_details: [],
        superset_group: null,
        sets: [
          {
            id: 101,
            set_number: 1,
            set_type: 'normal',
            reps: 10,
            weight: null,
            duration: null,
            rest_time: 0,
            notes: null,
            rpe: null,
            completed_at: null,
            is_pr: false,
          },
        ],
      },
    ],
  };

  const videoSetSave = {
    exercises: [
      expect.objectContaining({
        sets: [expect.objectContaining({ completed_at: expect.any(String) })],
      }),
    ],
  };

  beforeEach(() => {
    useActiveWorkoutStore.getState().startWorkout(videoSession, {
      videoUrl: 'https://example.test/workout.mp4',
      exerciseConfigs: [{ video_start_seconds: 0, video_end_seconds: 30 }],
    });
    jest.mocked(updateWorkout).mockImplementationOnce(async (_id, payload) => {
      useActiveWorkoutStore
        .getState()
        .completeVideoExercises([videoExerciseId]);
      return { ...videoSession, finished_at: payload.finished_at, revision: 2 };
    });
    jest
      .mocked(updateWorkout)
      .mockResolvedValue({ ...videoSession, revision: 3 });
  });

  it('saves the completion before clearing the workout', async () => {
    const { alert, flush, navigation, result } = setup();
    flush.mockImplementation(() => flushActiveWorkoutBeforeClear(queryClient));

    await act(async () => {
      await result.current.handleFinish();
    });

    expect(updateWorkout).toHaveBeenNthCalledWith(
      2,
      session.id,
      expect.objectContaining(videoSetSave)
    );
    expect(useActiveWorkoutStore.getState().sessionId).toBeNull();
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it('preserves the completion after a failed save and retries with the stamped revision', async () => {
    const { alert, flush, navigation, result } = setup();
    flush.mockImplementation(() => flushActiveWorkoutBeforeClear(queryClient));
    jest
      .mocked(updateWorkout)
      .mockRejectedValueOnce(new ApiError('Temporarily unavailable', 503));

    await act(async () => {
      await result.current.handleFinish();
    });

    expect(useActiveWorkoutStore.getState()).toMatchObject({
      sessionId: session.id,
      completedSetIds: { '101': expect.any(Number) },
      hasUnsavedChanges: true,
    });
    expect(navigation.replace).not.toHaveBeenCalled();
    const retry = alert.mock.lastCall?.[2]?.[0]?.onPress;
    expect(retry).toBeDefined();

    await act(async () => {
      retry?.();
    });

    expect(updateWorkout).toHaveBeenNthCalledWith(
      3,
      session.id,
      expect.objectContaining({ ...videoSetSave, revision: 2 })
    );
    expect(useActiveWorkoutStore.getState().sessionId).toBeNull();
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it('keeps an edit that arrives while the completed set is queued offline', async () => {
    const { alert, flush, navigation, result } = setup();
    flush.mockImplementation(() => flushActiveWorkoutBeforeClear(queryClient));
    jest
      .mocked(updateWorkout)
      .mockRejectedValueOnce(new ApiError('Temporarily unavailable', 503));
    jest.mocked(checkServerConnection).mockResolvedValue(false);
    jest
      .mocked(queueActiveWorkoutForUpload)
      .mockImplementationOnce(async () => {
        const state = useActiveWorkoutStore.getState();
        expect(state.offlineBaseRevision).toBe(2);
        expect(state.completedSetIds['101']).toEqual(expect.any(Number));
        state.updateSetField('101', { reps: 12 });
        return 'queued';
      });

    await act(async () => {
      await result.current.handleFinish();
    });

    const state = useActiveWorkoutStore.getState();
    expect(state.sessionId).toBe(session.id);
    expect(state.session?.exercises[0].sets[0].reps).toBe(12);
    expect(alert.mock.lastCall?.[2]?.[0]?.onPress).toBeDefined();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
