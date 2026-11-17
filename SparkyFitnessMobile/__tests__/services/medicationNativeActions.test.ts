const mockClaimed = jest.fn();
const mockRead = jest.fn();
const mockAck = jest.fn();
const mockSetSnooze = jest.fn();
let mockListener: (() => void) | undefined;

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: { addEventListener: jest.fn() },
}));
jest.mock('../../modules/background-water', () => ({
  __esModule: true,
  default: {
    isMedicationActionClaimed: (id: string, action: string) =>
      mockClaimed(id, action),
    readMedicationActionResults: () => mockRead(),
    acknowledgeMedicationActionResults: (ids: string[]) => mockAck(ids),
    setMedicationSnoozeMinutes: (m: number) => mockSetSnooze(m),
    addListener: (_name: string, fn: () => void) => {
      mockListener = fn;
      return { remove: jest.fn() };
    },
  },
}));
jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
  dismissDeliveredNotification: jest.fn(async () => undefined),
  ensureMedicationReminderChannel: jest.fn(async () => undefined),
  MEDICATION_REMINDER_CATEGORY: 'medication-reminder',
  MEDICATION_REMINDER_GROUP_CATEGORY: 'medication-reminder-group',
  MEDICATION_REMINDER_CHANNEL_ID: 'medication-reminders',
  MEDICATION_TAKEN_ACTION: 'medication-taken',
  MEDICATION_SKIP_ACTION: 'medication-skip',
  MEDICATION_SNOOZE_ACTION: 'medication-snooze',
}));
jest.mock('../../src/services/api/medicationsApi', () => ({
  createEntry: jest.fn(),
  listEntries: jest.fn(),
  listMedications: jest.fn(),
}));
let mockNetworkListener:
  | ((state: { isConnected: boolean; isInternetReachable: boolean }) => void)
  | undefined;
jest.mock('expo-network', () => ({
  addNetworkStateListener: (fn: typeof mockNetworkListener) => {
    mockNetworkListener = fn;
    return { remove: jest.fn() };
  },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyNativeMedicationActionResults,
  initMedicationNotificationActions,
  PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
  processMedicationNotificationResponse,
  retryPendingMedicationActions,
} from '../../src/services/medicationNotificationHandler';
import {
  createEntry,
  listEntries,
  listMedications,
} from '../../src/services/api/medicationsApi';
import { queryClient } from '../../src/hooks/queryClient';

const DATE = '2026-08-12';
const dose = { medicationId: 'm1', scheduleId: 's1' };

function response(actionIdentifier = 'medication-taken') {
  return {
    actionIdentifier,
    notification: {
      request: {
        identifier: 'notif-1',
        content: {
          data: { medicationId: 'm1', scheduleId: 's1', entryDate: DATE },
        },
      },
    },
  } as never;
}

describe('iOS native medication reminder handler', () => {
  beforeEach(async () => {
    mockClaimed.mockReset().mockReturnValue(false);
    mockRead.mockReset().mockReturnValue('[]');
    mockAck.mockReset();
    (createEntry as jest.Mock).mockReset();
    (listMedications as jest.Mock).mockReset();
    (listEntries as jest.Mock).mockReset().mockResolvedValue([]);
    await AsyncStorage.clear();
  });

  it('leaves a press the native handler claimed alone', async () => {
    mockClaimed.mockReturnValue(true);
    expect(await processMedicationNotificationResponse(response())).toBe(true);
    expect(mockClaimed).toHaveBeenCalledWith('notif-1', 'medication-taken');
    expect(listEntries).not.toHaveBeenCalled();
    expect(createEntry).not.toHaveBeenCalled();
  });

  it('still logs a press the native handler did not claim', async () => {
    (createEntry as jest.Mock).mockResolvedValue({});
    (listMedications as jest.Mock).mockResolvedValue([{ id: 'm1' }]);
    expect(await processMedicationNotificationResponse(response())).toBe(true);
    expect(createEntry).toHaveBeenCalledTimes(1);
  });

  it('pushes the snooze minutes and subscribes once on init', () => {
    initMedicationNotificationActions();
    expect(mockSetSnooze).toHaveBeenCalledWith(30);
    expect(mockListener).toBeDefined();
  });

  it('replays the queue when the connection returns', async () => {
    initMedicationNotificationActions();
    const queued = {
      key: null,
      notificationId: 'n-offline',
      status: 'taken',
      doses: [dose],
      entryDate: DATE,
      userId: null,
    };
    await AsyncStorage.setItem(
      PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
      JSON.stringify([queued])
    );
    (listMedications as jest.Mock).mockResolvedValue([
      { id: 'm1', user_id: 'u1' },
    ]);
    (listEntries as jest.Mock).mockResolvedValue([]);
    (createEntry as jest.Mock).mockResolvedValue({});

    mockNetworkListener?.({ isConnected: false, isInternetReachable: false });
    await Promise.resolve();
    expect(createEntry).not.toHaveBeenCalled();

    mockNetworkListener?.({ isConnected: true, isInternetReachable: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await retryPendingMedicationActions();
    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(
      await AsyncStorage.getItem(PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY)
    ).toBeNull();
  });

  it('picks up a dose queued while a retry is already running', async () => {
    const queued = (id: string) => ({
      key: null,
      notificationId: id,
      status: 'taken',
      doses: [dose],
      entryDate: DATE,
      userId: null,
    });
    await AsyncStorage.setItem(
      PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
      JSON.stringify([queued('first')])
    );
    let release!: (value: unknown) => void;
    (listMedications as jest.Mock).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve))
    );
    (listMedications as jest.Mock).mockResolvedValue([{ id: 'm1' }]);
    (listEntries as jest.Mock).mockResolvedValue([]);
    (createEntry as jest.Mock).mockResolvedValue({});

    const running = retryPendingMedicationActions();
    // Let the running pass read the queue and reach its ownership check.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The running pass has not read the queue yet; a dose is queued, then a
    // second caller arrives and joins the run.
    await AsyncStorage.setItem(
      PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
      JSON.stringify([queued('first'), queued('second')])
    );
    const joined = retryPendingMedicationActions();
    release([{ id: 'm1' }]);
    await Promise.all([running, joined]);
    expect(
      await AsyncStorage.getItem(PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY)
    ).toBeNull();
  });

  it('refreshes caches and clears only the matching queued action', async () => {
    const unrelated = {
      key: 'other',
      notificationId: 'n-other',
      status: 'taken',
      doses: [{ medicationId: 'm9', scheduleId: null }],
      entryDate: DATE,
      userId: null,
    };
    const matching = {
      key: null,
      notificationId: 'notif-1',
      status: 'taken',
      doses: [dose],
      entryDate: DATE,
      userId: null,
    };
    await AsyncStorage.setItem(
      PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
      JSON.stringify([matching, unrelated])
    );
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    mockRead.mockReturnValue(
      JSON.stringify([
        {
          id: 'r1',
          kind: 'action',
          status: 'taken',
          notificationId: 'notif-1',
          key: null,
          entryDate: DATE,
          userId: null,
          doses: [dose],
          failedDoses: [],
          loggedCount: 1,
        },
      ])
    );
    expect(await applyNativeMedicationActionResults()).toBe(true);
    expect(spy).toHaveBeenCalled();
    expect(mockAck).toHaveBeenCalledWith(['r1']);
    const left = JSON.parse(
      (await AsyncStorage.getItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
      )) ?? '[]'
    );
    expect(left).toEqual([unrelated]);
    spy.mockRestore();
  });

  it('keeps a failed dose natively when the retry queue cannot be written', async () => {
    const failed = { medicationId: 'm2', scheduleId: null };
    mockRead.mockReturnValue(
      JSON.stringify([
        {
          id: 'r9',
          kind: 'action',
          status: 'taken',
          notificationId: 'notif-9',
          key: null,
          entryDate: DATE,
          userId: null,
          doses: [failed],
          failedDoses: [failed],
          loggedCount: 0,
        },
      ])
    );
    // AsyncStorage is already a jest mock here; spyOn + mockRestore would
    // reset its implementation for every later test.
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('disk full')
    );
    await applyNativeMedicationActionResults();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('queues only the doses the native write failed for', async () => {
    const failed = { medicationId: 'm2', scheduleId: null };
    mockRead.mockReturnValue(
      JSON.stringify([
        {
          id: 'r2',
          kind: 'action',
          status: 'skipped',
          notificationId: 'notif-2',
          key: 'k',
          entryDate: DATE,
          userId: 'u1',
          doses: [dose, failed],
          failedDoses: [failed],
          loggedCount: 1,
        },
      ])
    );
    await applyNativeMedicationActionResults();
    expect(mockAck).toHaveBeenCalledWith(['r2']);
    const queued = JSON.parse(
      (await AsyncStorage.getItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
      )) ?? '[]'
    );
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      status: 'skipped',
      doses: [failed],
      userId: 'u1',
    });
  });

  it('records a native snooze so it is kept until the dose is logged', async () => {
    mockRead.mockReturnValue(
      JSON.stringify([
        {
          kind: 'snooze',
          baseKey: 'k',
          entryDate: DATE,
          doses: [dose],
          minutes: 30,
        },
      ])
    );
    await applyNativeMedicationActionResults();
    const stored = JSON.parse(
      (await AsyncStorage.getItem('snoozed_medication_reminders')) ?? '[]'
    );
    expect(stored).toEqual([{ baseKey: 'k', entryDate: DATE, doses: [dose] }]);
  });

  it('keeps a snooze natively when its record cannot be stored', async () => {
    mockRead.mockReturnValue(
      JSON.stringify([
        {
          id: 'r5',
          kind: 'snooze',
          baseKey: 'k',
          entryDate: DATE,
          doses: [dose],
          minutes: 30,
        },
      ])
    );
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('disk full')
    );
    await applyNativeMedicationActionResults();
    expect(mockAck).not.toHaveBeenCalled();
  });

  it('does nothing when the native handler left nothing', async () => {
    expect(await applyNativeMedicationActionResults()).toBe(false);
  });
});
