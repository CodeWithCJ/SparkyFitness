import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  cancelMoodCheckinReminders,
  normalizeCheckinReminderTimes,
  scheduleMoodCheckinReminders,
} from '../../src/services/moodCheckinReminderService';

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

describe('normalizeCheckinReminderTimes', () => {
  it('drops invalid times, de-duplicates and sorts', () => {
    expect(
      normalizeCheckinReminderTimes(['21:00', '08:00', '08:00', '25:00', '7:5'])
    ).toEqual(['08:00', '21:00']);
  });

  it('truncates to five times', () => {
    expect(
      normalizeCheckinReminderTimes([
        '06:00',
        '07:00',
        '08:00',
        '09:00',
        '10:00',
        '11:00',
      ])
    ).toEqual(['06:00', '07:00', '08:00', '09:00', '10:00']);
  });

  it('falls back to 20:30 when nothing is valid', () => {
    expect(normalizeCheckinReminderTimes([])).toEqual(['20:30']);
  });
});

describe('scheduleMoodCheckinReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllScheduled.mockResolvedValue([]);
  });

  it('schedules a daily trigger per time on the mood-checkin channel', async () => {
    const ids = await scheduleMoodCheckinReminders(['20:30', '08:00']);

    expect(ids).toHaveLength(2);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(mockSchedule).toHaveBeenNthCalledWith(1, {
      identifier: 'mood_checkin_0',
      content: expect.objectContaining({
        title: 'How are you feeling?',
        body: 'Take a quick check-in: mood, energy and focus.',
        data: { kind: 'mood-checkin' },
      }),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 8,
        minute: 0,
        channelId: 'mood-checkin',
      },
    });
    expect(mockSchedule).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        identifier: 'mood_checkin_1',
        trigger: expect.objectContaining({ hour: 20, minute: 30 }),
      })
    );
  });

  it('ensures the Android channel first', async () => {
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });
    try {
      await scheduleMoodCheckinReminders(['08:00']);
      expect(mockSetChannel).toHaveBeenCalledWith(
        'mood-checkin',
        expect.objectContaining({ name: 'Mood check-ins' })
      );
      expect(mockSetChannel.mock.invocationCallOrder[0]).toBeLessThan(
        mockSchedule.mock.invocationCallOrder[0]
      );
    } finally {
      Object.defineProperty(Platform, 'OS', {
        get: () => 'ios',
        configurable: true,
      });
    }
  });

  it('cancels what it scheduled and returns nothing when a schedule fails', async () => {
    mockSchedule
      .mockResolvedValueOnce('first-id')
      .mockRejectedValueOnce(new Error('boom'));

    const ids = await scheduleMoodCheckinReminders(['08:00', '20:30']);

    expect(ids).toEqual([]);
    expect(mockCancel).toHaveBeenCalledWith('first-id');
  });
});

describe('scheduleMoodCheckinReminders channel failure', () => {
  it('returns nothing and schedules nothing when channel creation rejects', async () => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', {
      get: () => 'android',
      configurable: true,
    });
    try {
      mockSetChannel.mockRejectedValueOnce(new Error('channel boom'));

      const ids = await scheduleMoodCheckinReminders(['08:00']);

      expect(ids).toEqual([]);
      expect(mockSchedule).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', {
        get: () => 'ios',
        configurable: true,
      });
    }
  });
});

describe('cancelMoodCheckinReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cancels mood check-in notifications and leaves other reminders alone', async () => {
    mockGetAllScheduled.mockResolvedValue([
      {
        identifier: 'legacy-mood',
        content: { data: { kind: 'mood-checkin' } },
      },
      { identifier: 'med_1', content: { data: { medicationId: 'm' } } },
    ] as unknown as Notifications.NotificationRequest[]);

    await cancelMoodCheckinReminders();

    expect(mockCancel).toHaveBeenCalledWith('legacy-mood');
    for (let i = 0; i < 5; i++) {
      expect(mockCancel).toHaveBeenCalledWith(`mood_checkin_${i}`);
    }
    expect(mockCancel).not.toHaveBeenCalledWith('med_1');
  });
});
