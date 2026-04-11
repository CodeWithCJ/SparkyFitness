import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PresetSessionResponse } from '@workspace/shared';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  cancelScheduledNotification,
  fireRestCompleteHaptic,
  scheduleRestNotification,
} from '../../src/services/notifications';

jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteHaptic: jest.fn(),
}));

const mockSchedule = scheduleRestNotification as jest.MockedFunction<
  typeof scheduleRestNotification
>;
const mockCancel = cancelScheduledNotification as jest.MockedFunction<
  typeof cancelScheduledNotification
>;
const mockHaptic = fireRestCompleteHaptic as jest.MockedFunction<
  typeof fireRestCompleteHaptic
>;

const FIXED_NOW = 1_700_000_000_000;

function makeSession(overrides?: Partial<PresetSessionResponse>): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-03-20',
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
        entry_date: '2026-03-20',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          calories_per_hour: 400,
          source: 'system',
          images: ['bench.jpg'],
        } as any,
        activity_details: [],
        sets: [
          {
            id: 101,
            set_number: 1,
            set_type: 'working',
            reps: 10,
            weight: 60,
            duration: null,
            rest_time: 60,
            notes: null,
            rpe: null,
          },
          {
            id: 102,
            set_number: 2,
            set_type: 'working',
            reps: 8,
            weight: 70,
            duration: null,
            rest_time: 60,
            notes: null,
            rpe: null,
          },
        ],
      } as any,
      {
        id: 'ex-uuid-2',
        exercise_id: 'ex-2',
        duration_minutes: 15,
        calories_burned: 120,
        entry_date: '2026-03-20',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        exercise_snapshot: {
          id: 'ex-2',
          name: 'Squat',
          category: 'Strength',
          calories_per_hour: 500,
          source: 'system',
          images: ['squat.jpg'],
        } as any,
        activity_details: [],
        sets: [
          {
            id: 201,
            set_number: 1,
            set_type: 'working',
            reps: 5,
            weight: 100,
            duration: null,
            rest_time: 120,
            notes: null,
            rpe: null,
          },
        ],
      } as any,
    ],
    ...overrides,
  };
}

/** Flush all pending microtasks (resolved promises). */
async function flushPromises(): Promise<void> {
  // advanceTimersByTimeAsync runs the microtask queue even when fake timers are installed.
  await jest.advanceTimersByTimeAsync(0);
}

describe('activeWorkoutStore', () => {
  beforeEach(async () => {
    __resetActiveWorkoutStoreForTests();
    mockSchedule.mockClear();
    mockCancel.mockClear();
    mockHaptic.mockClear();
    mockSchedule.mockImplementation(async () => 'notif-abc');
    jest.useFakeTimers();
    jest.setSystemTime(new Date(FIXED_NOW));
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('startWorkout', () => {
    it('builds steps in order across all exercises', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      const { steps, sessionId } = useActiveWorkoutStore.getState();
      expect(sessionId).toBe('session-1');
      expect(steps).toHaveLength(3);
      expect(steps.map((s) => s.setId)).toEqual(['101', '102', '201']);
      expect(steps[0].exerciseId).toBe('ex-uuid-1');
      expect(steps[2].exerciseId).toBe('ex-uuid-2');
    });

    it('derives restSec from the first set per exercise', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      const { steps } = useActiveWorkoutStore.getState();
      expect(steps[0].restSec).toBe(60);
      expect(steps[1].restSec).toBe(60);
      expect(steps[2].restSec).toBe(120);
    });

    it('falls back to 90s when rest_time is null', () => {
      const session = makeSession();
      session.exercises[0].sets[0].rest_time = null;
      useActiveWorkoutStore.getState().startWorkout(session);
      const { steps } = useActiveWorkoutStore.getState();
      expect(steps[0].restSec).toBe(90);
      expect(steps[1].restSec).toBe(90);
    });

    it('resets completedSetIds and activeRest', () => {
      useActiveWorkoutStore.setState({
        completedSetIds: { stale: true },
        activeRest: {
          setId: 'stale',
          state: 'running',
          durationSec: 60,
          endsAt: FIXED_NOW + 60000,
          pausedRemainingMs: null,
          scheduledNotificationId: 'stale-id',
          instanceToken: 99,
        },
      });
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      expect(useActiveWorkoutStore.getState().completedSetIds).toEqual({});
      expect(useActiveWorkoutStore.getState().activeRest).toBeNull();
    });

    it('snapshots exerciseName and exerciseImage per step', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      const { steps } = useActiveWorkoutStore.getState();
      expect(steps[0].exerciseName).toBe('Bench Press');
      expect(steps[0].exerciseImage).toBe('bench.jpg');
      expect(steps[2].exerciseName).toBe('Squat');
      expect(steps[2].exerciseImage).toBe('squat.jpg');
    });

    it('cancels an existing activeRest notification before replacing state', () => {
      useActiveWorkoutStore.setState({
        activeRest: {
          setId: 'x',
          state: 'running',
          durationSec: 60,
          endsAt: FIXED_NOW + 60000,
          pausedRemainingMs: null,
          scheduledNotificationId: 'leaked-id',
          instanceToken: 1,
        },
      });
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      expect(mockCancel).toHaveBeenCalledWith('leaked-id');
    });
  });

  describe('startWorkoutAtSet', () => {
    it('seeds all strictly-prior set IDs as completed, leaves target + later uncompleted', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '102');
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionId).toBe('session-1');
      expect(state.completedSetIds).toEqual({ '101': true });
      expect(state.activeRest).toBeNull();
    });

    it('seeds no completions when target is the first set', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '101');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({});
      expect(state.activeRest).toBeNull();
    });

    it('seeds all prior sets across exercises when target is the last set', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({ '101': true, '102': true });
    });

    it('cancels a pre-existing rest notification before replacing state', () => {
      useActiveWorkoutStore.setState({
        activeRest: {
          setId: 'x',
          state: 'running',
          durationSec: 60,
          endsAt: FIXED_NOW + 60000,
          pausedRemainingMs: null,
          scheduledNotificationId: 'prior-notif',
          instanceToken: 1,
        },
      });
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '102');
      expect(mockCancel).toHaveBeenCalledWith('prior-notif');
    });

    it('is a no-op when setId does not exist in the session', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), 'nope');
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionId).toBeNull();
      expect(state.steps).toEqual([]);
      expect(state.completedSetIds).toEqual({});
    });
  });

  describe('toggleSetComplete', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('creates activeRest in running state with correct endsAt and instanceToken', async () => {
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      const { activeRest, completedSetIds } = useActiveWorkoutStore.getState();
      expect(completedSetIds['101']).toBe(true);
      expect(activeRest).not.toBeNull();
      expect(activeRest?.state).toBe('running');
      expect(activeRest?.setId).toBe('101');
      expect(activeRest?.endsAt).toBe(FIXED_NOW + 60000);
      expect(activeRest?.instanceToken).toBeGreaterThan(0);
      await flushPromises();
    });

    it('writes scheduled notification ID back into activeRest after async resolves', async () => {
      mockSchedule.mockResolvedValueOnce('notif-1');
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeRest?.scheduledNotificationId).toBe('notif-1');
    });

    it('cancels the prior notification when completing a second set', async () => {
      mockSchedule.mockResolvedValueOnce('notif-1');
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();

      mockSchedule.mockResolvedValueOnce('notif-2');
      useActiveWorkoutStore.getState().toggleSetComplete('102');
      expect(mockCancel).toHaveBeenCalledWith('notif-1');
      await flushPromises();
    });

    it('late-schedule-after-pause cancels the late-arriving ID', async () => {
      let resolveSchedule: (id: string) => void = () => {};
      mockSchedule.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSchedule = resolve;
          }),
      );

      useActiveWorkoutStore.getState().toggleSetComplete('101');
      useActiveWorkoutStore.getState().pauseRest();
      resolveSchedule('late-notif');
      await flushPromises();

      expect(mockCancel).toHaveBeenCalledWith('late-notif');
      expect(useActiveWorkoutStore.getState().activeRest?.scheduledNotificationId).toBeNull();
    });

    it('late-schedule-after-clear cancels the late-arriving ID', async () => {
      let resolveSchedule: (id: string) => void = () => {};
      mockSchedule.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSchedule = resolve;
          }),
      );

      useActiveWorkoutStore.getState().toggleSetComplete('101');
      useActiveWorkoutStore.getState().clearWorkout();
      resolveSchedule('late-notif');
      await flushPromises();

      expect(mockCancel).toHaveBeenCalledWith('late-notif');
    });

    it('late-schedule-after-dismiss cancels the late-arriving ID', async () => {
      let resolveSchedule: (id: string) => void = () => {};
      mockSchedule.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSchedule = resolve;
          }),
      );

      useActiveWorkoutStore.getState().toggleSetComplete('101');
      useActiveWorkoutStore.getState().dismissRest();
      resolveSchedule('late-notif');
      await flushPromises();

      expect(mockCancel).toHaveBeenCalledWith('late-notif');
    });

    it('late-schedule-after-new-rest cancels the stale ID without overwriting the new rest', async () => {
      let resolveA: (id: string) => void = () => {};
      mockSchedule.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveA = resolve;
          }),
      );

      useActiveWorkoutStore.getState().toggleSetComplete('101');

      mockSchedule.mockResolvedValueOnce('notif-B');
      useActiveWorkoutStore.getState().toggleSetComplete('102');
      await flushPromises();

      resolveA('notif-A-late');
      await flushPromises();

      expect(mockCancel).toHaveBeenCalledWith('notif-A-late');
      expect(useActiveWorkoutStore.getState().activeRest?.scheduledNotificationId).toBe('notif-B');
    });

    it('un-completing a set deletes the flag but leaves activeRest alone', async () => {
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();
      const restBefore = useActiveWorkoutStore.getState().activeRest;

      useActiveWorkoutStore.getState().toggleSetComplete('101');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['101']).toBeUndefined();
      expect(state.activeRest).toBe(restBefore);
    });

    it('is a no-op when setId is not in steps', () => {
      useActiveWorkoutStore.getState().toggleSetComplete('does-not-exist');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({});
      expect(state.activeRest).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
    });
  });

  describe('pauseRest / resumeRest', () => {
    beforeEach(async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      mockSchedule.mockResolvedValueOnce('notif-running');
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();
    });

    it('pauseRest captures remaining ms and cancels notification', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 10_000));
      useActiveWorkoutStore.getState().pauseRest();
      const { activeRest } = useActiveWorkoutStore.getState();
      expect(activeRest?.state).toBe('paused');
      expect(activeRest?.endsAt).toBeNull();
      expect(activeRest?.pausedRemainingMs).toBe(50_000);
      expect(activeRest?.scheduledNotificationId).toBeNull();
      expect(mockCancel).toHaveBeenCalledWith('notif-running');
    });

    it('pauseRest is a no-op when not running', () => {
      useActiveWorkoutStore.getState().pauseRest();
      const first = useActiveWorkoutStore.getState().activeRest;
      useActiveWorkoutStore.getState().pauseRest();
      expect(useActiveWorkoutStore.getState().activeRest).toBe(first);
    });

    it('resumeRest computes endsAt from pausedRemainingMs and reschedules', async () => {
      jest.setSystemTime(new Date(FIXED_NOW + 10_000));
      useActiveWorkoutStore.getState().pauseRest();

      jest.setSystemTime(new Date(FIXED_NOW + 30_000));
      mockSchedule.mockResolvedValueOnce('notif-resumed');
      useActiveWorkoutStore.getState().resumeRest();
      const { activeRest } = useActiveWorkoutStore.getState();
      expect(activeRest?.state).toBe('running');
      expect(activeRest?.endsAt).toBe(FIXED_NOW + 80_000);
      expect(activeRest?.pausedRemainingMs).toBeNull();
      expect(mockSchedule).toHaveBeenLastCalledWith('Bench Press', 50);
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeRest?.scheduledNotificationId).toBe(
        'notif-resumed',
      );
    });

    it('resumeRest is a no-op when not paused', () => {
      const before = useActiveWorkoutStore.getState().activeRest;
      useActiveWorkoutStore.getState().resumeRest();
      expect(useActiveWorkoutStore.getState().activeRest).toBe(before);
    });

    it('pause → advance clock → resume preserves remaining time', async () => {
      jest.setSystemTime(new Date(FIXED_NOW + 20_000));
      useActiveWorkoutStore.getState().pauseRest();
      const remaining = useActiveWorkoutStore.getState().activeRest?.pausedRemainingMs;
      expect(remaining).toBe(40_000);

      jest.setSystemTime(new Date(FIXED_NOW + 1_000_000));
      mockSchedule.mockResolvedValueOnce('notif-resumed');
      useActiveWorkoutStore.getState().resumeRest();
      expect(useActiveWorkoutStore.getState().activeRest?.endsAt).toBe(FIXED_NOW + 1_040_000);
      await flushPromises();
    });
  });

  describe('markRestComplete', () => {
    beforeEach(async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      mockSchedule.mockResolvedValueOnce('notif-abc');
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();
    });

    it('is a no-op when not running', () => {
      useActiveWorkoutStore.getState().pauseRest();
      mockHaptic.mockClear();
      useActiveWorkoutStore.getState().markRestComplete();
      expect(useActiveWorkoutStore.getState().activeRest?.state).toBe('paused');
      expect(mockHaptic).not.toHaveBeenCalled();
    });

    it('is a no-op when Date.now() < endsAt (pause-right-before-zero guard)', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 59_950));
      const before = useActiveWorkoutStore.getState().activeRest;
      mockHaptic.mockClear();
      useActiveWorkoutStore.getState().markRestComplete();
      expect(useActiveWorkoutStore.getState().activeRest).toEqual(before);
      expect(mockHaptic).not.toHaveBeenCalled();
    });

    it('transitions to complete and clears endsAt + notification id when past endsAt', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 60_001));
      mockHaptic.mockClear();
      useActiveWorkoutStore.getState().markRestComplete();
      const { activeRest } = useActiveWorkoutStore.getState();
      expect(activeRest?.state).toBe('complete');
      expect(activeRest?.endsAt).toBeNull();
      expect(activeRest?.scheduledNotificationId).toBeNull();
      expect(mockCancel).toHaveBeenCalledWith('notif-abc');
      expect(mockHaptic).toHaveBeenCalledTimes(1);
    });
  });

  describe('dismissRest', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('cancels scheduled notification and clears activeRest', async () => {
      mockSchedule.mockResolvedValueOnce('notif-dismiss');
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();

      const returned = useActiveWorkoutStore.getState().dismissRest();
      expect(returned).toBe(false);
      expect(useActiveWorkoutStore.getState().activeRest).toBeNull();
      expect(mockCancel).toHaveBeenCalledWith('notif-dismiss');
    });

    it('returns true and fully resets when all steps are completed', async () => {
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();
      useActiveWorkoutStore.getState().toggleSetComplete('102');
      await flushPromises();
      useActiveWorkoutStore.getState().toggleSetComplete('201');
      await flushPromises();

      const returned = useActiveWorkoutStore.getState().dismissRest();
      expect(returned).toBe(true);
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionId).toBeNull();
      expect(state.steps).toEqual([]);
      expect(state.completedSetIds).toEqual({});
      expect(state.activeRest).toBeNull();
    });

    it('returns false when activeRest is null', () => {
      expect(useActiveWorkoutStore.getState().dismissRest()).toBe(false);
    });
  });

  describe('clearWorkout', () => {
    it('cancels pending notification and resets state', async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      mockSchedule.mockResolvedValueOnce('notif-clear');
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();

      useActiveWorkoutStore.getState().clearWorkout();
      expect(mockCancel).toHaveBeenCalledWith('notif-clear');
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionId).toBeNull();
      expect(state.steps).toEqual([]);
      expect(state.completedSetIds).toEqual({});
      expect(state.activeRest).toBeNull();
    });
  });

  describe('reconcileWithSession', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('is a no-op when session.id !== state.sessionId', () => {
      const foreign = makeSession({ id: 'session-2', exercises: [] });
      useActiveWorkoutStore.getState().reconcileWithSession(foreign);
      expect(useActiveWorkoutStore.getState().steps).toHaveLength(3);
    });

    it('preserves completion when IDs match but weight changes', async () => {
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();

      const updated = makeSession();
      updated.exercises[0].sets[0].weight = 65; // editing weight
      useActiveWorkoutStore.getState().reconcileWithSession(updated);

      expect(useActiveWorkoutStore.getState().completedSetIds['101']).toBe(true);
    });

    it('drops completedSetIds entries whose IDs no longer exist', async () => {
      useActiveWorkoutStore.getState().toggleSetComplete('102');
      await flushPromises();

      const updated = makeSession();
      updated.exercises[0].sets = [updated.exercises[0].sets[0]]; // drop set 102
      useActiveWorkoutStore.getState().reconcileWithSession(updated);

      expect(useActiveWorkoutStore.getState().completedSetIds['102']).toBeUndefined();
    });

    it('dismisses activeRest when active set ID vanishes, without triggering completion', async () => {
      // Complete first two sets so only set 201 is left uncompleted.
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();
      useActiveWorkoutStore.getState().toggleSetComplete('102');
      await flushPromises();
      // Now the activeRest is on 102. Remove set 102 from the session.
      const updated = makeSession();
      updated.exercises[0].sets = [updated.exercises[0].sets[0]];

      useActiveWorkoutStore.getState().reconcileWithSession(updated);
      const state = useActiveWorkoutStore.getState();

      expect(state.activeRest).toBeNull();
      // Reconcile must NOT wipe the workout even if the remaining completed set covers steps.
      expect(state.sessionId).toBe('session-1');
      expect(state.steps.length).toBeGreaterThan(0);
    });

    it('leaves activeRest intact when the active set still exists', async () => {
      mockSchedule.mockResolvedValueOnce('notif-keep');
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();

      const updated = makeSession();
      updated.exercises[1].sets[0].weight = 105;
      useActiveWorkoutStore.getState().reconcileWithSession(updated);

      expect(useActiveWorkoutStore.getState().activeRest?.setId).toBe('101');
      expect(useActiveWorkoutStore.getState().activeRest?.scheduledNotificationId).toBe(
        'notif-keep',
      );
    });

    it('adds new steps for newly-added sets without touching existing completion', async () => {
      useActiveWorkoutStore.getState().toggleSetComplete('101');
      await flushPromises();

      const updated = makeSession();
      updated.exercises[0].sets.push({
        id: 103,
        set_number: 3,
        set_type: 'working',
        reps: 6,
        weight: 80,
        duration: null,
        rest_time: 60,
        notes: null,
        rpe: null,
      } as any);

      useActiveWorkoutStore.getState().reconcileWithSession(updated);
      const { steps, completedSetIds } = useActiveWorkoutStore.getState();
      expect(steps.find((s) => s.setId === '103')).toBeDefined();
      expect(completedSetIds['101']).toBe(true);
    });

    it('refreshes restSec on every step when first set rest_time changes', () => {
      const updated = makeSession();
      updated.exercises[0].sets[0].rest_time = 180;
      updated.exercises[0].sets[1].rest_time = 60; // unchanged; should still be overridden

      useActiveWorkoutStore.getState().reconcileWithSession(updated);
      const { steps } = useActiveWorkoutStore.getState();
      expect(steps[0].restSec).toBe(180);
      expect(steps[1].restSec).toBe(180);
    });

    it('reorders steps to match new session order', () => {
      const updated = makeSession();
      updated.exercises = [updated.exercises[1], updated.exercises[0]];
      useActiveWorkoutStore.getState().reconcileWithSession(updated);
      const { steps } = useActiveWorkoutStore.getState();
      expect(steps.map((s) => s.setId)).toEqual(['201', '101', '102']);
    });
  });

  describe('persistence + rehydration', () => {
    it('simulated rehydration with running + expired endsAt transitions to complete', async () => {
      jest.useRealTimers();
      const now = Date.now();
      const persisted = {
        state: {
          sessionId: 'session-1',
          steps: [
            {
              exerciseId: 'ex-uuid-1',
              setId: '101',
              exerciseName: 'Bench Press',
              exerciseImage: null,
              restSec: 60,
            },
          ],
          completedSetIds: { '101': true },
          activeRest: {
            setId: '101',
            state: 'running',
            durationSec: 60,
            endsAt: now - 60_000,
            pausedRemainingMs: null,
            scheduledNotificationId: 'notif-old',
            instanceToken: 1,
          },
        },
        version: 1,
      };
      mockHaptic.mockClear();
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().activeRest;
      expect(rest?.state).toBe('complete');
      expect(rest?.endsAt).toBeNull();
      expect(rest?.scheduledNotificationId).toBeNull();
      // merge path mutates state directly; must NOT fire a phantom haptic on cold start
      expect(mockHaptic).not.toHaveBeenCalled();
    });

    it('rehydration with future endsAt is left alone', async () => {
      jest.useRealTimers();
      const now = Date.now();
      const persisted = {
        state: {
          sessionId: 'session-1',
          steps: [],
          completedSetIds: {},
          activeRest: {
            setId: '101',
            state: 'running',
            durationSec: 60,
            endsAt: now + 60_000,
            pausedRemainingMs: null,
            scheduledNotificationId: 'notif-future',
            instanceToken: 1,
          },
        },
        version: 1,
      };
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().activeRest;
      expect(rest?.state).toBe('running');
      expect(rest?.endsAt).toBe(now + 60_000);
    });

    it('rehydration with paused state is left alone', async () => {
      jest.useRealTimers();
      const persisted = {
        state: {
          sessionId: 'session-1',
          steps: [],
          completedSetIds: {},
          activeRest: {
            setId: '101',
            state: 'paused',
            durationSec: 60,
            endsAt: null,
            pausedRemainingMs: 30_000,
            scheduledNotificationId: null,
            instanceToken: 1,
          },
        },
        version: 1,
      };
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().activeRest;
      expect(rest?.state).toBe('paused');
      expect(rest?.pausedRemainingMs).toBe(30_000);
    });
  });
});
