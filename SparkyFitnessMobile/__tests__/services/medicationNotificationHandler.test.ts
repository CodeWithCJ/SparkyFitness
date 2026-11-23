import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import {
  clearSnoozedMedicationReminders,
  initMedicationNotificationActions,
  MEDICATION_NOTIFICATION_TASK_NAME,
  PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
  removeSnoozedMedicationReminders,
  syncSnoozedMedicationReminders,
} from '../../src/services/medicationNotificationHandler';
import {
  addNotificationResponseListener,
  dismissDeliveredNotification,
  MEDICATION_TAKEN_ACTION,
  MEDICATION_SKIP_ACTION,
  MEDICATION_SNOOZE_ACTION,
} from '../../src/services/notifications';
import {
  createEntry,
  listEntries,
  listMedications,
} from '../../src/services/api/medicationsApi';
import { queryClient } from '../../src/hooks/queryClient';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
  dismissDeliveredNotification: jest.fn(async () => undefined),
  ensureMedicationReminderChannel: jest.fn(async () => undefined),
  MEDICATION_REMINDER_CATEGORY: 'medication-reminder',
  MEDICATION_REMINDER_GROUP_CATEGORY: 'medication-reminder-group',
  MEDICATION_REMINDER_CHANNEL_ID: 'medication-reminders',
  MEDICATION_TAKEN_ACTION: 'MEDICATION_TAKEN',
  MEDICATION_SKIP_ACTION: 'MEDICATION_SKIP',
  MEDICATION_SNOOZE_ACTION: 'MEDICATION_SNOOZE',
}));

jest.mock('../../src/services/api/medicationsApi', () => ({
  createEntry: jest.fn(),
  listEntries: jest.fn(),
  listMedications: jest.fn(),
}));

const mockActiveServer = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: () => mockActiveServer(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const DATE = '2026-08-12';

type ResponseListener = (response: unknown) => void;
type TaskExecutor = (body: {
  data: unknown;
  error: Error | null;
}) => Promise<unknown>;

const registeredTaskExecutor = (
  TaskManager.defineTask as jest.Mock
).mock.calls.find(
  ([taskName]) => taskName === MEDICATION_NOTIFICATION_TASK_NAME
)?.[1] as TaskExecutor | undefined;

function takenResponse() {
  return {
    actionIdentifier: MEDICATION_TAKEN_ACTION,
    notification: {
      request: {
        identifier: 'notif-1',
        content: {
          data: { medicationId: 'm1', scheduleId: 's1', entryDate: DATE },
        },
      },
    },
  };
}

function groupResponse(actionIdentifier = MEDICATION_TAKEN_ACTION) {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: 'group-notif-1',
        content: {
          data: {
            medicationId: 'm1',
            entryDate: DATE,
            baseKey: 'med_group_2026-08-12_09:00_m1:s1_m2:s2',
            doses: JSON.stringify([
              { medicationId: 'm1', scheduleId: 's1' },
              { medicationId: 'm2', scheduleId: 's2' },
            ]),
            isGroup: 'true',
          },
        },
      },
    },
  };
}

/**
 * A dose marked Taken from an OS reminder never touches a React hook, so the entry
 * mutations' invalidation cannot run for it. Mobile queries have an infinite stale time,
 * so the miss is silent: the app resumes onto a dashboard that keeps showing pre-dose
 * calories until something else forces a refetch.
 */
describe('logging a dose from a notification action', () => {
  let spy: jest.SpyInstance;
  let listener: ResponseListener;

  // The handler latches on first call, so it registers exactly one listener per module
  // instance. Capture it up front rather than re-initialising per test.
  beforeAll(() => {
    initMedicationNotificationActions();
    listener = (addNotificationResponseListener as jest.Mock).mock
      .calls[0]?.[0] as ResponseListener;
    if (!listener)
      throw new Error('no notification response listener registered');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    spy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(() => undefined as never);
    (listEntries as jest.Mock).mockResolvedValue([]);
    (listMedications as jest.Mock).mockResolvedValue([
      { id: 'm1' },
      { id: 'm2' },
    ]);
    (createEntry as jest.Mock).mockResolvedValue({ id: 'e1' });
    (
      Notifications.getAllScheduledNotificationsAsync as jest.Mock
    ).mockResolvedValue([]);
    (
      Notifications.cancelScheduledNotificationAsync as jest.Mock
    ).mockResolvedValue(undefined);
  });

  afterEach(() => spy.mockRestore());

  const fireTakenAction = async () => {
    listener(takenResponse());
    // The listener dispatches the write without awaiting it.
    await new Promise(process.nextTick);
  };

  const invalidatedKeys = () =>
    spy.mock.calls
      .map(([arg]) => (arg as { queryKey?: readonly unknown[] })?.queryKey)
      .filter(Array.isArray);

  const invalidatedPrefix = (...prefix: unknown[]) =>
    invalidatedKeys().some((key) =>
      prefix.every((segment, index) => key[index] === segment)
    );

  it('invalidates the daily summary, which carries the dose nutrition', async () => {
    await fireTakenAction();

    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(invalidatedPrefix('dailySummary')).toBe(true);
  });

  it('invalidates the entry and medication lists the action also moved', async () => {
    await fireTakenAction();

    expect(invalidatedPrefix('medications', 'entries')).toBe(true);
    expect(invalidatedPrefix('medications')).toBe(true);
  });

  describe('consolidated group reminders', () => {
    it('logs all unlogged doses when a group notification taken action fires', async () => {
      listener(groupResponse(MEDICATION_TAKEN_ACTION));
      await new Promise(process.nextTick);

      expect(createEntry).toHaveBeenCalledTimes(2);
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'm1',
          schedule_id: 's1',
          status: 'taken',
          entry_date: DATE,
        })
      );
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'm2',
          schedule_id: 's2',
          status: 'taken',
          entry_date: DATE,
        })
      );
      expect(dismissDeliveredNotification).toHaveBeenCalledWith(
        'group-notif-1'
      );
      expect(invalidatedPrefix('medications', 'entries')).toBe(true);
    });

    it('logs all doses as skipped when a group notification skip action fires', async () => {
      listener(groupResponse(MEDICATION_SKIP_ACTION));
      await new Promise(process.nextTick);

      expect(createEntry).toHaveBeenCalledTimes(2);
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'm1',
          schedule_id: 's1',
          status: 'skipped',
          entry_date: DATE,
          taken_at: undefined,
        })
      );
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'm2',
          schedule_id: 's2',
          status: 'skipped',
          entry_date: DATE,
          taken_at: undefined,
        })
      );
    });

    it('skips doses that are already logged in the group', async () => {
      (listEntries as jest.Mock).mockResolvedValue([
        {
          id: 'existing-e1',
          medication_id: 'm1',
          schedule_id: 's1',
          status: 'taken',
        },
      ]);

      listener(groupResponse(MEDICATION_TAKEN_ACTION));
      await new Promise(process.nextTick);

      expect(createEntry).toHaveBeenCalledTimes(1);
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'm2',
          schedule_id: 's2',
          status: 'taken',
        })
      );
    });

    it('cancels scheduled repeat notifications matching baseKey', async () => {
      const baseKey = 'med_group_2026-08-12_09:00_m1:s1_m2:s2';
      (
        Notifications.getAllScheduledNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          identifier: 'repeat-10',
          content: { data: { baseKey } },
        },
        {
          identifier: 'unrelated',
          content: { data: { baseKey: 'other_key' } },
        },
      ]);

      listener(groupResponse(MEDICATION_TAKEN_ACTION));
      await new Promise(process.nextTick);

      expect(
        Notifications.cancelScheduledNotificationAsync
      ).toHaveBeenCalledWith('repeat-10');
      expect(
        Notifications.cancelScheduledNotificationAsync
      ).not.toHaveBeenCalledWith('unrelated');
    });

    it('dismisses all other already-delivered notifications for the same dose when one is logged or skipped', async () => {
      const baseKey = 'med_2026-08-12_m1_s1_09:00';
      (
        Notifications.getPresentedNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          request: {
            identifier: 'notif-base',
            content: {
              data: {
                medicationId: 'm1',
                scheduleId: 's1',
                entryDate: DATE,
                key: baseKey,
                baseKey,
              },
            },
          },
        },
        {
          request: {
            identifier: 'notif-repeat-10',
            content: {
              data: {
                medicationId: 'm1',
                scheduleId: 's1',
                entryDate: DATE,
                key: `${baseKey}_10`,
                baseKey,
              },
            },
          },
        },
        {
          request: {
            identifier: 'notif-other-med',
            content: {
              data: {
                medicationId: 'm2',
                scheduleId: 's2',
                entryDate: DATE,
                key: 'med_2026-08-12_m2_s2_09:00',
                baseKey: 'med_2026-08-12_m2_s2_09:00',
              },
            },
          },
        },
      ]);

      listener({
        actionIdentifier: MEDICATION_TAKEN_ACTION,
        notification: {
          request: {
            identifier: 'notif-repeat-20',
            content: {
              data: {
                medicationId: 'm1',
                scheduleId: 's1',
                entryDate: DATE,
                key: `${baseKey}_20`,
                baseKey,
              },
            },
          },
        },
      });
      await new Promise(process.nextTick);

      expect(dismissDeliveredNotification).toHaveBeenCalledWith(
        'notif-repeat-20'
      );
      expect(dismissDeliveredNotification).toHaveBeenCalledWith('notif-base');
      expect(dismissDeliveredNotification).toHaveBeenCalledWith(
        'notif-repeat-10'
      );
      expect(dismissDeliveredNotification).not.toHaveBeenCalledWith(
        'notif-other-med'
      );
    });

    it('persists failed actions for retry and leaves sibling/repeat reminders intact until flushed', async () => {
      const baseKey = 'med_2026-08-12_m1_s1_09:00';
      (createEntry as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      (
        Notifications.getPresentedNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          request: {
            identifier: 'notif-base',
            content: {
              data: {
                medicationId: 'm1',
                scheduleId: 's1',
                entryDate: DATE,
                key: baseKey,
                baseKey,
              },
            },
          },
        },
      ]);
      (
        Notifications.getAllScheduledNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          identifier: 'repeat-10',
          content: { data: { baseKey } },
        },
      ]);

      if (!registeredTaskExecutor) {
        throw new Error('background notification task executor not registered');
      }

      const failResult = await registeredTaskExecutor({
        data: {
          actionIdentifier: MEDICATION_TAKEN_ACTION,
          notification: {
            request: {
              identifier: 'notif-repeat-20',
              content: {
                data: {
                  medicationId: 'm1',
                  scheduleId: 's1',
                  entryDate: DATE,
                  key: `${baseKey}_20`,
                  baseKey,
                },
              },
            },
          },
        },
        error: null,
      });

      expect(failResult).toBe(
        Notifications.BackgroundNotificationTaskResult.Failed
      );
      expect(dismissDeliveredNotification).toHaveBeenCalledWith(
        'notif-repeat-20'
      );
      expect(dismissDeliveredNotification).not.toHaveBeenCalledWith(
        'notif-base'
      );
      expect(
        Notifications.cancelScheduledNotificationAsync
      ).not.toHaveBeenCalled();

      (createEntry as jest.Mock).mockResolvedValueOnce({ id: 'e-retried' });
      const { flushPendingMedicationNotificationActions } =
        require('../../src/services/medicationNotificationHandler') as typeof import('../../src/services/medicationNotificationHandler');
      await flushPendingMedicationNotificationActions();

      expect(createEntry).toHaveBeenCalledTimes(2);
      expect(dismissDeliveredNotification).toHaveBeenCalledWith('notif-base');
      expect(
        Notifications.cancelScheduledNotificationAsync
      ).toHaveBeenCalledWith('repeat-10');
    });

    it('retains queued doses for another account during an account switch and replays them when the owning account is active again', async () => {
      const baseKey = 'med_2026-08-12_med-of-A_sched-A_09:00';
      (createEntry as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      // The live press checks ownership first: account A owns med-of-A.
      (listMedications as jest.Mock).mockResolvedValueOnce([
        { id: 'med-of-A', user_id: 'user-A' },
      ]);

      if (!registeredTaskExecutor) {
        throw new Error('background notification task executor not registered');
      }

      await registeredTaskExecutor({
        data: {
          actionIdentifier: MEDICATION_TAKEN_ACTION,
          notification: {
            request: {
              identifier: 'notif-a',
              content: {
                data: {
                  medicationId: 'med-of-A',
                  scheduleId: 'sched-A',
                  userId: 'user-A',
                  entryDate: DATE,
                  key: baseKey,
                  baseKey,
                },
              },
            },
          },
        },
        error: null,
      });

      expect(createEntry).toHaveBeenCalledTimes(1);
      (createEntry as jest.Mock).mockClear();

      // Switch to account B which only owns med-of-B -> should NOT replay or delete A's record
      (listMedications as jest.Mock).mockResolvedValueOnce([
        { id: 'med-of-B', user_id: 'user-B' },
      ]);
      const { flushPendingMedicationNotificationActions } =
        require('../../src/services/medicationNotificationHandler') as typeof import('../../src/services/medicationNotificationHandler');
      const flushedUnderB = await flushPendingMedicationNotificationActions();

      expect(flushedUnderB).toBe(false);
      expect(createEntry).not.toHaveBeenCalled();

      // Switch back to account A -> should replay A's retained record
      (listMedications as jest.Mock).mockResolvedValueOnce([
        { id: 'med-of-A', user_id: 'user-A' },
      ]);
      (createEntry as jest.Mock).mockResolvedValueOnce({ id: 'entry-a' });
      const flushedUnderA = await flushPendingMedicationNotificationActions();

      expect(flushedUnderA).toBe(true);
      expect(createEntry).toHaveBeenCalledTimes(1);
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'med-of-A',
          schedule_id: 'sched-A',
        })
      );
    });

    it('preserves actions enqueued while flushPendingMedicationNotificationActions is awaiting network calls and coordinates with inFlightActions', async () => {
      if (!registeredTaskExecutor) {
        throw new Error('background notification task executor not registered');
      }

      // 1. Enqueue a failed action for m1
      (createEntry as jest.Mock).mockRejectedValueOnce(new Error('offline-1'));
      await registeredTaskExecutor({
        data: {
          actionIdentifier: MEDICATION_TAKEN_ACTION,
          notification: {
            request: {
              identifier: 'notif-m1',
              content: {
                data: {
                  medicationId: 'm1',
                  scheduleId: 's1',
                  entryDate: DATE,
                  key: 'med_2026-08-12_m1_s1_09:00',
                  baseKey: 'med_2026-08-12_m1_s1_09:00',
                },
              },
            },
          },
        },
        error: null,
      });

      (createEntry as jest.Mock).mockClear();

      // 2. Start flushing m1; while createEntry for m1 is in flight,
      //    a concurrent live action for m1 should share inFlightActions,
      //    and a concurrent failed live action for m2 should be enqueued.
      let resolveM1Create!: (val: unknown) => void;
      (createEntry as jest.Mock)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveM1Create = resolve;
            })
        )
        .mockRejectedValueOnce(new Error('offline-m2'));

      const { flushPendingMedicationNotificationActions } =
        require('../../src/services/medicationNotificationHandler') as typeof import('../../src/services/medicationNotificationHandler');
      const flushPromise = flushPendingMedicationNotificationActions();

      // Wait until flush reaches createEntry for m1
      await new Promise((r) => setTimeout(r, 10));

      // Concurrent live tap on m1 while replay is in flight -> should dedupe via inFlightActions
      const duplicateM1Promise = registeredTaskExecutor({
        data: {
          actionIdentifier: MEDICATION_TAKEN_ACTION,
          notification: {
            request: {
              identifier: 'notif-m1-repeat',
              content: {
                data: {
                  medicationId: 'm1',
                  scheduleId: 's1',
                  entryDate: DATE,
                  key: 'med_2026-08-12_m1_s1_09:00_10',
                  baseKey: 'med_2026-08-12_m1_s1_09:00',
                },
              },
            },
          },
        },
        error: null,
      });

      // Concurrent live tap on m2 that fails while flush is in flight -> enqueued into AsyncStorage
      await registeredTaskExecutor({
        data: {
          actionIdentifier: MEDICATION_TAKEN_ACTION,
          notification: {
            request: {
              identifier: 'notif-m2',
              content: {
                data: {
                  medicationId: 'm2',
                  scheduleId: 's2',
                  entryDate: DATE,
                  key: 'med_2026-08-12_m2_s2_09:00',
                  baseKey: 'med_2026-08-12_m2_s2_09:00',
                },
              },
            },
          },
        },
        error: null,
      });

      resolveM1Create({ id: 'e-m1' });
      await Promise.all([flushPromise, duplicateM1Promise]);

      // m1 was only created once despite concurrent replay + live tap, and m2 was attempted once
      expect(createEntry).toHaveBeenCalledTimes(2);

      // 3. Flushing again should replay the preserved m2 action that was enqueued mid-flush
      (createEntry as jest.Mock).mockClear();
      (createEntry as jest.Mock).mockResolvedValueOnce({ id: 'e-m2' });
      await flushPendingMedicationNotificationActions();

      expect(createEntry).toHaveBeenCalledTimes(1);
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'm2',
          schedule_id: 's2',
        })
      );
    });
  });

  it('queues a press made for another saved server instead of writing it here', async () => {
    mockActiveServer.mockResolvedValue({ id: 'server-new' });
    listener({
      ...takenResponse(),
      notification: {
        request: {
          identifier: 'notif-old-server',
          content: {
            data: {
              medicationId: 'm1',
              scheduleId: 's1',
              userId: 'user-A',
              serverId: 'server-old',
              entryDate: DATE,
            },
          },
        },
      },
    });
    await new Promise(process.nextTick);
    expect(createEntry).not.toHaveBeenCalled();
    const queued = JSON.parse(
      (await AsyncStorage.getItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
      )) ?? '[]'
    );
    expect(queued[0]).toMatchObject({ serverId: 'server-old' });

    // Replay keeps it while the other server is active, and writes it once
    // its own server is active again.
    const { flushPendingMedicationNotificationActions } =
      require('../../src/services/medicationNotificationHandler') as typeof import('../../src/services/medicationNotificationHandler');
    (listMedications as jest.Mock).mockResolvedValue([
      { id: 'm1', user_id: 'user-A' },
    ]);
    expect(await flushPendingMedicationNotificationActions()).toBe(false);
    expect(createEntry).not.toHaveBeenCalled();
    mockActiveServer.mockResolvedValue({ id: 'server-old' });
    expect(await flushPendingMedicationNotificationActions()).toBe(true);
    expect(createEntry).toHaveBeenCalledTimes(1);
    mockActiveServer.mockReset();
  });

  it('queues a press for another account instead of writing it or dropping it', async () => {
    (listMedications as jest.Mock).mockResolvedValueOnce([
      { id: 'other', user_id: 'user-B' },
    ]);
    listener({
      ...takenResponse(),
      notification: {
        request: {
          identifier: 'notif-old',
          content: {
            data: {
              medicationId: 'm1',
              scheduleId: 's1',
              userId: 'user-A',
              entryDate: DATE,
            },
          },
        },
      },
    });
    await new Promise(process.nextTick);
    expect(createEntry).not.toHaveBeenCalled();
    const queued = JSON.parse(
      (await AsyncStorage.getItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
      )) ?? '[]'
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      notificationId: 'notif-old',
      userId: 'user-A',
      status: 'taken',
    });
  });

  describe('Android background notification task (dataString payload)', () => {
    it('logs the dose when invoked via TaskManager.defineTask with raw Android dataString payload', async () => {
      if (!registeredTaskExecutor) {
        throw new Error('background notification task executor not registered');
      }

      const result = await registeredTaskExecutor({
        data: {
          actionIdentifier: MEDICATION_TAKEN_ACTION,
          notification: {
            request: {
              identifier: 'bg-notif-1',
              content: {
                dataString: JSON.stringify({
                  medicationId: 'm1',
                  scheduleId: 's1',
                  entryDate: DATE,
                }),
              },
            },
          },
        },
        error: null,
      });

      expect(result).toBe(
        Notifications.BackgroundNotificationTaskResult.NewData
      );
      expect(dismissDeliveredNotification).toHaveBeenCalledWith('bg-notif-1');
      expect(createEntry).toHaveBeenCalledTimes(1);
      expect(createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'm1',
          schedule_id: 's1',
          status: 'taken',
          entry_date: DATE,
        })
      );
    });

    it('schedules a snoozed notification using medicationReminderSnoozeMinutes (default 30m, configurable) and clears sibling repeats', async () => {
      if (!registeredTaskExecutor) {
        throw new Error('background notification task executor not registered');
      }

      const baseKey = 'med_2026-08-12_m1_s1_09:00';
      (
        Notifications.getAllScheduledNotificationsAsync as jest.Mock
      ).mockResolvedValue([
        {
          identifier: 'repeat-10',
          content: { data: { baseKey } },
        },
      ]);

      useAppPreferencesStore.setState({ medicationReminderSnoozeMinutes: 15 });
      const before = Date.now();

      const result = await registeredTaskExecutor({
        data: {
          actionIdentifier: MEDICATION_SNOOZE_ACTION,
          notification: {
            request: {
              identifier: 'notif-base',
              content: {
                title: 'Medication reminder',
                body: 'Scheduled dose: Metformin (500 mg)',
                categoryIdentifier: 'medication-reminder',
                data: {
                  medicationId: 'm1',
                  scheduleId: 's1',
                  entryDate: DATE,
                  key: baseKey,
                  baseKey,
                },
              },
            },
          },
        },
        error: null,
      });

      expect(result).toBe(
        Notifications.BackgroundNotificationTaskResult.NewData
      );
      expect(dismissDeliveredNotification).toHaveBeenCalledWith('notif-base');
      expect(
        Notifications.cancelScheduledNotificationAsync
      ).toHaveBeenCalledWith('repeat-10');
      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);

      const scheduledCall = (
        Notifications.scheduleNotificationAsync as jest.Mock
      ).mock.calls[0][0];
      expect(scheduledCall.content.data).toEqual(
        expect.objectContaining({
          medicationId: 'm1',
          scheduleId: 's1',
          entryDate: DATE,
          baseKey,
          isSnoozed: 'true',
        })
      );
      const triggerDate = scheduledCall.trigger.date as Date;
      expect(triggerDate.getTime()).toBeGreaterThanOrEqual(
        before + 15 * 60_000 - 1000
      );
      expect(triggerDate.getTime()).toBeLessThanOrEqual(
        Date.now() + 15 * 60_000 + 1000
      );

      useAppPreferencesStore.setState({ medicationReminderSnoozeMinutes: 30 });
    });

    it('passes a non-empty channel name to setNotificationChannelAsync in headless background execution before i18n is initialized', async () => {
      const { Platform } =
        require('react-native') as typeof import('react-native');
      const prevOS = Platform.OS;
      Platform.OS = 'android';
      try {
        const realNotifications = jest.requireActual(
          '../../src/services/notifications'
        ) as typeof import('../../src/services/notifications');
        (Notifications.setNotificationChannelAsync as jest.Mock).mockClear();

        await realNotifications.ensureMedicationReminderChannel();

        expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
          'medication-reminders',
          expect.objectContaining({
            name: 'Medication reminders',
          })
        );
      } finally {
        Platform.OS = prevOS;
      }
    });
  });
});

describe('forgetting snooze records (#3487)', () => {
  const SNOOZED_KEY = 'snoozed_medication_reminders';
  const record = (baseKey: string) => ({
    baseKey,
    entryDate: '2026-07-28',
    doses: [{ medicationId: 'med-1', scheduleId: 'sched-1' }],
  });
  const storedKeys = async () =>
    (
      JSON.parse((await AsyncStorage.getItem(SNOOZED_KEY)) ?? '[]') as {
        baseKey: string;
      }[]
    ).map((item) => item.baseKey);

  // A snooze pressed on a reminder, through the handler's own path.
  const snoozeThroughTheHandler = async (baseKey: string) => {
    if (!registeredTaskExecutor) {
      throw new Error('background notification task executor not registered');
    }
    (
      Notifications.getAllScheduledNotificationsAsync as jest.Mock
    ).mockResolvedValue([]);
    await registeredTaskExecutor({
      data: {
        actionIdentifier: MEDICATION_SNOOZE_ACTION,
        notification: {
          request: {
            identifier: `notif-${baseKey}`,
            content: {
              title: 'Medication reminder',
              body: 'Scheduled dose: Metformin (500 mg)',
              categoryIdentifier: 'medication-reminder',
              data: {
                medicationId: 'med-1',
                scheduleId: 'sched-1',
                entryDate: '2026-07-28',
                key: baseKey,
                baseKey,
              },
            },
          },
        },
      },
      error: null,
    });
  };

  afterEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.removeItem(SNOOZED_KEY);
  });

  it('says so when a removal cannot be written, and tries it again on the next call', async () => {
    await AsyncStorage.setItem(
      SNOOZED_KEY,
      JSON.stringify([record('slot-a'), record('slot-b')])
    );
    jest
      .spyOn(AsyncStorage, 'setItem')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(removeSnoozedMedicationReminders(['slot-a'])).resolves.toBe(
      false
    );
    expect(await storedKeys()).toEqual(['slot-a', 'slot-b']);

    // No snoozed copy is left to name it, so the next call (here with no
    // keys of its own) removes it.
    await expect(removeSnoozedMedicationReminders([])).resolves.toBe(true);
    expect(await storedKeys()).toEqual(['slot-b']);
  });

  it('says so when the records cannot be cleared', async () => {
    await AsyncStorage.setItem(SNOOZED_KEY, JSON.stringify([record('slot-a')]));
    jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockRejectedValueOnce(new Error('disk full'));

    await expect(clearSnoozedMedicationReminders()).resolves.toBe(false);
    await expect(clearSnoozedMedicationReminders()).resolves.toBe(true);
    expect(await AsyncStorage.getItem(SNOOZED_KEY)).toBeNull();
  });

  it('leaves the records a failed clear held out of the next reconcile, and drops them there', async () => {
    await AsyncStorage.setItem(SNOOZED_KEY, JSON.stringify([record('slot-a')]));
    jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(clearSnoozedMedicationReminders()).resolves.toBe(false);
    expect(await storedKeys()).toEqual(['slot-a']);

    // Reminders back on before another full cancel: the dose is scheduled
    // again rather than kept silent by its old snooze record.
    const snoozed = await syncSnoozedMedicationReminders(
      '2026-07-28',
      new Set(['slot-a'])
    );

    expect(snoozed.has('slot-a')).toBe(false);
    expect(await AsyncStorage.getItem(SNOOZED_KEY)).toBeNull();
  });

  it('keeps a record snoozed again after a failed clear', async () => {
    await AsyncStorage.setItem(SNOOZED_KEY, JSON.stringify([record('slot-a')]));
    jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(clearSnoozedMedicationReminders()).resolves.toBe(false);

    // The same slot is snoozed again: that record is a real one.
    await AsyncStorage.setItem(SNOOZED_KEY, '[]');
    await snoozeThroughTheHandler('slot-a');

    const snoozed = await syncSnoozedMedicationReminders(
      '2026-07-28',
      new Set(['slot-a'])
    );
    expect(snoozed.has('slot-a')).toBe(true);
    expect(await storedKeys()).toEqual(['slot-a']);
  });

  it('keeps a record snoozed again while a removal waited for the lock', async () => {
    // slot-a's removal could not be written, so slot-a waits to be removed.
    await AsyncStorage.setItem(SNOOZED_KEY, JSON.stringify([record('slot-a')]));
    jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(removeSnoozedMedicationReminders(['slot-a'])).resolves.toBe(
      false
    );
    jest.restoreAllMocks();

    // Another snooze holds the lock (its read is slow) while slot-a is snoozed
    // again and a removal of another server's copies is asked for.
    const getItem = AsyncStorage.getItem as unknown as jest.Mock;
    const original = getItem.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let lockHeld = false;
    getItem.mockImplementation(async (key: string) => {
      if (key === SNOOZED_KEY && !lockHeld) {
        lockHeld = true;
        await gate;
      }
      return original(key);
    });
    const nextMacrotask = () => new Promise((resolve) => setImmediate(resolve));
    const until = async (arrived: () => boolean, what: string) => {
      for (let i = 0; i < 200 && !arrived(); i += 1) await nextMacrotask();
      if (!arrived()) throw new Error(`never reached: ${what}`);
    };
    const copiesScheduled = (baseKey: string) =>
      (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.filter(
        ([request]) => request?.content?.data?.baseKey === baseKey
      ).length;

    const other = snoozeThroughTheHandler('slot-z');
    await until(() => lockHeld, 'slot-z holding the lock');
    const copiesBefore = copiesScheduled('slot-a');
    const again = snoozeThroughTheHandler('slot-a');
    // The snooze schedules its copy and then records it, with only microtasks
    // in between: once the copy is scheduled and those have run, its record
    // is queued on the lock, ahead of the removal below.
    await until(
      () => copiesScheduled('slot-a') > copiesBefore,
      "slot-a's snoozed copy"
    );
    await nextMacrotask();
    const removal = removeSnoozedMedicationReminders([]);
    release();
    await Promise.all([other, again, removal]);
    getItem.mockImplementation(original);

    expect((await storedKeys()).sort()).toEqual(['slot-a', 'slot-z']);
  });

  describe('after a clear that could neither read nor write', () => {
    const failTheClear = async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('locked'));
      jest
        .spyOn(AsyncStorage, 'removeItem')
        .mockRejectedValueOnce(new Error('locked'));
      await expect(clearSnoozedMedicationReminders()).resolves.toBe(false);
      jest.restoreAllMocks();
    };

    it('leaves every stored record out of the next reconcile, and drops them there', async () => {
      await AsyncStorage.setItem(
        SNOOZED_KEY,
        JSON.stringify([record('slot-a')])
      );
      await failTheClear();
      expect(await storedKeys()).toEqual(['slot-a']);

      const snoozed = await syncSnoozedMedicationReminders(
        '2026-07-28',
        new Set(['slot-a'])
      );

      expect(snoozed.has('slot-a')).toBe(false);
      expect(await AsyncStorage.getItem(SNOOZED_KEY)).toBeNull();
    });

    it('finishes that clear when a new snooze is recorded', async () => {
      await AsyncStorage.setItem(
        SNOOZED_KEY,
        JSON.stringify([record('slot-a')])
      );
      await failTheClear();

      await snoozeThroughTheHandler('slot-b');

      expect(await storedKeys()).toEqual(['slot-b']);
      const snoozed = await syncSnoozedMedicationReminders(
        '2026-07-28',
        new Set(['slot-a', 'slot-b'])
      );
      expect([...snoozed]).toEqual(['slot-b']);
    });
  });

  it.each([
    ['nothing else snoozed', [] as Notifications.NotificationContent[]],
    [
      'another slot snoozed',
      [
        {
          data: {
            isSnoozed: 'true',
            baseKey: 'slot-z',
            entryDate: '2026-07-28',
            medicationId: 'med-1',
            scheduleId: 'sched-1',
          },
        } as unknown as Notifications.NotificationContent,
      ],
    ],
  ])(
    'keeps a record stale through a reconcile that could not read the records (%s)',
    async (_label, activeSnoozes) => {
      await AsyncStorage.setItem(
        SNOOZED_KEY,
        JSON.stringify([record('slot-k')])
      );
      jest
        .spyOn(AsyncStorage, 'removeItem')
        .mockRejectedValueOnce(new Error('disk full'));
      await expect(removeSnoozedMedicationReminders(['slot-k'])).resolves.toBe(
        false
      );

      // This reconcile cannot read the records, so it cannot tell whether
      // slot-k's record is gone: it stays stale.
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('locked'));
      await syncSnoozedMedicationReminders(
        '2026-07-28',
        new Set(['slot-k', 'slot-z']),
        activeSnoozes
      );

      const snoozed = await syncSnoozedMedicationReminders(
        '2026-07-28',
        new Set(['slot-k'])
      );
      expect(snoozed.has('slot-k')).toBe(false);
      expect(await AsyncStorage.getItem(SNOOZED_KEY)).toBeNull();
    }
  );

  it('keeps the keys when the records cannot be read, and removes them once they can', async () => {
    await AsyncStorage.setItem(
      SNOOZED_KEY,
      JSON.stringify([record('slot-a'), record('slot-b')])
    );
    jest
      .spyOn(AsyncStorage, 'getItem')
      .mockRejectedValueOnce(new Error('locked'));

    await expect(removeSnoozedMedicationReminders(['slot-a'])).resolves.toBe(
      false
    );
    await expect(removeSnoozedMedicationReminders([])).resolves.toBe(true);
    expect(await storedKeys()).toEqual(['slot-b']);
  });
});
