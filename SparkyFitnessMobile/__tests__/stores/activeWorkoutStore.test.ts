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
import { fireSelectionHaptic, fireSuccessHaptic } from '../../src/services/haptics';

jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteHaptic: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
  fireSelectionHaptic: jest.fn(),
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
const mockSuccessHaptic = fireSuccessHaptic as jest.MockedFunction<
  typeof fireSuccessHaptic
>;
const mockSelectionHaptic = fireSelectionHaptic as jest.MockedFunction<
  typeof fireSelectionHaptic
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
            completed_at: null,
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
            completed_at: null,
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
            completed_at: null,
          },
        ],
      } as any,
    ],
    ...overrides,
  };
}

/**
 * A superset of two exercises (X ids 301+, Y ids 401+) sharing one group, each
 * with `rounds` sets at a 90s group rest. Steps interleave rounds — X0, Y0, X1,
 * Y1, … — so the interior partner (Y) carries a step-baked 0 rest.
 */
function makeSupersetSession(rounds = 2): PresetSessionResponse {
  const makeSets = (base: number) =>
    Array.from({ length: rounds }, (_, i) => ({
      id: base + i,
      set_number: i + 1,
      set_type: 'working',
      reps: 8,
      weight: 50,
      duration: null,
      rest_time: 90,
      notes: null,
      rpe: null,
      completed_at: null,
    }));
  const makeMember = (entryId: string, exId: string, name: string, base: number) =>
    ({
      id: entryId,
      exercise_id: exId,
      duration_minutes: 0,
      calories_burned: 0,
      entry_date: '2026-03-20',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: null,
      superset_group: 1,
      exercise_snapshot: { id: exId, name, images: [`${exId}.jpg`] } as any,
      activity_details: [],
      sets: makeSets(base),
    }) as any;
  return makeSession({
    exercises: [
      makeMember('ex-x', 'x', 'Curl', 301),
      makeMember('ex-y', 'y', 'Pushdown', 401),
    ],
  });
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
    mockSuccessHaptic.mockClear();
    mockSelectionHaptic.mockClear();
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

    it('seeds completion from server completed_at and lands on the first uncompleted step', () => {
      const session = makeSession();
      session.exercises[0].sets[0].completed_at = '2026-03-20T10:00:00.000Z';
      useActiveWorkoutStore.getState().startWorkout(session);
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({
        '101': Date.parse('2026-03-20T10:00:00.000Z'),
      });
      expect(state.activeSetId).toBe('102');
      // Server already knows these completions — nothing to save.
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('lands the cursor on the first hole in a non-contiguous completion map', () => {
      const session = makeSession();
      session.exercises[0].sets[0].completed_at = '2026-03-20T10:00:00.000Z';
      session.exercises[1].sets[0].completed_at = '2026-03-20T10:05:00.000Z';
      useActiveWorkoutStore.getState().startWorkout(session);
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('102');
    });

    it('starts finished (activeSetId null) when every set is completed', () => {
      const session = makeSession();
      for (const exercise of session.exercises) {
        for (const s of exercise.sets) s.completed_at = '2026-03-20T10:00:00.000Z';
      }
      useActiveWorkoutStore.getState().startWorkout(session);
      expect(useActiveWorkoutStore.getState().activeSetId).toBeNull();
    });

    it('ignores unparseable completed_at values', () => {
      const session = makeSession();
      session.exercises[0].sets[0].completed_at = 'not-a-date';
      useActiveWorkoutStore.getState().startWorkout(session);
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({});
      expect(state.activeSetId).toBe('101');
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
      expect(state.completedSetIds).toEqual({ '101': FIXED_NOW });
      expect(state.activeSetId).toBe('102');
      expect(state.rest.state).toBe('ready');
      // The newly stamped prior needs to reach the server.
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('seeds no completions when target is the first set', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '101');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({});
      expect(state.activeSetId).toBe('101');
      expect(state.rest.state).toBe('ready');
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('preserves later server completions when restarting at an earlier set', () => {
      const session = makeSession();
      session.exercises[0].sets[0].completed_at = '2026-03-20T10:00:00.000Z';
      session.exercises[1].sets[0].completed_at = '2026-03-20T10:10:00.000Z';
      useActiveWorkoutStore.getState().startWorkoutAtSet(session, '102');
      const state = useActiveWorkoutStore.getState();
      // Resume-with-holes: the later set stays checked, nothing is cleared.
      expect(state.completedSetIds).toEqual({
        '101': Date.parse('2026-03-20T10:00:00.000Z'),
        '201': Date.parse('2026-03-20T10:10:00.000Z'),
      });
      expect(state.activeSetId).toBe('102');
      // No priors were newly stamped — nothing to save.
      expect(state.hasUnsavedChanges).toBe(false);
    });

    it('keeps server timestamps on already-completed priors and stamps only new ones', () => {
      const session = makeSession();
      session.exercises[0].sets[0].completed_at = '2026-03-20T10:00:00.000Z';
      useActiveWorkoutStore.getState().startWorkoutAtSet(session, '201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({
        '101': Date.parse('2026-03-20T10:00:00.000Z'),
        '102': FIXED_NOW,
      });
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('seeds all prior sets across exercises when target is the last set', () => {
      useActiveWorkoutStore.getState().startWorkoutAtSet(makeSession(), '201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({ '101': FIXED_NOW, '102': FIXED_NOW });
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
      expect(state.completedSetIds['101']).toBe(FIXED_NOW);
      expect(state.activeSetId).toBe('102');
      expect(state.rest.state).toBe('resting');
      expect(state.rest.endsAt).toBe(FIXED_NOW + 60000);
      expect(state.rest.instanceToken).toBeGreaterThan(0);
      await flushPromises();
    });

    it('stamps completion with now and marks the session dirty', async () => {
      const revBefore = useActiveWorkoutStore.getState().sessionRevision;
      useActiveWorkoutStore.getState().completeActiveSet();
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['101']).toBe(FIXED_NOW);
      expect(state.sessionRevision).toBe(revBefore + 1);
      expect(state.hasUnsavedChanges).toBe(true);
      await flushPromises();
    });

    it('skips already-completed steps when advancing', async () => {
      // Ahead-hole (as a server resume would leave it): 102 done while the
      // cursor still sits on 101 before it.
      useActiveWorkoutStore.setState({ completedSetIds: { '102': FIXED_NOW } });
      useActiveWorkoutStore.getState().completeActiveSet(); // 101 done → skips 102
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('201');
      // Rest keys off the step actually landed on (Squat's 120s).
      expect(state.rest.durationSec).toBe(120);
      await flushPromises();
    });

    it('finishes when only completed steps remain ahead', async () => {
      useActiveWorkoutStore.setState({
        completedSetIds: { '102': FIXED_NOW, '201': FIXED_NOW },
      });
      mockSchedule.mockClear();
      useActiveWorkoutStore.getState().completeActiveSet();
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBeNull();
      expect(state.rest.state).toBe('ready');
      expect(mockSchedule).not.toHaveBeenCalled();
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

      expect(state.completedSetIds).toEqual({ '101': FIXED_NOW, '102': FIXED_NOW, '201': FIXED_NOW });
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

    it('keeps the cursor and its rest when un-checking a set behind it', () => {
      const before = useActiveWorkoutStore.getState();
      expect(before.completedSetIds['101']).toBe(FIXED_NOW);
      expect(before.activeSetId).toBe('102');
      expect(before.rest.state).toBe('resting');

      useActiveWorkoutStore.getState().uncompleteSet('101');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['101']).toBeUndefined();
      // The cursor stays on 102 — 101 is now a re-loggable hole reachable from
      // its own row control, so there's no need to rewind. The rest belongs to
      // 102, which didn't move, so it keeps running.
      expect(state.activeSetId).toBe('102');
      expect(state.rest.state).toBe('resting');
    });

    it('leaves the cursor when the un-checked set is ahead of an earlier hole', () => {
      // Cursor is on 102 (101 done). Inject an ahead completion on 201, then
      // uncheck it: 102 is still the earliest hole, so the cursor stays put.
      useActiveWorkoutStore.setState({
        completedSetIds: { '101': FIXED_NOW, '201': FIXED_NOW },
      });
      useActiveWorkoutStore.getState().uncompleteSet('201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['201']).toBeUndefined();
      expect(state.activeSetId).toBe('102');
      expect(state.rest.state).toBe('resting'); // untouched — cursor didn't move
    });

    it('is a no-op when the set is not completed', () => {
      const before = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().uncompleteSet('201');
      expect(useActiveWorkoutStore.getState()).toEqual(before);
    });

    it('bumps the revision and marks the session dirty so the clear propagates', () => {
      const revBefore = useActiveWorkoutStore.getState().sessionRevision;
      useActiveWorkoutStore.getState().uncompleteSet('101');
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionRevision).toBe(revBefore + 1);
      expect(state.hasUnsavedChanges).toBe(true);
    });
  });

  describe('uncompleteSet after a finished workout', () => {
    it('re-anchors the cursor onto the un-checked last set so it can be re-logged', async () => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
      // Complete everything through to the end (cursor → null).
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      useActiveWorkoutStore.getState().completeActiveSet();
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBeNull();

      // Un-checking the last set un-finishes the workout and lands the cursor
      // on it — otherwise there would be no next-up to resume from.
      useActiveWorkoutStore.getState().uncompleteSet('201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['201']).toBeUndefined();
      expect(state.activeSetId).toBe('201');
    });
  });

  describe('completeSet (out of order)', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('logs a later set without completing the ones before it', async () => {
      // Cursor starts on 101; log 102 directly, skipping 101.
      useActiveWorkoutStore.getState().completeSet('102');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['102']).toBe(FIXED_NOW);
      expect(state.completedSetIds['101']).toBeUndefined(); // left as a hole
      // Next-up follows the logged set: the step after 102 is Squat's 201.
      expect(state.activeSetId).toBe('201');
      expect(state.rest.state).toBe('resting');
      expect(state.rest.durationSec).toBe(120);
      await flushPromises();
    });

    it('advances to the next set in the same exercise', async () => {
      useActiveWorkoutStore.getState().completeSet('101');
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('102');
      await flushPromises();
    });

    it('falls back to the earliest hole when the logged set was last', async () => {
      // Skip straight to the final set, leaving 101 and 102 unchecked.
      useActiveWorkoutStore.getState().completeSet('201');
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds['201']).toBe(FIXED_NOW);
      // Nothing after 201, so next-up circles back to the earliest hole.
      expect(state.activeSetId).toBe('101');
      await flushPromises();
    });

    it('finishes (activeSetId null) only once every set is logged', async () => {
      useActiveWorkoutStore.getState().completeSet('201');
      await flushPromises();
      useActiveWorkoutStore.getState().completeSet('102');
      await flushPromises();
      expect(useActiveWorkoutStore.getState().activeSetId).toBe('101'); // last hole
      useActiveWorkoutStore.getState().completeSet('101');
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBeNull();
      expect(state.rest.state).toBe('ready');
    });

    it('is a no-op on an already-completed set', () => {
      useActiveWorkoutStore.getState().completeSet('101'); // 101 done, cursor → 102
      const { completedSetIds, activeSetId } = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().completeSet('101');
      expect(useActiveWorkoutStore.getState().completedSetIds).toEqual(completedSetIds);
      expect(useActiveWorkoutStore.getState().activeSetId).toBe(activeSetId);
    });

    it('is a no-op when the set id does not exist', () => {
      const before = useActiveWorkoutStore.getState();
      useActiveWorkoutStore.getState().completeSet('nope');
      expect(useActiveWorkoutStore.getState()).toEqual(before);
    });
  });

  describe('completeSet rest (supersets)', () => {
    // Steps: 301(90), 401(0), 302(90), 402(0).
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSupersetSession(2));
    });

    it('rests between rounds but not between partners when logged in order', async () => {
      // Partner within the round → no rest.
      useActiveWorkoutStore.getState().completeSet('301');
      expect(useActiveWorkoutStore.getState().rest.state).toBe('ready');
      // Finishing the round → rest before the next round.
      useActiveWorkoutStore.getState().completeSet('401');
      const afterRound = useActiveWorkoutStore.getState();
      expect(afterRound.activeSetId).toBe('302');
      expect(afterRound.rest.state).toBe('resting');
      expect(afterRound.rest.durationSec).toBe(90);
      await flushPromises();
    });

    it('rests after a round finished out of order (regression)', async () => {
      // Log both X sets first, skipping the Y partners. Each lands on its own
      // round's Y partner (back-to-back) → no rest.
      useActiveWorkoutStore.getState().completeSet('301');
      expect(useActiveWorkoutStore.getState().rest.state).toBe('ready');
      useActiveWorkoutStore.getState().completeSet('302');
      expect(useActiveWorkoutStore.getState().rest.state).toBe('ready');
      // Fill round 0's Y partner: round 0 is now complete and the cursor lands
      // on round 1's Y (402), a between-rounds move — a rest must start even
      // though 402's step-baked restSec is 0.
      useActiveWorkoutStore.getState().completeSet('401');
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('402');
      expect(state.rest.state).toBe('resting');
      expect(state.rest.durationSec).toBe(90);
      await flushPromises();
    });

    it('stays back-to-back when the cursor lands on the same-round partner', () => {
      // Logging X of round 1 out of order lands on its own partner (402),
      // which is still a within-round transition → no rest.
      useActiveWorkoutStore.getState().completeSet('302');
      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('402');
      expect(state.rest.state).toBe('ready');
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
      expect(mockSchedule).toHaveBeenLastCalledWith('Bench Press', 65, expect.anything());
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
      expect(mockSchedule).toHaveBeenLastCalledWith('Bench Press', 50, expect.anything());
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

      expect(useActiveWorkoutStore.getState().completedSetIds['101']).toBe(FIXED_NOW);
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
        completed_at: null,
      } as any);

      useActiveWorkoutStore.getState().reconcileWithSession(updated);
      const { steps, completedSetIds } = useActiveWorkoutStore.getState();
      expect(steps.find((s) => s.setId === '103')).toBeDefined();
      expect(completedSetIds['101']).toBe(FIXED_NOW);
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
        expect(state.completedSetIds['101']).toBe(FIXED_NOW);
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
        expect(useActiveWorkoutStore.getState().completedSetIds['101']).toBe(FIXED_NOW);

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

    describe('renameSession', () => {
      it('updates the session name, trims it, and marks unsaved', () => {
        useActiveWorkoutStore.getState().renameSession('  Leg Day  ');
        const state = useActiveWorkoutStore.getState();
        expect(state.session!.name).toBe('Leg Day');
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('is a no-op for an empty or unchanged name', () => {
        useActiveWorkoutStore.getState().renameSession('   ');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
        useActiveWorkoutStore.getState().renameSession('Push Day');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
        expect(useActiveWorkoutStore.getState().hasUnsavedChanges).toBe(false);
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

    describe('removeExercise', () => {
      it('removes the entry and rebuilds steps and cursor', () => {
        useActiveWorkoutStore.getState().removeExercise('ex-uuid-1');
        const state = useActiveWorkoutStore.getState();
        expect(state.session!.exercises).toHaveLength(1);
        expect(state.session!.exercises[0].id).toBe('ex-uuid-2');
        expect(state.steps.map((s) => s.setId)).toEqual(['201']);
        expect(state.activeSetId).toBe('201');
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('prunes completion for the removed exercise sets', async () => {
        useActiveWorkoutStore.getState().completeActiveSet(); // 101 done
        await flushPromises();
        useActiveWorkoutStore.getState().removeExercise('ex-uuid-1');
        const state = useActiveWorkoutStore.getState();
        expect(state.completedSetIds['101']).toBeUndefined();
        expect(state.completedSetIds['102']).toBeUndefined();
      });

      it('clears a running rest when the cursor moves off the removed exercise', async () => {
        mockSchedule.mockResolvedValueOnce('notif-doomed');
        useActiveWorkoutStore.getState().completeActiveSet(); // cursor → 102, resting
        await flushPromises();
        useActiveWorkoutStore.getState().removeExercise('ex-uuid-1');
        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('201');
        expect(state.rest.state).toBe('ready');
        expect(mockCancel).toHaveBeenCalledWith('notif-doomed');
      });

      it('is a no-op for an unknown entry id', () => {
        useActiveWorkoutStore.getState().removeExercise('nope');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      });
    });

    describe('replaceExercise', () => {
      const replacement = {
        id: 'ex-9',
        name: 'Overhead Press',
        category: 'Strength',
        equipment: ['barbell'],
        primary_muscles: ['shoulders'],
        secondary_muscles: [],
        calories_per_hour: 300,
        source: 'system',
        images: ['ohp.jpg'],
        tags: [],
      };

      it('swaps the exercise in place and resets to one default set', () => {
        useActiveWorkoutStore.getState().replaceExercise('ex-uuid-1', replacement);
        const state = useActiveWorkoutStore.getState();
        const entry = state.session!.exercises[0];
        expect(entry.id).toBe('ex-uuid-1'); // entry id (position) preserved
        expect(entry.exercise_id).toBe('ex-9');
        expect(entry.exercise_snapshot?.name).toBe('Overhead Press');
        expect(entry.sets).toHaveLength(1);
        expect(entry.sets[0].id).toBe(-1);
        expect(entry.sets[0].set_type).toBe('normal');
        expect(state.session!.exercises[1].id).toBe('ex-uuid-2'); // sibling untouched
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('prunes completions for the replaced sets and repoints the cursor', async () => {
        useActiveWorkoutStore.getState().completeActiveSet(); // 101 done, cursor 102
        await flushPromises();
        useActiveWorkoutStore.getState().replaceExercise('ex-uuid-1', replacement);
        const state = useActiveWorkoutStore.getState();
        expect(state.completedSetIds['101']).toBeUndefined();
        expect(state.activeSetId).toBe('-1');
        expect(state.steps.map((s) => s.setId)).toEqual(['-1', '201']);
      });

      it('is a no-op for an unknown entry id', () => {
        useActiveWorkoutStore.getState().replaceExercise('nope', replacement);
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      });
    });

    describe('clearExerciseCompletions', () => {
      it("un-checks only the target exercise's sets and rewinds the cursor", async () => {
        useActiveWorkoutStore.getState().completeActiveSet(); // 101
        await flushPromises();
        useActiveWorkoutStore.getState().completeActiveSet(); // 102
        await flushPromises();
        useActiveWorkoutStore.getState().completeActiveSet(); // 201
        await flushPromises();
        expect(
          Object.keys(useActiveWorkoutStore.getState().completedSetIds).sort(),
        ).toEqual(['101', '102', '201']);

        useActiveWorkoutStore.getState().clearExerciseCompletions('ex-uuid-1');
        const state = useActiveWorkoutStore.getState();
        expect(state.completedSetIds['101']).toBeUndefined();
        expect(state.completedSetIds['102']).toBeUndefined();
        expect(state.completedSetIds['201']).toBe(FIXED_NOW); // sibling kept
        expect(state.activeSetId).toBe('101'); // earliest uncompleted
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('is a no-op when the exercise has no completed sets', () => {
        useActiveWorkoutStore.getState().clearExerciseCompletions('ex-uuid-1');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      });

      it('is a no-op for an unknown entry id', () => {
        useActiveWorkoutStore.getState().clearExerciseCompletions('nope');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      });
    });

    describe('clearAllCompletions', () => {
      it('un-checks every set and rewinds the cursor to the first step', async () => {
        useActiveWorkoutStore.getState().completeActiveSet(); // 101
        await flushPromises();
        useActiveWorkoutStore.getState().completeActiveSet(); // 102
        await flushPromises();

        useActiveWorkoutStore.getState().clearAllCompletions();
        const state = useActiveWorkoutStore.getState();
        expect(state.completedSetIds).toEqual({});
        expect(state.prSetIds).toEqual({});
        expect(state.activeSetId).toBe('101');
        expect(state.rest.state).toBe('ready');
        expect(state.hasUnsavedChanges).toBe(true);
      });

      it('cancels a running rest notification', async () => {
        mockSchedule.mockResolvedValueOnce('notif-live');
        useActiveWorkoutStore.getState().completeActiveSet(); // cursor 102, resting
        await flushPromises();
        useActiveWorkoutStore.getState().clearAllCompletions();
        expect(mockCancel).toHaveBeenCalledWith('notif-live');
        expect(useActiveWorkoutStore.getState().rest.state).toBe('ready');
      });

      it('is a no-op when nothing is completed', () => {
        useActiveWorkoutStore.getState().clearAllCompletions();
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      });
    });
  });

  describe('applyServerSession', () => {
    /** Entry-id order of makeSession() at autosave send time. */
    const SENT_ENTRY_IDS = ['ex-uuid-1', 'ex-uuid-2'];

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
      useActiveWorkoutStore.getState().applyServerSession(response, sentRevision, SENT_ENTRY_IDS);

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

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({ '501': FIXED_NOW });
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

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);
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
      useActiveWorkoutStore.getState().applyServerSession(response, sentRevision, SENT_ENTRY_IDS);

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

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);
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

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);
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

      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);
      const state = useActiveWorkoutStore.getState();
      expect(state.completedSetIds).toEqual({ '501': FIXED_NOW });
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
      useActiveWorkoutStore.getState().applyServerSession(response, sentRevision, SENT_ENTRY_IDS);

      const state = useActiveWorkoutStore.getState();
      expect(state.session!.exercises[0].sets[0].weight).toBe(70);
    });

    it('is a no-op for a foreign session id', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const before = useActiveWorkoutStore.getState();
      const foreign = makeRecreatedSession();
      foreign.id = 'session-other';
      useActiveWorkoutStore.getState().applyServerSession(foreign, before.sessionRevision, SENT_ENTRY_IDS);
      expect(useActiveWorkoutStore.getState().session).toBe(before.session);
    });

    it('is a no-op after the workout was cleared', () => {
      useActiveWorkoutStore.getState().clearWorkout();
      useActiveWorkoutStore.getState().applyServerSession(makeRecreatedSession(), 0, SENT_ENTRY_IDS);
      expect(useActiveWorkoutStore.getState().sessionId).toBeNull();
      expect(useActiveWorkoutStore.getState().session).toBeNull();
    });

    it('reorder-mid-flight: skips the graft and stays dirty when entry order diverged', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      // Grouping reorders exercises while the save is in flight.
      useActiveWorkoutStore.getState().supersetWith('ex-uuid-2', 'ex-uuid-1');
      const reordered = useActiveWorkoutStore.getState().session;
      expect(reordered!.exercises.map((e) => e.id)).toEqual(['ex-uuid-2', 'ex-uuid-1']);

      useActiveWorkoutStore
        .getState()
        .applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);

      const state = useActiveWorkoutStore.getState();
      expect(state.session).toBe(reordered); // untouched — no positional graft
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('exercise-delete-mid-flight: skips the graft when the local list is shorter than sent', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      // Deleting ex-uuid-2's only set removes the exercise mid-flight.
      useActiveWorkoutStore.getState().deleteSet('201');
      const shortened = useActiveWorkoutStore.getState().session;
      expect(shortened!.exercises.map((e) => e.id)).toEqual(['ex-uuid-1']);

      useActiveWorkoutStore
        .getState()
        .applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);

      const state = useActiveWorkoutStore.getState();
      expect(state.session).toBe(shortened);
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('drag-reorder-mid-flight: skips the graft and stays dirty when reorderExercises diverged the order', () => {
      useActiveWorkoutStore.getState().updateSetField('101', { weight: 65 });
      const sentRevision = useActiveWorkoutStore.getState().sessionRevision;

      // A drag reorder swaps the two exercises while the save is in flight.
      useActiveWorkoutStore.getState().reorderExercises(0, 1);
      const reordered = useActiveWorkoutStore.getState().session;
      expect(reordered!.exercises.map((e) => e.id)).toEqual(['ex-uuid-2', 'ex-uuid-1']);

      // The response still carries the pre-reorder order, so the positional
      // graft must be skipped rather than pairing ids to the wrong entries.
      useActiveWorkoutStore
        .getState()
        .applyServerSession(makeRecreatedSession(), sentRevision, SENT_ENTRY_IDS);

      const state = useActiveWorkoutStore.getState();
      expect(state.session).toBe(reordered); // untouched — no positional graft
      expect(state.hasUnsavedChanges).toBe(true);
    });
  });

  describe('reorderExercises', () => {
    beforeEach(() => {
      useActiveWorkoutStore.getState().startWorkout(makeSession());
    });

    it('reorders exercises and rebuilds steps in the new order', () => {
      // items: [ex-uuid-1 (101,102)], [ex-uuid-2 (201)]. Move item 0 after 1.
      useActiveWorkoutStore.getState().reorderExercises(0, 1);
      const state = useActiveWorkoutStore.getState();
      expect(state.session!.exercises.map((e) => e.id)).toEqual([
        'ex-uuid-2',
        'ex-uuid-1',
      ]);
      expect(state.steps.map((s) => s.setId)).toEqual(['201', '101', '102']);
    });

    it('bumps the revision and marks unsaved changes', () => {
      expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      useActiveWorkoutStore.getState().reorderExercises(0, 1);
      const state = useActiveWorkoutStore.getState();
      expect(state.sessionRevision).toBe(1);
      expect(state.hasUnsavedChanges).toBe(true);
    });

    it('leaves the cursor and a running rest untouched when the active set survives', async () => {
      useActiveWorkoutStore.getState().completeActiveSet(); // 101 done, cursor → 102, resting
      await flushPromises();
      const restBefore = useActiveWorkoutStore.getState().rest;
      expect(restBefore.state).toBe('resting');
      mockCancel.mockClear();

      useActiveWorkoutStore.getState().reorderExercises(0, 1);

      const state = useActiveWorkoutStore.getState();
      expect(state.activeSetId).toBe('102'); // still present, cursor unmoved
      expect(state.rest).toBe(restBefore); // rest object untouched
      expect(mockCancel).not.toHaveBeenCalled();
      expect(state.completedSetIds).toEqual({ '101': FIXED_NOW }); // completion intact
    });

    it('preserves PR stamps for surviving sets across a reorder', () => {
      useActiveWorkoutStore.setState({ prSetIds: { '201': true } });
      useActiveWorkoutStore.getState().reorderExercises(0, 1);
      expect(useActiveWorkoutStore.getState().prSetIds).toEqual({ '201': true });
    });

    it('leaves an uncompleted set moved before the forward-only cursor behind (hole semantics)', () => {
      useActiveWorkoutStore.getState().completeActiveSet(); // 101 done, cursor → 102
      // Move ex-uuid-2 (uncompleted 201) to sit before ex-uuid-1. The cursor
      // stays on 102 (still present) even though 201 is now an uncompleted step
      // before it — a hole, matching uncompleteSet's forward-only semantics.
      useActiveWorkoutStore.getState().reorderExercises(1, 0);
      const state = useActiveWorkoutStore.getState();
      expect(state.steps.map((s) => s.setId)).toEqual(['201', '101', '102']);
      expect(state.activeSetId).toBe('102');
      expect(state.completedSetIds['201']).toBeUndefined();
    });

    it('no-ops on an out-of-range index (no revision bump)', () => {
      useActiveWorkoutStore.getState().reorderExercises(0, 5);
      expect(useActiveWorkoutStore.getState().sessionRevision).toBe(0);
      expect(useActiveWorkoutStore.getState().hasUnsavedChanges).toBe(false);
    });

    it('no-ops when there is no active session', () => {
      useActiveWorkoutStore.getState().clearWorkout();
      useActiveWorkoutStore.getState().reorderExercises(0, 1);
      const state = useActiveWorkoutStore.getState();
      expect(state.session).toBeNull();
      expect(state.sessionRevision).toBe(0);
    });
  });

  describe('supersets', () => {
    /** Solo Row exercise (one set, rest 45) appended as a grouping candidate. */
    function makeRowExercise() {
      return {
        id: 'ex-uuid-3',
        exercise_id: 'ex-3',
        duration_minutes: 10,
        calories_burned: 80,
        entry_date: '2026-03-20',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        superset_group: null,
        exercise_snapshot: {
          id: 'ex-3',
          name: 'Row',
          category: 'Strength',
          calories_per_hour: 300,
          source: 'system',
          images: ['row.jpg'],
        },
        activity_details: [],
        sets: [
          {
            id: 301,
            set_number: 1,
            set_type: 'working',
            reps: 12,
            weight: 40,
            duration: null,
            rest_time: 45,
            notes: null,
            rpe: null,
            completed_at: null,
          },
        ],
      } as any;
    }

    /** Bench(101,102), Squat(201), Row(301) — all solo. */
    function makeThreeExerciseSession(): PresetSessionResponse {
      const session = makeSession();
      session.exercises.push(makeRowExercise());
      return session;
    }

    /** Bench(101,102) + Squat(201,202) grouped as 1 with harmonized rest 60; Row solo. */
    function makeGroupedSession(): PresetSessionResponse {
      const session = makeThreeExerciseSession();
      const [bench, squat] = session.exercises;
      (bench as any).superset_group = 1;
      (squat as any).superset_group = 1;
      squat.sets = [
        { ...squat.sets[0], rest_time: 60 },
        { ...squat.sets[0], id: 202, set_number: 2, rest_time: 60 },
      ];
      return session;
    }

    /** Bench + Squat + Row all in group 1 (tri-set), harmonized rest 60. */
    function makeTriGroupSession(): PresetSessionResponse {
      const session = makeGroupedSession();
      const row = session.exercises[2];
      (row as any).superset_group = 1;
      row.sets = [{ ...row.sets[0], rest_time: 60 }];
      return session;
    }

    describe('step interleaving', () => {
      it('interleaves grouped exercises into rounds with rest only on round openers', () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        const { steps } = useActiveWorkoutStore.getState();
        expect(steps.map((s) => s.setId)).toEqual(['101', '201', '102', '202', '301']);
        expect(steps.map((s) => s.restSec)).toEqual([60, 0, 60, 0, 45]);
        expect(steps.map((s) => s.exerciseName)).toEqual([
          'Bench Press',
          'Squat',
          'Bench Press',
          'Squat',
          'Row',
        ]);
      });

      it('drops exhausted members from later rounds; survivor tail sets each open a round', () => {
        const session = makeGroupedSession();
        // Bench gets a 3rd set; Squat is trimmed to one.
        session.exercises[0].sets.push({
          ...session.exercises[0].sets[0],
          id: 103,
          set_number: 3,
        });
        session.exercises[1].sets = [session.exercises[1].sets[0]];
        useActiveWorkoutStore.getState().startWorkout(session);

        const { steps } = useActiveWorkoutStore.getState();
        expect(steps.map((s) => s.setId)).toEqual(['101', '201', '102', '103', '301']);
        expect(steps.map((s) => s.restSec)).toEqual([60, 0, 60, 60, 45]);
      });

      it('produces unchanged sequential steps for ungrouped sessions (incl. pre-upgrade shape)', () => {
        // makeSession() exercises lack superset_group entirely — the
        // pre-upgrade persisted shape.
        useActiveWorkoutStore.getState().startWorkout(makeSession());
        const { steps } = useActiveWorkoutStore.getState();
        expect(steps.map((s) => s.setId)).toEqual(['101', '102', '201']);
        expect(steps.map((s) => s.restSec)).toEqual([60, 60, 120]);
      });
    });

    describe('round advancement', () => {
      it('advances without rest inside a round (no timer, no notification)', () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        useActiveWorkoutStore.getState().completeActiveSet(); // 101 → 201

        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('201');
        expect(state.rest.state).toBe('ready');
        expect(mockSchedule).not.toHaveBeenCalled();
      });

      it('starts the group rest after the round-final set', () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        useActiveWorkoutStore.getState().completeActiveSet(); // 101 → 201, no rest
        useActiveWorkoutStore.getState().completeActiveSet(); // 201 → 102, round done

        const state = useActiveWorkoutStore.getState();
        expect(state.activeSetId).toBe('102');
        expect(state.rest.state).toBe('resting');
        expect(state.rest.durationSec).toBe(60);
        expect(mockSchedule).toHaveBeenCalledTimes(1);
        // The rest-complete notification describes the upcoming set (#1).
        expect(mockSchedule).toHaveBeenCalledWith(
          'Bench Press',
          60,
          expect.objectContaining({
            title: expect.stringContaining('Rest complete'),
            body: expect.stringContaining('Set'),
          }),
        );
      });
    });

    describe('supersetWith', () => {
      it('groups two non-adjacent solos: reorders adjacent, harmonizes rest, bumps revision', () => {
        useActiveWorkoutStore.getState().startWorkout(makeThreeExerciseSession());
        const revBefore = useActiveWorkoutStore.getState().sessionRevision;

        useActiveWorkoutStore.getState().supersetWith('ex-uuid-1', 'ex-uuid-3');

        const state = useActiveWorkoutStore.getState();
        const exercises = state.session!.exercises;
        expect(exercises.map((e) => e.id)).toEqual(['ex-uuid-1', 'ex-uuid-3', 'ex-uuid-2']);
        expect(exercises[0].superset_group).toBe(1);
        expect(exercises[1].superset_group).toBe(1);
        expect(exercises[2].superset_group ?? null).toBeNull();
        // Row's per-set rest (45) is overwritten by the anchor's 60.
        expect(exercises[1].sets.map((s) => s.rest_time)).toEqual([60]);
        expect(state.sessionRevision).toBe(revBefore + 1);
        expect(state.hasUnsavedChanges).toBe(true);
        expect(state.activeSetId).toBe('101'); // cursor preserved
        expect(state.steps.map((s) => s.setId)).toEqual(['101', '301', '102', '201']);
        expect(state.steps.map((s) => s.restSec)).toEqual([60, 0, 60, 120]);
      });

      it("adds a member to the current run's tail via a grouped card", () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        useActiveWorkoutStore.getState().supersetWith('ex-uuid-1', 'ex-uuid-3');

        const state = useActiveWorkoutStore.getState();
        const exercises = state.session!.exercises;
        expect(exercises.map((e) => e.id)).toEqual(['ex-uuid-1', 'ex-uuid-2', 'ex-uuid-3']);
        expect(exercises.map((e) => e.superset_group)).toEqual([1, 1, 1]);
        expect(exercises[2].sets.map((s) => s.rest_time)).toEqual([60]);
        expect(state.steps.map((s) => s.setId)).toEqual(['101', '201', '301', '102', '202']);
        expect(state.steps.map((s) => s.restSec)).toEqual([60, 0, 0, 60, 0]);
      });

      it('generates a fresh group id past stale (singleton) values', () => {
        const session = makeThreeExerciseSession();
        (session.exercises[2] as any).superset_group = 5; // stale singleton
        useActiveWorkoutStore.getState().startWorkout(session);

        useActiveWorkoutStore.getState().supersetWith('ex-uuid-1', 'ex-uuid-2');

        const exercises = useActiveWorkoutStore.getState().session!.exercises;
        expect(exercises[0].superset_group).toBe(6);
        expect(exercises[1].superset_group).toBe(6);
        // Normalization scrubs the stale value in the same edit.
        expect(exercises[2].superset_group).toBeNull();
      });

      it('rejects grouping with an already-grouped pick', () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        const revBefore = useActiveWorkoutStore.getState().sessionRevision;
        useActiveWorkoutStore.getState().supersetWith('ex-uuid-3', 'ex-uuid-1');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(revBefore);
      });

      it('preserves cursor, completion, and running rest across grouping', async () => {
        useActiveWorkoutStore.getState().startWorkout(makeThreeExerciseSession());
        useActiveWorkoutStore.getState().completeActiveSet(); // 101 done → 102 resting
        await flushPromises();
        const restBefore = useActiveWorkoutStore.getState().rest;
        expect(restBefore.state).toBe('resting');

        useActiveWorkoutStore.getState().supersetWith('ex-uuid-1', 'ex-uuid-3');

        const state = useActiveWorkoutStore.getState();
        expect(state.completedSetIds).toEqual({ '101': FIXED_NOW });
        expect(state.activeSetId).toBe('102');
        expect(state.rest).toBe(restBefore); // untouched — cursor didn't move
      });
    });

    describe('ungroupExercise', () => {
      it('ungrouping either member of a 2-group dissolves it entirely', () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        useActiveWorkoutStore.getState().ungroupExercise('ex-uuid-1');

        const exercises = useActiveWorkoutStore.getState().session!.exercises;
        expect(exercises.map((e) => e.id)).toEqual(['ex-uuid-1', 'ex-uuid-2', 'ex-uuid-3']);
        expect(exercises.map((e) => e.superset_group ?? null)).toEqual([null, null, null]);
        // Steps revert to sequential.
        expect(useActiveWorkoutStore.getState().steps.map((s) => s.setId)).toEqual([
          '101',
          '102',
          '201',
          '202',
          '301',
        ]);
      });

      it('ungrouping the first member of a tri-set keeps the other two grouped', () => {
        useActiveWorkoutStore.getState().startWorkout(makeTriGroupSession());
        useActiveWorkoutStore.getState().ungroupExercise('ex-uuid-1');

        const exercises = useActiveWorkoutStore.getState().session!.exercises;
        expect(exercises.map((e) => e.id)).toEqual(['ex-uuid-1', 'ex-uuid-2', 'ex-uuid-3']);
        expect(exercises.map((e) => e.superset_group)).toEqual([null, 1, 1]);
      });

      it('ungrouping a middle member moves it after the run so the rest stay adjacent', () => {
        useActiveWorkoutStore.getState().startWorkout(makeTriGroupSession());
        useActiveWorkoutStore.getState().ungroupExercise('ex-uuid-2');

        const exercises = useActiveWorkoutStore.getState().session!.exercises;
        expect(exercises.map((e) => e.id)).toEqual(['ex-uuid-1', 'ex-uuid-3', 'ex-uuid-2']);
        expect(exercises.map((e) => e.superset_group)).toEqual([1, 1, null]);
      });

      it('ungrouping the last member of a tri-set keeps the other two grouped', () => {
        useActiveWorkoutStore.getState().startWorkout(makeTriGroupSession());
        useActiveWorkoutStore.getState().ungroupExercise('ex-uuid-3');

        const exercises = useActiveWorkoutStore.getState().session!.exercises;
        expect(exercises.map((e) => e.id)).toEqual(['ex-uuid-1', 'ex-uuid-2', 'ex-uuid-3']);
        expect(exercises.map((e) => e.superset_group)).toEqual([1, 1, null]);
      });

      it('is a no-op for an ungrouped exercise', () => {
        useActiveWorkoutStore.getState().startWorkout(makeThreeExerciseSession());
        const revBefore = useActiveWorkoutStore.getState().sessionRevision;
        useActiveWorkoutStore.getState().ungroupExercise('ex-uuid-1');
        expect(useActiveWorkoutStore.getState().sessionRevision).toBe(revBefore);
      });
    });

    describe('normalization', () => {
      it("deleting a member's last set dissolves the 1-member remainder", () => {
        const session = makeGroupedSession();
        session.exercises[1].sets = [session.exercises[1].sets[0]]; // Squat: one set
        useActiveWorkoutStore.getState().startWorkout(session);

        useActiveWorkoutStore.getState().deleteSet('201'); // removes Squat entirely

        const state = useActiveWorkoutStore.getState();
        expect(state.session!.exercises.map((e) => e.id)).toEqual(['ex-uuid-1', 'ex-uuid-3']);
        expect(state.session!.exercises[0].superset_group).toBeNull();
        expect(state.steps.map((s) => s.setId)).toEqual(['101', '102', '301']);
        expect(state.steps.map((s) => s.restSec)).toEqual([60, 60, 45]);
      });
    });

    describe('group-aware rest', () => {
      it("a member's rest edit writes every member's sets and the round-opener steps", () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        useActiveWorkoutStore.getState().setExerciseRest('ex-uuid-2', 150);

        const state = useActiveWorkoutStore.getState();
        const [bench, squat, row] = state.session!.exercises;
        expect(bench.sets.map((s) => s.rest_time)).toEqual([150, 150]);
        expect(squat.sets.map((s) => s.rest_time)).toEqual([150, 150]);
        expect(row.sets.map((s) => s.rest_time)).toEqual([45]); // untouched
        expect(state.steps.map((s) => s.restSec)).toEqual([150, 0, 150, 0, 45]);
      });

      it('solo exercises keep the single-exercise behavior', () => {
        useActiveWorkoutStore.getState().startWorkout(makeGroupedSession());
        useActiveWorkoutStore.getState().setExerciseRest('ex-uuid-3', 30);

        const state = useActiveWorkoutStore.getState();
        expect(state.session!.exercises[0].sets.map((s) => s.rest_time)).toEqual([60, 60]);
        expect(state.session!.exercises[2].sets.map((s) => s.rest_time)).toEqual([30]);
      });
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
          completedSetIds: { '101': now - 120_000 },
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
        version: 4,
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
        version: 4,
      };
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().rest;
      expect(rest.state).toBe('resting');
      expect(rest.endsAt).toBe(now + 60_000);
    });

    describe('pre-v4 migration discard', () => {
      /** v3 shape: completedSetIds values were `true`, sets had no completed_at. */
      function buildPreV4Payload(version: number) {
        return {
          state: {
            sessionId: 'session-1',
            session: null,
            startedAt: Date.now(),
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
              state: 'ready',
              durationSec: 0,
              endsAt: null,
              pausedRemainingMs: null,
              scheduledNotificationId: null,
              instanceToken: 0,
            },
            hasUnsavedChanges: true,
            createdByLiveStart: false,
          },
          version,
        };
      }

      it.each([1, 2, 3])('discards persisted version %i wholesale', async (version) => {
        jest.useRealTimers();
        await AsyncStorage.setItem(
          '@SparkyFitness/active-workout',
          JSON.stringify(buildPreV4Payload(version)),
        );
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.sessionId).toBeNull();
        expect(state.session).toBeNull();
        expect(state.steps).toEqual([]);
        expect(state.completedSetIds).toEqual({});
        expect(state.activeSetId).toBeNull();
        expect(state.hasUnsavedChanges).toBe(false);
      });

      it('keeps version-4 state intact', async () => {
        jest.useRealTimers();
        const persisted = {
          state: {
            ...buildPreV4Payload(4).state,
            completedSetIds: { '101': 1_699_999_000_000 },
          },
          version: 4,
        };
        await AsyncStorage.setItem(
          '@SparkyFitness/active-workout',
          JSON.stringify(persisted),
        );
        await useActiveWorkoutStore.persist.rehydrate();
        const state = useActiveWorkoutStore.getState();
        expect(state.sessionId).toBe('session-1');
        expect(state.completedSetIds).toEqual({ '101': 1_699_999_000_000 });
        expect(state.activeSetId).toBe('102');
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
        version: 4,
      };
      await AsyncStorage.setItem('@SparkyFitness/active-workout', JSON.stringify(persisted));
      await useActiveWorkoutStore.persist.rehydrate();
      const rest = useActiveWorkoutStore.getState().rest;
      expect(rest.state).toBe('paused');
      expect(rest.pausedRemainingMs).toBe(30_000);
    });
  });

  describe('PR detection', () => {
    /** A working set with sane defaults; set_number is assigned by benchSession. */
    function set(
      id: number,
      weight: number | null,
      reps: number | null,
      overrides?: Record<string, unknown>,
    ) {
      return {
        id,
        set_number: 1,
        set_type: 'working',
        reps,
        weight,
        duration: null,
        rest_time: 60,
        notes: null,
        rpe: null,
        completed_at: null,
        is_pr: false,
        ...overrides,
      };
    }

    /** A single-exercise (Bench Press, exercise_id 'ex-1') session. */
    function benchSession(...sets: ReturnType<typeof set>[]): PresetSessionResponse {
      const session = makeSession();
      session.exercises = [
        {
          ...session.exercises[0],
          sets: sets.map((s, i) => ({ ...s, set_number: i + 1 })),
        },
      ] as any;
      return session;
    }

    const store = () => useActiveWorkoutStore.getState();

    it('stamps a heavier working set as a PR and fires the success haptic', () => {
      store().startWorkout(benchSession(set(101, 60, 10), set(102, 70, 8)));
      store().capturePrBaseline('ex-1', { weight: 65, reps: 10 });

      store().completeActiveSet(); // 101 @ 60kg — below baseline, no PR
      expect(store().prSetIds).toEqual({});
      expect(mockSuccessHaptic).not.toHaveBeenCalled();
      // A regular log fires the light selection tick, not the success buzz.
      expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);

      store().completeActiveSet(); // 102 @ 70kg — beats 65, PR
      const st = store();
      expect(st.prSetIds).toEqual({ '102': true });
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
      // The PR fires only the success buzz — the two stay mutually exclusive.
      expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
      expect(st.lastPrEvent).toMatchObject({
        setId: '102',
        exerciseName: 'Bench Press',
        weightKg: 70,
        reps: 8,
      });
      expect(st.lastPrEvent!.seq).toBeGreaterThan(0);
    });

    it('stamps a rep-PR at the same top weight', () => {
      store().startWorkout(benchSession(set(101, 60, 10), set(102, 70, 8)));
      store().capturePrBaseline('ex-1', { weight: 70, reps: 5 });

      store().completeActiveSet(); // 101 @ 60kg — no PR
      store().completeActiveSet(); // 102 @ 70kg × 8 reps > baseline 70 × 5 → PR
      expect(store().prSetIds).toEqual({ '102': true });
    });

    it('does not award a second PR for repeating the session top set', () => {
      store().startWorkout(benchSession(set(101, 80, 8), set(102, 80, 8)));
      store().capturePrBaseline('ex-1', { weight: 75, reps: 8 });

      store().completeActiveSet(); // 101 @ 80kg > 75 → PR
      expect(store().prSetIds).toEqual({ '101': true });
      store().completeActiveSet(); // 102 identical — running best is now 80, no PR
      expect(store().prSetIds).toEqual({ '101': true });
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it('never awards a PR to a warmup set', () => {
      store().startWorkout(benchSession(set(101, 999, 1, { set_type: 'warmup' })));
      store().capturePrBaseline('ex-1', { weight: 60, reps: 10 });
      store().completeActiveSet();
      expect(store().prSetIds).toEqual({});
      expect(mockSuccessHaptic).not.toHaveBeenCalled();
    });

    it('never awards a PR when the baseline was not captured', () => {
      store().startWorkout(benchSession(set(101, 100, 5)));
      store().completeActiveSet();
      expect(store().prSetIds).toEqual({});
    });

    it('never awards a PR when the baseline is null (first-ever exercise)', () => {
      store().startWorkout(benchSession(set(101, 100, 5)));
      store().capturePrBaseline('ex-1', null);
      store().completeActiveSet();
      expect(store().prSetIds).toEqual({});
    });

    it('treats a sub-cent difference as no PR (hundredths compare)', () => {
      store().startWorkout(benchSession(set(101, 100.004, 5)));
      store().capturePrBaseline('ex-1', { weight: 100, reps: 5 });
      store().completeActiveSet();
      expect(store().prSetIds).toEqual({});
    });

    it('clears the stamp when the PR set is unchecked', () => {
      store().startWorkout(benchSession(set(101, 100, 5)));
      store().capturePrBaseline('ex-1', { weight: 90, reps: 5 });
      store().completeActiveSet();
      expect(store().prSetIds).toEqual({ '101': true });

      store().uncompleteSet('101');
      expect(store().prSetIds).toEqual({});
    });

    it('re-stamps the PR when the un-checked set is re-logged', () => {
      store().startWorkout(benchSession(set(101, 100, 5)));
      store().capturePrBaseline('ex-1', { weight: 90, reps: 5 });
      store().completeActiveSet();
      expect(store().prSetIds).toEqual({ '101': true });

      // Un-checking clears the stamp and rewinds the cursor onto the set.
      store().uncompleteSet('101');
      expect(store().prSetIds).toEqual({});
      expect(store().activeSetId).toBe('101');
      mockSuccessHaptic.mockClear();

      // Re-logging it is a genuine completion, so the PR re-stamps and buzzes.
      store().completeActiveSet();
      expect(store().prSetIds).toEqual({ '101': true });
      expect(mockSuccessHaptic).toHaveBeenCalledTimes(1);
    });

    it('seeds stamps from the server is_pr flags on startWorkout', () => {
      store().startWorkout(
        benchSession(set(101, 100, 5, { is_pr: true }), set(102, 60, 8)),
      );
      expect(store().prSetIds).toEqual({ '101': true });
    });

    it('remaps stamps positionally across a recreate save', () => {
      store().startWorkout(makeSession());
      useActiveWorkoutStore.setState({ prSetIds: { '102': true } });
      const sentRevision = store().sessionRevision;

      const recreated = makeSession();
      recreated.exercises[0].sets[0].id = 501; // 101 → 501
      recreated.exercises[0].sets[1].id = 502; // 102 → 502
      recreated.exercises[1].sets[0].id = 601; // 201 → 601
      store().applyServerSession(recreated, sentRevision, ['ex-uuid-1', 'ex-uuid-2']);

      expect(store().prSetIds).toEqual({ '502': true });
    });

    it('does not stamp priors backfilled by startWorkoutAtSet', () => {
      store().startWorkoutAtSet(makeSession(), '201');
      expect(store().prSetIds).toEqual({});
    });

    it('does not stamp skipped-over sets — only the logged set is PR-checked', () => {
      store().startWorkout(makeSession());
      // A low baseline the skipped bench sets would "beat" if they were stamped.
      store().capturePrBaseline('ex-1', { weight: 50, reps: 5 });
      // Skip straight to Squat's set, leaving the bench sets unchecked.
      store().completeSet('201');
      expect(store().prSetIds['101']).toBeUndefined();
      expect(store().prSetIds['102']).toBeUndefined();
    });

    it('does not resurrect a stale stamp when a temp set id is re-minted', () => {
      store().startWorkout(benchSession(set(101, 60, 10), set(-1, 80, 8)));
      // The temp set earned a PR earlier this session.
      useActiveWorkoutStore.setState({ prSetIds: { '-1': true } });

      store().deleteSet('-1'); // pruned by buildSessionEditState
      expect(store().prSetIds).toEqual({});

      store().addSetToExercise('ex-uuid-1'); // clones set 101, re-mints id -1
      const sets = store().session!.exercises[0].sets;
      const newSet = sets[sets.length - 1];
      expect(newSet.id).toBe(-1);
      expect(store().prSetIds['-1']).toBeUndefined();
    });

    it('hydrates safely from v4 state lacking prBaseline/prSetIds', async () => {
      jest.useRealTimers();
      const persisted = {
        state: {
          sessionId: 'session-1',
          session: makeSession(),
          startedAt: FIXED_NOW,
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
          hasUnsavedChanges: false,
          createdByLiveStart: false,
          // No prBaseline / prSetIds — the pre-PR persisted shape.
        },
        version: 4,
      };
      await AsyncStorage.setItem(
        '@SparkyFitness/active-workout',
        JSON.stringify(persisted),
      );
      await useActiveWorkoutStore.persist.rehydrate();
      const st = useActiveWorkoutStore.getState();
      expect(st.prSetIds).toEqual({});
      expect(st.prBaseline).toEqual({});
      expect(st.lastPrEvent).toBeNull();
    });
  });
});
