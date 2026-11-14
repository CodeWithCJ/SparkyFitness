import * as Notifications from 'expo-notifications';
import {
  scheduleOngoingEpisodeNudge,
  cancelOngoingEpisodeNudge,
} from '../../src/services/symptomReminderService';

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
    await scheduleOngoingEpisodeNudge('ep-123', 'Migraine', futureStart, 24);

    expect(mockCancel).toHaveBeenCalledWith('symptom_nudge_ep-123');
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'symptom_nudge_ep-123',
        content: expect.objectContaining({
          categoryIdentifier: 'symptom-episode-nudge',
          data: { episodeId: 'ep-123', symptomName: 'Migraine' },
        }),
      })
    );
  });

  it('cancels ongoing episode nudge', async () => {
    await cancelOngoingEpisodeNudge('ep-123');
    expect(mockCancel).toHaveBeenCalledWith('symptom_nudge_ep-123');
  });
});
