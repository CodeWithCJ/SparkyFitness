import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { useActiveWorkoutFinish } from '../../src/hooks/useActiveWorkoutFinish';
import { queueActiveWorkoutForUpload } from '../../src/offline/workoutHandOver';
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
  return { alert, flush, result, safeGoBack };
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
