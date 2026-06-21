import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  reconcileFastGoalNotification,
  cancelFastGoalNotification,
  __resetFastingReconcileStateForTests,
} from '../../src/hooks/useFasting';
import {
  scheduleFastGoalNotification,
  cancelScheduledNotification,
} from '../../src/services/notifications';
import type { FastingLog } from '../../src/types/fasting';

jest.mock('../../src/services/notifications', () => ({
  scheduleFastGoalNotification: jest.fn(),
  cancelScheduledNotification: jest.fn(),
}));

const mockSchedule = scheduleFastGoalNotification as jest.MockedFunction<
  typeof scheduleFastGoalNotification
>;
const mockCancel = cancelScheduledNotification as jest.MockedFunction<
  typeof cancelScheduledNotification
>;

const GOAL_NOTIF_STORAGE_KEY = '@Fasting:goalNotificationId';
const HOUR = 1000 * 60 * 60;

function activeFast(overrides: Partial<FastingLog> = {}): FastingLog {
  return {
    id: 'fast-1',
    user_id: 'user-1',
    start_time: new Date(Date.now() - HOUR).toISOString(),
    end_time: null,
    target_end_time: new Date(Date.now() + 8 * HOUR).toISOString(),
    duration_minutes: null,
    fasting_type: '16:8 Leangains',
    status: 'ACTIVE',
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('reconcileFastGoalNotification', () => {
  beforeEach(async () => {
    __resetFastingReconcileStateForTests();
    await AsyncStorage.clear();
    mockSchedule.mockReset().mockResolvedValue('notif-1');
    mockCancel.mockReset().mockResolvedValue(undefined);
  });

  test('schedules once for an active fast with a future target', async () => {
    const fast = activeFast();
    await reconcileFastGoalNotification(fast);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledWith(fast.target_end_time);
    const stored = await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY);
    expect(JSON.parse(stored as string)).toEqual({
      fastId: 'fast-1',
      target: fast.target_end_time,
      notificationId: 'notif-1',
    });
  });

  test('is idempotent across repeated reconciles for the same fast', async () => {
    const fast = activeFast();
    await reconcileFastGoalNotification(fast);
    await reconcileFastGoalNotification(fast);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  test('cancels and forgets when there is no active fast', async () => {
    await reconcileFastGoalNotification(activeFast());
    await reconcileFastGoalNotification(null);

    expect(mockCancel).toHaveBeenCalledWith('notif-1');
    expect(await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY)).toBeNull();
  });

  test('cancels when the fast is no longer ACTIVE', async () => {
    await reconcileFastGoalNotification(activeFast());
    await reconcileFastGoalNotification(activeFast({ status: 'COMPLETED' }));
    expect(mockCancel).toHaveBeenCalledWith('notif-1');
  });

  test('schedules nothing when the active fast has a null target', async () => {
    await reconcileFastGoalNotification(activeFast({ target_end_time: null }));
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY)).toBeNull();
  });

  test('replaces a stale notification when the active fast changes', async () => {
    await reconcileFastGoalNotification(activeFast({ id: 'fast-1' }));
    mockSchedule.mockResolvedValueOnce('notif-2');
    const secondFast = activeFast({ id: 'fast-2' });
    await reconcileFastGoalNotification(secondFast);

    expect(mockCancel).toHaveBeenCalledWith('notif-1');
    const stored = await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY);
    expect(JSON.parse(stored as string)).toEqual({
      fastId: 'fast-2',
      target: secondFast.target_end_time,
      notificationId: 'notif-2',
    });
  });

  test('reschedules when the same fast has its target time edited elsewhere', async () => {
    const fast = activeFast();
    await reconcileFastGoalNotification(fast);

    // Same fast id, but the goal was edited (e.g. on web) to a later target.
    const newTarget = new Date(Date.now() + 12 * HOUR).toISOString();
    mockSchedule.mockResolvedValueOnce('notif-2');
    await reconcileFastGoalNotification(activeFast({ target_end_time: newTarget }));

    // Old alert cancelled, new one scheduled for the new target.
    expect(mockCancel).toHaveBeenCalledWith('notif-1');
    expect(mockSchedule).toHaveBeenLastCalledWith(newTarget);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    const stored = await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY);
    expect(JSON.parse(stored as string)).toEqual({
      fastId: 'fast-1',
      target: newTarget,
      notificationId: 'notif-2',
    });
  });

  test('treats a legacy record without a target as stale and reschedules', async () => {
    // Simulate a record persisted before `target` was tracked.
    await AsyncStorage.setItem(
      GOAL_NOTIF_STORAGE_KEY,
      JSON.stringify({ fastId: 'fast-1', notificationId: 'notif-legacy' }),
    );

    mockSchedule.mockResolvedValueOnce('notif-2');
    await reconcileFastGoalNotification(activeFast({ id: 'fast-1' }));

    expect(mockCancel).toHaveBeenCalledWith('notif-legacy');
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('cancelFastGoalNotification', () => {
  beforeEach(async () => {
    __resetFastingReconcileStateForTests();
    await AsyncStorage.clear();
    mockSchedule.mockReset().mockResolvedValue('notif-1');
    mockCancel.mockReset().mockResolvedValue(undefined);
  });

  test('cancels and clears a stored notification', async () => {
    await reconcileFastGoalNotification(activeFast());
    await cancelFastGoalNotification();
    expect(mockCancel).toHaveBeenCalledWith('notif-1');
    expect(await AsyncStorage.getItem(GOAL_NOTIF_STORAGE_KEY)).toBeNull();
  });

  test('no-ops when nothing is stored', async () => {
    await cancelFastGoalNotification();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});
