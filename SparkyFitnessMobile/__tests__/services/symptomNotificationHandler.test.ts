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

let nextId = 0;
function response(
  actionIdentifier: string,
  {
    category = 'symptom-episode-nudge',
    data = { episodeId: 'ep-1', symptomName: 'Migraine' } as Record<
      string,
      unknown
    >,
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
  });

  function listener(): (r: unknown) => void {
    initSymptomNotificationActions();
    return mockAddListener.mock.calls[0][0];
  }

  it('ends the episode when End now is pressed', async () => {
    listener()(response('symptom-end-episode', { id: 'n-end' }));
    await flush();

    expect(mockEnd).toHaveBeenCalledWith('ep-1', {
      ended_at: expect.any(String),
    });
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
      expect.any(String)
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

  it('removes the listener on cleanup', () => {
    const stop = initSymptomNotificationActions();
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
