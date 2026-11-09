const mockClaimed = jest.fn();
const mockDrain = jest.fn();
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
    drainMedicationActionResults: () => mockDrain(),
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
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyNativeMedicationActionResults,
  initMedicationNotificationActions,
  PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
  processMedicationNotificationResponse,
} from '../../src/services/medicationNotificationHandler';
import {
  createEntry,
  listEntries,
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
    mockDrain.mockReset().mockReturnValue('[]');
    (createEntry as jest.Mock).mockReset();
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
    expect(await processMedicationNotificationResponse(response())).toBe(true);
    expect(createEntry).toHaveBeenCalledTimes(1);
  });

  it('pushes the snooze minutes and subscribes once on init', () => {
    initMedicationNotificationActions();
    expect(mockSetSnooze).toHaveBeenCalledWith(30);
    expect(mockListener).toBeDefined();
  });

  it('refreshes caches for a dose the native handler logged', async () => {
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    mockDrain.mockReturnValue(
      JSON.stringify([
        {
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
    expect(
      await AsyncStorage.getItem(PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY)
    ).toBeNull();
    spy.mockRestore();
  });

  it('queues only the doses the native write failed for', async () => {
    const failed = { medicationId: 'm2', scheduleId: null };
    mockDrain.mockReturnValue(
      JSON.stringify([
        {
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
    mockDrain.mockReturnValue(
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

  it('does nothing when the native handler left nothing', async () => {
    expect(await applyNativeMedicationActionResults()).toBe(false);
  });
});
