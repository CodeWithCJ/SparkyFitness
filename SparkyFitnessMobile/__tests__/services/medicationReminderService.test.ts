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
} from '@workspace/shared';

const mockGetPerms = Notifications.getPermissionsAsync as jest.MockedFunction<
  typeof Notifications.getPermissionsAsync
>;
const mockSchedule =
  Notifications.scheduleNotificationAsync as jest.MockedFunction<
    typeof Notifications.scheduleNotificationAsync
  >;
const mockCancel =
  Notifications.cancelScheduledNotificationAsync as jest.MockedFunction<
    typeof Notifications.cancelScheduledNotificationAsync
  >;
const mockGetAllScheduled =
  Notifications.getAllScheduledNotificationsAsync as jest.MockedFunction<
    typeof Notifications.getAllScheduledNotificationsAsync
  >;
const mockSetChannel =
  Notifications.setNotificationChannelAsync as jest.MockedFunction<
    typeof Notifications.setNotificationChannelAsync
  >;

// Fixed "now": 2026-07-28 08:00 local. getTodayDate() and the past-dose
// cutoff in the service both derive from this.
const NOW = new Date(2026, 6, 28, 8, 0, 0);
const TODAY = '2026-07-28';
const BASE_KEY = `med_${TODAY}_med-1_sched-1_09:00`;

// The 7-day scheduling window starting at NOW.
const WINDOW_DATES = [
  '2026-07-28',
  '2026-07-29',
  '2026-07-30',
  '2026-07-31',
  '2026-08-01',
  '2026-08-02',
  '2026-08-03',
];

const baseKeyFor = (date: string) => `med_${date}_med-1_sched-1_09:00`;

function buildSchedule(
  overrides: Partial<MedicationSchedule> = {}
): MedicationSchedule {
  return {
    id: 'sched-1',
    medication_id: 'med-1',
    schedule_type_id: 'daily',
    time_of_day: '09:00',
    dose_amount: null,
    days_of_week: null,
    interval_days: null,
    day_of_month: null,
    cycle_on_days: null,
    cycle_off_days: null,
    prn_reason: null,
    prn_max_per_day: null,
    with_meal: null,
    start_date: null,
    end_date: null,
    active: true,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function buildMedication(
  overrides: Partial<MedicationDetail> = {}
): MedicationDetail {
  return {
    id: 'med-1',
    user_id: 'user-1',
    name: 'Metformin',
    display_name: null,
    type_id: 'pill',
    route_id: null,
    strength_value: null,
    strength_unit: null,
    dose_amount: 500,
    dose_unit: 'mg',
    reason_text: null,
    effectiveness_rating: null,
    color: null,
    icon: null,
    photo_path: null,
    is_active: true,
    is_quick: false,
    is_glp1: false,
    notes: null,
    source: 'manual',
    custom_fields: {},
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
    taken_at: `${TODAY}T09:05:00Z`,
    scheduled_for: null,
    entry_date: TODAY,
    med_name_snapshot: null,
    dose_amount_snapshot: null,
    dose_unit_snapshot: null,
    notes: null,
    source: 'manual',
    custom_fields: {},
    created_at: `${TODAY}T09:05:00Z`,
    updated_at: `${TODAY}T09:05:00Z`,
    ...overrides,
  };
}

function pendingRequest(
  identifier: string,
  data?: Record<string, string>
): Notifications.NotificationRequest {
  return {
    identifier,
    content: { data },
    trigger: null,
  } as unknown as Notifications.NotificationRequest;
}

function scheduledKeys(): string[] {
  return (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map(
    (c) => c[0].content.data?.key as string
  );
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
    Object.defineProperty(Platform, 'OS', {
      get: () => 'ios',
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when reminders are off', () => {
    it.each([
      ['medication reminders pref', { medicationRemindersEnabled: false }],
      ['app notifications toggle', { notificationsEnabled: false }],
    ])(
      'cancels pending medication reminders when the %s is off',
      async (_label, prefs) => {
        useAppPreferencesStore.setState(prefs);
        mockGetAllScheduled.mockResolvedValue([
          pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
          pendingRequest('n2', undefined),
        ]);

        await reconcileMedicationReminders([buildMedication()], []);

        expect(mockCancel).toHaveBeenCalledTimes(1);
        expect(mockCancel).toHaveBeenCalledWith('n1');
        expect(mockSchedule).not.toHaveBeenCalled();
      }
    );

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

      expect(mockSchedule).toHaveBeenNthCalledWith(1, {
        content: {
          title: 'Medication reminder',
          body: 'Scheduled dose: Metformin (500 mg)',
          sound: true,
          categoryIdentifier: 'medication-reminder',
          data: {
            medicationId: 'med-1',
            scheduleId: 'sched-1',
            userId: 'user-1',
            entryDate: TODAY,
            key: BASE_KEY,
            baseKey: BASE_KEY,
            hideNames: 'false',
            locale: 'en',
          },
        },
        trigger: {
          type: 'date',
          date: new Date(2026, 6, 28, 9, 0, 0, 0),
          channelId: 'medication-reminders',
        },
      });

      const repeatCalls = mockSchedule.mock.calls.slice(1, 4);
      expect(repeatCalls.map((c) => c[0].content.data?.key)).toEqual([
        `${BASE_KEY}_10`,
        `${BASE_KEY}_20`,
        `${BASE_KEY}_30`,
      ]);
      expect(
        repeatCalls.map((c) => (c[0].trigger as { date: Date }).date)
      ).toEqual([
        new Date(2026, 6, 28, 9, 10, 0, 0),
        new Date(2026, 6, 28, 9, 20, 0, 0),
        new Date(2026, 6, 28, 9, 30, 0, 0),
      ]);
      // Repeats keep pointing at the base dose so a "taken" response can
      // sweep the whole chain.
      expect(
        repeatCalls.every((c) => c[0].content.data?.baseKey === BASE_KEY)
      ).toBe(true);
    });

    it('schedules base reminders for the whole 7-day window, with repeats only today', async () => {
      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockSchedule).toHaveBeenCalledTimes(10);
      const keys = scheduledKeys();
      for (const date of WINDOW_DATES) {
        expect(keys).toContain(baseKeyFor(date));
      }
      expect(
        keys.filter(
          (k) => k.endsWith('_10') || k.endsWith('_20') || k.endsWith('_30')
        )
      ).toEqual([`${BASE_KEY}_10`, `${BASE_KEY}_20`, `${BASE_KEY}_30`]);

      // Future reminders log the dose against their own day, not today.
      const day3 = mockSchedule.mock.calls.find(
        (c) => c[0].content.data?.key === baseKeyFor('2026-07-31')
      );
      expect(day3?.[0].content.data?.entryDate).toBe('2026-07-31');
      expect((day3?.[0].trigger as { date: Date }).date).toEqual(
        new Date(2026, 6, 31, 9, 0, 0, 0)
      );
    });

    it('schedules only base reminders when repeats are disabled', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });

      await reconcileMedicationReminders([buildMedication()], []);

      expect(scheduledKeys()).toEqual(WINDOW_DATES.map(baseKeyFor));
    });

    it('omits the dose suffix from the body when the medication has no dose amount', async () => {
      await reconcileMedicationReminders(
        [buildMedication({ dose_amount: null, dose_unit: null })],
        []
      );

      expect(mockSchedule.mock.calls[0][0].content.body).toBe(
        'Scheduled dose: Metformin'
      );
    });

    it.each([['taken'], ['skipped']] as const)(
      'drops today and cancels the pending chain when the dose is %s',
      async (status) => {
        mockGetAllScheduled.mockResolvedValue([
          pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
          pendingRequest('n2', {
            medicationId: 'med-1',
            key: `${BASE_KEY}_10`,
          }),
        ]);

        await reconcileMedicationReminders(
          [buildMedication()],
          [buildEntry({ status })]
        );

        expect(scheduledKeys()).toEqual(WINDOW_DATES.slice(1).map(baseKeyFor));
        expect(mockCancel).toHaveBeenCalledTimes(2);
        expect(mockCancel).toHaveBeenCalledWith('n1');
        expect(mockCancel).toHaveBeenCalledWith('n2');
      }
    );

    it('still schedules when the only entry is snoozed', async () => {
      await reconcileMedicationReminders(
        [buildMedication()],
        [buildEntry({ status: 'snoozed' })]
      );

      expect(mockSchedule).toHaveBeenCalledTimes(10);
    });

    it('still schedules when the logged entry belongs to a different schedule', async () => {
      await reconcileMedicationReminders(
        [buildMedication()],
        [buildEntry({ schedule_id: 'sched-other' })]
      );

      expect(mockSchedule).toHaveBeenCalledTimes(10);
    });

    it('treats a schedule-less entry for the medication as logging today, like the dashboard card', async () => {
      await reconcileMedicationReminders(
        [buildMedication()],
        [buildEntry({ schedule_id: null })]
      );

      expect(scheduledKeys()).toEqual(WINDOW_DATES.slice(1).map(baseKeyFor));
    });

    it('skips schedules with no time of day', async () => {
      await reconcileMedicationReminders(
        [
          buildMedication({
            schedules: [buildSchedule({ time_of_day: null })],
          }),
        ],
        []
      );

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('skips inactive medications', async () => {
      await reconcileMedicationReminders(
        [buildMedication({ is_active: false })],
        []
      );

      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('skips today entirely when the dose time and all repeats are in the past', async () => {
      await reconcileMedicationReminders(
        [
          buildMedication({
            schedules: [buildSchedule({ time_of_day: '07:00' })],
          }),
        ],
        []
      );

      expect(mockSchedule).toHaveBeenCalledTimes(6);
      expect(scheduledKeys().every((k) => !k.includes(TODAY))).toBe(true);
    });

    it('schedules only the still-future repeats when the base time just passed', async () => {
      // Dose at 07:55, now 08:00: base is past, repeats land at 08:05/08:15/08:25.
      await reconcileMedicationReminders(
        [
          buildMedication({
            schedules: [buildSchedule({ time_of_day: '07:55' })],
          }),
        ],
        []
      );

      expect(mockSchedule).toHaveBeenCalledTimes(9);
      const baseKey = `med_${TODAY}_med-1_sched-1_07:55`;
      expect(scheduledKeys().slice(0, 3)).toEqual([
        `${baseKey}_10`,
        `${baseKey}_20`,
        `${baseKey}_30`,
      ]);
    });

    it('replaces pending reminders when the effective app language changes', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('english', {
          medicationId: 'med-1',
          key: BASE_KEY,
          hideNames: 'false',
          locale: 'pl',
        }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('english');
      expect(mockSchedule.mock.calls[0][0].content.data?.locale).toBe('en');
    });

    it('does not reschedule a dose whose base reminder is already pending', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).not.toHaveBeenCalled();
      expect(scheduledKeys()).toEqual(WINDOW_DATES.slice(1).map(baseKeyFor));
    });

    it('adds the repeat pings behind an already-pending base reminder when repeats turn on mid-day', async () => {
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('n1', { medicationId: 'med-1', key: BASE_KEY }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).not.toHaveBeenCalled();
      const keys = scheduledKeys();
      expect(keys).not.toContain(BASE_KEY);
      expect(keys).toEqual(
        expect.arrayContaining([
          `${BASE_KEY}_10`,
          `${BASE_KEY}_20`,
          `${BASE_KEY}_30`,
        ])
      );
    });

    it('cancels stale reminders from a previous day and schedules fresh ones', async () => {
      const staleKey = 'med_2026-07-27_med-1_sched-1_09:00';
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('stale', { medicationId: 'med-1', key: staleKey }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('stale');
      expect(mockSchedule).toHaveBeenCalledTimes(10);
    });

    it('cancels medication notifications that carry no key', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('legacy', { medicationId: 'med-1' }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('legacy');
      expect(mockSchedule).toHaveBeenCalledTimes(7);
    });

    it('stops the lookahead at a schedule end date', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });

      await reconcileMedicationReminders(
        [
          buildMedication({
            schedules: [buildSchedule({ end_date: '2026-07-30' })],
          }),
        ],
        []
      );

      expect(scheduledKeys()).toEqual([
        baseKeyFor('2026-07-28'),
        baseKeyFor('2026-07-29'),
        baseKeyFor('2026-07-30'),
      ]);
    });
  });

  describe('hide names', () => {
    beforeEach(() => {
      useAppPreferencesStore.setState({ medicationReminderHideNames: true });
    });

    it('uses a generic body with no medication name or dose', async () => {
      await reconcileMedicationReminders([buildMedication()], []);

      for (const call of mockSchedule.mock.calls) {
        expect(call[0].content.body).toBe('You have a scheduled dose');
        expect(call[0].content.data?.hideNames).toBe('true');
      }
    });

    it('cancels pending named reminders and reschedules them censored when the preference turns on', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('named', {
          medicationId: 'med-1',
          key: BASE_KEY,
          hideNames: 'false',
        }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('named');
      expect(scheduledKeys()).toEqual(WINDOW_DATES.map(baseKeyFor));
    });

    it('treats unstamped pending reminders as named and replaces them', async () => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('legacy-named', {
          medicationId: 'med-1',
          key: BASE_KEY,
        }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('legacy-named');
      expect(scheduledKeys()).toContain(BASE_KEY);
    });

    it('cancels pending censored reminders and reschedules them named when the preference turns back off', async () => {
      useAppPreferencesStore.setState({
        medicationReminderHideNames: false,
        medicationReminderRepeats: false,
      });
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('censored', {
          medicationId: 'med-1',
          key: BASE_KEY,
          hideNames: 'true',
        }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('censored');
      const base = mockSchedule.mock.calls.find(
        (c) => c[0].content.data?.key === BASE_KEY
      );
      expect(base?.[0].content.body).toBe('Scheduled dose: Metformin (500 mg)');
    });
  });

  describe('platform channel', () => {
    it('ensures the Android medication channel before scheduling', async () => {
      Object.defineProperty(Platform, 'OS', {
        get: () => 'android',
        configurable: true,
      });

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockSetChannel).toHaveBeenCalledWith(
        'medication-reminders',
        expect.objectContaining({
          importance: Notifications.AndroidImportance.HIGH,
        })
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

  describe('consolidated reminders', () => {
    const med2 = buildMedication({
      id: 'med-2',
      name: 'Lisinopril',
      dose_amount: 10,
      dose_unit: 'mg',
      schedules: [buildSchedule({ id: 'sched-2', medication_id: 'med-2' })],
    });

    const med3 = buildMedication({
      id: 'med-3',
      name: 'Vitamin D3',
      dose_amount: 1000,
      dose_unit: 'IU',
      schedules: [buildSchedule({ id: 'sched-3', medication_id: 'med-3' })],
    });

    const med4 = buildMedication({
      id: 'med-4',
      name: 'Aspirin',
      dose_amount: 81,
      dose_unit: 'mg',
      schedules: [buildSchedule({ id: 'sched-4', medication_id: 'med-4' })],
    });

    const med5 = buildMedication({
      id: 'med-5',
      name: 'Omega 3',
      dose_amount: 1000,
      dose_unit: 'mg',
      schedules: [buildSchedule({ id: 'sched-5', medication_id: 'med-5' })],
    });

    it('consolidates multiple medications due at the same time into a single notification', async () => {
      await reconcileMedicationReminders([buildMedication(), med2], []);

      // 1 base + 3 repeats today + 6 days lookahead = 10 calls (instead of 20)
      expect(mockSchedule).toHaveBeenCalledTimes(10);

      const firstCall = mockSchedule.mock.calls[0][0];
      expect(firstCall.content.title).toBe('Medication reminder');
      expect(firstCall.content.categoryIdentifier).toBe(
        'medication-reminder-group'
      );
      expect(firstCall.content.body).toBe(
        'Scheduled doses: Metformin (500 mg), Lisinopril (10 mg)'
      );
      expect(firstCall.content.data?.isGroup).toBe('true');
      expect(JSON.parse(firstCall.content.data?.doses ?? '[]')).toEqual([
        { medicationId: 'med-1', scheduleId: 'sched-1' },
        { medicationId: 'med-2', scheduleId: 'sched-2' },
      ]);
    });

    it('uses overflow formatting when more than 3 medications are due at the same time', async () => {
      await reconcileMedicationReminders(
        [buildMedication(), med2, med3, med4, med5],
        []
      );

      const firstCall = mockSchedule.mock.calls[0][0];
      expect(firstCall.content.body).toBe(
        'Scheduled doses: Metformin (500 mg), Lisinopril (10 mg), Vitamin D3 (1000 IU), and 2 more'
      );
    });

    it('uses pluralized generic body when hideNames is true', async () => {
      useAppPreferencesStore.setState({ medicationReminderHideNames: true });

      await reconcileMedicationReminders([buildMedication(), med2], []);

      const firstCall = mockSchedule.mock.calls[0][0];
      expect(firstCall.content.body).toBe('You have 2 scheduled doses');
      expect(firstCall.content.data?.hideNames).toBe('true');
    });

    it('schedules separate notifications when consolidate preference is disabled', async () => {
      useAppPreferencesStore.setState({
        medicationReminderConsolidate: false,
        medicationReminderRepeats: false,
      });

      await reconcileMedicationReminders([buildMedication(), med2], []);

      // 7 days * 2 medications = 14 notifications
      expect(mockSchedule).toHaveBeenCalledTimes(14);
      for (const call of mockSchedule.mock.calls) {
        expect(call[0].content.categoryIdentifier).toBe('medication-reminder');
        expect(call[0].content.data?.isGroup).toBeUndefined();
      }
    });

    it('cancels group reminder and schedules single reminder when one dose is logged mid-day', async () => {
      const groupKey = 'med_group_2026-07-28_09:00_med-1:sched-1_med-2:sched-2';
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('group-notif', {
          medicationId: 'med-1',
          key: groupKey,
          baseKey: groupKey,
        }),
      ]);

      await reconcileMedicationReminders(
        [buildMedication(), med2],
        [
          buildEntry({
            medication_id: 'med-1',
            schedule_id: 'sched-1',
            status: 'taken',
          }),
        ]
      );

      // The old group notification was cancelled
      expect(mockCancel).toHaveBeenCalledWith('group-notif');

      // The remaining dose (med-2) is now scheduled as a single reminder
      const singleCall = mockSchedule.mock.calls.find(
        (c) => c[0].content.data?.medicationId === 'med-2'
      );
      expect(singleCall).toBeDefined();
      expect(singleCall?.[0].content.categoryIdentifier).toBe(
        'medication-reminder'
      );
      expect(singleCall?.[0].content.body).toBe(
        'Scheduled dose: Lisinopril (10 mg)'
      );
    });

    it('cancels all reminders when all doses in the slot are logged', async () => {
      const groupKey = 'med_group_2026-07-28_09:00_med-1:sched-1_med-2:sched-2';
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('group-notif', {
          medicationId: 'med-1',
          key: groupKey,
          baseKey: groupKey,
        }),
      ]);

      await reconcileMedicationReminders(
        [buildMedication(), med2],
        [
          buildEntry({
            medication_id: 'med-1',
            schedule_id: 'sched-1',
            status: 'taken',
          }),
          buildEntry({
            id: 'entry-2',
            medication_id: 'med-2',
            schedule_id: 'sched-2',
            status: 'taken',
          }),
        ]
      );

      expect(mockCancel).toHaveBeenCalledWith('group-notif');
      const todayScheduled = mockSchedule.mock.calls.filter((c) =>
        (c[0].content.data?.key as string)?.includes(TODAY)
      );
      expect(todayScheduled).toHaveLength(0);
    });

    it('dismisses already-delivered notifications from the tray when a dose is logged', async () => {
      (
        Notifications.getPresentedNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          request: {
            identifier: 'delivered-base',
            content: {
              data: {
                medicationId: 'med-1',
                key: BASE_KEY,
                baseKey: BASE_KEY,
              },
            },
          },
        },
        {
          request: {
            identifier: 'delivered-repeat-10',
            content: {
              data: {
                medicationId: 'med-1',
                key: `${BASE_KEY}_10`,
                baseKey: BASE_KEY,
              },
            },
          },
        },
      ]);

      await reconcileMedicationReminders([buildMedication()], [buildEntry()]);

      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
        'delivered-base'
      );
      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
        'delivered-repeat-10'
      );
    });

    it('dismisses presented medication reminders when notification permission is not granted', async () => {
      mockGetPerms.mockResolvedValue({ status: 'denied' } as never);
      (
        Notifications.getPresentedNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          request: {
            identifier: 'delivered-med',
            content: { data: { medicationId: 'med-1' } },
          },
        },
        {
          request: {
            identifier: 'delivered-other',
            content: { data: { other: 'true' } },
          },
        },
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
        'delivered-med'
      );
      expect(Notifications.dismissNotificationAsync).not.toHaveBeenCalledWith(
        'delivered-other'
      );
    });

    it('reloads today entries when flushPendingMedicationNotificationActions processes a queued action', async () => {
      const handlerMod =
        require('../../src/services/medicationNotificationHandler') as typeof import('../../src/services/medicationNotificationHandler');
      const apiMod =
        require('../../src/services/api/medicationsApi') as typeof import('../../src/services/api/medicationsApi');

      const flushSpy = jest
        .spyOn(handlerMod, 'flushPendingMedicationNotificationActions')
        .mockResolvedValueOnce(true);
      const listEntriesSpy = jest
        .spyOn(apiMod, 'listEntries')
        .mockResolvedValueOnce([buildEntry()]);

      // Pass stale empty entries snapshot; reloaded entries include today's logged dose
      await reconcileMedicationReminders([buildMedication()], []);

      expect(flushSpy).toHaveBeenCalledTimes(1);
      expect(listEntriesSpy).toHaveBeenCalledWith({
        fromDate: TODAY,
        toDate: TODAY,
      });

      // Today's base + repeat reminders should NOT be scheduled since reloaded entries show the dose is logged
      const scheduledKeys = mockSchedule.mock.calls.map(
        (c) => (c[0].content.data as { key: string }).key
      );
      expect(scheduledKeys).not.toContain(BASE_KEY);

      flushSpy.mockRestore();
      listEntriesSpy.mockRestore();
    });

    it('preserves an active snoozed reminder for an unlogged dose without rescheduling its base or repeat slots', async () => {
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('leftover-repeat', {
          medicationId: 'med-1',
          key: `${BASE_KEY}_20`,
          baseKey: BASE_KEY,
        }),
        pendingRequest('snoozed-1', {
          medicationId: 'med-1',
          key: `${BASE_KEY}_snooze_12345`,
          baseKey: BASE_KEY,
          isSnoozed: 'true',
        }),
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).not.toHaveBeenCalledWith('snoozed-1');
      expect(mockCancel).toHaveBeenCalledWith('leftover-repeat');
      expect(scheduledKeys()).toEqual(WINDOW_DATES.slice(1).map(baseKeyFor));
    });

    it('cancels a pending snoozed reminder once its dose is logged', async () => {
      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('snoozed-1', {
          medicationId: 'med-1',
          key: `${BASE_KEY}_snooze_12345`,
          baseKey: BASE_KEY,
          isSnoozed: 'true',
        }),
      ]);

      await reconcileMedicationReminders([buildMedication()], [buildEntry()]);

      expect(mockCancel).toHaveBeenCalledWith('snoozed-1');
    });

    it('does not reschedule future repeat slots after a snoozed reminder has already fired and is only in presented notifications', async () => {
      const pastBaseKey = `med_${TODAY}_med-1_sched-1_07:55`;
      mockGetAllScheduled.mockResolvedValue([]);
      (
        Notifications.getPresentedNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          request: {
            identifier: 'delivered-snooze',
            content: {
              data: {
                medicationId: 'med-1',
                key: `${pastBaseKey}_snooze_12345`,
                baseKey: pastBaseKey,
                isSnoozed: 'true',
              },
            },
          },
        },
      ]);

      await reconcileMedicationReminders(
        [
          buildMedication({
            schedules: [buildSchedule({ time_of_day: '07:55' })],
          }),
        ],
        []
      );

      const keys = scheduledKeys();
      expect(keys).not.toContain(`${pastBaseKey}_10`);
      expect(keys).not.toContain(`${pastBaseKey}_20`);
      expect(keys).not.toContain(`${pastBaseKey}_30`);
      expect(keys.every((k) => !k.startsWith(pastBaseKey))).toBe(true);
    });

    it('retains a cross-day grouped snooze while at least one represented dose is unlogged, then cancels it once all represented doses are logged', async () => {
      const apiMod =
        require('../../src/services/api/medicationsApi') as typeof import('../../src/services/api/medicationsApi');
      const yesterday = '2026-07-27';
      const crossDayGroupKey = `med_group_${yesterday}_23:50_med-1:sched-1_med-2:sched-2`;
      const snoozedRequest = pendingRequest('cross-day-group-snooze', {
        medicationId: 'med-1',
        scheduleId: 'sched-1',
        entryDate: yesterday,
        key: `${crossDayGroupKey}_snooze_99999`,
        baseKey: crossDayGroupKey,
        isGroup: 'true',
        isSnoozed: 'true',
        doses: JSON.stringify([
          { medicationId: 'med-1', scheduleId: 'sched-1' },
          { medicationId: 'med-2', scheduleId: 'sched-2' },
        ]),
      });

      mockGetAllScheduled.mockResolvedValue([snoozedRequest]);

      // First run after midnight: med-1 is taken on yesterday, med-2 is still unlogged
      const listEntriesSpy = jest
        .spyOn(apiMod, 'listEntries')
        .mockResolvedValueOnce([
          buildEntry({
            medication_id: 'med-1',
            schedule_id: 'sched-1',
            entry_date: yesterday,
            status: 'taken',
          }),
        ]);

      await reconcileMedicationReminders([buildMedication(), med2], []);

      expect(listEntriesSpy).toHaveBeenCalledWith({
        fromDate: yesterday,
        toDate: yesterday,
      });
      expect(mockCancel).not.toHaveBeenCalledWith('cross-day-group-snooze');

      // Second run after midnight: both med-1 and med-2 have terminal entries for yesterday
      mockCancel.mockClear();
      listEntriesSpy.mockResolvedValueOnce([
        buildEntry({
          medication_id: 'med-1',
          schedule_id: 'sched-1',
          entry_date: yesterday,
          status: 'taken',
        }),
        buildEntry({
          id: 'entry-2',
          medication_id: 'med-2',
          schedule_id: 'sched-2',
          entry_date: yesterday,
          status: 'skipped',
        }),
      ]);

      await reconcileMedicationReminders([buildMedication(), med2], []);

      expect(mockCancel).toHaveBeenCalledWith('cross-day-group-snooze');
      listEntriesSpy.mockRestore();
    });

    it('retains a same-day grouped snooze when one of its doses is logged, then cancels it once all represented doses are logged', async () => {
      const sameDayGroupKey = `med_group_${TODAY}_07:50_med-1:sched-1_med-2:sched-2`;
      const remainingSingleKey = `med_${TODAY}_med-2_sched-2_07:50`;
      const snoozedRequest = pendingRequest('same-day-group-snooze', {
        medicationId: 'med-1',
        scheduleId: 'sched-1',
        entryDate: TODAY,
        key: `${sameDayGroupKey}_snooze_${Date.now() + 900_000}`,
        baseKey: sameDayGroupKey,
        isGroup: 'true',
        isSnoozed: 'true',
        doses: JSON.stringify([
          { medicationId: 'med-1', scheduleId: 'sched-1' },
          { medicationId: 'med-2', scheduleId: 'sched-2' },
        ]),
      });

      const pastMed1 = buildMedication({
        id: 'med-1',
        schedules: [buildSchedule({ id: 'sched-1', time_of_day: '07:50' })],
      });
      const pastMed2 = buildMedication({
        id: 'med-2',
        name: 'Lisinopril',
        schedules: [
          buildSchedule({
            id: 'sched-2',
            medication_id: 'med-2',
            time_of_day: '07:50',
          }),
        ],
      });

      mockGetAllScheduled.mockResolvedValue([snoozedRequest]);

      // One dose (med-1) in the snoozed group is logged; med-2 remains unlogged.
      await reconcileMedicationReminders(
        [pastMed1, pastMed2],
        [
          buildEntry({
            medication_id: 'med-1',
            schedule_id: 'sched-1',
            entry_date: TODAY,
            status: 'taken',
          }),
        ]
      );

      expect(mockCancel).not.toHaveBeenCalledWith('same-day-group-snooze');
      // The remaining dose (med-2) is covered by the retained group snooze, so
      // no duplicate repeat notifications for med-2 are scheduled for today.
      expect(
        scheduledKeys().some((k) => k.startsWith(remainingSingleKey))
      ).toBe(false);

      // Once med-2 is also logged, the grouped snooze is cancelled.
      mockCancel.mockClear();
      await reconcileMedicationReminders(
        [pastMed1, pastMed2],
        [
          buildEntry({
            medication_id: 'med-1',
            schedule_id: 'sched-1',
            entry_date: TODAY,
            status: 'taken',
          }),
          buildEntry({
            id: 'entry-2',
            medication_id: 'med-2',
            schedule_id: 'sched-2',
            entry_date: TODAY,
            status: 'taken',
          }),
        ]
      );

      expect(mockCancel).toHaveBeenCalledWith('same-day-group-snooze');
    });

    it('replaces pending and delivered named snoozed reminders with generic copy when hideNames is enabled', async () => {
      useAppPreferencesStore.setState({ medicationReminderHideNames: true });
      const snoozeFireAt = new Date('2026-07-28T09:45:00');
      const snoozeKey = `${BASE_KEY}_snooze_${snoozeFireAt.getTime()}`;

      mockGetAllScheduled.mockResolvedValue([
        {
          identifier: 'named-snooze',
          content: {
            title: 'Medication reminder',
            body: 'Scheduled dose: Metformin (500 mg)',
            data: {
              medicationId: 'med-1',
              scheduleId: 'sched-1',
              entryDate: TODAY,
              key: snoozeKey,
              baseKey: BASE_KEY,
              isSnoozed: 'true',
              hideNames: 'false',
              locale: 'en',
            },
          } as unknown as Notifications.NotificationContent,
          trigger: {
            type: 'date',
            value: snoozeFireAt.getTime(),
          } as unknown as Notifications.NotificationTrigger,
        },
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(mockCancel).toHaveBeenCalledWith('named-snooze');
      const rebuiltSnooze = mockSchedule.mock.calls.find(
        (c) => c[0].content.data?.key === snoozeKey
      );
      expect(rebuiltSnooze).toBeDefined();
      expect(rebuiltSnooze?.[0].content.body).toBe('You have a scheduled dose');
      expect(rebuiltSnooze?.[0].content.data).toEqual(
        expect.objectContaining({
          key: snoozeKey,
          baseKey: BASE_KEY,
          isSnoozed: 'true',
          hideNames: 'true',
        })
      );
      expect(rebuiltSnooze?.[0].trigger).toEqual(
        expect.objectContaining({
          date: snoozeFireAt,
        })
      );
      expect(scheduledKeys()).not.toContain(`${BASE_KEY}_10`);

      // Also verify an already-delivered (presented) named snooze is dismissed and re-posted with generic copy
      mockSchedule.mockClear();
      mockGetAllScheduled.mockResolvedValue([]);
      (
        Notifications.getPresentedNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          request: {
            identifier: 'delivered-named-snooze',
            content: {
              title: 'Medication reminder',
              body: 'Scheduled dose: Metformin (500 mg)',
              data: {
                medicationId: 'med-1',
                scheduleId: 'sched-1',
                entryDate: TODAY,
                key: snoozeKey,
                baseKey: BASE_KEY,
                isSnoozed: 'true',
                hideNames: 'false',
                locale: 'en',
              },
            },
          },
        },
      ]);

      await reconcileMedicationReminders([buildMedication()], []);

      expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
        'delivered-named-snooze'
      );
      const repostedSnooze = mockSchedule.mock.calls.find(
        (c) => c[0].content.data?.baseKey === BASE_KEY
      );
      expect(repostedSnooze).toBeDefined();
      expect(repostedSnooze?.[0].content.body).toBe(
        'You have a scheduled dose'
      );
      expect(repostedSnooze?.[0].content.data).toEqual(
        expect.objectContaining({
          baseKey: BASE_KEY,
          isSnoozed: 'true',
          hideNames: 'true',
        })
      );
    });

    it('cancels and drops a snoozed reminder whose medication does not belong to the active account', async () => {
      const AsyncStorage =
        require('@react-native-async-storage/async-storage') as {
          setItem: (k: string, v: string) => Promise<void>;
          getItem: (k: string) => Promise<string | null>;
        };
      const yesterday = '2026-07-27';
      const foreignBaseKey = `med_${yesterday}_other-med_other-sched_23:50`;

      await AsyncStorage.setItem(
        'snoozed_medication_reminders',
        JSON.stringify([
          {
            baseKey: foreignBaseKey,
            entryDate: yesterday,
            doses: [{ medicationId: 'other-med', scheduleId: 'other-sched' }],
          },
        ])
      );

      mockGetAllScheduled.mockResolvedValue([
        pendingRequest('foreign-snooze', {
          medicationId: 'other-med',
          scheduleId: 'other-sched',
          entryDate: yesterday,
          key: `${foreignBaseKey}_snooze_${Date.now() + 600_000}`,
          baseKey: foreignBaseKey,
          isSnoozed: 'true',
        }),
      ]);

      await reconcileMedicationReminders(
        [buildMedication({ id: 'med-1' })],
        []
      );

      expect(mockCancel).toHaveBeenCalledWith('foreign-snooze');
      const remaining = await AsyncStorage.getItem(
        'snoozed_medication_reminders'
      );
      expect(JSON.parse(remaining ?? '[]')).toEqual([]);
    });
  });
});
