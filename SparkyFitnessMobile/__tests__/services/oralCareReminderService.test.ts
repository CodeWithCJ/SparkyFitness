import * as Notifications from 'expo-notifications';

import { reconcileOralCareReminders } from '../../src/services/oralCareReminderService';
import { hasNotificationPermission } from '../../src/services/notifications';
import i18n, { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/services/notifications', () => ({
  ensureOralCareChannel: jest.fn(async () => undefined),
  hasNotificationPermission: jest.fn(async () => true),
  notificationCopy: (_key: string, fallback: string) => fallback,
  ORAL_CARE_CHANNEL_ID: 'oral-care',
}));

const mockSchedule = jest.mocked(Notifications.scheduleNotificationAsync);
const mockCancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);
const mockGetAllScheduled = jest.mocked(
  Notifications.getAllScheduledNotificationsAsync
);
const mockGetPresented = jest.mocked(
  Notifications.getPresentedNotificationsAsync
);
const mockDismiss = jest.mocked(Notifications.dismissNotificationAsync);
const mockHasPermission = jest.mocked(hasNotificationPermission);

const presented = (identifier: string, kind: string) =>
  ({
    request: { identifier, content: { data: { kind } } },
  }) as unknown as Notifications.Notification;

const scheduled = (identifier: string, data: Record<string, unknown>) =>
  ({
    identifier,
    content: { data },
  }) as unknown as Notifications.NotificationRequest;

/** A brushing reminder as `scheduleOralCareReminders` stamps it. */
const brushing = (time: string, language = i18n.resolvedLanguage) =>
  scheduled(`oral_care_${time}`, { kind: 'oral-care', time, language });

describe('reconcileOralCareReminders', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockHasPermission.mockResolvedValue(true);
    mockGetPresented.mockResolvedValue([]);
    mockGetAllScheduled.mockResolvedValue([]);
  });

  it('cancels, then schedules one reminder a day per time', async () => {
    await reconcileOralCareReminders({
      mode: 'on',
      times: ['21:15', '07:30'],
    });

    expect(mockCancel).toHaveBeenCalledWith('oral_care_0');
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(mockCancel.mock.invocationCallOrder[0]).toBeLessThan(
      mockSchedule.mock.invocationCallOrder[0]
    );
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('stamps each reminder with its time and the language it is written in', async () => {
    await reconcileOralCareReminders({ mode: 'on', times: ['07:30'] });

    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: {
            kind: 'oral-care',
            time: '07:30',
            language: 'en',
          },
        }),
      })
    );
  });

  it('only cancels without notification permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    await reconcileOralCareReminders({ mode: 'on', times: ['07:30'] });

    expect(mockCancel).toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('only cancels when off, leaving those shown', async () => {
    mockGetPresented.mockResolvedValue([presented('oral_care_0', 'oral-care')]);
    await reconcileOralCareReminders({ mode: 'off', times: ['07:30'] });

    expect(mockCancel).toHaveBeenCalled();
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('clears the brushing reminders already shown when asked, and nothing else', async () => {
    mockGetPresented.mockResolvedValue([
      presented('oral_care_0', 'oral-care'),
      presented('med-1', 'medication'),
    ]);
    await reconcileOralCareReminders({
      mode: 'off',
      times: ['07:30'],
      dismissDelivered: true,
    });

    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledWith('oral_care_0');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  describe('keep', () => {
    it('schedules nothing while none is scheduled: they were off', async () => {
      mockGetAllScheduled.mockResolvedValue([
        scheduled('med-1', { kind: 'medication' }),
      ]);
      await reconcileOralCareReminders({ mode: 'keep', times: ['07:30'] });

      expect(mockCancel).not.toHaveBeenCalled();
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('applies new times to the ones scheduled', async () => {
      mockGetAllScheduled.mockResolvedValue([brushing('08:00')]);
      await reconcileOralCareReminders({ mode: 'keep', times: ['06:45'] });

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      expect(mockSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            data: expect.objectContaining({ time: '06:45' }),
          }),
        })
      );
    });
  });

  describe('skipWhenCurrent', () => {
    it('leaves them untouched when they are already these times in this language', async () => {
      mockGetAllScheduled.mockResolvedValue([
        brushing('21:15'),
        brushing('07:30'),
      ]);
      await reconcileOralCareReminders({
        mode: 'on',
        times: ['07:30', '21:15'],
        skipWhenCurrent: true,
      });

      expect(mockCancel).not.toHaveBeenCalled();
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it.each([
      ['another time', [brushing('07:30'), brushing('22:00')]],
      ['one missing', [brushing('07:30')]],
      ['another language', [brushing('07:30', 'xx'), brushing('21:15', 'xx')]],
      [
        'reminders from before the stamps',
        [
          scheduled('oral_care_0', { kind: 'oral-care' }),
          scheduled('oral_care_1', { kind: 'oral-care' }),
        ],
      ],
      ['none', []],
    ])('rewrites them with %s', async (_label, current) => {
      mockGetAllScheduled.mockResolvedValue(current);
      await reconcileOralCareReminders({
        mode: 'on',
        times: ['07:30', '21:15'],
        skipWhenCurrent: true,
      });

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSchedule).toHaveBeenCalledTimes(2);
    });

    it('still cancels when off', async () => {
      mockGetAllScheduled.mockResolvedValue([brushing('07:30')]);
      await reconcileOralCareReminders({
        mode: 'off',
        times: ['07:30'],
        dismissDelivered: true,
        skipWhenCurrent: true,
      });

      expect(mockCancel).toHaveBeenCalled();
      expect(mockSchedule).not.toHaveBeenCalled();
    });
  });

  it('runs one call at a time, so the last one wins', async () => {
    let releasePermission!: (granted: boolean) => void;
    mockHasPermission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePermission = resolve;
        })
    );
    const first = reconcileOralCareReminders({
      mode: 'on',
      times: ['07:30'],
    });
    const second = reconcileOralCareReminders({
      mode: 'off',
      times: ['07:30'],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    releasePermission(true);
    await Promise.all([first, second]);

    // The first scheduled once its permission check answered, and only then
    // did the second cancel what it had scheduled.
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.invocationCallOrder[0]).toBeLessThan(
      mockCancel.mock.invocationCallOrder.at(-1)!
    );
  });
});
