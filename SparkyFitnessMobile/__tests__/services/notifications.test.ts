import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { Alert, Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  __resetNotificationStateForTests,
  cancelAllScheduledNotifications,
  cancelScheduledNotification,
  ensureNotificationPermission,
  fireRestCompleteHaptic,
  initNotifications,
  maybePromptForExactAlarmPermission,
  scheduleFastGoalNotification,
  scheduleRestNotification,
  setNotificationsEnabled,
} from '../../src/services/notifications';
import { ExactAlarmBridge } from '../../src/services/ExactAlarmBridge';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/ExactAlarmBridge', () => ({
  ExactAlarmBridge: {
    isAvailable: true,
    canScheduleExactAlarms: jest.fn(async () => false),
    openExactAlarmSettings: jest.fn(async () => undefined),
  },
}));

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
const mockCancelAll = Notifications.cancelAllScheduledNotificationsAsync as jest.MockedFunction<
  typeof Notifications.cancelAllScheduledNotificationsAsync
>;
const mockSetHandler = Notifications.setNotificationHandler as jest.MockedFunction<
  typeof Notifications.setNotificationHandler
>;
const mockSetChannel = Notifications.setNotificationChannelAsync as jest.MockedFunction<
  typeof Notifications.setNotificationChannelAsync
>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;

describe('notifications service', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetNotificationStateForTests();
    mockGetPerms.mockReset().mockResolvedValue({ status: 'granted' } as any);
    mockRequestPerms.mockReset().mockResolvedValue({ status: 'granted' } as any);
    mockSchedule.mockReset().mockResolvedValue('notif-id' as any);
    mockCancel.mockReset().mockResolvedValue(undefined as any);
    mockCancelAll.mockReset().mockResolvedValue(undefined as any);
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

    it('creates a dedicated fasting Android channel', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
      await initNotifications();
      expect(mockSetChannel).toHaveBeenCalledWith(
        'fasting',
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

  describe('scheduleFastGoalNotification', () => {
    it('schedules a DATE-trigger notification on the fasting channel for a future target', async () => {
      mockGetPerms.mockResolvedValue({ status: 'granted' } as any);
      mockSchedule.mockResolvedValue('fast-goal-id' as any);
      const target = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const id = await scheduleFastGoalNotification(target);

      expect(id).toBe('fast-goal-id');
      expect(mockSchedule).toHaveBeenCalledWith({
        content: expect.objectContaining({ title: 'Fasting goal reached' }),
        trigger: expect.objectContaining({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          channelId: 'fasting',
        }),
      });
    });

    it('returns null and schedules nothing for a past target', async () => {
      const target = new Date(Date.now() - 60 * 1000).toISOString();
      const id = await scheduleFastGoalNotification(target);
      expect(id).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('returns null when permission is denied', async () => {
      mockGetPerms.mockResolvedValue({ status: 'denied' } as any);
      const target = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      expect(await scheduleFastGoalNotification(target)).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('returns null on an invalid date string', async () => {
      expect(await scheduleFastGoalNotification('not-a-date')).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
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

  describe('notifications-enabled toggle', () => {
    it('updates the in-memory value when toggled', async () => {
      await setNotificationsEnabled(false);
      expect(useAppPreferencesStore.getState().notificationsEnabled).toBe(false);

      await setNotificationsEnabled(true);
      expect(useAppPreferencesStore.getState().notificationsEnabled).toBe(true);
    });

    it('skips scheduling a rest notification when disabled', async () => {
      await setNotificationsEnabled(false);
      expect(await scheduleRestNotification('Bench Press', 60)).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(mockGetPerms).not.toHaveBeenCalled();
    });

    it('skips scheduling a fast-goal notification when disabled', async () => {
      await setNotificationsEnabled(false);
      const target = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      expect(await scheduleFastGoalNotification(target)).toBeNull();
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(mockGetPerms).not.toHaveBeenCalled();
    });

    it('cancels already-scheduled notifications when turned off', async () => {
      await setNotificationsEnabled(false);
      expect(mockCancelAll).toHaveBeenCalledTimes(1);
    });

    it('does not cancel scheduled notifications when turned on', async () => {
      await setNotificationsEnabled(true);
      expect(mockCancelAll).not.toHaveBeenCalled();
    });
  });

  describe('cancelAllScheduledNotifications', () => {
    it('calls the expo cancel-all API', async () => {
      await cancelAllScheduledNotifications();
      expect(mockCancelAll).toHaveBeenCalledTimes(1);
    });

    it('swallows errors', async () => {
      mockCancelAll.mockRejectedValue(new Error('boom'));
      await expect(cancelAllScheduledNotifications()).resolves.toBeUndefined();
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

  describe('maybePromptForExactAlarmPermission', () => {
    const mockCanExact =
      ExactAlarmBridge.canScheduleExactAlarms as jest.MockedFunction<
        typeof ExactAlarmBridge.canScheduleExactAlarms
      >;
    const mockOpenSettings =
      ExactAlarmBridge.openExactAlarmSettings as jest.MockedFunction<
        typeof ExactAlarmBridge.openExactAlarmSettings
      >;
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
      alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      mockCanExact.mockReset().mockResolvedValue(false);
      mockOpenSettings.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
      alertSpy.mockRestore();
    });

    it('prompts once and persists the shown flag', async () => {
      await maybePromptForExactAlarmPermission();
      expect(alertSpy).toHaveBeenCalledTimes(1);

      await maybePromptForExactAlarmPermission();
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('does not prompt when exact alarms are already allowed', async () => {
      mockCanExact.mockResolvedValue(true);
      await maybePromptForExactAlarmPermission();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not prompt when the notifications toggle is off', async () => {
      useAppPreferencesStore.getState().setNotificationsEnabled(false);
      await maybePromptForExactAlarmPermission();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not prompt without OS notification permission', async () => {
      mockGetPerms.mockResolvedValue({ status: 'denied' } as any);
      await maybePromptForExactAlarmPermission();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('the settings button opens the exact-alarm grant screen', async () => {
      await maybePromptForExactAlarmPermission();
      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      const openButton = buttons.find((b) => b.text === 'Open Settings');
      openButton?.onPress?.();
      expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    });
  });
});
