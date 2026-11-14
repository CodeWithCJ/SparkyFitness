import * as Notifications from 'expo-notifications';
import {
  CHALLENGES_CHANNEL_ID,
  ensureChallengesChannel,
  notificationCopy,
} from './notifications';
import {
  CHALLENGE_WEEK_LEADER_KIND,
  type ChallengeWeekNotice,
} from '../utils/challenges';
import { addLog } from './LogService';

function noticeIdentifier(challengeId: string): string {
  return `challenge_week_${challengeId}`;
}

export function challengeWeekNoticeContent(notice: ChallengeWeekNotice): {
  title: string;
  body: string;
} {
  const title = notificationCopy(
    'notifications.challengeWeek.title',
    '{{name}}: who leads this week',
    { name: notice.challengeName }
  );
  if (notice.leaderIsMe) {
    return {
      title,
      body: notificationCopy(
        'notifications.challengeWeek.bodyYouLead',
        'You lead with {{total}}. The week closes tonight.',
        { total: notice.leaderTotal }
      ),
    };
  }
  if (notice.own) {
    return {
      title,
      body: notificationCopy(
        'notifications.challengeWeek.bodyWithOwn',
        '{{leader}} leads with {{total}}. You are #{{rank}} with {{ownTotal}}. The week closes tonight.',
        {
          leader: notice.leaderName,
          total: notice.leaderTotal,
          rank: notice.own.rank,
          ownTotal: notice.own.total,
        }
      ),
    };
  }
  return {
    title,
    body: notificationCopy(
      'notifications.challengeWeek.body',
      '{{leader}} leads with {{total}}. The week closes tonight.',
      { leader: notice.leaderName, total: notice.leaderTotal }
    ),
  };
}

/** Cancels every scheduled challenge week notification. */
export async function cancelChallengeWeekNotifications(): Promise<void> {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => n.content.data?.kind === CHALLENGE_WEEK_LEADER_KIND)
        .map((n) =>
          Notifications.cancelScheduledNotificationAsync(n.identifier).catch(
            () => undefined
          )
        )
    );
  } catch (err) {
    addLog(
      `cancelChallengeWeekNotifications failed: ${(err as Error).message}`,
      'ERROR'
    );
  }
}

/**
 * Schedules one notification per weekly challenge for the evening of the
 * week's last day and returns the ids. Never prompts for permission; the
 * caller gates on it. A failed one is logged and skipped.
 */
export async function scheduleChallengeWeekNotifications(
  notices: readonly ChallengeWeekNotice[]
): Promise<string[]> {
  if (notices.length === 0) return [];
  const ids: string[] = [];
  try {
    await ensureChallengesChannel();
  } catch (err) {
    addLog(
      `ensureChallengesChannel failed: ${(err as Error).message}`,
      'WARNING'
    );
  }
  for (const notice of notices) {
    try {
      const { title, body } = challengeWeekNoticeContent(notice);
      ids.push(
        await Notifications.scheduleNotificationAsync({
          identifier: noticeIdentifier(notice.challengeId),
          content: {
            title,
            body,
            sound: true,
            data: {
              kind: CHALLENGE_WEEK_LEADER_KIND,
              challengeId: notice.challengeId,
            },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: notice.fireAt,
            channelId: CHALLENGES_CHANNEL_ID,
          },
        })
      );
    } catch (err) {
      addLog(
        `scheduleChallengeWeekNotifications failed: ${(err as Error).message}`,
        'ERROR'
      );
    }
  }
  return ids;
}
