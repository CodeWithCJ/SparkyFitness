import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { reconcileMedicationReminders } from '../../src/services/medicationReminderService';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import type {
  MedicationDetail,
  MedicationEntry,
  MedicationSchedule,
} from '../../src/types/medications';

const mockGetPerms = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const mockSchedule = Notifications.scheduleNotificationAsync as jest.MockedFunction<
  typeof Notifications.scheduleNotificationAsync
>;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.MockedFunction<
  typeof Notifications.cancelScheduledNotificationAsync
>;
const mockGetAllScheduled = Notifications.getAllScheduledNotificationsAsync as jest.MockedFunction<
  typeof Notifications.getAllScheduledNotificationsAsync
>;
const mockSetChannel = Notifications.setNotificationChannelAsync as jest.MockedFunction<
  typeof Notifications.setNotificationChannelAsync
>;

// Fixed "now": 2026-07-28 08:00 local. getTodayDate() and the past-dose
// cutoff in the service both derive from this.
const NOW = new Date(2026, 6, 28, 8, 0, 0);
const TODAY = '2026-07-28';
const BASE_KEY = `med_${TODAY}_med-1_sched-1_09:00`;

function buildSchedule(overrides: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    id: 'sched-1',
    medication_id: 'med-1',
    schedule_type_id: 'daily',
    time_of_day: '09:00',
    active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function buildMedication(overrides: Partial<MedicationDetail> = {}): MedicationDetail {
  return {
    id: 'med-1',
    user_id: 'user-1',
    name: 'Metformin',
    type_id: 'pill',
    dose_amount: 500,
    dose_unit: 'mg',
    is_glp1: false,
    is_active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    schedules: [buildSchedule()],
    ...overrides,
  };
}

function buildEntry(overrides: Partial<MedicationEntry> = {}): MedicationEntry {
  return {
    id: 'entry-1',
    user_id: 'user-1',
    medication_id: 'med-1',
    schedule_id: 'sched-1',
    status: 'taken',
    entry_date: TODAY,
    created_at: `${TODAY}T09:05:00Z`,
    updated_at: `${TODAY}T09:05:00Z`,
    ...overrides,
  };
}

function pendingRequest(
  identifier: string,
  data?: Record<string, string>,
): Notifications.NotificationRequest {
  return {
    identifier,
    content: { data },
    trigger: null,
  } as unknown as Notifications.NotificationRequest;
}

describe('reconcileMedicationReminders', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    __resetAppPreferencesStoreForTests();
    mockGetPerms.mockReset().mockResolvedValue({ status: 'granted' } as never);
    mockSchedule.mockReset().mockResolvedValue('notif-id' as never);
    mockCancel.mockReset().mockResolvedValue(undefined);
    mockGetAllScheduled.mockReset().mockResolvedValue([]);
    mockSetChannel.mockClear();
    Object.defineProperty(Platform, 'OS', { get: () => 'ios', configurable: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when reminders are off', () => {
    it.each([
      ['medication reminders pref', { medicationRemindersEnabled: false }],
      ['app notifications toggle', { notificationsEnabled: false }],
    ])('cancels pending medication reminders when the %s is off', async (_label, prefs) => {
      useAppPreferencesStore.setState(prefs);
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
        pendingRequest('n2', undefined),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledTimes(1);
      expect(mockCancel).toHaveBeenCalledWith('n1');
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('cancels pending medication reminders when the OS permission is not granted', async () => {
      mockGetPerms.mockResolvedValue({ status: 'denied' } as never);
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('n1');
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('never cancels non-medication notifications', async () => {
      useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('rest-timer', { workoutId: 'w1' }),
        pendingRequest('fasting-goal', undefined),
      ]);

      await reconcileMedicationReminders([], []);

      expect(mockCancel).not.toHaveBeenCalled();
    });
  });

  describe('scheduling', () => {
    it('schedules a base reminder plus 10/20/30-minute repeats for an unlogged future dose', async () => {
      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockSchedule).toHaveBeenCalledTimes(4);
      expect(mockSchedule).toHaveBeenNthCalledWith(1, {
        content: {
          title: 'Medication reminder',
          body: 'Time to take Metformin (500 mg)',
          sound: true,
          categoryIdentifier: 'medication-reminder',
          data: {
            medicationId: 'med-1',
            scheduleId: 'sched-1',
            entryDate: TODAY,
            key: BASE_KEY,
            baseKey: BASE_KEY,
          },
        },
        trigger: {
          type: 'date',
          date: new Date(2026, 6, 28, 9, 0, 0, 0),
          channelId: 'medication-reminders',
        },
      });

      const repeatCalls = mockSchedule.mock.calls.slice(1);
      expect(repeatCalls.map((c) => c[0].content.data?.key)).toEqual([
        `${BASE_KEY}_10`,
        `${BASE_KEY}_20`,
        `${BASE_KEY}_30`,
      ]);
      expect(
        repeatCalls.map((c) => (c[0].trigger as { date: Date }).date),
      ).toEqual([
        new Date(2026, 6, 28, 9, 10, 0, 0),
        new Date(2026, 6, 28, 9, 20, 0, 0),
        new Date(2026, 6, 28, 9, 30, 0, 0),
      ]);
      // Repeats keep pointing at the base dose so a "taken" response can
      // sweep the whole chain.
      expect(repeatCalls.every((c) => c[0].content.data?.baseKey === BASE_KEY)).toBe(true);
    });

    it('schedules only the base reminder when repeats are disabled', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(mockSchedule.mock.calls[0][0].content.data?.key).toBe(BASE_KEY);
    });

    it('omits the dose suffix from the body when the medication has no dose amount', async () => {
      await reconcileMedicationReminders(
        [buildMedication({ dose_amount: null, dose_unit: null })],
        [],
      );

      expect(mockSchedule.mock.calls[0][0].content.body).toBe('Time to take Metformin');
    });

    it.each([['taken'], ['skipped']] as const)(
      'schedules nothing and cancels the pending chain when the dose is %s',
      async (status) => {
        mockGetAllScheduled.mockResolvedValue([
          pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
          pendingRequest('n2', { medicationId: 'med-1', key: `${BASE_KEY}_10` }),
        ]);

        await reconcileMedicationReminders([buildMedication()], [buildEntry({ status })]);

        expect(mockSchedule).not.toHaveBeenCalled();
        expect(mockCancel).toHaveBeenCalledTimes(2);
        expect(mockCancel).toHaveBeenCalledWith('n1');
        expect(mockCancel).toHaveBeenCalledWith('n2');
      },
    );

    it('still schedules when the only entry is snoozed', async () => {
      await reconcileMedicationReminders(
        [buildMedication()],
        [buildEntry({ status: 'snoozed' })],
      );

      expect(mockSchedule).toHaveBeenCalledTimes(4);
    });

    it('still schedules when the logged entry belongs to a different schedule', async () => {
      await reconcileMedicationReminders(
        [buildMedication()],
        [buildEntry({ schedule_id: 'sched-other' })],
      );

      expect(mockSchedule).toHaveBeenCalledTimes(4);
    });

    it('skips schedules with no time of day', async () => {
      await reconcileMedicationReminders(
        [buildMedication({ schedules: [buildSchedule({ time_of_day: null })] })],
        [],
      );

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('skips inactive medications', async () => {
      await reconcileMedicationReminders([buildMedication({ is_active: false })], []);

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('schedules nothing when the dose time and all repeats are in the past', async () => {
      await reconcileMedicationReminders(
        [buildMedication({ schedules: [buildSchedule({ time_of_day: '07:00' })] })],
        [],
      );

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('schedules only the still-future repeats when the base time just passed', async () => {
      // Dose at 07:55, now 08:00: base is past, repeats land at 08:05/08:15/08:25.
      await reconcileMedicationReminders(
        [buildMedication({ schedules: [buildSchedule({ time_of_day: '07:55' })] })],
        [],
      );

      expect(mockSchedule).toHaveBeenCalledTimes(3);
      const baseKey = `med_${TODAY}_med-1_sched-1_07:55`;
      expect(mockSchedule.mock.calls.map((c) => c[0].content.data?.key)).toEqual([
        `${baseKey}_10`,
        `${baseKey}_20`,
        `${baseKey}_30`,
      ]);
    });

    it('does not reschedule a dose whose base reminder is already pending', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).not.toHaveBeenCalled();
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('cancels stale reminders from a previous day and schedules fresh ones', async () => {
      const staleKey = 'med_2026-07-27_med-1_sched-1_09:00';
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('stale', { medicationId: 'med-1', key: staleKey }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('stale');
      expect(mockSchedule).toHaveBeenCalledTimes(4);
    });

    it('cancels medication notifications that carry no key', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('legacy', { medicationId: 'med-1' }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('legacy');
      expect(mockSchedule).toHaveBeenCalledTimes(1);
    });
  });

  describe('platform channel', () => {
    it('ensures the Android medication channel before scheduling', async () => {
      Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockSetChannel).toHaveBeenCalledWith(
        'medication-reminders',
        expect.objectContaining({ importance: Notifications.AndroidImportance.HIGH }),
      );
    });
  });

  describe('locking', () => {
    it('makes a concurrent second call a no-op', async () => {
      useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
      ]);

      const first = reconcileMedicationReminders([], []);
      const second = reconcileMedicationReminders([], []);
      await Promise.all([first, second]);

      expect(mockGetAllScheduled).toHaveBeenCalledTimes(1);
      expect(mockCancel).toHaveBeenCalledTimes(1);
    });
  });
});
