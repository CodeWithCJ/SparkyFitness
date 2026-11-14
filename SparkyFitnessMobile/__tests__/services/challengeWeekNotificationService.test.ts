import * as Notifications from 'expo-notifications';

import {
  cancelChallengeWeekNotifications,
  challengeWeekNoticeContent,
  scheduleChallengeWeekNotifications,
} from '../../src/services/challengeWeekNotificationService';
import { initializeI18n } from '../../src/localization/i18n';
import {
  CHALLENGE_WEEK_LEADER_KIND,
  type ChallengeWeekNotice,
} from '../../src/utils/challenges';

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockGetAll = Notifications.getAllScheduledNotificationsAsync as jest.Mock;

const notice: ChallengeWeekNotice = {
  challengeId: 'c1',
  challengeName: 'Family Cup',
  fireAt: new Date(2026, 10, 15, 20, 0, 0),
  leaderName: 'Alex',
  leaderTotal: '400 pts',
  leaderIsMe: false,
  own: { rank: 2, total: '250 pts' },
};

beforeAll(async () => {
  await initializeI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('challengeWeekNoticeContent', () => {
  it('says who leads and where the user stands', () => {
    expect(challengeWeekNoticeContent(notice)).toEqual({
      title: 'Family Cup: who leads this week',
      body: 'Alex leads with 400 pts. You are #2 with 250 pts. The week closes tonight.',
    });
    expect(
      challengeWeekNoticeContent({ ...notice, leaderIsMe: true, own: null })
        .body
    ).toBe('You lead with 400 pts. The week closes tonight.');
    expect(challengeWeekNoticeContent({ ...notice, own: null }).body).toBe(
      'Alex leads with 400 pts. The week closes tonight.'
    );
  });
});

describe('scheduleChallengeWeekNotifications', () => {
  it('schedules one dated notification per challenge, tagged for the tap handler', async () => {
    const ids = await scheduleChallengeWeekNotifications([notice]);
    expect(ids).toHaveLength(1);
    expect(mockSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'challenge_week_c1',
        content: expect.objectContaining({
          data: { kind: CHALLENGE_WEEK_LEADER_KIND, challengeId: 'c1' },
        }),
        trigger: expect.objectContaining({
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notice.fireAt,
        }),
      })
    );
  });

  it('keeps going when one fails', async () => {
    mockSchedule.mockRejectedValueOnce(new Error('nope'));
    const ids = await scheduleChallengeWeekNotifications([
      notice,
      { ...notice, challengeId: 'c2' },
    ]);
    expect(ids).toHaveLength(1);
  });
});

describe('cancelChallengeWeekNotifications', () => {
  it('cancels only the challenge week notifications', async () => {
    mockGetAll.mockResolvedValueOnce([
      {
        identifier: 'a',
        content: { data: { kind: CHALLENGE_WEEK_LEADER_KIND } },
      },
      { identifier: 'b', content: { data: { kind: 'mood-checkin' } } },
    ]);
    await cancelChallengeWeekNotifications();
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockCancel).toHaveBeenCalledWith('a');
  });
});
