import type { NotificationResponse } from 'expo-notifications';

const mockGetLast = jest.fn();
const mockClearLast = jest.fn();
const mockAddListener = jest.fn();
const mockCreateEntry = jest.fn();
const mockListEntries = jest.fn();
const mockSchedule = jest.fn();

jest.mock('expo-notifications', () => ({
  getLastNotificationResponse: mockGetLast,
  clearLastNotificationResponse: mockClearLast,
  registerTaskAsync: jest.fn(async () => null),
  scheduleNotificationAsync: mockSchedule,
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  getPresentedNotificationsAsync: jest.fn(async () => []),
}));
jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: mockAddListener,
  ensureMedicationReminderChannel: jest.fn(async () => undefined),
  dismissDeliveredNotification: jest.fn(async () => undefined),
  MEDICATION_TAKEN_ACTION: 'medication-taken',
  MEDICATION_SKIP_ACTION: 'medication-skip',
  MEDICATION_SNOOZE_ACTION: 'medication-snooze',
}));
jest.mock('../../src/services/api/medicationsApi', () => ({
  createEntry: mockCreateEntry,
  listEntries: mockListEntries,
}));
jest.mock('../../src/hooks/queryClient', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const response = (
  actionIdentifier = 'medication-taken'
): NotificationResponse =>
  ({
    actionIdentifier,
    notification: {
      date: 1234,
      request: {
        identifier: 'cold-start-reminder',
        content: {
          data: {
            medicationId: 'medicine-1',
            scheduleId: 'schedule-1',
            entryDate: '2026-11-06',
          },
        },
      },
    },
  }) as NotificationResponse;

const settle = () => new Promise<void>((resolve) => process.nextTick(resolve));

/** Native iOS can save the launch response before the React startup listener exists. */
describe('medication notification launch recovery', () => {
  let initialize: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLast.mockReturnValue(null);
    mockClearLast.mockImplementation(() => mockGetLast.mockReturnValue(null));
    mockListEntries.mockResolvedValue([]);
    mockCreateEntry.mockResolvedValue({ id: 'entry-1' });
    jest.isolateModules(() => {
      initialize = jest.requireActual<
        typeof import('../../src/services/medicationNotificationHandler')
      >(
        '../../src/services/medicationNotificationHandler'
      ).initMedicationNotificationActions;
    });
  });

  it.each([
    ['medication-taken', 'taken'],
    ['medication-skip', 'skipped'],
  ])(
    'recovers a saved %s action without a listener event',
    async (action, status) => {
      mockGetLast.mockReturnValue(response(action));
      initialize();
      await settle();

      expect(mockCreateEntry).toHaveBeenCalledTimes(1);
      expect(mockCreateEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          medication_id: 'medicine-1',
          schedule_id: 'schedule-1',
          entry_date: '2026-11-06',
          status,
        })
      );
      expect(mockClearLast).toHaveBeenCalledTimes(1);
    }
  );

  it('deduplicates a launch action also delivered to the listener', async () => {
    const saved = response();
    mockGetLast.mockReturnValue(saved);
    initialize();
    const listener = mockAddListener.mock.calls[0][0] as (
      value: NotificationResponse
    ) => void;
    listener(saved);
    await settle();
    expect(mockCreateEntry).toHaveBeenCalledTimes(1);
  });

  it('clears the newer response when two repeat snoozes share one operation', async () => {
    let finishScheduling!: (id: string) => void;
    mockSchedule.mockReturnValue(
      new Promise<string>((resolve) => {
        finishScheduling = resolve;
      })
    );
    initialize();
    const listener = mockAddListener.mock.calls[0][0] as (
      value: NotificationResponse
    ) => void;
    const first = response('medication-snooze');
    const second = {
      ...first,
      notification: {
        ...first.notification,
        date: first.notification.date + 1,
        request: {
          ...first.notification.request,
          identifier: 'repeat-reminder',
        },
      },
    };
    mockGetLast.mockReturnValue(second);
    listener(first);
    listener(second);
    await settle();
    expect(mockSchedule).toHaveBeenCalledTimes(1);

    finishScheduling('snoozed-reminder');
    await settle();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockClearLast).toHaveBeenCalledTimes(1);
    expect(mockGetLast()).toBeNull();
  });

  it('does not consume unrelated launch responses', async () => {
    mockGetLast.mockReturnValue(response('mood-checkin'));
    initialize();
    await settle();
    expect(mockCreateEntry).not.toHaveBeenCalled();
    expect(mockClearLast).not.toHaveBeenCalled();
  });

  it('retains a failed launch response for recovery', async () => {
    mockGetLast.mockReturnValue(response());
    mockCreateEntry.mockRejectedValue(new Error('offline'));
    initialize();
    await settle();
    expect(mockCreateEntry).toHaveBeenCalledTimes(1);
    expect(mockClearLast).not.toHaveBeenCalled();
  });

  it('does not clear a newer response arriving while the dose is saved', async () => {
    mockGetLast
      .mockReturnValueOnce(response())
      .mockReturnValue(response('other-action'));
    initialize();
    await settle();
    expect(mockCreateEntry).toHaveBeenCalledTimes(1);
    expect(mockClearLast).not.toHaveBeenCalled();
  });
});
