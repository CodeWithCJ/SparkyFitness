import { useLiveHeartRateStore } from '../../src/stores/liveHeartRateStore';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { PresetSessionResponse } from '@workspace/shared';
import { useWatchWorkoutBridge } from '../../src/hooks/useWatchWorkoutBridge';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  updateWorkout,
  deleteWorkout,
  attachExerciseEntryWatchTelemetry,
} from '../../src/services/api/exerciseApi';
import { addLog } from '../../src/services/LogService';
import {
  __resetWatchTelemetryKeyForTests,
  notifyWatchTelemetryAccountSwitch,
  readWatchTelemetry,
  serializeWatchTelemetry,
  settleWatchTelemetryWrites,
  writeWatchTelemetry,
  type WatchTelemetrySessionState,
} from '../../src/utils/watchTelemetryPersistence';
import { ApiError } from '../../src/services/api/errors';
import { clearServerConfigCache } from '../../src/services/storage';

jest.mock('../../src/services/api/exerciseApi', () => ({
  updateWorkout: jest.fn(),
  deleteWorkout: jest.fn(),
  attachExerciseEntryWatchTelemetry: jest.fn(),
}));

jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

jest.mock('../../src/hooks/syncExerciseSessionInCache', () => ({
  syncExerciseSessionInCache: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

/**
 * Captured mockListeners, keyed by event name, so tests can fire them directly.
 * Named with a `mock` prefix so `jest.mock`'s factory (hoisted above this
 * module's other top-level code) is allowed to close over it.
 */
type Listener = (payload: unknown) => void;
const mockListeners = new Map<string, Listener>();
// The native module queues a batch before it emits the event. Tests that
// fire during restore rely on that queue for the replay.
const queuedHeartRateBatches: {
  clientId?: string;
  queueId?: string;
}[] = [];

jest.mock('../../modules/watch-connectivity', () => {
  const mockModule = {
    isSupported: jest.fn(() => true),
    stopWorkout: jest.fn(),
    pendingHeartRateBatches: jest.fn(async () => [...queuedHeartRateBatches]),
    setTelemetryOwner: jest.fn(async () => undefined),
    takeDroppedHeartRateBatchCount: jest.fn(async () => 0),
    ackHeartRateBatches: jest.fn(async (ids: string[]) => {
      const drop = new Set(ids);
      for (let i = queuedHeartRateBatches.length - 1; i >= 0; i -= 1) {
        const batch = queuedHeartRateBatches[i];
        const id = batch.clientId || batch.queueId;
        if (id && drop.has(id)) queuedHeartRateBatches.splice(i, 1);
      }
    }),
    addListener: jest.fn((event: string, callback: Listener) => {
      mockListeners.set(event, callback);
      const remove = jest.fn(() => mockListeners.delete(event));
      return { remove };
    }),
  };
  return { __esModule: true, default: mockModule };
});

const mockUpdateWorkout = updateWorkout as jest.MockedFunction<
  typeof updateWorkout
>;
const mockAttachTelemetry =
  attachExerciseEntryWatchTelemetry as jest.MockedFunction<
    typeof attachExerciseEntryWatchTelemetry
  >;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockStopWorkout = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { stopWorkout: jest.Mock };
  }
).default.stopWorkout;
const mockPendingHeartRateBatches = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: {
      pendingHeartRateBatches: jest.Mock;
      ackHeartRateBatches: jest.Mock;
    };
  }
).default.pendingHeartRateBatches;
const mockNativeWatch = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: {
      setTelemetryOwner: jest.Mock;
      takeDroppedHeartRateBatchCount: jest.Mock;
    };
  }
).default;
const mockAckHeartRateBatches = (
  jest.requireMock('../../modules/watch-connectivity') as {
    default: { ackHeartRateBatches: jest.Mock };
  }
).default.ackHeartRateBatches;

// The active server config in these tests. The native module stamps every
// batch it receives with the config that was active then.
const OWNER = 'config-a';
const BUFFER_KEY = `sparky.watchTelemetryBuffer.${OWNER}`;

function stamp<T extends object>(batch: T): T & { ownerId: string } {
  return { ownerId: OWNER, ...batch };
}

async function useActiveConfig(ownerId: string | null): Promise<void> {
  clearServerConfigCache();
  if (ownerId) await AsyncStorage.setItem('activeServerConfigId', ownerId);
  else await AsyncStorage.removeItem('activeServerConfigId');
}

function fire(event: string, payload: unknown) {
  let delivered = payload;
  if (event === 'onHeartRateBatch') {
    delivered = stamp(payload as object);
    queuedHeartRateBatches.push(
      delivered as { clientId?: string; queueId?: string }
    );
  }
  mockListeners.get(event)?.(delivered);
}

/** Hold the telemetry read without also swallowing the account-id lookup. */
function deferTelemetryRead(gate: Promise<string | null>): void {
  const getItem = AsyncStorage.getItem as jest.Mock;
  const previous = getItem.getMockImplementation();
  getItem.mockImplementation(async (key: string) => {
    if (
      key === 'sparky.watchTelemetryBuffer' ||
      key.startsWith('sparky.watchTelemetryBuffer.')
    ) {
      getItem.mockImplementation(previous ?? (() => Promise.resolve(null)));
      return gate;
    }
    if (previous) return previous(key);
    return null;
  });
}

function makeSession(
  overrides: Partial<PresetSessionResponse> = {}
): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-09-17',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 60,
    activity_details: [],
    exercises: [
      {
        id: 'ex-uuid-1',
        exercise_id: 'ex-1',
        duration_minutes: 20,
        calories_burned: 150,
        entry_date: '2026-09-17',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          calories_per_hour: 400,
          images: ['bench.jpg'],
        } as any,
        activity_details: [],
        sets: [
          {
            id: 101,
            set_number: 1,
            set_type: 'normal',
            reps: 10,
            weight: 60,
            duration: null,
            rest_time: 60,
            notes: null,
            rpe: null,
          },
        ],
      } as any,
    ],
    ...overrides,
  };
}

function getStore() {
  return useActiveWorkoutStore.getState();
}

describe('useWatchWorkoutBridge', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockListeners.clear();
    queuedHeartRateBatches.length = 0;
    await settleWatchTelemetryWrites();
    await AsyncStorage.clear();
    await useActiveConfig(OWNER);
    mockPendingHeartRateBatches.mockImplementation(async () => [
      ...queuedHeartRateBatches,
    ]);
    __resetActiveWorkoutStoreForTests();
    useLiveHeartRateStore.setState({ reading: null });
    mockUpdateWorkout.mockImplementation(async () => getStore().session!);
    mockAttachTelemetry.mockResolvedValue(undefined);
  });

  it('subscribes to all three watch events when enabled', () => {
    renderHook(() => useWatchWorkoutBridge(true));
    expect(mockListeners.has('onSetCompleted')).toBe(true);
    expect(mockListeners.has('onRestChanged')).toBe(true);
    expect(mockListeners.has('onHeartRateBatch')).toBe(true);
    expect(mockListeners.has('onWorkoutStop')).toBe(true);
  });

  describe('set timer started on the watch', () => {
    const fire = (payload: Record<string, unknown>) =>
      act(() => {
        mockListeners.get('onSetTimerStarted')!(payload);
      });

    beforeEach(() => {
      useActiveWorkoutStore.setState({
        sessionId: 'session-1',
        setTimerStartedAt: {},
        completedSetIds: {},
      });
    });

    it('starts the phone stopwatch from the watch start time', () => {
      renderHook(() => useWatchWorkoutBridge(true));
      const startedAt = Date.now() - 12_000;
      fire({ sessionId: 'session-1', setId: '101', startedAt });
      expect(getStore().setTimerStartedAt['101']).toBe(startedAt);
    });

    it('keeps a stopwatch that is already running', () => {
      const earlier = Date.now() - 30_000;
      useActiveWorkoutStore.setState({ setTimerStartedAt: { '101': earlier } });
      renderHook(() => useWatchWorkoutBridge(true));
      fire({ sessionId: 'session-1', setId: '101', startedAt: Date.now() });
      expect(getStore().setTimerStartedAt['101']).toBe(earlier);
    });

    it('ignores another session, a logged set, and a stale start', () => {
      useActiveWorkoutStore.setState({ completedSetIds: { '102': 1000 } });
      renderHook(() => useWatchWorkoutBridge(true));
      fire({ sessionId: 'other', setId: '101', startedAt: Date.now() });
      fire({ sessionId: 'session-1', setId: '102', startedAt: Date.now() });
      fire({
        sessionId: 'session-1',
        setId: '103',
        startedAt: Date.now() - 4 * 60 * 60 * 1000,
      });
      expect(getStore().setTimerStartedAt).toEqual({});
    });

    it('ignores a start from an earlier arm of the same session', () => {
      const armedAt = Date.now() - 60_000;
      useActiveWorkoutStore.setState({ watchArmedAt: armedAt });
      renderHook(() => useWatchWorkoutBridge(true));
      fire({
        sessionId: 'session-1',
        setId: '101',
        startedAt: Date.now(),
        armedAt: armedAt - 3_600_000,
      });
      expect(getStore().setTimerStartedAt).toEqual({});
      fire({
        sessionId: 'session-1',
        setId: '101',
        startedAt: Date.now(),
        armedAt,
      });
      expect(Object.keys(getStore().setTimerStartedAt)).toEqual(['101']);
    });
  });

  describe('set timer stopped on the watch', () => {
    const fire = (payload: Record<string, unknown>) =>
      act(() => {
        mockListeners.get('onSetTimerStopped')!(payload);
      });
    let startedAt = 0;

    beforeEach(() => {
      startedAt = Date.now() - 20_000;
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      useActiveWorkoutStore.setState({
        sessionId: 'session-1',
        setTimerStartedAt: { '101': startedAt },
        completedSetIds: {},
      });
    });

    it('stops the phone stopwatch and keeps the wrist time as the duration', () => {
      renderHook(() => useWatchWorkoutBridge(true));
      fire({ sessionId: 'session-1', setId: '101', seconds: 19, startedAt });
      expect(getStore().setTimerStartedAt['101']).toBeUndefined();
      expect(getStore().session!.exercises[0].sets[0].duration).toBe(19);
    });

    it('ignores a stop from an earlier run of the same set', () => {
      renderHook(() => useWatchWorkoutBridge(true));
      fire({
        sessionId: 'session-1',
        setId: '101',
        seconds: 19,
        startedAt: startedAt - 30_000,
      });
      expect(getStore().setTimerStartedAt['101']).toBe(startedAt);
      expect(getStore().session!.exercises[0].sets[0].duration).not.toBe(19);
    });

    it('accepts a stop whose start the phone clock clamped forward', () => {
      useActiveWorkoutStore.setState({ setTimerStartedAt: {} });
      renderHook(() => useWatchWorkoutBridge(true));
      const watchStart = Date.now() + 5_000;
      act(() => {
        mockListeners.get('onSetTimerStarted')!({
          sessionId: 'session-1',
          setId: '101',
          startedAt: watchStart,
        });
      });
      expect(getStore().setTimerStartedAt['101']).toBeLessThan(watchStart);
      fire({
        sessionId: 'session-1',
        setId: '101',
        seconds: 19,
        startedAt: watchStart,
      });
      expect(getStore().setTimerStartedAt['101']).toBeUndefined();
      expect(getStore().session!.exercises[0].sets[0].duration).toBe(19);
    });

    it('ignores another session, a logged set and a zero time', () => {
      useActiveWorkoutStore.setState({ completedSetIds: { '102': 1000 } });
      renderHook(() => useWatchWorkoutBridge(true));
      fire({ sessionId: 'other', setId: '101', seconds: 19, startedAt });
      fire({ sessionId: 'session-1', setId: '102', seconds: 19, startedAt });
      fire({ sessionId: 'session-1', setId: '101', seconds: 0, startedAt });
      expect(getStore().setTimerStartedAt['101']).toBeDefined();
    });
  });

  describe('rest changed on the watch', () => {
    const resting = (endsAt: number) => ({
      state: 'resting' as const,
      durationSec: 90,
      endsAt,
      pausedRemainingMs: null,
      scheduledNotificationId: null,
      instanceToken: 1,
    });
    const fire = (payload: Record<string, unknown>) =>
      act(() => {
        mockListeners.get('onRestChanged')!(payload);
      });

    beforeEach(() => {
      useActiveWorkoutStore.setState({ sessionId: 'session-1' });
    });

    it('skips the phone rest when the watch skips the same rest', () => {
      const endsAt = Date.now() + 60_000;
      useActiveWorkoutStore.setState({ rest: resting(endsAt) });
      renderHook(() => useWatchWorkoutBridge(true));
      fire({ sessionId: 'session-1', previousEndsAt: endsAt + 800 });
      expect(getStore().rest.state).toBe('ready');
    });

    it('moves the phone rest by the watch change, once', () => {
      const endsAt = Date.now() + 60_000;
      useActiveWorkoutStore.setState({ rest: resting(endsAt) });
      renderHook(() => useWatchWorkoutBridge(true));
      const payload = {
        sessionId: 'session-1',
        previousEndsAt: endsAt,
        endsAt: endsAt + 15_000,
      };
      fire(payload);
      expect(getStore().rest.endsAt).toBe(endsAt + 15_000);
      // The same message delivered again finds the rest already moved.
      fire(payload);
      expect(getStore().rest.endsAt).toBe(endsAt + 15_000);
    });

    it('ignores a change meant for a different rest or session', () => {
      const endsAt = Date.now() + 60_000;
      useActiveWorkoutStore.setState({ rest: resting(endsAt) });
      renderHook(() => useWatchWorkoutBridge(true));
      fire({ sessionId: 'session-1', previousEndsAt: endsAt - 90_000 });
      fire({ sessionId: 'other', previousEndsAt: endsAt });
      expect(getStore().rest).toMatchObject({ state: 'resting', endsAt });
    });
  });

  it('does not subscribe when disabled', () => {
    renderHook(() => useWatchWorkoutBridge(false));
    expect(mockListeners.size).toBe(0);
  });

  it('completes the matching set and flushes the session on onSetCompleted', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
      });
      // Let the async handler's completeSet + saveActiveWorkoutSession settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getStore().completedSetIds['101']).toBeDefined();
    expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['inside the workout', 0, true],
    ['an hour before the workout began', -60 * 60_000, false],
  ])(
    'uses the watch tap time only when it is %s',
    async (_label, offsetMs, used) => {
      renderHook(() => useWatchWorkoutBridge(true));
      act(() => {
        getStore().startWorkout(makeSession());
      });
      const startedAt = getStore().startedAt!;
      const tapped = startedAt + offsetMs;
      const phoneNow = startedAt + 1_000;
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(phoneNow);

      try {
        await act(async () => {
          fire('onSetCompleted', {
            clientId: 'client-1',
            sessionId: 'session-1',
            setId: '101',
            completedAt: new Date(tapped).toISOString(),
          });
          await Promise.resolve();
          await Promise.resolve();
        });
      } finally {
        nowSpy.mockRestore();
      }

      const stamped = getStore().completedSetIds['101'];
      if (used) {
        expect(stamped).toBe(tapped);
      } else {
        // Ignored: the phone stamps its own clock instead.
        expect(stamped).toBe(phoneNow);
      }
    }
  );

  it('applies weight and reps typed on the watch before completing the set', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        weightKg: 82.5,
        reps: 6,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const set = getStore().session!.exercises[0].sets[0];
    expect(set.weight).toBe(82.5);
    expect(set.reps).toBe(6);
    expect(getStore().completedSetIds['101']).toBeDefined();
  });

  it('writes the carry distance the watch entered as km', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        weightKg: 40,
        distanceKm: 0.03,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const set = getStore().session!.exercises[0].sets[0];
    expect(set.weight).toBe(40);
    expect(set.distance).toBe(0.03);
    expect(getStore().completedSetIds['101']).toBeDefined();
  });

  it('writes the effort the watch picked', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        reps: 8,
        rpe: 9.5,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getStore().session!.exercises[0].sets[0].rpe).toBe(9.5);
  });

  it('ignores an effort outside 1 to 10', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        reps: 8,
        rpe: 14,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getStore().session!.exercises[0].sets[0].rpe).toBeNull();
    expect(getStore().completedSetIds['101']).toBeDefined();
  });

  it('writes the hold the watch counted down, and leaves reps alone', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        duration: 32,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const set = getStore().session!.exercises[0].sets[0];
    expect(set.duration).toBe(32);
    expect(set.reps).toBe(10);
    expect(getStore().completedSetIds['101']).toBeDefined();
  });

  it('leaves planned values alone when the watch sends none', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'session-1',
        setId: '101',
        weightKg: null,
        reps: null,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // The fixture's planned 60kg x 10 survives rather than being nulled out.
    const set = getStore().session!.exercises[0].sets[0];
    expect(set.weight).toBe(60);
    expect(set.reps).toBe(10);
  });

  it('ignores a setCompleted for a session that is no longer active', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'client-1',
        sessionId: 'stale-session',
        setId: '101',
      });
      await Promise.resolve();
    });

    expect(getStore().completedSetIds['101']).toBeUndefined();
    expect(mockUpdateWorkout).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('no matching active session'),
      'WARNING'
    );
  });

  it('dedupes a re-delivered setCompleted by clientId', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    const payload = {
      clientId: 'client-1',
      sessionId: 'session-1',
      setId: '101',
    };
    await act(async () => {
      fire('onSetCompleted', payload);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      fire('onSetCompleted', payload);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
  });

  it('clears a live-start session and deletes it from the diary on workoutDiscard, without attaching heart rate', async () => {
    const mockDelete = deleteWorkout as jest.MockedFunction<
      typeof deleteWorkout
    >;
    mockDelete.mockResolvedValue(undefined);
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession(), { createdByLiveStart: true });
    });
    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
    });

    await act(async () => {
      fire('onWorkoutDiscard', { sessionId: 'session-1' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getStore().sessionId).toBeNull();
    expect(mockDelete).toHaveBeenCalledWith('session-1');
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
    expect(mockUpdateWorkout).not.toHaveBeenCalled();
  });

  it('only clears, without deleting, a discarded session that was not created by the live start', async () => {
    const mockDelete = deleteWorkout as jest.MockedFunction<
      typeof deleteWorkout
    >;
    mockDelete.mockClear();
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onWorkoutDiscard', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(getStore().sessionId).toBeNull();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('attaches telemetry for a session that is opened again after a watch discard', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    await act(async () => {
      fire('onWorkoutDiscard', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(getStore().sessionId).toBeNull();

    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
    });
    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith(
      'ex-uuid-1',
      expect.objectContaining({ hrSamples: expect.any(Array) })
    );
  });

  it('ignores a workoutDiscard for a session that is not live', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onWorkoutDiscard', { sessionId: 'other-session' });
      await Promise.resolve();
    });

    expect(getStore().sessionId).toBe('session-1');
  });

  it('ignores a workoutDiscard from an earlier arm of the same session', async () => {
    const mockDelete = deleteWorkout as jest.MockedFunction<
      typeof deleteWorkout
    >;
    mockDelete.mockClear();
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession(), { createdByLiveStart: true });
      useActiveWorkoutStore.setState({ watchArmedAt: 2_000_000 });
    });

    await act(async () => {
      fire('onWorkoutDiscard', { sessionId: 'session-1', armedAt: 1_000_000 });
      await Promise.resolve();
    });

    expect(getStore().sessionId).toBe('session-1');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('buffers heart-rate batches for the matching session and attaches them on workoutStop', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
      // A batch for a session that no longer matches is dropped, not merged in.
      fire('onHeartRateBatch', {
        sessionId: 'other-session',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:20.000Z', bpm: 200 }],
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
    });
    expect(getStore().sessionId).toBeNull();
  });

  it("puts the newest sample of a live batch on screen, not an ended workout's", async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        ],
      });
      fire('onHeartRateBatch', {
        sessionId: 'other-session',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:20.000Z', bpm: 200 }],
      });
    });

    // Batches apply once the saved telemetry buffer has been restored.
    await waitFor(() =>
      expect(useLiveHeartRateStore.getState().reading).toEqual({
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        bpm: 128,
        at: Date.parse('2026-09-17T10:00:10.000Z'),
      })
    );
  });

  it('shows a live reading as soon as the watch sends it, for the live session only', () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    const at = Date.now();

    act(() => {
      fire('onLiveHeartRate', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        bpm: 131.4,
        at,
      });
    });
    expect(useLiveHeartRateStore.getState().reading).toEqual({
      sessionId: 'session-1',
      exerciseEntryId: 'ex-uuid-1',
      bpm: 131,
      at,
    });

    act(() => {
      fire('onLiveHeartRate', {
        sessionId: 'other-session',
        exerciseEntryId: 'ex-uuid-1',
        bpm: 190,
        at: at + 1000,
      });
      fire('onLiveHeartRate', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        bpm: 0,
        at: at + 2000,
      });
    });
    expect(useLiveHeartRateStore.getState().reading?.bpm).toBe(131);
  });

  it('skips attaching heart rate for an exercise with fewer than two samples', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:00.000Z', bpm: 120 }],
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('does not re-attach an unchanged buffer on a second workoutStop', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
    });
    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    mockAttachTelemetry.mockClear();

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('attaches heart rate and stops the watch when the phone ends the workout', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
    });

    // The watch never sends workoutStop here — the wearer finished on the
    // phone, which is the common case and the one that used to strand the
    // buffered samples entirely.
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });

    expect(mockStopWorkout).toHaveBeenCalledWith(
      'session-1',
      expect.any(String),
      false
    );
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
    });
  });

  it('tells the watch to drop the workout when the phone discards it', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:00.000Z', bpm: 120 }],
      });
    });
    mockAttachTelemetry.mockClear();

    await act(async () => {
      getStore().clearWorkout({ discarded: true });
      await Promise.resolve();
    });

    expect(mockStopWorkout).toHaveBeenCalledWith(
      'session-1',
      expect.any(String),
      true
    );
    // A discarded workout's heart rate is never attached.
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('attributes the watch drain that arrives after the phone ends the workout', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(
        makeSession({
          exercises: [
            {
              id: 'ex-uuid-1',
              exercise_id: 'ex-1',
              sets: [
                {
                  id: 101,
                  set_number: 1,
                  set_type: 'normal',
                  reps: 10,
                  weight: 60,
                },
              ],
            } as any,
            {
              id: 'ex-uuid-2',
              exercise_id: 'ex-2',
              sets: [
                {
                  id: 201,
                  set_number: 1,
                  set_type: 'normal',
                  reps: 8,
                  weight: 40,
                },
              ],
            } as any,
          ],
        })
      );
      useActiveWorkoutStore.setState({
        startedAt: Date.parse('2026-09-17T10:00:00.000Z'),
      });
      getStore().completeSet('101', Date.parse('2026-09-17T10:03:00.000Z'));
    });

    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    mockAttachTelemetry.mockClear();

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'late-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:04:00.000Z', bpm: 140 },
          { t: '2026-09-17T10:05:00.000Z', bpm: 144 },
        ],
        durationMinutes: 20,
      });
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith(
      'ex-uuid-2',
      expect.objectContaining({
        hrSamples: [
          { t: '2026-09-17T10:04:00.000Z', bpm: 140 },
          { t: '2026-09-17T10:05:00.000Z', bpm: 144 },
        ],
      })
    );
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      durationMinutes: 3,
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalledWith(
      'ex-uuid-1',
      expect.objectContaining({ durationMinutes: 20 })
    );
  });

  it('does not let a later agreeing batch restore the watch duration', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(
        makeSession({
          exercises: [
            {
              id: 'ex-uuid-1',
              exercise_id: 'ex-1',
              sets: [
                {
                  id: 101,
                  set_number: 1,
                  set_type: 'normal',
                  reps: 10,
                  weight: 60,
                },
              ],
            } as any,
            {
              id: 'ex-uuid-2',
              exercise_id: 'ex-2',
              sets: [
                {
                  id: 201,
                  set_number: 1,
                  set_type: 'normal',
                  reps: 8,
                  weight: 40,
                },
              ],
            } as any,
          ],
        })
      );
      useActiveWorkoutStore.setState({
        startedAt: Date.parse('2026-09-17T10:00:00.000Z'),
      });
      getStore().completeSet('101', Date.parse('2026-09-17T10:03:00.000Z'));
    });

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:04:00.000Z', bpm: 140 },
          { t: '2026-09-17T10:04:10.000Z', bpm: 142 },
        ],
        durationMinutes: 999999,
      });
      fire('onHeartRateBatch', {
        clientId: 'hr-2',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-2',
        samples: [
          { t: '2026-09-17T10:05:00.000Z', bpm: 150 },
          { t: '2026-09-17T10:05:10.000Z', bpm: 151 },
        ],
        durationMinutes: 999999,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    const posted = mockAttachTelemetry.mock.calls.map(
      (call) => call[1].durationMinutes
    );
    expect(posted).not.toContain(999999);
    expect(mockAttachTelemetry).toHaveBeenCalledWith(
      'ex-uuid-1',
      expect.objectContaining({ durationMinutes: 3 })
    );
  });

  it('sums the per-batch energy deltas into one measured calorie figure', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 12.5,
      });
      fire('onHeartRateBatch', {
        clientId: 'hr-2',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:01:00.000Z', bpm: 131 }],
        activeEnergyKcal: 7.5,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        { t: '2026-09-17T10:01:00.000Z', bpm: 131 },
      ],
      activeEnergyKcal: 20,
    });
  });

  it('posts the longest duration the watch reported for the exercise', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [],
        durationMinutes: 4.5,
      });
      fire('onHeartRateBatch', {
        clientId: 'hr-2',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [],
        durationMinutes: 2,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      durationMinutes: 4.5,
    });
  });

  it('posts measured energy even when the series is too short to zone', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-energy-only',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [{ t: '2026-09-17T10:00:00.000Z', bpm: 120 }],
        activeEnergyKcal: 9,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    // hrSamples omitted — one reading spans no time, so there is nothing to
    // bucket into zones — but the calories the watch measured still land.
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      activeEnergyKcal: 9,
    });
  });

  it('does not double-attach when the watch reports a stop the phone already handled', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
    });

    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

    // The queued workoutStop lands afterwards. The buffer still holds the
    // samples — it is kept so a late batch can re-post the full series — but
    // nothing has arrived since the last attach, so there is nothing to send.
    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
  });

  it("re-posts the whole series when the watch's final batch lands after the phone finished", async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-late-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 40,
      });
    });

    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

    // The watch answers the phone's stop signal with whatever HealthKit was
    // still holding — always after the session has already ended here.
    await act(async () => {
      fire('onHeartRateBatch', {
        clientId: 'hr-late-2',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
          { t: '2026-09-17T10:00:30.000Z', bpm: 141 },
        ],
        activeEnergyKcal: 7,
      });
      await Promise.resolve();
    });

    // The second post carries the FULL series and the FULL energy, not the
    // tail: the server derives avg/max, calories and the zone rows from
    // whatever one post contains, so a tail-only correction would overwrite
    // the workout's figures with its last minute's.
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(2);
    expect(mockAttachTelemetry).toHaveBeenLastCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
        { t: '2026-09-17T10:00:30.000Z', bpm: 141 },
      ],
      activeEnergyKcal: 47,
    });
  });

  it('attaches a final batch for a workout too short to have sent one earlier', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    // Batches are a minute apart, so a workout ended before the first one
    // fires reaches here with the buffer never having seen this session.
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();

    await act(async () => {
      fire('onHeartRateBatch', {
        clientId: 'hr-short',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 118 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 124 },
        ],
        activeEnergyKcal: 9,
      });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 118 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 124 },
      ],
      activeEnergyKcal: 9,
    });
  });

  it('ignores a batch for a workout that was never this session', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    await act(async () => {
      fire('onHeartRateBatch', {
        sessionId: 'session-from-another-phone',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
      });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('dedupes a re-delivered heart-rate batch by clientId so calories do not double', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    const payload = {
      clientId: 'hr-redeliver',
      sessionId: 'session-1',
      exerciseEntryId: 'ex-uuid-1',
      samples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
      activeEnergyKcal: 12.5,
    };
    act(() => {
      fire('onHeartRateBatch', payload);
      fire('onHeartRateBatch', payload);
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
      activeEnergyKcal: 12.5,
    });
  });

  it('skips energy on a batch with no clientId so a redelivery cannot double calories', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });

    act(() => {
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 12.5,
      });
      fire('onHeartRateBatch', {
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
          { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
        ],
        activeEnergyKcal: 7.5,
      });
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });

    // Samples still merge (timestamp-deduped); energy is refused without a
    // clientId because transferUserInfo can redeliver the same delta.
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        { t: '2026-09-17T10:00:20.000Z', bpm: 134 },
      ],
    });
  });

  it('stays subscribed while the server is offline and flushes when it returns', async () => {
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useWatchWorkoutBridge(true, connected),
      { initialProps: { connected: false } }
    );
    expect(mockListeners.has('onSetCompleted')).toBe(true);
    expect(mockListeners.has('onRestChanged')).toBe(true);
    expect(mockListeners.has('onHeartRateBatch')).toBe(true);
    expect(mockListeners.has('onWorkoutStop')).toBe(true);
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });

    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-offline',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 12.5,
      });
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ connected: true });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: [
        { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
        { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
      ],
      activeEnergyKcal: 12.5,
    });
  });

  it('reports unposted telemetry so the phone only polls while a flush is outstanding', async () => {
    const onPending = jest.fn();
    const { rerender } = renderHook(
      ({ connected }: { connected: boolean }) =>
        useWatchWorkoutBridge(true, connected, onPending),
      { initialProps: { connected: false } }
    );
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });

    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-pending',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 4,
      });
    });
    expect(onPending).toHaveBeenCalledWith(true);
    expect(mockAttachTelemetry).not.toHaveBeenCalled();

    await act(async () => {
      rerender({ connected: true });
      await Promise.resolve();
    });
    expect(onPending).toHaveBeenLastCalledWith(false);
  });
});

describe('useWatchWorkoutBridge across sessions, failures and watch finishes', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockListeners.clear();
    queuedHeartRateBatches.length = 0;
    await settleWatchTelemetryWrites();
    await AsyncStorage.clear();
    await useActiveConfig(OWNER);
    mockPendingHeartRateBatches.mockImplementation(async () => [
      ...queuedHeartRateBatches,
    ]);
    __resetActiveWorkoutStoreForTests();
    mockUpdateWorkout.mockImplementation(async () => getStore().session!);
    mockAttachTelemetry.mockResolvedValue(undefined);
  });

  const twoSamples = [
    { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
    { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
  ];

  it("still attaches a workout's final batch after the next workout has already started", async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    // Finished on the phone with nothing from the watch yet…
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });
    // …and a new workout started before the watch's queued drain arrived.
    act(() => {
      getStore().startWorkout(
        makeSession({ id: 'session-2', entry_date: '2026-09-17' })
      );
    });
    expect(getStore().sessionId).toBe('session-2');

    await act(async () => {
      fire('onHeartRateBatch', {
        clientId: 'hr-drain-1',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
        activeEnergyKcal: 12,
      });
      await Promise.resolve();
    });

    expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
      hrSamples: twoSamples,
      activeEnergyKcal: 12,
    });
  });

  it('drops an entry the server permanently rejects instead of retrying it forever', async () => {
    const onPending = jest.fn();
    renderHook(() => useWatchWorkoutBridge(true, true, onPending));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-404',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
      });
    });
    mockAttachTelemetry.mockRejectedValueOnce(
      new ApiError('Server error: 404 - not found', 404)
    );

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
    expect(onPending).toHaveBeenLastCalledWith(false);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('server rejected it (404)'),
      'WARNING',
      expect.any(Array)
    );

    // Nothing left to post: another stop does not ask the server again.
    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);
  });

  it('keeps retrying after a server fault', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-500',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
      });
    });
    mockAttachTelemetry.mockRejectedValueOnce(
      new ApiError('Server error: 500 - boom', 500)
    );

    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).toHaveBeenCalledTimes(2);
  });

  it.each([401, 408, 429])(
    'keeps telemetry for a retryable %i instead of dropping it',
    async (status) => {
      renderHook(() => useWatchWorkoutBridge(true));
      act(() => {
        getStore().startWorkout(makeSession());
      });
      act(() => {
        fire('onHeartRateBatch', {
          clientId: `hr-${status}`,
          sessionId: 'session-1',
          exerciseEntryId: 'ex-uuid-1',
          samples: twoSamples,
        });
      });
      mockAttachTelemetry.mockRejectedValueOnce(
        new ApiError(`Server error: ${status}`, status)
      );

      await act(async () => {
        getStore().clearWorkout();
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockAttachTelemetry).toHaveBeenCalledTimes(1);

      await act(async () => {
        fire('onWorkoutStop', { sessionId: 'session-1' });
        await Promise.resolve();
      });
      expect(mockAttachTelemetry).toHaveBeenCalledTimes(2);
    }
  );

  it('keeps the phone workout open when a watch finish cannot save it', async () => {
    const onWatchFinished = jest.fn();
    renderHook(() =>
      useWatchWorkoutBridge(true, true, undefined, onWatchFinished)
    );
    act(() => {
      getStore().startWorkout(makeSession());
    });
    mockUpdateWorkout.mockRejectedValue(new Error('offline'));
    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'set-offline',
        sessionId: 'session-1',
        setId: '101',
      });
      await Promise.resolve();
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

    expect(getStore().sessionId).toBe('session-1');
    expect(getStore().completedSetIds).toHaveProperty('101');
    expect(onWatchFinished).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('kept the phone workout open'),
      'WARNING'
    );
  });

  it('leaves an unknown-session batch queued until restore has finished', async () => {
    let releaseRead: (value: string | null) => void = () => {};
    const gate = new Promise<string | null>((resolve) => {
      releaseRead = resolve;
    });
    deferTelemetryRead(gate);
    const batch = stamp({
      clientId: 'hr-early',
      sessionId: 'session-unknown',
      exerciseEntryId: 'ex-uuid-9',
      samples: twoSamples,
    });
    mockPendingHeartRateBatches.mockResolvedValue([batch]);
    act(() => {
      getStore().startWorkout(makeSession());
    });

    renderHook(() => useWatchWorkoutBridge(true, true));
    act(() => {
      fire('onHeartRateBatch', batch);
    });
    expect(mockAckHeartRateBatches).not.toHaveBeenCalled();

    await act(async () => {
      releaseRead(null);
    });
    await waitFor(() => {
      expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-early']);
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('unknown session'),
      'WARNING',
      expect.any(Array)
    );
  });

  it('logs a batch for a session it has no record of instead of dropping it silently', async () => {
    renderHook(() => useWatchWorkoutBridge(true));
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-stranger',
        sessionId: 'session-unknown',
        exerciseEntryId: 'ex-uuid-9',
        samples: twoSamples,
      });
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
    expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-stranger']);
    expect(mockAddLog).toHaveBeenCalledWith(
      expect.stringContaining('unknown session session-unknown'),
      'WARNING',
      expect.any(Array)
    );
  });

  it('keeps an unposted batch across a remount and posts it when the server is back', async () => {
    const first = renderHook(
      ({ connected }: { connected: boolean }) =>
        useWatchWorkoutBridge(true, connected),
      { initialProps: { connected: false } }
    );
    act(() => {
      getStore().startWorkout(makeSession());
    });
    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-kept',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 9,
      });
    });

    await waitFor(async () => {
      const saved = await readWatchTelemetry(
        () => ({
          samples: new Map(),
          energy: new Map(),
          durations: new Map(),
          durationFromTimeline: false,
          handledBatchClientIds: new Set(),
          entryDate: null,
          unposted: false,
          endedAt: null,
          attribution: null,
        }),
        OWNER
      );
      expect(saved.get('session-1')?.unposted).toBe(true);
    });
    first.unmount();

    renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockAttachTelemetry).toHaveBeenCalledWith('ex-uuid-1', {
        hrSamples: [
          { t: '2026-09-17T10:00:00.000Z', bpm: 120 },
          { t: '2026-09-17T10:00:10.000Z', bpm: 128 },
        ],
        activeEnergyKcal: 9,
      });
    });
  });

  it('leaves the native queue when restoring saved telemetry fails', async () => {
    const getItem = AsyncStorage.getItem as jest.Mock;
    const previous = getItem.getMockImplementation();
    getItem.mockImplementation(async (key: string) => {
      if (
        key === 'sparky.watchTelemetryBuffer' ||
        key.startsWith('sparky.watchTelemetryBuffer.')
      ) {
        throw new Error('disk');
      }
      if (previous) return previous(key);
      return null;
    });
    mockPendingHeartRateBatches.mockResolvedValue([
      stamp({
        clientId: 'hr-queued',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
      }),
    ]);

    const view = renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('restore failed'),
        'WARNING'
      );
    });
    expect(mockPendingHeartRateBatches).not.toHaveBeenCalled();
    expect(mockAckHeartRateBatches).not.toHaveBeenCalled();
    getItem.mockImplementation(previous ?? (() => Promise.resolve(null)));
    view.unmount();
  });

  it('does not wipe saved telemetry when the keychain read fails', async () => {
    await AsyncStorage.setItem(BUFFER_KEY, 'sealed-not-plaintext');
    __resetWatchTelemetryKeyForTests();
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(
      new Error('locked')
    );
    (AsyncStorage.removeItem as jest.Mock).mockClear();

    renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('restore failed'),
        'WARNING'
      );
    });
    expect(mockPendingHeartRateBatches).not.toHaveBeenCalled();
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(BUFFER_KEY);
    expect(await AsyncStorage.getItem(BUFFER_KEY)).toBe('sealed-not-plaintext');
  });

  it('does not let a live batch replace the saved buffer before restore finishes', async () => {
    const empty = (): WatchTelemetrySessionState => ({
      samples: new Map(),
      energy: new Map(),
      durations: new Map(),
      durationFromTimeline: false,
      handledBatchClientIds: new Set(),
      entryDate: '2026-09-17',
      unposted: true,
      endedAt: 1_000,
      attribution: null,
    });
    const older = empty();
    older.endedAt = Date.now();
    older.samples.set('ex-old', [
      { t: '2026-09-17T09:00:00.000Z', bpm: 100 },
      { t: '2026-09-17T09:00:10.000Z', bpm: 108 },
    ]);
    await writeWatchTelemetry(
      new Map<string, WatchTelemetrySessionState>([['session-old', older]]),
      OWNER
    );
    const stored = await AsyncStorage.getItem(BUFFER_KEY);
    let releaseRead: (value: string | null) => void = () => {};
    const gate = new Promise<string | null>((resolve) => {
      releaseRead = resolve;
    });
    deferTelemetryRead(gate);
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (AsyncStorage.removeItem as jest.Mock).mockClear();
    const batch = stamp({
      clientId: 'hr-live',
      sessionId: 'session-1',
      exerciseEntryId: 'ex-uuid-1',
      samples: twoSamples,
      activeEnergyKcal: 4,
    });
    mockPendingHeartRateBatches.mockResolvedValue([batch]);
    act(() => {
      getStore().startWorkout(makeSession());
    });

    renderHook(() => useWatchWorkoutBridge(true, true));
    act(() => {
      fire('onHeartRateBatch', batch);
    });
    expect(mockAckHeartRateBatches).not.toHaveBeenCalled();
    expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
      BUFFER_KEY,
      expect.anything()
    );
    expect(AsyncStorage.removeItem).not.toHaveBeenCalledWith(BUFFER_KEY);

    await act(async () => {
      releaseRead(stored);
    });
    await waitFor(() => {
      expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-live']);
    });
    await settleWatchTelemetryWrites();
    const saved = await readWatchTelemetry(empty, OWNER);
    expect(saved.get('session-old')?.samples.get('ex-old')).toHaveLength(2);
    expect(saved.get('session-1')?.energy.get('ex-uuid-1')).toBe(4);
  });

  it('leaves a batch for another server config queued and unapplied', async () => {
    act(() => {
      getStore().startWorkout(makeSession());
    });
    renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });
    expect(mockNativeWatch.setTelemetryOwner).toHaveBeenCalledWith(OWNER);

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-other',
        ownerId: 'config-b',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
        activeEnergyKcal: 6,
      });
      fire('onHeartRateBatch', {
        clientId: 'hr-unowned',
        ownerId: undefined,
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
        activeEnergyKcal: 6,
      });
    });
    await settleWatchTelemetryWrites();

    expect(mockAckHeartRateBatches).not.toHaveBeenCalled();
    const saved = await readWatchTelemetry(
      (): WatchTelemetrySessionState => ({
        samples: new Map(),
        energy: new Map(),
        durations: new Map(),
        durationFromTimeline: false,
        handledBatchClientIds: new Set(),
        entryDate: null,
        unposted: false,
        endedAt: null,
        attribution: null,
      }),
      OWNER
    );
    expect(saved.get('session-1')?.energy.get('ex-uuid-1')).toBeUndefined();
  });

  it('applies and saves nothing while no server config is active', async () => {
    await useActiveConfig(null);
    act(() => {
      getStore().startWorkout(makeSession());
    });
    renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockNativeWatch.setTelemetryOwner).toHaveBeenCalledWith('');
    });

    act(() => {
      fire('onHeartRateBatch', {
        clientId: 'hr-nobody',
        ownerId: undefined,
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
      });
    });
    await settleWatchTelemetryWrites();

    expect(mockPendingHeartRateBatches).not.toHaveBeenCalled();
    expect(mockAckHeartRateBatches).not.toHaveBeenCalled();
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('retries a failed restore when the app returns to the foreground, then replays the queue', async () => {
    const appStateListeners: ((state: AppStateStatus) => void)[] = [];
    // react-native's jest setup already mocks this. Swap the implementation
    // and put it back, rather than restoring a spy that would clear it.
    const addEventListener = AppState.addEventListener as jest.Mock;
    const originalAddEventListener = addEventListener.getMockImplementation();
    addEventListener.mockImplementation(
      (_type: string, listener: (state: AppStateStatus) => void) => {
        appStateListeners.push(listener);
        return { remove: jest.fn() };
      }
    );
    const getItem = AsyncStorage.getItem as jest.Mock;
    const previous = getItem.getMockImplementation();
    getItem.mockImplementation(async (key: string) => {
      if (key === BUFFER_KEY) {
        getItem.mockImplementation(previous ?? (() => Promise.resolve(null)));
        throw new Error('disk');
      }
      if (previous) return previous(key);
      return null;
    });
    act(() => {
      getStore().startWorkout(makeSession());
    });
    mockPendingHeartRateBatches.mockResolvedValue([
      stamp({
        clientId: 'hr-waiting',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-1',
        samples: twoSamples,
        activeEnergyKcal: 5,
      }),
    ]);

    try {
      const view = renderHook(() => useWatchWorkoutBridge(true, true));
      await waitFor(() => {
        expect(mockAddLog).toHaveBeenCalledWith(
          expect.stringContaining('restore failed'),
          'WARNING'
        );
      });
      expect(mockPendingHeartRateBatches).not.toHaveBeenCalled();

      await act(async () => {
        for (const listener of appStateListeners) listener('active');
      });
      await waitFor(() => {
        expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-waiting']);
      });
      view.unmount();
    } finally {
      if (originalAddEventListener) {
        addEventListener.mockImplementation(originalAddEventListener);
      }
    }
  });

  it('holds a batch for a known session until the workout store has loaded', async () => {
    jest.useFakeTimers();
    const base = makeSession();
    const session = makeSession({
      exercises: [base.exercises[0], { ...base.exercises[0], id: 'ex-uuid-2' }],
    });
    const saved: WatchTelemetrySessionState = {
      samples: new Map([['ex-uuid-1', twoSamples]]),
      energy: new Map(),
      durations: new Map(),
      durationFromTimeline: false,
      handledBatchClientIds: new Set(['hr-earlier']),
      entryDate: '2026-09-17',
      unposted: true,
      endedAt: null,
      attribution: null,
    };
    // Plain JSON, which restore still reads, so nothing waits on real crypto
    // while the clock is fake.
    await AsyncStorage.setItem(
      BUFFER_KEY,
      serializeWatchTelemetry(new Map([['session-1', saved]]))
    );
    let finishHydration: (() => void) | undefined;
    const hasHydrated = jest
      .spyOn(useActiveWorkoutStore.persist, 'hasHydrated')
      .mockReturnValue(false);
    const onFinishHydration = jest
      .spyOn(useActiveWorkoutStore.persist, 'onFinishHydration')
      .mockImplementation((listener) => {
        finishHydration = () => listener(useActiveWorkoutStore.getState());
        return () => undefined;
      });
    const later = [
      { t: '2026-09-17T10:05:00.000Z', bpm: 131 },
      { t: '2026-09-17T10:05:10.000Z', bpm: 135 },
    ];
    mockPendingHeartRateBatches.mockResolvedValue([
      stamp({
        clientId: 'hr-second-exercise',
        sessionId: 'session-1',
        exerciseEntryId: 'ex-uuid-2',
        samples: later,
      }),
    ]);

    try {
      const view = renderHook(() => useWatchWorkoutBridge(true, false));
      await act(async () => {
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
        await jest.advanceTimersByTimeAsync(10_000);
      });
      // Restore went ahead without the store. The session is known from the
      // saved buffer, but not which exercises it has, so nothing is applied.
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
      expect(mockAckHeartRateBatches).not.toHaveBeenCalled();

      hasHydrated.mockReturnValue(true);
      await act(async () => {
        getStore().startWorkout(session);
        finishHydration?.();
        await jest.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await settleWatchTelemetryWrites();
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mockAckHeartRateBatches).toHaveBeenCalledWith([
        'hr-second-exercise',
      ]);
      const stored = await readWatchTelemetry(
        (): WatchTelemetrySessionState => ({ ...saved, samples: new Map() }),
        OWNER
      );
      expect(stored.get('session-1')?.samples.get('ex-uuid-2')).toEqual(later);
      view.unmount();
    } finally {
      hasHydrated.mockRestore();
      onFinishHydration.mockRestore();
      jest.useRealTimers();
    }
  });

  it('saves once and acks once when replaying a backlog', async () => {
    act(() => {
      getStore().startWorkout(makeSession());
    });
    mockPendingHeartRateBatches.mockResolvedValue(
      [0, 1, 2].map((minute) =>
        stamp({
          clientId: `hr-backlog-${minute}`,
          sessionId: 'session-1',
          exerciseEntryId: 'ex-uuid-1',
          samples: [
            { t: `2026-09-17T10:0${minute}:00.000Z`, bpm: 120 + minute },
            { t: `2026-09-17T10:0${minute}:10.000Z`, bpm: 125 + minute },
          ],
        })
      )
    );
    (AsyncStorage.setItem as jest.Mock).mockClear();

    renderHook(() => useWatchWorkoutBridge(true, false));
    await waitFor(() => {
      expect(mockAckHeartRateBatches).toHaveBeenCalled();
    });

    expect(mockAckHeartRateBatches).toHaveBeenCalledTimes(1);
    expect(mockAckHeartRateBatches).toHaveBeenCalledWith([
      'hr-backlog-0',
      'hr-backlog-1',
      'hr-backlog-2',
    ]);
    const bufferWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      ([key]) => key === BUFFER_KEY
    );
    expect(bufferWrites).toHaveLength(1);
  });

  it('restores without the workout store when it never loads, and replays once it does', async () => {
    jest.useFakeTimers();
    let finishHydration: (() => void) | undefined;
    const hasHydrated = jest
      .spyOn(useActiveWorkoutStore.persist, 'hasHydrated')
      .mockReturnValue(false);
    const onFinishHydration = jest
      .spyOn(useActiveWorkoutStore.persist, 'onFinishHydration')
      .mockImplementation((listener) => {
        finishHydration = () => listener(useActiveWorkoutStore.getState());
        return () => undefined;
      });
    const batch = stamp({
      clientId: 'hr-before-store',
      sessionId: 'session-unknown',
      exerciseEntryId: 'ex-uuid-9',
      samples: twoSamples,
    });
    mockPendingHeartRateBatches.mockResolvedValue([batch]);

    try {
      const view = renderHook(() => useWatchWorkoutBridge(true, true));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(10_000);
      });
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('Workout store has not loaded'),
        'WARNING'
      );
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
      // The store has not said which session is live, so the batch stays.
      expect(mockAckHeartRateBatches).not.toHaveBeenCalled();

      hasHydrated.mockReturnValue(true);
      await act(async () => {
        finishHydration?.();
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-before-store']);
      view.unmount();
    } finally {
      hasHydrated.mockRestore();
      onFinishHydration.mockRestore();
      jest.useRealTimers();
    }
  });

  it('puts batches the native queue dropped into the app log', async () => {
    mockNativeWatch.takeDroppedHeartRateBatchCount.mockResolvedValueOnce(3);
    renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('dropped 3 batch(es)'),
        'WARNING'
      );
    });
  });

  it("purges the previous account's telemetry when the account changes on the same config", async () => {
    const previous: WatchTelemetrySessionState = {
      samples: new Map([['ex-old', twoSamples]]),
      energy: new Map([['ex-old', 7]]),
      durations: new Map(),
      durationFromTimeline: false,
      handledBatchClientIds: new Set(['hr-old']),
      entryDate: '2026-09-17',
      unposted: true,
      endedAt: Date.now(),
      attribution: null,
    };
    await writeWatchTelemetry(new Map([['session-old', previous]]), OWNER);
    // The server is unreachable, so the samples are still unposted when the
    // account changes.
    mockAttachTelemetry.mockRejectedValue(new Error('offline'));
    const view = renderHook(
      ({ connected }: { connected: boolean }) =>
        useWatchWorkoutBridge(true, connected),
      { initialProps: { connected: false } }
    );
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });
    queuedHeartRateBatches.push(
      stamp({
        clientId: 'hr-queued-old',
        sessionId: 'session-old',
        exerciseEntryId: 'ex-old',
        samples: twoSamples,
      })
    );
    mockPendingHeartRateBatches.mockClear();
    mockAttachTelemetry.mockReset();
    mockAttachTelemetry.mockResolvedValue(undefined);

    // Same server config, different person: the config id does not change.
    await act(async () => {
      notifyWatchTelemetryAccountSwitch(async () => [OWNER]);
    });
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalledTimes(2);
    });
    await settleWatchTelemetryWrites();

    expect(await AsyncStorage.getItem(BUFFER_KEY)).toBeNull();
    expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-queued-old']);
    expect(queuedHeartRateBatches).toHaveLength(0);
    view.rerender({ connected: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('does not restore the previous account when its telemetry purge fails', async () => {
    const appStateListeners: ((state: AppStateStatus) => void)[] = [];
    const addEventListener = AppState.addEventListener as jest.Mock;
    const originalAddEventListener = addEventListener.getMockImplementation();
    addEventListener.mockImplementation(
      (_type: string, listener: (state: AppStateStatus) => void) => {
        appStateListeners.push(listener);
        return { remove: jest.fn() };
      }
    );
    const previous: WatchTelemetrySessionState = {
      samples: new Map([['ex-old', twoSamples]]),
      energy: new Map([['ex-old', 7]]),
      durations: new Map(),
      durationFromTimeline: false,
      handledBatchClientIds: new Set(['hr-old']),
      entryDate: '2026-09-17',
      unposted: true,
      endedAt: Date.now(),
      attribution: null,
    };
    await writeWatchTelemetry(new Map([['session-old', previous]]), OWNER);
    mockAttachTelemetry.mockRejectedValue(new Error('offline'));

    try {
      const view = renderHook(() => useWatchWorkoutBridge(true, false));
      await waitFor(() => {
        expect(mockPendingHeartRateBatches).toHaveBeenCalled();
      });
      mockPendingHeartRateBatches.mockClear();
      mockAttachTelemetry.mockReset();
      mockAttachTelemetry.mockResolvedValue(undefined);
      const removeItem = AsyncStorage.removeItem as jest.Mock;
      const originalRemoveItem = removeItem.getMockImplementation();
      removeItem.mockImplementationOnce(async () => {
        throw new Error('disk');
      });
      const getItem = AsyncStorage.getItem as jest.Mock;
      getItem.mockClear();

      await act(async () => {
        notifyWatchTelemetryAccountSwitch(async () => [OWNER]);
      });
      await waitFor(() => {
        expect(mockAddLog).toHaveBeenCalledWith(
          expect.stringContaining('purge on account switch failed'),
          'WARNING'
        );
      });
      await act(async () => {
        await Promise.resolve();
      });
      // The purge failed, so the buffer is still there, and nothing reads it.
      expect(getItem).not.toHaveBeenCalledWith(BUFFER_KEY);
      expect(await AsyncStorage.getItem(BUFFER_KEY)).not.toBeNull();
      expect(mockPendingHeartRateBatches).not.toHaveBeenCalled();
      getItem.mockClear();
      if (originalRemoveItem) removeItem.mockImplementation(originalRemoveItem);

      await act(async () => {
        for (const listener of appStateListeners) listener('active');
      });
      await waitFor(() => {
        expect(mockPendingHeartRateBatches).toHaveBeenCalled();
      });
      expect(await AsyncStorage.getItem(BUFFER_KEY)).toBeNull();
      expect(mockAttachTelemetry).not.toHaveBeenCalled();
      view.unmount();
    } finally {
      if (originalAddEventListener) {
        addEventListener.mockImplementation(originalAddEventListener);
      }
    }
  });

  it('purges a config after an account switch even when the bridge is not running', async () => {
    const previous: WatchTelemetrySessionState = {
      samples: new Map([['ex-old', twoSamples]]),
      energy: new Map([['ex-old', 7]]),
      durations: new Map(),
      durationFromTimeline: false,
      handledBatchClientIds: new Set(['hr-old']),
      entryDate: '2026-09-17',
      unposted: true,
      endedAt: Date.now(),
      attribution: null,
    };
    await writeWatchTelemetry(new Map([['session-old', previous]]), OWNER);
    queuedHeartRateBatches.push(
      stamp({
        clientId: 'hr-queued-old',
        sessionId: 'session-old',
        exerciseEntryId: 'ex-old',
        samples: twoSamples,
      })
    );

    // No bridge mounted, so nothing knows the owner. The purge still runs
    // for the config the identity change names.
    notifyWatchTelemetryAccountSwitch(async () => [OWNER]);
    await waitFor(() => {
      expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-queued-old']);
    });
    expect(await AsyncStorage.getItem(BUFFER_KEY)).toBeNull();

    renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('waits for the configs of an identity change before restoring', async () => {
    const previous: WatchTelemetrySessionState = {
      samples: new Map([['ex-old', twoSamples]]),
      energy: new Map([['ex-old', 7]]),
      durations: new Map(),
      durationFromTimeline: false,
      handledBatchClientIds: new Set(['hr-old']),
      entryDate: '2026-09-17',
      unposted: true,
      endedAt: Date.now(),
      attribution: null,
    };
    await writeWatchTelemetry(new Map([['session-old', previous]]), OWNER);
    mockAttachTelemetry.mockRejectedValue(new Error('offline'));
    renderHook(() => useWatchWorkoutBridge(true, false));
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });
    mockPendingHeartRateBatches.mockClear();
    mockAttachTelemetry.mockReset();
    mockAttachTelemetry.mockResolvedValue(undefined);
    const getItem = AsyncStorage.getItem as jest.Mock;
    getItem.mockClear();

    let releaseIds: (ids: string[]) => void = () => {};
    const ids = new Promise<string[]>((resolve) => {
      releaseIds = resolve;
    });
    await act(async () => {
      notifyWatchTelemetryAccountSwitch(() => ids);
    });
    // The ids are still loading, so restore has not read anything yet.
    expect(getItem).not.toHaveBeenCalledWith(BUFFER_KEY);
    expect(mockPendingHeartRateBatches).not.toHaveBeenCalled();

    await act(async () => {
      releaseIds([OWNER]);
    });
    await waitFor(() => {
      expect(mockPendingHeartRateBatches).toHaveBeenCalled();
    });
    expect(await AsyncStorage.getItem(BUFFER_KEY)).toBeNull();
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
  });

  it('keeps restore blocked until the configs of an identity change can be read', async () => {
    const appStateListeners: ((state: AppStateStatus) => void)[] = [];
    const addEventListener = AppState.addEventListener as jest.Mock;
    const originalAddEventListener = addEventListener.getMockImplementation();
    addEventListener.mockImplementation(
      (_type: string, listener: (state: AppStateStatus) => void) => {
        appStateListeners.push(listener);
        return { remove: jest.fn() };
      }
    );
    const previous: WatchTelemetrySessionState = {
      samples: new Map([['ex-old', twoSamples]]),
      energy: new Map([['ex-old', 7]]),
      durations: new Map(),
      durationFromTimeline: false,
      handledBatchClientIds: new Set(['hr-old']),
      entryDate: '2026-09-17',
      unposted: true,
      endedAt: Date.now(),
      attribution: null,
    };
    await writeWatchTelemetry(new Map([['session-old', previous]]), OWNER);
    mockAttachTelemetry.mockRejectedValue(new Error('offline'));

    try {
      const view = renderHook(() => useWatchWorkoutBridge(true, false));
      await waitFor(() => {
        expect(mockPendingHeartRateBatches).toHaveBeenCalled();
      });
      mockPendingHeartRateBatches.mockClear();
      mockAttachTelemetry.mockReset();
      mockAttachTelemetry.mockResolvedValue(undefined);
      const getItem = AsyncStorage.getItem as jest.Mock;
      getItem.mockClear();
      // Storage fails until the test says otherwise, however often the
      // reader is retried.
      let storageWorks = false;
      const readIds = jest.fn(async (): Promise<string[]> => {
        if (!storageWorks) throw new Error('disk');
        return [OWNER];
      });

      await act(async () => {
        notifyWatchTelemetryAccountSwitch(readIds);
      });
      await waitFor(() => {
        expect(mockAddLog).toHaveBeenCalledWith(
          expect.stringContaining('config read on account switch failed'),
          'WARNING'
        );
      });
      await act(async () => {
        await Promise.resolve();
      });
      // The ids could not be read, so nothing counts as purged yet.
      expect(getItem).not.toHaveBeenCalledWith(BUFFER_KEY);
      expect(mockPendingHeartRateBatches).not.toHaveBeenCalled();

      storageWorks = true;
      await act(async () => {
        for (const listener of appStateListeners) listener('active');
      });
      await waitFor(() => {
        expect(mockPendingHeartRateBatches).toHaveBeenCalled();
      });
      expect(readIds.mock.calls.length).toBeGreaterThan(1);
      expect(await AsyncStorage.getItem(BUFFER_KEY)).toBeNull();
      expect(mockAttachTelemetry).not.toHaveBeenCalled();
      view.unmount();
    } finally {
      if (originalAddEventListener) {
        addEventListener.mockImplementation(originalAddEventListener);
      }
    }
  });

  it('applies a heart-rate batch that was queued before JavaScript was listening', async () => {
    act(() => {
      getStore().startWorkout(makeSession());
    });
    mockPendingHeartRateBatches.mockResolvedValue([
      stamp({
        clientId: 'hr-queued',
        sessionId: 'session-unknown',
        exerciseEntryId: 'ex-uuid-9',
        samples: [
          { t: '2026-09-17T11:00:00.000Z', bpm: 110 },
          { t: '2026-09-17T11:00:10.000Z', bpm: 118 },
        ],
        activeEnergyKcal: 4,
      }),
    ]);

    renderHook(() => useWatchWorkoutBridge(true, true));
    await waitFor(() => {
      expect(mockAckHeartRateBatches).toHaveBeenCalledWith(['hr-queued']);
    });
    expect(mockAttachTelemetry).not.toHaveBeenCalled();
    const saved = await readWatchTelemetry(
      () => ({
        samples: new Map(),
        energy: new Map(),
        durations: new Map(),
        durationFromTimeline: false,
        handledBatchClientIds: new Set<string>(),
        entryDate: null,
        unposted: false,
        endedAt: null,
        attribution: null,
      }),
      OWNER
    );
    expect(saved.has('session-unknown')).toBe(false);
  });

  it('ends the phone workout and hands the completion params over when the wearer finishes on the watch', async () => {
    const onWatchFinished = jest.fn();
    renderHook(() =>
      useWatchWorkoutBridge(true, true, undefined, onWatchFinished)
    );
    act(() => {
      getStore().startWorkout(makeSession());
    });
    await act(async () => {
      fire('onSetCompleted', {
        clientId: 'set-1',
        sessionId: 'session-1',
        setId: '101',
      });
      await Promise.resolve();
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    });

    expect(getStore().sessionId).toBeNull();
    expect(onWatchFinished).toHaveBeenCalledTimes(1);
    const celebration = onWatchFinished.mock.calls[0][0];
    expect(celebration?.session.id).toBe('session-1');
    expect(Object.keys(celebration?.completedSetIds ?? {})).toEqual(['101']);
  });

  it('does not report a watch finish for a stop the phone already handled', async () => {
    const onWatchFinished = jest.fn();
    renderHook(() =>
      useWatchWorkoutBridge(true, true, undefined, onWatchFinished)
    );
    act(() => {
      getStore().startWorkout(makeSession());
    });
    await act(async () => {
      getStore().clearWorkout();
      await Promise.resolve();
    });

    await act(async () => {
      fire('onWorkoutStop', { sessionId: 'session-1' });
      await Promise.resolve();
    });
    expect(onWatchFinished).not.toHaveBeenCalled();
  });
});
