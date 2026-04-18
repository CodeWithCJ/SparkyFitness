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

    it('sets activeSetId to the first step and rest to ready', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('101');
      expect(state.rest.state).toBe('ready');
      expect(state.rest.endsAt).toBeNull();
      expect(state.completedSetIds).toEqual({});
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

    it('snapshots exerciseName and exerciseImage per step', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      const { steps } = useActiveWorkoutStore.getState();
      expect(steps[0].exerciseName).toBe('Bench Press');
      expect(steps[0].exerciseImage).toBe('bench.jpg');
      expect(steps[2].exerciseName).toBe('Squat');
      expect(steps[2].exerciseImage).toBe('squat.jpg');
    });

    it('cancels an existing rest notification before replacing state', () => {
      useActiveWorkoutStore.setState({
        rest: {
          state: 'resting',
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
    it('seeds all strictly-prior set IDs as completed and sets activeSetId to target', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '102');
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionId).toBe('session-1');
      expect(state.completedSetIds).toEqual({ '101': true });
      expect(state.activeSetId).toBe('102');
      expect(state.rest.state).toBe('ready');
    });

    it('seeds no completions when target is the first set', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '101');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({});
      expect(state.activeSetId).toBe('101');
      expect(state.rest.state).toBe('ready');
    });

    it('seeds all prior sets across exercises when target is the last set', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({ '101': true, '102': true });
      expect(state.activeSetId).toBe('201');
    });

    it('cancels a pre-existing rest notification before replacing state', () => {
      useActiveWorkoutStore.setState({
        rest: {
          state: 'resting',
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
      expect(state.activeSetId).toBeNull();
    });
  });

  describe('completeActiveSet', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('marks the active set complete and advances activeSetId to the next step', async () => {
      useActiveWorkoutStore.getState().completeActiveSet();
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['101']).toBe(true);
      expect(state.activeSetId).toBe('102');
      expect(state.rest.state).toBe('resting');
      expect(state.rest.endsAt).toBe(FIXED_NOW + 60000);
      expect(state.rest.instanceToken).toBeGreaterThan(0);
      await flushPromises();
    });

    it('writes scheduled notification ID back into rest after async resolves', async () => {
      mockSchedule.mockResolvedValueOnce('notif-1');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().rest.scheduledNotificationId).toBe('notif-1');
    });

    it('cancels the prior rest notification when completing a second set', async () => {
      mockSchedule.mockResolvedValueOnce('notif-1');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      mockSchedule.mockResolvedValueOnce('notif-2');
      useActiveWorkoutStore.getState().completeActiveSet();
      expect(mockCancel).toHaveBeenCalledWith('notif-1');
      await flushPromises();
    });

    it('advances through every set in order', async () => {
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('102');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('201');
    });

    it('completing the last set finishes the workout without starting a rest', async () => {
      // Advance to the final set.
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('201');

      mockSchedule.mockClear();
      useActiveWorkoutStore.getState().completeActiveSet();
      const state = useActiveWorkoutStore.getState();

      expect(state.completedSetIds).toEqual({ '101': true, '102': true, '201': true });
      expect(state.activeSetId).toBeNull();
      expect(state.rest.state).toBe('ready');
      // Session snapshot + steps stay put — the user still has to hit X.
      expect(state.sessionId).toBe('session-1');
      expect(state.steps.length).toBeGreaterThan(0);
      // Critically, no final rest timer is scheduled.
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('cancels a still-pending rest when completing the last set', async () => {
      // Complete sets 1 and 2 so the cursor sits on 201 with a running rest.
      mockSchedule.mockResolvedValueOnce('notif-1');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      mockSchedule.mockResolvedValueOnce('notif-2');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      mockCancel.mockClear();
      useActiveWorkoutStore.getState().completeActiveSet();
      expect(mockCancel).toHaveBeenCalledWith('notif-2');
    });

    it('late-schedule-after-pause cancels the late-arriving ID', async () => {
      let resolveSchedule: (id: string) => void = () => {};
      mockSchedule.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSchedule = resolve;
          }),
      );

      useActiveWorkoutStore.getState().completeActiveSet();
      useActiveWorkoutStore.getState().pauseRest();
      resolveSchedule('late-notif');
      await flushPromises();

      expect(mockCancel).toHaveBeenCalledWith('late-notif');
      expect(useActiveWorkoutStore.getState().rest.scheduledNotificationId).toBeNull();
    });

    it('late-schedule-after-clear cancels the late-arriving ID', async () => {
      let resolveSchedule: (id: string) => void = () => {};
      mockSchedule.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSchedule = resolve;
          }),
      );

      useActiveWorkoutStore.getState().completeActiveSet();
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

      useActiveWorkoutStore.getState().completeActiveSet();
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

      useActiveWorkoutStore.getState().completeActiveSet();

      mockSchedule.mockResolvedValueOnce('notif-B');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      resolveA('notif-A-late');
      await flushPromises();

      expect(mockCancel).toHaveBeenCalledWith('notif-A-late');
      expect(useActiveWorkoutStore.getState().rest.scheduledNotificationId).toBe('notif-B');
    });

    it('is a no-op when there is no active set', () => {
      useActiveWorkoutStore.setState({ activeSetId: null });
      useActiveWorkoutStore.getState().completeActiveSet();
      expect(mockSchedule).not.toHaveBeenCalled();
    });
  });

  describe('uncompleteSet', () => {
    beforeEach(async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
    });

    it('removes the set from completedSetIds without touching activeSetId or rest', () => {
      const before = useActiveWorkoutStore.getState();
      expect(before.completedSetIds['101']).toBe(true);
      expect(before.activeSetId).toBe('102');

      useActiveWorkoutStore.getState().uncompleteSet('101');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['101']).toBeUndefined();
      expect(state.activeSetId).toBe('102'); // cursor does NOT jump back
      expect(state.rest.state).toBe('resting');
    });

    it('is a no-op when the set is not completed', () => {
      const before = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().uncompleteSet('201');
      expect(useActiveWorkoutStore.getState()).toEqual(before);
    });
  });

  describe('recompleteSet', () => {
    beforeEach(async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      // Cursor is now on 102 with a running rest. Uncheck 101 to simulate
      // an accidental uncheck.
      useActiveWorkoutStore.getState().uncompleteSet('101');
    });

    it('re-marks a set complete without moving activeSetId or touching rest', () => {
      const before = useActiveWorkoutStore.getState();
      expect(before.completedSetIds['101']).toBeUndefined();
      expect(before.activeSetId).toBe('102');
      expect(before.rest.state).toBe('resting');

      useActiveWorkoutStore.getState().recompleteSet('101');
      const after = useActiveWorkoutStore.getState();
      expect(after.completedSetIds['101']).toBe(true);
      expect(after.activeSetId).toBe('102');
      expect(after.rest).toBe(before.rest); // same reference — rest untouched
    });

    it('is a no-op when the set is already complete', () => {
      // Re-mark 101, then try again.
      useActiveWorkoutStore.getState().recompleteSet('101');
      const before = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().recompleteSet('101');
      expect(useActiveWorkoutStore.getState()).toEqual(before);
    });

    it('is a no-op when the setId does not exist in steps', () => {
      const before = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().recompleteSet('nope');
      expect(useActiveWorkoutStore.getState()).toEqual(before);
    });

    it('works after the workout has finished (activeSetId === null)', async () => {
      // Complete everything through to the end.
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBeNull();

      // Uncheck the last set, then recheck it.
      useActiveWorkoutStore.getState().uncompleteSet('201');
      expect(useActiveWorkoutStore.getState().completedSetIds['201']).toBeUndefined();
      useActiveWorkoutStore.getState().recompleteSet('201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['201']).toBe(true);
      expect(state.activeSetId).toBeNull(); // stays finished
    });
  });

  describe('jumpToSet', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('moves activeSetId forward and seeds priors as completed', () => {
      useActiveWorkoutStore.getState().jumpToSet('201');
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('201');
      expect(state.completedSetIds).toEqual({ '101': true, '102': true });
      expect(state.rest.state).toBe('ready');
    });

    it('cancels a running rest notification on jump', async () => {
      mockSchedule.mockResolvedValueOnce('notif-pre-jump');
      useActiveWorkoutStore.getState().completeActiveSet(); // cursor → 102, rest running
      await flushPromises();

      useActiveWorkoutStore.getState().jumpToSet('201');
      expect(mockCancel).toHaveBeenCalledWith('notif-pre-jump');
      expect(useActiveWorkoutStore.getState().rest.state).toBe('ready');
    });

    it('is a no-op on backward targets', async () => {
      // Advance to 102.
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      const before = useActiveWorkoutStore.getState();

      useActiveWorkoutStore.getState().jumpToSet('101');
      const after = useActiveWorkoutStore.getState();
      // Nothing changed.
      expect(after.activeSetId).toBe(before.activeSetId);
      expect(after.completedSetIds).toEqual(before.completedSetIds);
      expect(after.rest).toBe(before.rest);
    });

    it('is a no-op when jumping to the active set itself', async () => {
      const before = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().jumpToSet('101');
      expect(useActiveWorkoutStore.getState()).toEqual(before);
    });

    it('is a no-op when setId does not exist', () => {
      const before = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().jumpToSet('nope');
      expect(useActiveWorkoutStore.getState()).toEqual(before);
    });
  });

  describe('pauseRest / resumeRest', () => {
    beforeEach(async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      mockSchedule.mockResolvedValueOnce('notif-resting');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
    });

    it('pauseRest captures remaining ms and cancels notification', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 10_000));
      useActiveWorkoutStore.getState().pauseRest();
      const { rest } = useActiveWorkoutStore.getState();
      expect(rest.state).toBe('paused');
      expect(rest.endsAt).toBeNull();
      expect(rest.pausedRemainingMs).toBe(50_000);
      expect(rest.scheduledNotificationId).toBeNull();
      expect(mockCancel).toHaveBeenCalledWith('notif-resting');
    });

    it('pauseRest is a no-op when not resting', () => {
      useActiveWorkoutStore.getState().pauseRest();
      const first = useActiveWorkoutStore.getState().rest;
      useActiveWorkoutStore.getState().pauseRest();
      expect(useActiveWorkoutStore.getState().rest).toBe(first);
    });

    it('resumeRest computes endsAt from pausedRemainingMs and reschedules', async () => {
      jest.setSystemTime(new Date(FIXED_NOW + 10_000));
      useActiveWorkoutStore.getState().pauseRest();

      jest.setSystemTime(new Date(FIXED_NOW + 30_000));
      mockSchedule.mockResolvedValueOnce('notif-resumed');
      useActiveWorkoutStore.getState().resumeRest();
      const { rest } = useActiveWorkoutStore.getState();
      expect(rest.state).toBe('resting');
      expect(rest.endsAt).toBe(FIXED_NOW + 80_000);
      expect(rest.pausedRemainingMs).toBeNull();
      // Rest is before the active set, which is now set 102 (Bench Press).
      expect(mockSchedule).toHaveBeenLastCalledWith('Bench Press', 50);
      await flushPromises();
      expect(useActiveWorkoutStore.getState().rest.scheduledNotificationId).toBe(
        'notif-resumed',
      );
    });

    it('resumeRest is a no-op when not paused', () => {
      const before = useActiveWorkoutStore.getState().rest;
      useActiveWorkoutStore.getState().resumeRest();
      expect(useActiveWorkoutStore.getState().rest).toBe(before);
    });

    it('pause → advance clock → resume preserves remaining time', async () => {
      jest.setSystemTime(new Date(FIXED_NOW + 20_000));
      useActiveWorkoutStore.getState().pauseRest();
      const remaining = useActiveWorkoutStore.getState().rest.pausedRemainingMs;
      expect(remaining).toBe(40_000);

      jest.setSystemTime(new Date(FIXED_NOW + 1_000_000));
      mockSchedule.mockResolvedValueOnce('notif-resumed');
      useActiveWorkoutStore.getState().resumeRest();
      expect(useActiveWorkoutStore.getState().rest.endsAt).toBe(FIXED_NOW + 1_040_000);
      await flushPromises();
    });
  });

  describe('markRestReady', () => {
    beforeEach(async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      mockSchedule.mockResolvedValueOnce('notif-abc');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
    });

    it('is a no-op when not resting', () => {
      useActiveWorkoutStore.getState().pauseRest();
      mockHaptic.mockClear();
      useActiveWorkoutStore.getState().markRestReady();
      expect(useActiveWorkoutStore.getState().rest.state).toBe('paused');
      expect(mockHaptic).not.toHaveBeenCalled();
    });

    it('is a no-op when Date.now() < endsAt (pause-right-before-zero guard)', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 59_950));
      const before = useActiveWorkoutStore.getState().rest;
      mockHaptic.mockClear();
      useActiveWorkoutStore.getState().markRestReady();
      expect(useActiveWorkoutStore.getState().rest).toEqual(before);
      expect(mockHaptic).not.toHaveBeenCalled();
    });

    it('transitions to ready and fires haptic when past endsAt', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 60_001));
      mockHaptic.mockClear();
      useActiveWorkoutStore.getState().markRestReady();
      const { rest } = useActiveWorkoutStore.getState();
      expect(rest.state).toBe('ready');
      expect(rest.endsAt).toBeNull();
      expect(rest.scheduledNotificationId).toBeNull();
      expect(mockCancel).toHaveBeenCalledWith('notif-abc');
      expect(mockHaptic).toHaveBeenCalledTimes(1);
    });

    it('leaves activeSetId untouched (cursor stays until user completes the set)', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 60_001));
      const before = useActiveWorkoutStore.getState().activeSetId;
      useActiveWorkoutStore.getState().markRestReady();
      expect(useActiveWorkoutStore.getState().activeSetId).toBe(before);
    });
  });

  describe('dismissRest', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('cancels scheduled notification and clears rest to ready', async () => {
      mockSchedule.mockResolvedValueOnce('notif-dismiss');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      useActiveWorkoutStore.getState().dismissRest();
      const state = useActiveWorkoutStore.getState();
      expect(state.rest.state).toBe('ready');
      expect(state.rest.endsAt).toBeNull();
      expect(mockCancel).toHaveBeenCalledWith('notif-dismiss');
      // activeSetId is unchanged — dismiss doesn't advance the cursor.
      expect(state.activeSetId).toBe('102');
    });

    it('is a no-op when rest is already ready', () => {
      const before = useActiveWorkoutStore.getState().rest;
      useActiveWorkoutStore.getState().dismissRest();
      expect(useActiveWorkoutStore.getState().rest).toBe(before);
    });

    it('does not reset the workout when all sets become complete', async () => {
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      // Final-set completion already puts rest back in 'ready', but dismiss
      // must still not wipe session state.
      useActiveWorkoutStore.getState().dismissRest();
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionId).toBe('session-1');
      expect(state.activeSetId).toBeNull();
    });
  });

  describe('clearWorkout', () => {
    it('cancels pending notification and resets state', async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      mockSchedule.mockResolvedValueOnce('notif-clear');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      useActiveWorkoutStore.getState().clearWorkout();
      expect(mockCancel).toHaveBeenCalledWith('notif-clear');
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionId).toBeNull();
      expect(state.steps).toEqual([]);
      expect(state.completedSetIds).toEqual({});
      expect(state.activeSetId).toBeNull();
      expect(state.rest.state).toBe('ready');
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
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      const updated = makeSession();
      updated.exercises[0].sets[0].weight = 65; // editing weight
      useActiveWorkoutStore.getState().reconcileWithSession(updated);

      expect(useActiveWorkoutStore.getState().completedSetIds['101']).toBe(true);
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('102');
    });

    it('drops completedSetIds entries whose IDs no longer exist', async () => {
      // Advance past 101 and 102 so both are complete.
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      const updated = makeSession();
      updated.exercises[0].sets = [updated.exercises[0].sets[0]]; // drop set 102
      useActiveWorkoutStore.getState().reconcileWithSession(updated);

      expect(useActiveWorkoutStore.getState().completedSetIds['102']).toBeUndefined();
    });

    it('falls back to first uncompleted step when active set is removed', async () => {
      // Complete set 101 so cursor is on 102, rest running.
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('102');

      // Remove set 102.
      const updated = makeSession();
      updated.exercises[0].sets = [updated.exercises[0].sets[0]];

      useActiveWorkoutStore.getState().reconcileWithSession(updated);
      const state = useActiveWorkoutStore.getState();

      expect(state.activeSetId).toBe('201'); // first remaining uncompleted
      expect(state.rest.state).toBe('ready'); // rest cleared since cursor moved
      expect(state.sessionId).toBe('session-1');
      expect(state.steps.length).toBeGreaterThan(0);
    });

    it('sets activeSetId to null when every remaining step is already complete', async () => {
      // Complete all three sets.
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBeNull();

      // Reconcile with an identical session.
      useActiveWorkoutStore.getState().reconcileWithSession(makeSession());
      expect(useActiveWorkoutStore.getState().activeSetId).toBeNull();
    });

    it('leaves rest intact when the active set still exists', async () => {
      mockSchedule.mockResolvedValueOnce('notif-keep');
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();

      const updated = makeSession();
      updated.exercises[1].sets[0].weight = 105;
      useActiveWorkoutStore.getState().reconcileWithSession(updated);

      expect(useActiveWorkoutStore.getState().rest.state).toBe('resting');
      expect(useActiveWorkoutStore.getState().rest.scheduledNotificationId).toBe(
        'notif-keep',
      );
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('102');
    });

    it('adds new steps for newly-added sets without touching existing completion', async () => {
      useActiveWorkoutStore.getState().completeActiveSet();
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
    it('rehydration with resting + expired endsAt snaps to ready (no phantom haptic)', async () => {
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
          activeSetId: '102',
          rest: {
            state: 'resting',
            durationSec: 60,
            endsAt: now - 60_000,
            pausedRemainingMs: null,
            scheduledNotificationId: 'notif-old',
            instanceToken: 1,
          },
        },
        version: 2,
      };
      mockHaptic.mockClear();
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().rest;
      expect(rest.state).toBe('ready');
      expect(rest.endsAt).toBeNull();
      expect(rest.scheduledNotificationId).toBeNull();
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
          activeSetId: '101',
          rest: {
            state: 'resting',
            durationSec: 60,
            endsAt: now + 60_000,
            pausedRemainingMs: null,
            scheduledNotificationId: 'notif-future',
            instanceToken: 1,
          },
        },
        version: 2,
      };
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().rest;
      expect(rest.state).toBe('resting');
      expect(rest.endsAt).toBe(now + 60_000);
    });

    describe('v1 → v2 migration', () => {
      function buildV1Payload(activeRest: unknown, extras: Record<string, unknown> = {}) {
        return {
          state: {
            sessionId: 'session-1',
            session: null,
            steps: [
              {
                exerciseId: 'ex-uuid-1',
                setId: '101',
                exerciseName: 'Bench Press',
                exerciseImage: 'bench.jpg',
                restSec: 60,
              },
              {
                exerciseId: 'ex-uuid-1',
                setId: '102',
                exerciseName: 'Bench Press',
                exerciseImage: 'bench.jpg',
                restSec: 60,
              },
              {
                exerciseId: 'ex-uuid-2',
                setId: '201',
                exerciseName: 'Squat',
                exerciseImage: 'squat.jpg',
                restSec: 120,
              },
            ],
            completedSetIds: { '101': true },
            activeRest,
            ...extras,
          },
          version: 1,
        };
      }

      it('derives activeSetId from first uncompleted step and remaps running → resting', async () => {
        jest.useRealTimers();
        const now = Date.now();
        const persisted = buildV1Payload({
          setId: '101',
          state: 'running',
          durationSec: 60,
          endsAt: now + 30_000,
          pausedRemainingMs: null,
          scheduledNotificationId: 'notif-carried-over',
          instanceToken: 7,
        });
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.sessionId).toBe('session-1');
        expect(state.activeSetId).toBe('102');
        expect(state.completedSetIds).toEqual({ '101': true });
        expect(state.rest.state).toBe('resting');
        expect(state.rest.endsAt).toBe(now + 30_000);
        expect(state.rest.scheduledNotificationId).toBe('notif-carried-over');
        expect(state.rest.instanceToken).toBe(7);
      });

      it('remaps paused rest', async () => {
        jest.useRealTimers();
        const persisted = buildV1Payload({
          setId: '101',
          state: 'paused',
          durationSec: 60,
          endsAt: null,
          pausedRemainingMs: 25_000,
          scheduledNotificationId: null,
          instanceToken: 3,
        });
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('102');
        expect(state.rest.state).toBe('paused');
        expect(state.rest.pausedRemainingMs).toBe(25_000);
        expect(state.rest.durationSec).toBe(60);
      });

      it('collapses complete rest to ready', async () => {
        jest.useRealTimers();
        const persisted = buildV1Payload({
          setId: '101',
          state: 'complete',
          durationSec: 60,
          endsAt: null,
          pausedRemainingMs: null,
          scheduledNotificationId: null,
          instanceToken: 5,
        });
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('102');
        expect(state.rest.state).toBe('ready');
        expect(state.rest.endsAt).toBeNull();
      });

      it('collapses null activeRest to ready', async () => {
        jest.useRealTimers();
        const persisted = buildV1Payload(null);
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('102');
        expect(state.rest.state).toBe('ready');
      });

      it('sets activeSetId to null when every step is already completed', async () => {
        jest.useRealTimers();
        const persisted = buildV1Payload(null, {
          completedSetIds: { '101': true, '102': true, '201': true },
        });
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBeNull();
        expect(state.rest.state).toBe('ready');
        expect(state.sessionId).toBe('session-1');
      });

      it('drops carried-over rest when activeSetId ends up null', async () => {
        jest.useRealTimers();
        // Every set complete + stale 'running' activeRest from v1 — migration
        // should not hand back a rest with no set to attach it to.
        const persisted = buildV1Payload(
          {
            setId: '201',
            state: 'running',
            durationSec: 60,
            endsAt: Date.now() + 60_000,
            pausedRemainingMs: null,
            scheduledNotificationId: 'stale',
            instanceToken: 9,
          },
          { completedSetIds: { '101': true, '102': true, '201': true } },
        );
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBeNull();
        expect(state.rest.state).toBe('ready');
        expect(state.rest.scheduledNotificationId).toBeNull();
      });

      it('v1 → v2 with running + already-expired endsAt snaps to ready via merge', async () => {
        jest.useRealTimers();
        const now = Date.now();
        const persisted = buildV1Payload({
          setId: '101',
          state: 'running',
          durationSec: 60,
          endsAt: now - 1_000, // expired
          pausedRemainingMs: null,
          scheduledNotificationId: 'notif-old',
          instanceToken: 1,
        });
        mockHaptic.mockClear();
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        // migrate produces rest={state:'resting',endsAt:past}, then merge snaps to ready.
        expect(state.rest.state).toBe('ready');
        expect(state.rest.endsAt).toBeNull();
        expect(mockHaptic).not.toHaveBeenCalled();
      });
    });

    it('rehydration with paused state is left alone', async () => {
      jest.useRealTimers();
      const persisted = {
        state: {
          sessionId: 'session-1',
          steps: [],
          completedSetIds: {},
          activeSetId: '101',
          rest: {
            state: 'paused',
            durationSec: 60,
            endsAt: null,
            pausedRemainingMs: 30_000,
            scheduledNotificationId: null,
            instanceToken: 1,
          },
        },
        version: 2,
      };
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().rest;
      expect(rest.state).toBe('paused');
      expect(rest.pausedRemainingMs).toBe(30_000);
    });
  });
});
