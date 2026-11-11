import * as Notifications from 'expo-notifications';
import {
  cancelMeditationTimerNotification,
  scheduleMeditationTimerNotification,
} from '../../src/services/notifications';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/ExactAlarmBridge', () => ({
  ExactAlarmBridge: {
    isAvailable: false,
    canScheduleExactAlarms: jest.fn(async () => false),
    openExactAlarmSettings: jest.fn(async () => undefined),
  },
}));

const mockGetPerms = jest.mocked(Notifications.getPermissionsAsync);
const mockSchedule = jest.mocked(Notifications.scheduleNotificationAsync);
const mockCancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);

type PermissionResult = Awaited<
  ReturnType<typeof Notifications.getPermissionsAsync>
>;
const granted = { status: 'granted' } as PermissionResult;

/** A permission check that stays pending until the test releases it. */
const heldPermission = () => {
  let release: () => void = () => {};
  mockGetPerms.mockImplementationOnce(
    () =>
      new Promise<PermissionResult>((resolve) => {
        release = () => resolve(granted);
      })
  );
  return () => release();
};

describe('timer done notification races', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ notificationsEnabled: true });
    mockGetPerms.mockResolvedValue(granted);
    let n = 0;
    mockSchedule.mockImplementation(async () => `ping-${++n}`);
    await cancelMeditationTimerNotification();
    mockCancel.mockClear();
  });

  it('schedules nothing when cancelled while the schedule awaited permission', async () => {
    const release = heldPermission();
    const pending = scheduleMeditationTimerNotification(600);
    // Flush the initial cancel so the schedule is parked on the permission check.
    await Promise.resolve();
    await cancelMeditationTimerNotification();
    release();
    await pending;
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('keeps only the latest ping when two schedules overlap', async () => {
    const releaseFirst = heldPermission();
    const first = scheduleMeditationTimerNotification(600);
    await Promise.resolve();
    await scheduleMeditationTimerNotification(540);
    releaseFirst();
    await first;

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0].trigger).toMatchObject({
      seconds: 540,
    });

    await cancelMeditationTimerNotification();
    expect(mockCancel).toHaveBeenCalledWith('ping-1');
  });

  it('cancels a ping that was created after it went stale', async () => {
    let finishSchedule: (id: string) => void = () => {};
    mockSchedule.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishSchedule = resolve;
        })
    );
    const pending = scheduleMeditationTimerNotification(600);
    // Let it reach scheduleNotificationAsync.
    for (let i = 0; i < 10 && mockSchedule.mock.calls.length === 0; i++) {
      await Promise.resolve();
    }
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    await cancelMeditationTimerNotification();
    finishSchedule('late-ping');
    await pending;
    expect(mockCancel).toHaveBeenCalledWith('late-ping');
  });
});
