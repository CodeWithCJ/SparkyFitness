import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  __resetNotificationStateForTests,
  cancelScheduledNotification,
  ensureNotificationPermission,
  fireRestCompleteHaptic,
  initNotifications,
  scheduleRestNotification,
} from '../../src/services/notifications';

const mockGetPerms = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const mockRequestPerms = Notifications.requestPermissionsAsync as jest.MockedFunction<
  typeof Notifications.requestPermissionsAsync
>;
const mockSchedule = Notifications.scheduleNotificationAsync as jest.MockedFunction<
  typeof Notifications.scheduleNotificationAsync
>;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.MockedFunction<
  typeof Notifications.cancelScheduledNotificationAsync
>;
const mockSetHandler = Notifications.setNotificationHandler as jest.MockedFunction<
  typeof Notifications.setNotificationHandler
>;
const mockSetChannel = Notifications.setNotificationChannelAsync as jest.MockedFunction<
  typeof Notifications.setNotificationChannelAsync
>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;

describe('notifications service', () => {
  beforeEach(() => {
    __resetNotificationStateForTests();
    mockGetPerms.mockReset().mockResolvedValue({ status: 'granted' } as any);
    mockRequestPerms.mockReset().mockResolvedValue({ status: 'granted' } as any);
    mockSchedule.mockReset().mockResolvedValue('notif-id' as any);
    mockCancel.mockReset().mockResolvedValue(undefined as any);
    mockSetHandler.mockClear();
    mockSetChannel.mockClear();
    mockToastShow.mockClear();
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  describe('initNotifications', () => {
    it('calls setNotificationHandler once and is idempotent', async () => {
      await initNotifications();
      await initNotifications();
      expect(mockSetHandler).toHaveBeenCalledTimes(1);
    });

    it('creates Android channel with HIGH importance', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
      await initNotifications();
      expect(mockSetChannel).toHaveBeenCalledWith(
        'workout-timer',
        expect.objectContaining({
          importance: Notifications.AndroidImportance.HIGH,
        }),
      );
    });

    it('does not create an Android channel on iOS', async () => {
      await initNotifications();
      expect(mockSetChannel).not.toHaveBeenCalled();
    });
  });

  describe('ensureNotificationPermission', () => {
    it('returns true for granted without calling requestPermissionsAsync', async () => {
      mockGetPerms.mockResolvedValue({ status: 'granted' } as any);
      expect(await ensureNotificationPermission()).toBe(true);
      expect(mockRequestPerms).not.toHaveBeenCalled();
    });

    it('requests when undetermined and returns true on grant', async () => {
      mockGetPerms.mockResolvedValue({ status: 'undetermined' } as any);
      mockRequestPerms.mockResolvedValue({ status: 'granted' } as any);
      expect(await ensureNotificationPermission()).toBe(true);
      expect(mockRequestPerms).toHaveBeenCalledTimes(1);
    });

    it('returns false and shows toast exactly once on first denial', async () => {
      mockGetPerms.mockResolvedValue({ status: 'undetermined' } as any);
      mockRequestPerms.mockResolvedValue({ status: 'denied' } as any);

      expect(await ensureNotificationPermission()).toBe(false);
      expect(mockToastShow).toHaveBeenCalledTimes(1);

      // Subsequent undetermined→denied must not re-show the toast.
      expect(await ensureNotificationPermission()).toBe(false);
      expect(mockToastShow).toHaveBeenCalledTimes(1);
    });

    it('returns false without toast when already denied', async () => {
      mockGetPerms.mockResolvedValue({ status: 'denied' } as any);
      expect(await ensureNotificationPermission()).toBe(false);
      expect(mockRequestPerms).not.toHaveBeenCalled();
      expect(mockToastShow).not.toHaveBeenCalled();
    });
  });

  describe('scheduleRestNotification', () => {
    it('passes content and trigger, returns mocked ID', async () => {
      mockGetPerms.mockResolvedValue({ status: 'granted' } as any);
      mockSchedule.mockResolvedValue('mock-id' as any);
      const id = await scheduleRestNotification('Bench Press', 60);
      expect(id).toBe('mock-id');
      expect(mockSchedule).toHaveBeenCalledWith({
        content: expect.objectContaining({ title: 'Rest complete', body: 'Bench Press' }),
        trigger: expect.objectContaining({
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 60,
          channelId: 'workout-timer',
        }),
      });
    });

    it('returns null when permission is denied', async () => {
      mockGetPerms.mockResolvedValue({ status: 'denied' } as any);
      expect(await scheduleRestNotification('Squat', 60)).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('returns null on thrown error', async () => {
      mockGetPerms.mockResolvedValue({ status: 'granted' } as any);
      mockSchedule.mockRejectedValue(new Error('boom'));
      expect(await scheduleRestNotification('Squat', 60)).toBeNull();
    });
  });

  describe('fireRestCompleteHaptic', () => {
    const mockHaptic = Haptics.notificationAsync as jest.MockedFunction<
      typeof Haptics.notificationAsync
    >;

    beforeEach(() => {
      mockHaptic.mockClear();
    });

    it('calls Haptics.notificationAsync with Success feedback type', () => {
      fireRestCompleteHaptic();
      expect(mockHaptic).toHaveBeenCalledTimes(1);
      expect(mockHaptic).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    });

    it('swallows rejections from Haptics', () => {
      mockHaptic.mockRejectedValueOnce(new Error('boom'));
      expect(() => fireRestCompleteHaptic()).not.toThrow();
    });
  });

  describe('cancelScheduledNotification', () => {
    it('no-ops on null', async () => {
      await cancelScheduledNotification(null);
      expect(mockCancel).not.toHaveBeenCalled();
    });

    it('calls the expo API with the id', async () => {
      await cancelScheduledNotification('abc');
      expect(mockCancel).toHaveBeenCalledWith('abc');
    });

    it('swallows errors', async () => {
      mockCancel.mockRejectedValue(new Error('boom'));
      await expect(cancelScheduledNotification('abc')).resolves.toBeUndefined();
    });
  });
});
