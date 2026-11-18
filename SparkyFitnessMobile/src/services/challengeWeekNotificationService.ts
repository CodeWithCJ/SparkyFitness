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

/**
 * Waits before each retry of a cancellation that failed. A failed one is
 * tried again, as the reconciler does not run again on its own (the user
 * turned the notice off, or switched accounts).
 */
export const CANCEL_RETRY_DELAYS_MS = [1000, 5000, 15000] as const;

/** One pass; returns how many could not be cancelled (or listed). */
async function cancelOnce(): Promise<number> {
  let scheduled: Notifications.NotificationRequest[];
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch (err) {
    addLog(
      `cancelChallengeWeekNotifications could not list: ${(err as Error).message}`,
      'WARNING'
    );
    return 1;
  }
  const results = await Promise.allSettled(
    scheduled
      .filter((n) => n.content.data?.kind === CHALLENGE_WEEK_LEADER_KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
  return results.filter((result) => result.status === 'rejected').length;
}

/**
 * Cancels every scheduled challenge week notification. What fails is tried
 * again (each pass re-reads what is still scheduled) after each delay in
 * `CANCEL_RETRY_DELAYS_MS`; returns false when some are still left after
 * the last.
 */
export async function cancelChallengeWeekNotifications(): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    const failed = await cancelOnce();
    if (failed === 0) return true;
    const delay = CANCEL_RETRY_DELAYS_MS[attempt];
    if (delay === undefined) {
      addLog(
        `cancelChallengeWeekNotifications gave up with ${failed} left after ${attempt + 1} tries`,
        'ERROR'
      );
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

let queue: Promise<void> = Promise.resolve();

/**
 * Runs `task` after every earlier one, so a quick change can't interleave
 * its cancel/schedule with the previous run's and leave a stale notification
 * behind. A failure is logged and does not stop the next task.
 */
export function enqueueChallengeWeekNotificationTask(
  task: () => Promise<unknown>
): Promise<void> {
  queue = queue
    .then(task)
    .then(() => undefined)
    .catch((error: unknown) => {
      addLog(
        `Challenge week notification sync failed: ${String(error)}`,
        'ERROR'
      );
    });
  return queue;
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
