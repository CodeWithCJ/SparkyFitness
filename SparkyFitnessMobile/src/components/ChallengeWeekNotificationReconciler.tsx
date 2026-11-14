import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  challengesQueryKeyRoot,
  useChallenges,
  useChallengesStandings,
} from '../hooks/useChallenges';
import { usePreferences } from '../hooks/usePreferences';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import {
  cancelChallengeWeekNotifications,
  scheduleChallengeWeekNotifications,
} from '../services/challengeWeekNotificationService';
import { hasNotificationPermission } from '../services/notifications';
import { addLog } from '../services/LogService';
import { getTodayDate } from '../utils/dateUtils';
import {
  buildChallengeWeekNotices,
  challengeState,
  type ChallengeDistanceUnit,
} from '../utils/challenges';

/** Re-read the standings on return to the app at most this often. */
const FOREGROUND_REFRESH_MS = 15 * 60 * 1000;

let queue: Promise<void> = Promise.resolve();

// Runs are serialized so a quick change can't interleave its cancel/schedule
// with the previous run's and leave a stale notification behind.
function enqueue(task: () => Promise<void>): Promise<void> {
  queue = queue.then(task).catch((error: unknown) => {
    addLog(
      `Challenge week notification sync failed: ${String(error)}`,
      'ERROR'
    );
  });
  return queue;
}

/**
 * Keeps one local notification per running weekly challenge scheduled for
 * 8 PM on the week's last day, saying who leads. The text is built from
 * the standings the app last loaded, so it is rebuilt whenever they change
 * and they are re-read when the app comes back to the foreground.
 */
const ChallengeWeekNotificationReconciler: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const prefEnabled = useAppPreferencesStore(
    (s) => s.challengeWeekNotificationsEnabled
  );
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );
  const active = prefEnabled && notificationsEnabled;

  const { challenges } = useChallenges({ enabled: active });
  const today = getTodayDate();
  const weekly = useMemo(
    () =>
      active
        ? challenges.filter(
            (c) =>
              c.rules.period === 'week' &&
              challengeState(c, today) === 'running'
          )
        : [],
    [active, challenges, today]
  );
  const hasWeekly = weekly.length > 0;
  const weeklyIds = useMemo(() => weekly.map((c) => c.id), [weekly]);
  const standings = useChallengesStandings(weeklyIds, null);
  const { preferences } = usePreferences({ enabled: hasWeekly });
  const energyUnit = useEnergyUnit();
  const distanceUnit: ChallengeDistanceUnit =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';

  const notices = useMemo(
    () =>
      buildChallengeWeekNotices(
        weekly,
        standings.byId,
        { distanceUnit, energyUnit },
        t,
        new Date(),
        today
      ),
    [weekly, standings.byId, distanceUnit, energyUnit, t, today]
  );
  const signature = JSON.stringify(
    notices.map((n) => [
      n.challengeId,
      n.fireAt.getTime(),
      n.challengeName,
      n.leaderName,
      n.leaderTotal,
      n.leaderIsMe,
      n.own,
    ])
  );
  const noticesRef = useRef(notices);
  useEffect(() => {
    noticesRef.current = notices;
  }, [notices]);

  useEffect(() => {
    void enqueue(async () => {
      await cancelChallengeWeekNotifications();
      const list = noticesRef.current;
      if (list.length > 0 && (await hasNotificationPermission())) {
        await scheduleChallengeWeekNotifications(list);
      }
    });
  }, [signature]);

  // Scores change while the app is closed; re-read them on return.
  const lastRefresh = useRef(0);
  useEffect(() => {
    if (!active) return;
    lastRefresh.current = Date.now();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - lastRefresh.current < FOREGROUND_REFRESH_MS) return;
      lastRefresh.current = Date.now();
      void queryClient.invalidateQueries({ queryKey: challengesQueryKeyRoot });
    });
    return () => subscription.remove();
  }, [active, queryClient]);

  return null;
};

export default ChallengeWeekNotificationReconciler;
