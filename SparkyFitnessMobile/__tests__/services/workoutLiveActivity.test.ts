import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PresetSessionResponse } from '@workspace/shared';
import { addUserInteractionListener } from 'expo-widgets';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
// On macOS Jest resolves the `.ios.ts` variant, which is the module under test.
import {
  __resetWorkoutLiveActivityForTests,
  initWorkoutLiveActivity,
} from '../../src/services/workoutLiveActivity';
import WorkoutLiveActivityFactory from '../../src/services/WorkoutLiveActivityLayout';
import { addLog } from '../../src/services/LogService';

jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteHaptic: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(async () => undefined),
}));

// The layout module runs createLiveActivity (an iOS native call) at module
// scope; the service only ever touches the factory's start/getInstances.
jest.mock('../../src/services/WorkoutLiveActivityLayout', () => ({
  __esModule: true,
  default: { start: jest.fn(), getInstances: jest.fn() },
}));

// expo-widgets requires the ExpoWidgets native module at import time.
jest.mock('expo-widgets', () => ({
  addUserInteractionListener: jest.fn(() => ({ remove: jest.fn() })),
}));

type MockInstance = { update: jest.Mock; end: jest.Mock };

const mockFactory = WorkoutLiveActivityFactory as unknown as {
  start: jest.Mock;
  getInstances: jest.Mock;
};
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockAddUserInteractionListener = addUserInteractionListener as jest.MockedFunction<
  typeof addUserInteractionListener
>;

const FIXED_NOW = 1_700_000_000_000;
const ACTIVE_WORKOUT_URL = 'sparkyfitnessmobile://active-workout';

const createdInstances: MockInstance[] = [];

function makeInstance(): MockInstance {
  return { update: jest.fn(async () => undefined), end: jest.fn(async () => undefined) };
}

function makeSet(id: number, setNumber: number, restTime = 60) {
  return {
    id,
    set_number: setNumber,
    set_type: 'normal',
    reps: 10,
    weight: 60,
    duration: null,
    rest_time: restTime,
    notes: null,
    rpe: null,
    completed_at: null,
  };
}

function makeSession(overrides?: Partial<PresetSessionResponse>): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-07-12',
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
        entry_date: '2026-07-12',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        superset_group: null,
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          images: [],
          calories_per_hour: 400,
        } as any,
        activity_details: [],
        sets: [makeSet(101, 1), makeSet(102, 2)],
      } as any,
    ],
    ...overrides,
  };
}

/** Flush all pending microtasks (resolved promises). */
async function flushPromises(): Promise<void> {
  await jest.advanceTimersByTimeAsync(0);
}

/** Init against a hydrated store and clear the reconcile's factory traffic. */
async function initHydrated(): Promise<void> {
  await initWorkoutLiveActivity();
  await flushPromises();
}

/** Drive the interaction listener the service registered, as a button press would. */
function fireInteraction(target: string): void {
  const listener = mockAddUserInteractionListener.mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('interaction listener not registered');
  listener({
    source: 'WorkoutLiveActivity',
    target,
    timestamp: Date.now(),
    type: 'ExpoWidgetsUserInteraction',
  });
}

describe('workoutLiveActivity', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_NOW));
    // Service first: resetting the store fires setState, which must not reach
    // a lingering subscription from the previous case.
    __resetWorkoutLiveActivityForTests();
    __resetActiveWorkoutStoreForTests();
    createdInstances.length = 0;
    mockFactory.start.mockReset().mockImplementation(() => {
      const instance = makeInstance();
      createdInstances.push(instance);
      return instance;
    });
    mockFactory.getInstances.mockReset().mockReturnValue([]);
    mockAddLog.mockClear();
    mockAddUserInteractionListener.mockClear();
    jest.spyOn(useActiveWorkoutStore.persist, 'hasHydrated').mockReturnValue(true);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('workout lifecycle', () => {
    it('starts the activity with active-phase props and the deep-link url', async () => {
      await initHydrated();

      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();

      expect(mockFactory.start).toHaveBeenCalledTimes(1);
      const [props, url] = mockFactory.start.mock.calls[0];
      expect(url).toBe(ACTIVE_WORKOUT_URL);
      expect(props).toEqual({
        workoutName: 'Push Day',
        startedAt: FIXED_NOW,
        phase: 'active',
        restStartedAt: null,
        restEndsAt: null,
        pausedRemainingLabel: null,
        setLine: 'Bench Press · Set 1 of 2',
        elapsedLabel: null,
      });
    });

    it('updates through resting, paused, and back to active', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      useActiveWorkoutStore.getState().completeSet('101');
      await flushPromises();
      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: 'resting',
          restStartedAt: FIXED_NOW,
          restEndsAt: FIXED_NOW + 60_000,
          setLine: 'Bench Press · Set 2 of 2',
        }),
      );

      useActiveWorkoutStore.getState().pauseRest();
      await flushPromises();
      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: 'paused',
          restStartedAt: null,
          restEndsAt: null,
          pausedRemainingLabel: '1:00',
        }),
      );

      useActiveWorkoutStore.getState().dismissRest();
      await flushPromises();
      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: 'active', pausedRemainingLabel: null }),
      );
    });

    it('freezes the elapsed clock when the last set completes', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      jest.setSystemTime(new Date(FIXED_NOW + 125_000));
      useActiveWorkoutStore.getState().completeSet('101');
      useActiveWorkoutStore.getState().completeSet('102');
      await flushPromises();

      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: 'complete',
          elapsedLabel: '02:05',
          restEndsAt: null,
          setLine: null,
        }),
      );
    });

    it('keeps the clock running for an empty live-start workout', async () => {
      await initHydrated();

      useActiveWorkoutStore
        .getState()
        .startWorkout(makeSession({ exercises: [] }), { createdByLiveStart: true });
      await flushPromises();

      expect(mockFactory.start).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'active', setLine: null, elapsedLabel: null }),
        ACTIVE_WORKOUT_URL,
      );
    });

    it('ends the activity immediately when the workout is cleared', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();

      useActiveWorkoutStore.getState().clearWorkout();
      await flushPromises();

      expect(createdInstances[0].end).toHaveBeenCalledWith('immediate');
    });
  });

  describe('init reconcile', () => {
    it('ends a stale instance when no workout is active', async () => {
      const stale = makeInstance();
      mockFactory.getInstances.mockReturnValue([stale]);

      await initHydrated();

      expect(stale.end).toHaveBeenCalledWith('immediate');
      expect(mockFactory.start).not.toHaveBeenCalled();
    });

    it('starts an activity for an active workout with no instance', async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());

      await initHydrated();

      expect(mockFactory.start).toHaveBeenCalledTimes(1);
      expect(mockFactory.start).toHaveBeenCalledWith(
        expect.objectContaining({ workoutName: 'Push Day', phase: 'active' }),
        ACTIVE_WORKOUT_URL,
      );
    });

    it('adopts a leftover instance and ends extras', async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      const leftover = makeInstance();
      const extra = makeInstance();
      mockFactory.getInstances.mockReturnValue([leftover, extra]);

      await initHydrated();

      expect(mockFactory.start).not.toHaveBeenCalled();
      expect(leftover.update).toHaveBeenCalledWith(
        expect.objectContaining({ workoutName: 'Push Day' }),
      );
      expect(extra.end).toHaveBeenCalledWith('immediate');

      // The adopted instance keeps receiving subsequent state changes.
      useActiveWorkoutStore.getState().completeSet('101');
      await flushPromises();
      expect(leftover.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: 'resting' }),
      );
    });

    it('holds all operations until hydration, then adopts without a duplicate start', async () => {
      (useActiveWorkoutStore.persist.hasHydrated as jest.Mock).mockReturnValue(false);
      let finishHydration: (() => void) | undefined;
      jest
        .spyOn(useActiveWorkoutStore.persist, 'onFinishHydration')
        .mockImplementation(((cb: () => void) => {
          finishHydration = cb;
          return () => {};
        }) as any);
      const leftover = makeInstance();
      mockFactory.getInstances.mockReturnValue([leftover]);

      await initWorkoutLiveActivity();
      // The rehydration setState (null → session) lands before hydration
      // completes; it must not start a fresh activity over the leftover.
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      expect(mockFactory.start).not.toHaveBeenCalled();
      expect(leftover.update).not.toHaveBeenCalled();

      finishHydration!();
      await flushPromises();
      expect(mockFactory.start).not.toHaveBeenCalled();
      expect(leftover.update).toHaveBeenCalledWith(
        expect.objectContaining({ workoutName: 'Push Day', phase: 'active' }),
      );
    });

    it('derives the frozen clock of a completed workout from the newest set timestamp', async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      jest.setSystemTime(new Date(FIXED_NOW + 60_000));
      useActiveWorkoutStore.getState().completeSet('101');
      useActiveWorkoutStore.getState().completeSet('102');

      // Relaunch long after — the frozen label must not stretch to "now".
      jest.setSystemTime(new Date(FIXED_NOW + 3_000_000));
      await initHydrated();

      expect(mockFactory.start).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'complete', elapsedLabel: '01:00' }),
        ACTIVE_WORKOUT_URL,
      );
    });
  });

  describe('update coalescing and failure handling', () => {
    it('skips updates when the computed props are unchanged', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      // Editing a non-active set replaces the session ref but leaves every
      // prop the activity shows untouched.
      useActiveWorkoutStore.getState().updateSetField('102', { notes: 'heavy' });
      await flushPromises();

      expect(instance.update).not.toHaveBeenCalled();
    });

    it('logs a rejected update and retries on the next state change', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      instance.update.mockRejectedValueOnce(new Error('boom'));
      useActiveWorkoutStore.getState().completeSet('101');
      await flushPromises();
      expect(mockAddLog).toHaveBeenCalledWith(
        expect.stringContaining('sync failed'),
        'ERROR',
      );

      // The queue keeps flowing and the failed props are not treated as sent.
      useActiveWorkoutStore.getState().pauseRest();
      await flushPromises();
      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: 'paused' }),
      );
    });

    it('serializes a rapid pause/resume/adjust burst to the final state', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      useActiveWorkoutStore.getState().completeSet('101');
      useActiveWorkoutStore.getState().pauseRest();
      useActiveWorkoutStore.getState().resumeRest();
      useActiveWorkoutStore.getState().adjustRest(30);
      await flushPromises();

      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: 'resting',
          restEndsAt: FIXED_NOW + 90_000,
        }),
      );
    });
  });

  describe('button interactions', () => {
    it('extends the current rest by 15s on rest-add-15', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      useActiveWorkoutStore.getState().completeSet('101');
      await flushPromises();

      fireInteraction('rest-add-15');
      await flushPromises();

      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: 'resting',
          restEndsAt: FIXED_NOW + 75_000,
        }),
      );
    });

    it('skips the current rest on rest-skip', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      useActiveWorkoutStore.getState().completeSet('101');
      await flushPromises();

      fireInteraction('rest-skip');
      await flushPromises();

      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ phase: 'active', restEndsAt: null }),
      );
    });

    it('completes the active set on complete-set', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      fireInteraction('complete-set');
      await flushPromises();

      expect(instance.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phase: 'resting',
          restEndsAt: FIXED_NOW + 60_000,
          setLine: 'Bench Press · Set 2 of 2',
        }),
      );
    });

    it('ignores a stale complete-set press while resting', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      useActiveWorkoutStore.getState().completeSet('101');
      await flushPromises();
      const updateCount = instance.update.mock.calls.length;

      fireInteraction('complete-set');
      await flushPromises();

      expect(instance.update.mock.calls.length).toBe(updateCount);
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('102');
    });

    it('ignores unknown interaction targets', async () => {
      await initHydrated();
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      await flushPromises();
      const instance = createdInstances[0];

      useActiveWorkoutStore.getState().completeSet('101');
      await flushPromises();
      const updateCount = instance.update.mock.calls.length;

      fireInteraction('some-other-widget-button');
      await flushPromises();

      expect(instance.update.mock.calls.length).toBe(updateCount);
    });
  });
});
