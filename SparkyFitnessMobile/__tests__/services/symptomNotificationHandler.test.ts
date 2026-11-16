import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';

import { initSymptomNotificationActions } from '../../src/services/symptomNotificationHandler';
import {
  addNotificationResponseListener,
  dismissDeliveredNotification,
} from '../../src/services/notifications';
import {
  cancelOngoingEpisodeNudge,
  scheduleOngoingEpisodeNudge,
} from '../../src/services/symptomReminderService';
import { endSymptomEpisode } from '../../src/services/api/symptomsApi';
import { invalidateSymptomEntryCaches } from '../../src/hooks/useSymptoms';
import { currentServerConfig } from '../../src/services/notificationServerScope';

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
  dismissDeliveredNotification: jest.fn(async () => undefined),
  notificationCopy: (_key: string, defaultValue: string) => defaultValue,
  SYMPTOM_EPISODE_NUDGE_CATEGORY: 'symptom-episode-nudge',
  SYMPTOM_END_EPISODE_ACTION: 'symptom-end-episode',
  SYMPTOM_STILL_ONGOING_ACTION: 'symptom-still-ongoing',
}));

jest.mock('../../src/services/symptomReminderService', () => ({
  cancelOngoingEpisodeNudge: jest.fn(async () => undefined),
  scheduleOngoingEpisodeNudge: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/notificationServerScope', () => ({
  ...jest.requireActual('../../src/services/notificationServerScope'),
  currentServerConfig: jest.fn(),
}));

jest.mock('../../src/services/api/symptomsApi', () => ({
  endSymptomEpisode: jest.fn(),
}));

jest.mock('../../src/hooks/useSymptoms', () => ({
  invalidateSymptomEntryCaches: jest.fn(),
}));

jest.mock('../../src/hooks/queryClient', () => ({
  queryClient: { id: 'query-client' },
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockAddListener = addNotificationResponseListener as jest.Mock;
const mockDismiss = dismissDeliveredNotification as jest.Mock;
const mockEnd = endSymptomEpisode as jest.Mock;
const mockCancelNudge = cancelOngoingEpisodeNudge as jest.Mock;
const mockScheduleNudge = scheduleOngoingEpisodeNudge as jest.Mock;
const mockInvalidate = invalidateSymptomEntryCaches as jest.Mock;
const mockGetLast = Notifications.getLastNotificationResponse as jest.Mock;
const mockClearLast = Notifications.clearLastNotificationResponse as jest.Mock;
const mockToast = Toast.show as jest.Mock;
const mockCurrentServerConfig = currentServerConfig as jest.Mock;
const serverA = { id: 'server-a', url: 'https://a.example' };
const serverB = { id: 'server-b', url: 'https://b.example' };

let nextId = 0;
function response(
  actionIdentifier: string,
  {
    category = 'symptom-episode-nudge',
    data = {
      episodeId: 'ep-1',
      symptomName: 'Migraine',
      serverId: 'server-a',
    } as Record<string, unknown>,
    id,
  }: {
    category?: string;
    data?: Record<string, unknown>;
    id?: string;
  } = {}
) {
  return {
    actionIdentifier,
    notification: {
      date: 1000,
      request: {
        identifier: id ?? `symptom_nudge_${nextId++}`,
        content: { categoryIdentifier: category, data },
      },
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('initSymptomNotificationActions', () => {
  let remove: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    remove = jest.fn();
    mockAddListener.mockReturnValue({ remove });
    mockGetLast.mockReturnValue(null);
    mockEnd.mockResolvedValue({ id: 'ep-1' });
    mockCurrentServerConfig.mockResolvedValue(serverA);
  });

  function listener(): (r: unknown) => void {
    initSymptomNotificationActions();
    return mockAddListener.mock.calls[0][0];
  }

  it('ends the episode when End now is pressed', async () => {
    listener()(response('symptom-end-episode', { id: 'n-end' }));
    await flush();

    expect(mockEnd).toHaveBeenCalledWith(
      'ep-1',
      { ended_at: expect.any(String) },
      serverA
    );
    expect(mockCancelNudge).toHaveBeenCalledWith('ep-1');
    expect(mockInvalidate).toHaveBeenCalledWith({ id: 'query-client' });
    expect(mockDismiss).toHaveBeenCalledWith('n-end');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', text1: 'Episode ended' })
    );
  });

  it('shows an error and keeps the caches when ending fails', async () => {
    mockEnd.mockRejectedValueOnce(new Error('offline'));
    listener()(response('symptom-end-episode'));
    await flush();

    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Could not end the episode',
      })
    );
  });

  it('asks again in 24 hours when Still ongoing is pressed', async () => {
    const before = Date.now();
    listener()(response('symptom-still-ongoing', { id: 'n-ongoing' }));
    await flush();

    expect(mockEnd).not.toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith('n-ongoing');
    expect(mockScheduleNudge).toHaveBeenCalledWith(
      'ep-1',
      'Migraine',
      expect.any(String),
      { serverId: 'server-a' }
    );
    const startedAt = Date.parse(mockScheduleNudge.mock.calls[0][2]);
    expect(startedAt).toBeGreaterThanOrEqual(before);
  });

  it('ignores a plain tap and other categories', async () => {
    const handle = listener();
    handle(response(Notifications.DEFAULT_ACTION_IDENTIFIER));
    handle(
      response('symptom-end-episode', { category: 'medication-reminder' })
    );
    await flush();

    expect(mockEnd).not.toHaveBeenCalled();
    expect(mockScheduleNudge).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('does nothing beyond dismissing when the episode id is missing', async () => {
    listener()(response('symptom-end-episode', { data: {}, id: 'n-bad' }));
    await flush();

    expect(mockDismiss).toHaveBeenCalledWith('n-bad');
    expect(mockEnd).not.toHaveBeenCalled();
  });

  it('runs a launch press once even if the listener also delivers it', async () => {
    const launch = response('symptom-end-episode', { id: 'n-launch' });
    mockGetLast.mockReturnValue(launch);
    const handle = listener();
    handle(launch);
    await flush();

    expect(mockClearLast).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
  });

  it('leaves another handler’s launch response alone', () => {
    mockGetLast.mockReturnValue(
      response(Notifications.DEFAULT_ACTION_IDENTIFIER, { category: '' })
    );
    initSymptomNotificationActions();
    expect(mockClearLast).not.toHaveBeenCalled();
  });

  it('ignores a press from a nudge scheduled for another server', async () => {
    mockCurrentServerConfig.mockResolvedValue(serverB);
    const handle = listener();
    handle(response('symptom-end-episode', { id: 'n-other-end' }));
    handle(response('symptom-still-ongoing', { id: 'n-other-ongoing' }));
    await flush();

    expect(mockEnd).not.toHaveBeenCalled();
    expect(mockScheduleNudge).not.toHaveBeenCalled();
    expect(mockDismiss).toHaveBeenCalledWith('n-other-end');
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        text1: 'This reminder is from another server',
      })
    );
  });

  it('acts on a nudge from an older build that has no server stamp', async () => {
    mockCurrentServerConfig.mockResolvedValue(serverB);
    listener()(
      response('symptom-end-episode', {
        data: { episodeId: 'ep-1', symptomName: 'Migraine' },
      })
    );
    await flush();

    expect(mockEnd).toHaveBeenCalledWith(
      'ep-1',
      { ended_at: expect.any(String) },
      serverB
    );
  });

  it('runs a press once even when another press arrives in between', async () => {
    const handle = listener();
    const first = response('symptom-end-episode', { id: 'n-a' });
    const second = response('symptom-end-episode', {
      id: 'n-b',
      data: { episodeId: 'ep-2', symptomName: 'Nausea', serverId: 'server-a' },
    });
    handle(first);
    handle(second);
    handle(first);
    await flush();

    expect(mockEnd).toHaveBeenCalledTimes(2);
    expect(mockEnd).toHaveBeenNthCalledWith(
      1,
      'ep-1',
      expect.anything(),
      serverA
    );
    expect(mockEnd).toHaveBeenNthCalledWith(
      2,
      'ep-2',
      expect.anything(),
      serverA
    );
  });

  it('keeps using the server it checked if the active one changes meanwhile', async () => {
    mockCurrentServerConfig
      .mockResolvedValueOnce(serverA)
      .mockResolvedValue(serverB);
    listener()(response('symptom-end-episode', { id: 'n-race' }));
    await flush();

    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledWith('ep-1', expect.anything(), serverA);
  });

  it.each([
    [
      'stamped',
      { episodeId: 'ep-1', symptomName: 'Migraine', serverId: 'server-a' },
    ],
    ['unstamped', { episodeId: 'ep-1', symptomName: 'Migraine' }],
  ])(
    'does not act on a %s nudge when no server is active',
    async (_label, data) => {
      mockCurrentServerConfig.mockResolvedValue(null);
      const handle = listener();
      handle(response('symptom-end-episode', { data }));
      handle(response('symptom-still-ongoing', { data }));
      await flush();

      expect(mockEnd).not.toHaveBeenCalled();
      expect(mockScheduleNudge).not.toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Could not end the episode',
        })
      );
    }
  );

  it('removes the listener on cleanup', () => {
    const stop = initSymptomNotificationActions();
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
