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

    it('defaults createdByLiveStart to false', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      expect(useActiveWorkoutStore.getState().createdByLiveStart).toBe(false);
    });

    it('sets createdByLiveStart when the live-start option is passed', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession(), { createdByLiveStart: true });
      expect(useActiveWorkoutStore.getState().createdByLiveStart).toBe(true);
    });

    it('clearWorkout resets createdByLiveStart', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession(), { createdByLiveStart: true });
      useActiveWorkoutStore.getState().clearWorkout();
      expect(useActiveWorkoutStore.getState().createdByLiveStart).toBe(false);
    });

    it('startWorkoutAtSet always marks the session as not live-start-created', () => {
      useActiveWorkoutStore.setState({ createdByLiveStart: true });
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '102');
      expect(useActiveWorkoutStore.getState().createdByLiveStart).toBe(false);
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

  describe('startedAt', () => {
    it('startWorkout stamps startedAt with now', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      expect(useActiveWorkoutStore.getState().startedAt).toBe(FIXED_NOW);
    });

    it('startWorkoutAtSet stamps startedAt with now', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '102');
      expect(useActiveWorkoutStore.getState().startedAt).toBe(FIXED_NOW);
    });

    it('clearWorkout resets startedAt to null', () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      useActiveWorkoutStore.getState().clearWorkout();
      expect(useActiveWorkoutStore.getState().startedAt).toBeNull();
    });
  });

  describe('adjustRest', () => {
    beforeEach(async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      mockSchedule.mockResolvedValueOnce('notif-initial');
      useActiveWorkoutStore.getState().completeActiveSet(); // rest 60s before set 102
      await flushPromises();
    });

    it('is a no-op when rest is ready', () => {
      useActiveWorkoutStore.getState().dismissRest();
      const before = useActiveWorkoutStore.getState().rest;
      mockSchedule.mockClear();
      useActiveWorkoutStore.getState().adjustRest(15);
      expect(useActiveWorkoutStore.getState().rest).toBe(before);
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('resting +15 extends endsAt and durationSec and reschedules the notification', async () => {
      jest.setSystemTime(new Date(FIXED_NOW + 10_000)); // 50s remaining
      mockCancel.mockClear();
      mockSchedule.mockResolvedValueOnce('notif-extended');

      useActiveWorkoutStore.getState().adjustRest(15);
      const { rest } = useActiveWorkoutStore.getState();
      expect(rest.state).toBe('resting');
      expect(rest.endsAt).toBe(FIXED_NOW + 75_000); // 60s + 15s
      expect(rest.durationSec).toBe(75);
      expect(mockCancel).toHaveBeenCalledWith('notif-initial');
      // Rescheduled for the remaining 65s, labeled with the active step's exercise.
      expect(mockSchedule).toHaveBeenLastCalledWith('Bench Press', 65);
      await flushPromises();
      expect(useActiveWorkoutStore.getState().rest.scheduledNotificationId).toBe(
        'notif-extended',
      );
    });

    it('resting −15 shortens the deadline', async () => {
      mockSchedule.mockResolvedValueOnce('notif-shortened');
      useActiveWorkoutStore.getState().adjustRest(-15);
      const { rest } = useActiveWorkoutStore.getState();
      expect(rest.endsAt).toBe(FIXED_NOW + 45_000);
      expect(rest.durationSec).toBe(45);
      await flushPromises();
    });

    it('resting −delta crossing zero behaves like markRestReady (haptic, ready)', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 50_000)); // 10s remaining
      mockHaptic.mockClear();
      mockCancel.mockClear();
      mockSchedule.mockClear();

      useActiveWorkoutStore.getState().adjustRest(-15);
      const { rest, activeSetId } = useActiveWorkoutStore.getState();
      expect(rest.state).toBe('ready');
      expect(rest.endsAt).toBeNull();
      expect(mockHaptic).toHaveBeenCalledTimes(1);
      expect(mockCancel).toHaveBeenCalledWith('notif-initial');
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(activeSetId).toBe('102'); // cursor untouched
    });

    it('late-resolving reschedule from adjustRest is cancelled if the rest was replaced', async () => {
      let resolveSchedule: (id: string) => void = () => {};
      mockSchedule.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSchedule = resolve;
          }),
      );

      useActiveWorkoutStore.getState().adjustRest(15);
      useActiveWorkoutStore.getState().dismissRest();
      resolveSchedule('late-adjust-notif');
      await flushPromises();

      expect(mockCancel).toHaveBeenCalledWith('late-adjust-notif');
      expect(useActiveWorkoutStore.getState().rest.scheduledNotificationId).toBeNull();
    });

    it('paused +15 adjusts pausedRemainingMs without scheduling', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 10_000));
      useActiveWorkoutStore.getState().pauseRest(); // 50s remaining
      mockSchedule.mockClear();

      useActiveWorkoutStore.getState().adjustRest(15);
      const { rest } = useActiveWorkoutStore.getState();
      expect(rest.state).toBe('paused');
      expect(rest.pausedRemainingMs).toBe(65_000);
      expect(rest.durationSec).toBe(75);
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('paused −delta crossing zero snaps to ready with haptic', () => {
      jest.setSystemTime(new Date(FIXED_NOW + 50_000));
      useActiveWorkoutStore.getState().pauseRest(); // 10s remaining
      mockHaptic.mockClear();

      useActiveWorkoutStore.getState().adjustRest(-15);
      const { rest } = useActiveWorkoutStore.getState();
      expect(rest.state).toBe('ready');
      expect(mockHaptic).toHaveBeenCalledTimes(1);
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

  describe('session edit actions', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    describe('updateSetField', () => {
      it('patches the set, bumps sessionRevision, and marks unsaved changes', () => {
        useActiveWorkoutStore.getState().updateSetField('101', { weight: 65, rpe: 8 });
        const state = useActiveWorkoutStore.getState();
        const set0 = state.session!.exercises[0].sets[0];
        expect(set0.weight).toBe(65);
        expect(set0.rpe).toBe(8);
        expect(set0.reps).toBe(10); // untouched fields preserved
        expect(state.sessionRevision).toBe(1);
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('does not disturb completion, cursor, or a running rest', async () => {
        mockSchedule.mockResolvedValueOnce('notif-live');
        useActiveWorkoutStore.getState().completeActiveSet(); // cursor → 102, rest running
        await flushPromises();
        const restBefore = useActiveWorkoutStore.getState().rest;

        useActiveWorkoutStore.getState().updateSetField('102', { weight: 72.5 });
        const state = useActiveWorkoutStore.getState();
        expect(state.completedSetIds['101']).toBe(true);
        expect(state.activeSetId).toBe('102');
        expect(state.rest).toBe(restBefore);
      });

      it('is a no-op for an unknown set id', () => {
        useActiveWorkoutStore.getState().updateSetField('nope', { weight: 1 });
        const state = useActiveWorkoutStore.getState();
        expect(state.sessionRevision).toBe(0);
        expect(state.hasUnsavedChanges).toBe(false);
      });
    });

    describe('addSetToExercise', () => {
      it('appends a clone of the last set with a negative temp id, without its outcomes', () => {
        useActiveWorkoutStore.getState().updateSetField('102', { rpe: 9 });
        useActiveWorkoutStore.getState().addSetToExercise('ex-uuid-1');
        const state = useActiveWorkoutStore.getState();
        const sets = state.session!.exercises[0].sets;
        expect(sets).toHaveLength(3);
        expect(sets[2].id).toBe(-1);
        expect(sets[2].set_number).toBe(3);
        expect(sets[2].weight).toBe(70); // plan cloned from set 102
        expect(sets[2].reps).toBe(8);
        expect(sets[2].rpe).toBeNull(); // outcomes not cloned
        expect(sets[2].notes).toBeNull();
        expect(state.steps.map((s) => s.setId)).toEqual(['101', '102', '-1', '201']);
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('derives successive negative temp ids from the session (restart-safe)', () => {
        useActiveWorkoutStore.getState().addSetToExercise('ex-uuid-1');
        useActiveWorkoutStore.getState().addSetToExercise('ex-uuid-2');
        const state = useActiveWorkoutStore.getState();
        expect(state.session!.exercises[0].sets[2].id).toBe(-1);
        expect(state.session!.exercises[1].sets[1].id).toBe(-2);
      });

      it('re-activates a finished workout when a set is added', async () => {
        useActiveWorkoutStore.getState().completeActiveSet();
        await flushPromises();
        useActiveWorkoutStore.getState().completeActiveSet();
        await flushPromises();
        useActiveWorkoutStore.getState().completeActiveSet();
        await flushPromises();
        expect(useActiveWorkoutStore.getState().activeSetId).toBeNull();

        useActiveWorkoutStore.getState().addSetToExercise('ex-uuid-2');
        expect(useActiveWorkoutStore.getState().activeSetId).toBe('-1');
      });

      it('is a no-op for an unknown exercise entry id', () => {
        useActiveWorkoutStore.getState().addSetToExercise('nope');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      });
    });

    describe('deleteSet', () => {
      it('removes the set and renumbers the remaining ones', () => {
        useActiveWorkoutStore.getState().deleteSet('101');
        const state = useActiveWorkoutStore.getState();
        const sets = state.session!.exercises[0].sets;
        expect(sets).toHaveLength(1);
        expect(sets[0].id).toBe(102);
        expect(sets[0].set_number).toBe(1);
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('prunes completion for the deleted set', async () => {
        useActiveWorkoutStore.getState().completeActiveSet();
        await flushPromises();
        expect(useActiveWorkoutStore.getState().completedSetIds['101']).toBe(true);

        useActiveWorkoutStore.getState().deleteSet('101');
        expect(useActiveWorkoutStore.getState().completedSetIds['101']).toBeUndefined();
      });

      it('moves the cursor forward and clears rest when the active set is deleted', async () => {
        mockSchedule.mockResolvedValueOnce('notif-doomed');
        useActiveWorkoutStore.getState().completeActiveSet(); // cursor → 102, resting
        await flushPromises();

        useActiveWorkoutStore.getState().deleteSet('102');
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('201');
        expect(state.rest.state).toBe('ready');
        expect(mockCancel).toHaveBeenCalledWith('notif-doomed');
      });

      it("deleting an exercise's only set removes the exercise from the session", () => {
        useActiveWorkoutStore.getState().deleteSet('201');
        const state = useActiveWorkoutStore.getState();
        expect(state.session!.exercises).toHaveLength(1);
        expect(state.session!.exercises[0].id).toBe('ex-uuid-1');
        expect(state.steps.map((s) => s.setId)).toEqual(['101', '102']);
      });

      it('is a no-op for an unknown set id', () => {
        useActiveWorkoutStore.getState().deleteSet('nope');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      });
    });

    describe('setExerciseRest', () => {
      it('sets rest_time on every set of the exercise and refreshes step restSec', () => {
        useActiveWorkoutStore.getState().setExerciseRest('ex-uuid-1', 150);
        const state = useActiveWorkoutStore.getState();
        expect(state.session!.exercises[0].sets.map((s) => s.rest_time)).toEqual([150, 150]);
        expect(state.session!.exercises[1].sets[0].rest_time).toBe(120); // other exercise untouched
        expect(state.steps[0].restSec).toBe(150);
        expect(state.steps[1].restSec).toBe(150);
        expect(state.steps[2].restSec).toBe(120);
        expect(state.hasUnsavedChanges).toBe(true);
      });
    });

    describe('addExercise', () => {
      const newExercise = {
        id: 'ex-3',
        name: 'Deadlift',
        category: 'Strength',
        equipment: ['barbell'],
        primary_muscles: ['back'],
        secondary_muscles: [],
        calories_per_hour: 450,
        source: 'system',
        images: ['deadlift.jpg'],
        tags: [],
      };

      it('appends a temp-id entry with a snapshot and one default set', () => {
        useActiveWorkoutStore.getState().addExercise(newExercise);
        const state = useActiveWorkoutStore.getState();
        const entry = state.session!.exercises[2];
        expect(entry.id).toBe('temp-1');
        expect(entry.exercise_id).toBe('ex-3');
        expect(entry.exercise_snapshot?.name).toBe('Deadlift');
        expect(entry.exercise_snapshot?.images).toEqual(['deadlift.jpg']);
        expect(entry.sets).toHaveLength(1);
        expect(entry.sets[0].id).toBe(-1);
        expect(entry.sets[0].set_type).toBe('normal');
        expect(entry.sets[0].rest_time).toBe(90);
        expect(state.steps).toHaveLength(4);
        expect(state.steps[3].exerciseName).toBe('Deadlift');
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('assigns unique temp ids for successive adds', () => {
        useActiveWorkoutStore.getState().addExercise(newExercise);
        useActiveWorkoutStore.getState().addExercise({ ...newExercise, id: 'ex-4', name: 'Row' });
        const exercises = useActiveWorkoutStore.getState().session!.exercises;
        expect(exercises[2].id).toBe('temp-1');
        expect(exercises[3].id).toBe('temp-2');
        expect(exercises[2].sets[0].id).toBe(-1);
        expect(exercises[3].sets[0].id).toBe(-2);
      });
    });
  });

  describe('applyServerSession', () => {
    /** Same shape as makeSession() but with server-recreated ids. */
    function makeRecreatedSession(): PresetSessionResponse {
      const session = makeSession();
      session.exercises[0].id = 'ex-uuid-1-new';
      session.exercises[0].sets[0].id = 501;
      session.exercises[0].sets[1].id = 502;
      session.exercises[1].id = 'ex-uuid-2-new';
      session.exercises[1].sets[0].id = 601;
      return session;
    }

    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('adopts the server session wholesale when no edits landed mid-flight', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      const response = makeRecreatedSession();
      response.exercises[0].sets[0].weight = 65;
      useActiveWorkoutStore.getState().applyServerSession(response, sentRevision);

      const state = useActiveWorkoutStore.getState();
      expect(state.session).toBe(response);
      expect(state.steps.map((s) => s.setId)).toEqual(['501', '502', '601']);
      expect(state.hasUnsavedChanges).toBe(false);
      expect(state.sessionRevision).toBe(sentRevision);
    });

    it('remaps completion and cursor positionally across a recreate save', async () => {
      useActiveWorkoutStore.getState().completeActiveSet(); // 101 done, cursor → 102
      await flushPromises();
      useActiveWorkoutStore.getState().updateSetField('102', { weight: 72.5 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision);
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({ '501': true });
      expect(state.activeSetId).toBe('502');
    });

    it('preserves a running rest when the cursor id changes but the logical set survives', async () => {
      mockSchedule.mockResolvedValueOnce('notif-keep-across-recreate');
      useActiveWorkoutStore.getState().completeActiveSet(); // cursor → 102, resting
      await flushPromises();
      useActiveWorkoutStore.getState().updateSetField('102', { weight: 72.5 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;
      const restBefore = useActiveWorkoutStore.getState().rest;
      mockCancel.mockClear();

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision);
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('502');
      expect(state.rest).toBe(restBefore); // untouched — no cancel, no reset
      expect(mockCancel).not.toHaveBeenCalled();
    });

    it('falls back and clears rest only when the logical target set is gone', async () => {
      mockSchedule.mockResolvedValueOnce('notif-clear-me');
      useActiveWorkoutStore.getState().completeActiveSet(); // cursor → 102, resting
      await flushPromises();
      useActiveWorkoutStore.getState().updateSetField('102', { weight: 72.5 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      // Server response lost exercise 1's second set (position gone).
      const response = makeRecreatedSession();
      response.exercises[0].sets = [response.exercises[0].sets[0]];
      useActiveWorkoutStore.getState().applyServerSession(response, sentRevision);

      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('601'); // first uncompleted remaining
      expect(state.rest.state).toBe('ready');
      expect(mockCancel).toHaveBeenCalledWith('notif-clear-me');
    });

    it('add-mid-flight: grafts ids positionally, keeps the temp set, and stays dirty', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      // A set is added while the save is in flight.
      useActiveWorkoutStore.getState().addSetToExercise('ex-uuid-1');
      useActiveWorkoutStore.getState().updateSetField('-1', { weight: 80 });

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision);
      const state = useActiveWorkoutStore.getState();
      const ex1Sets = state.session!.exercises[0].sets;
      expect(ex1Sets.map((s) => s.id)).toEqual([501, 502, -1]); // temp id survives
      expect(ex1Sets[0].weight).toBe(65); // local values kept
      expect(ex1Sets[2].weight).toBe(80);
      expect(state.session!.exercises[0].id).toBe('ex-uuid-1-new');
      expect(state.hasUnsavedChanges).toBe(true);
      expect(state.steps.map((s) => s.setId)).toEqual(['501', '502', '-1', '601']);
    });

    it('delete-mid-flight: index-clamped graft keeps local shape and stays dirty', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      // Set 102 is deleted while the save is in flight.
      useActiveWorkoutStore.getState().deleteSet('102');

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision);
      const state = useActiveWorkoutStore.getState();
      const ex1Sets = state.session!.exercises[0].sets;
      expect(ex1Sets).toHaveLength(1); // local delete preserved
      expect(ex1Sets[0].id).toBe(501); // grafted from same position
      expect(ex1Sets[0].weight).toBe(65);
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('graft branch remaps completion and cursor through the id map', async () => {
      useActiveWorkoutStore.getState().completeActiveSet(); // 101 done, cursor → 102
      await flushPromises();
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;
      useActiveWorkoutStore.getState().addSetToExercise('ex-uuid-2'); // mid-flight edit
      const restBefore = useActiveWorkoutStore.getState().rest;

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision);
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({ '501': true });
      expect(state.activeSetId).toBe('502');
      expect(state.rest).toBe(restBefore); // graft never touches rest
    });

    it('keeps reconciled values when a WorkoutDetail save landed mid-flight', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      // WorkoutDetail edit-save reconciles a newer session (weight 70).
      const reconciled = makeSession();
      reconciled.exercises[0].sets[0].weight = 70;
      useActiveWorkoutStore.getState().reconcileWithSession(reconciled);

      // The stale autosave response (weight 65) lands afterwards.
      const response = makeSession();
      response.exercises[0].sets[0].weight = 65;
      useActiveWorkoutStore.getState().applyServerSession(response, sentRevision);

      const state = useActiveWorkoutStore.getState();
      expect(state.session!.exercises[0].sets[0].weight).toBe(70);
    });

    it('is a no-op for a foreign session id', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const before = useActiveWorkoutStore.getState();
      const foreign = makeRecreatedSession();
      foreign.id = 'session-other';
      useActiveWorkoutStore.getState().applyServerSession(foreign, before.sessionRevision);
      expect(useActiveWorkoutStore.getState().session).toBe(before.session);
    });

    it('is a no-op after the workout was cleared', () => {
      useActiveWorkoutStore.getState().clearWorkout();
      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), 0);
      expect(useActiveWorkoutStore.getState().sessionId).toBeNull();
      expect(useActiveWorkoutStore.getState().session).toBeNull();
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

    describe('v2 → v3 migration', () => {
      it('backfills startedAt with now when a session is live', async () => {
        jest.useRealTimers();
        const before = Date.now();
        const persisted = {
          state: {
            sessionId: 'session-1',
            session: null,
            steps: [],
            completedSetIds: {},
            activeSetId: '101',
            rest: {
              state: 'ready',
              durationSec: 0,
              endsAt: null,
              pausedRemainingMs: null,
              scheduledNotificationId: null,
              instanceToken: 0,
            },
          },
          version: 2,
        };
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const { startedAt } = useActiveWorkoutStore.getState();
        expect(startedAt).not.toBeNull();
        expect(startedAt!).toBeGreaterThanOrEqual(before);
        expect(startedAt!).toBeLessThanOrEqual(Date.now());
      });

      it('leaves startedAt null when no session is live', async () => {
        jest.useRealTimers();
        const persisted = {
          state: {
            sessionId: null,
            session: null,
            steps: [],
            completedSetIds: {},
            activeSetId: null,
            rest: {
              state: 'ready',
              durationSec: 0,
              endsAt: null,
              pausedRemainingMs: null,
              scheduledNotificationId: null,
              instanceToken: 0,
            },
          },
          version: 2,
        };
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        expect(useActiveWorkoutStore.getState().startedAt).toBeNull();
      });

      it('v1 payloads also gain a backfilled startedAt (chained migration)', async () => {
        jest.useRealTimers();
        const persisted = {
          state: {
            sessionId: 'session-1',
            session: null,
            steps: [
              {
                exerciseId: 'ex-uuid-1',
                setId: '101',
                exerciseName: 'Bench Press',
                exerciseImage: null,
                restSec: 60,
              },
            ],
            completedSetIds: {},
            activeRest: null,
          },
          version: 1,
        };
        await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('101');
        expect(state.startedAt).not.toBeNull();
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
