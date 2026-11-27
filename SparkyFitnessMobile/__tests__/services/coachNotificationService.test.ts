import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  COACH_MESSAGE_KIND,
  coachNotificationText,
  notifyNewCoachMessages,
} from '../../src/services/coachNotificationService';
import { initializeI18n } from '../../src/localization/i18n';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

const mockFetchUnread = jest.fn();
const mockFetchChoices = jest.fn();
const mockHasPermission = jest.fn();
const mockServerId = jest.fn();
jest.mock('../../src/services/api/coachesApi', () => ({
  fetchUnreadCoachMessages: (...args: unknown[]) => mockFetchUnread(...args),
}));
jest.mock('../../src/services/api/featureChoicesApi', () => ({
  fetchFeatureChoices: () => mockFetchChoices(),
}));
jest.mock('../../src/services/notificationServerScope', () => ({
  currentServerId: () => mockServerId(),
  belongsToOtherServer: jest.fn(),
}));
jest.mock('../../src/services/notifications', () => ({
  COACHES_CHANNEL_ID: 'coaches',
  ensureCoachesChannel: jest.fn(),
  hasNotificationPermission: () => mockHasPermission(),
}));

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;

const message = (n: number, over: Record<string, unknown> = {}) => ({
  nudge_id: `n${n}`,
  coach_id: 'c1',
  coach_name: null,
  builtin_key: 'recovery',
  text: `Message ${n}`,
  template_key: null,
  template_params: null,
  created_at: `2026-11-25T1${n}:00:00.000Z`,
  ...over,
});

beforeAll(async () => {
  await initializeI18n('en');
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockHasPermission.mockResolvedValue(true);
  mockServerId.mockResolvedValue('server-1');
  mockFetchChoices.mockResolvedValue({
    feature_choices: { mobile: { aiCoaches: true } },
  });
  mockFetchUnread.mockResolvedValue([]);
  // The store restores itself from storage; wait so it cannot overwrite these.
  await useAppPreferencesStore.persist.rehydrate();
  useAppPreferencesStore.setState({
    notificationsEnabled: true,
    coachNotificationsEnabled: true,
    mutedCoachNotificationIds: [],
  });
});

describe('notifyNewCoachMessages', () => {
  it('shows one notification per new message, opening the right thread', async () => {
    mockFetchUnread.mockResolvedValue([message(2), message(1)]);
    expect(await notifyNewCoachMessages()).toBe(2);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    const request = mockSchedule.mock.calls[0][0];
    expect(request.content.data).toEqual({
      kind: COACH_MESSAGE_KIND,
      coachId: 'c1',
      nudgeId: 'n2',
      serverId: 'server-1',
    });
    expect(request.content.body).toBe('Message 2');
  });

  it('never notifies the same message twice, and asks only for newer ones', async () => {
    mockFetchUnread.mockResolvedValue([message(2), message(1)]);
    await notifyNewCoachMessages();
    mockSchedule.mockClear();
    mockFetchUnread.mockResolvedValue([message(2), message(1), message(3)]);
    expect(await notifyNewCoachMessages()).toBe(1);
    expect(mockFetchUnread).toHaveBeenLastCalledWith(message(2).created_at);
    expect(mockSchedule.mock.calls[0][0].identifier).toBe('coach_n3');
  });

  it('shows at most three at once', async () => {
    mockFetchUnread.mockResolvedValue([1, 2, 3, 4, 5].map((n) => message(n)));
    expect(await notifyNewCoachMessages()).toBe(3);
  });

  it('skips a coach the person muted, but still counts it as seen', async () => {
    useAppPreferencesStore.setState({ mutedCoachNotificationIds: ['c1'] });
    mockFetchUnread.mockResolvedValue([message(1)]);
    expect(await notifyNewCoachMessages()).toBe(0);
    useAppPreferencesStore.setState({ mutedCoachNotificationIds: [] });
    expect(await notifyNewCoachMessages()).toBe(0);
  });

  it.each([
    ['notifications are off', { notificationsEnabled: false }],
    ['coach notifications are off', { coachNotificationsEnabled: false }],
  ])('does nothing when %s', async (_name, prefs) => {
    useAppPreferencesStore.setState(prefs);
    expect(await notifyNewCoachMessages()).toBe(0);
    expect(mockFetchUnread).not.toHaveBeenCalled();
  });

  it('does nothing without permission, a server, or the Coaches feature', async () => {
    mockHasPermission.mockResolvedValue(false);
    expect(await notifyNewCoachMessages()).toBe(0);
    mockHasPermission.mockResolvedValue(true);
    mockServerId.mockResolvedValue(null);
    expect(await notifyNewCoachMessages()).toBe(0);
    mockServerId.mockResolvedValue('server-1');
    mockFetchChoices.mockResolvedValue({ feature_choices: { mobile: {} } });
    expect(await notifyNewCoachMessages()).toBe(0);
    mockFetchChoices.mockResolvedValue(null);
    expect(await notifyNewCoachMessages()).toBe(0);
    expect(mockFetchUnread).not.toHaveBeenCalled();
  });

  it('keeps each server’s state apart', async () => {
    mockFetchUnread.mockResolvedValue([message(1)]);
    await notifyNewCoachMessages();
    mockServerId.mockResolvedValue('server-2');
    mockSchedule.mockClear();
    expect(await notifyNewCoachMessages()).toBe(1);
  });

  it('never throws: a failed fetch is tried again next time', async () => {
    mockFetchUnread.mockRejectedValueOnce(new Error('offline'));
    expect(await notifyNewCoachMessages()).toBe(0);
    mockFetchUnread.mockResolvedValue([message(1)]);
    expect(await notifyNewCoachMessages()).toBe(1);
  });
});

describe('coachNotificationText', () => {
  it('uses the coach name, and the AI’s own text', () => {
    expect(
      coachNotificationText(message(1, { coach_name: 'Race prep' }))
    ).toEqual({ title: 'Race prep', body: 'Message 1' });
    expect(coachNotificationText(message(1)).title).toBe('Recovery');
  });

  it('translates a fixed message with its numbers', () => {
    const text = coachNotificationText(
      message(1, {
        template_key: 'coaches.templates.nutrition.protein_low',
        template_params: { protein_pct_of_goal: 42 },
        builtin_key: 'nutrition',
      })
    );
    expect(text.body).toBe(
      'Protein is at 42% of your goal today. Consider a protein-rich meal.'
    );
  });

  it('falls back to the written text for a template this app does not know', () => {
    expect(
      coachNotificationText(
        message(1, { template_key: 'coaches.templates.new.thing' })
      ).body
    ).toBe('Message 1');
  });
});
