import * as Notifications from 'expo-notifications';
import { currentServerId } from '../../src/services/notificationServerScope';
import {
  scheduleOngoingEpisodeNudge,
  cancelOngoingEpisodeNudge,
} from '../../src/services/symptomReminderService';

jest.mock('../../src/services/notificationServerScope', () => ({
  currentServerId: jest.fn(async () => 'server-a'),
}));

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
describe('symptomReminderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPerms.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    } as never);
  });

  it('schedules ongoing episode nudge for future timestamp', async () => {
    const futureStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago
    await scheduleOngoingEpisodeNudge('ep-123', 'Migraine', futureStart, {
      nudgeHours: 24,
    });

    expect(mockCancel).toHaveBeenCalledWith('symptom_nudge_ep-123');
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'symptom_nudge_ep-123',
        content: expect.objectContaining({
          categoryIdentifier: 'symptom-episode-nudge',
          data: {
            episodeId: 'ep-123',
            symptomName: 'Migraine',
            serverId: 'server-a',
          },
        }),
      })
    );
  });

  it('stamps the nudge with the server it was given', async () => {
    const recentStart = new Date().toISOString();
    await scheduleOngoingEpisodeNudge('ep-9', 'Migraine', recentStart, {
      serverId: 'server-b',
    });
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          data: {
            episodeId: 'ep-9',
            symptomName: 'Migraine',
            serverId: 'server-b',
          },
        }),
      })
    );
  });

  it('does not schedule a nudge it cannot stamp with a server', async () => {
    (currentServerId as jest.Mock).mockResolvedValueOnce(null);
    await scheduleOngoingEpisodeNudge(
      'ep-123',
      'Migraine',
      new Date().toISOString()
    );
    expect(mockCancel).toHaveBeenCalledWith('symptom_nudge_ep-123');
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('cancels ongoing episode nudge', async () => {
    await cancelOngoingEpisodeNudge('ep-123');
    expect(mockCancel).toHaveBeenCalledWith('symptom_nudge_ep-123');
  });
});
