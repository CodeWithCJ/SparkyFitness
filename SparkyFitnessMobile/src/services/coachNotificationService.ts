import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isFeatureEnabled, type CoachUnreadMessages } from '@workspace/shared';
import i18n from '../localization/i18n';
import { fetchUnreadCoachMessages } from './api/coachesApi';
import { fetchFeatureChoices } from './api/featureChoicesApi';
import { addLog } from './LogService';
import { currentServerId } from './notificationServerScope';
import {
  COACHES_CHANNEL_ID,
  COACH_MESSAGE_KIND,
  ensureCoachesChannel,
  hasNotificationPermission,
} from './notifications';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

/** `data.kind` of a notification for a coach's message. */
export { COACH_MESSAGE_KIND };

const STATE_KEY_PREFIX = '@SparkyFitness/coachNotifications:';
const MAX_REMEMBERED_IDS = 100;
const MAX_NOTIFICATIONS_PER_RUN = 3;

interface CoachNotificationState {
  /** The newest message already looked at, as the server's ISO time. */
  since: string | null;
  /** Ids already shown, so a message never notifies twice. */
  shown: string[];
}

async function readState(serverId: string): Promise<CoachNotificationState> {
  try {
    const raw = await AsyncStorage.getItem(`${STATE_KEY_PREFIX}${serverId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CoachNotificationState>;
      return {
        since: typeof parsed.since === 'string' ? parsed.since : null,
        shown: Array.isArray(parsed.shown)
          ? parsed.shown.filter((id): id is string => typeof id === 'string')
          : [],
      };
    }
  } catch {
    // A damaged record starts over; the shown list only prevents repeats.
  }
  return { since: null, shown: [] };
}

async function writeState(serverId: string, state: CoachNotificationState) {
  await AsyncStorage.setItem(
    `${STATE_KEY_PREFIX}${serverId}`,
    JSON.stringify({
      since: state.since,
      shown: state.shown.slice(-MAX_REMEMBERED_IDS),
    })
  );
}

/** A coach message as notification text: the translated fixed text when no AI
 * wrote it, else the text the AI wrote. */
export function coachNotificationText(message: CoachUnreadMessages[number]): {
  title: string;
  body: string;
} {
  const key = message.builtin_key ?? 'custom';
  const title =
    message.coach_name ??
    // i18n-audit-ignore-next-line dynamic-i18n-key -- keys come from the shared coach catalog.
    i18n.t(`coaches.names.${key}`, { defaultValue: key.replace(/_/g, ' ') });
  let body: unknown = message.text;
  if (message.template_key) {
    // i18n-audit-ignore-next-line dynamic-i18n-key -- keys come from the server's coach templates.
    body = i18n.t(message.template_key, {
      ...(message.template_params ?? {}),
      defaultValue: message.text,
    });
  }
  return { title, body: typeof body === 'string' ? body : message.text };
}

/**
 * Shows a local notification for each new unread coach message (at most three
 * a run), once each. Runs from the background sync and when the app opens.
 * Never prompts for permission and never throws: a failure is logged and the
 * messages are tried again next time.
 *
 * iOS decides when background tasks run, so a message can notify later than
 * its check-in time; opening the app always shows it.
 */
export async function notifyNewCoachMessages(): Promise<number> {
  try {
    const prefs = useAppPreferencesStore.getState();
    if (!prefs.notificationsEnabled || !prefs.coachNotificationsEnabled) {
      return 0;
    }
    if (!(await hasNotificationPermission())) return 0;
    const serverId = await currentServerId();
    if (!serverId) return 0;

    // Coaches are off unless the person turned them on in this app.
    const choices = await fetchFeatureChoices();
    if (
      !isFeatureEnabled('aiCoaches', 'mobile', {
        choices: choices?.feature_choices,
        cycleEnabled: null,
      })
    ) {
      return 0;
    }

    const state = await readState(serverId);
    const messages = await fetchUnreadCoachMessages(state.since);
    if (messages.length === 0) return 0;

    const muted = new Set(prefs.mutedCoachNotificationIds);
    const fresh = messages
      .filter(
        (message) =>
          !state.shown.includes(message.nudge_id) &&
          !muted.has(message.coach_id)
      )
      .slice(0, MAX_NOTIFICATIONS_PER_RUN);

    await ensureCoachesChannel();
    const shown = [...state.shown];
    for (const message of fresh) {
      const { title, body } = coachNotificationText(message);
      await Notifications.scheduleNotificationAsync({
        identifier: `coach_${message.nudge_id}`,
        content: {
          title,
          body,
          sound: true,
          data: {
            kind: COACH_MESSAGE_KIND,
            coachId: message.coach_id,
            nudgeId: message.nudge_id,
            serverId,
          },
        },
        trigger:
          Platform.OS === 'android' ? { channelId: COACHES_CHANNEL_ID } : null,
      });
      shown.push(message.nudge_id);
    }
    // Everything seen is not looked at again, notified or muted.
    await writeState(serverId, {
      since: messages[0]?.created_at ?? state.since,
      shown: [...shown, ...messages.map((message) => message.nudge_id)],
    });
    return fresh.length;
  } catch (error) {
    addLog(
      `Coach notification check failed: ${error instanceof Error ? error.message : String(error)}`,
      'WARNING'
    );
    return 0;
  }
}
