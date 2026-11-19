import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import i18n from '../localization/i18n';
import {
  challengesQueryKeyRoot,
  useChallenges,
  useChallengesStandings,
} from '../hooks/useChallenges';
import { usePreferences } from '../hooks/usePreferences';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import {
  cancelChallengeWeekNotifications,
  enqueueChallengeWeekNotificationTask,
  scheduleChallengeWeekNotifications,
} from '../services/challengeWeekNotificationService';
import { hasNotificationPermission } from '../services/notifications';
import { challengeToday } from '@workspace/shared';
import {
  buildChallengeWeekNotices,
  challengeState,
  type ChallengeDistanceUnit,
} from '../utils/challenges';

/** Re-read the standings on return to the app at most this often. */
const FOREGROUND_REFRESH_MS = 15 * 60 * 1000;

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

  const [languageRevision, setLanguageRevision] = useState(0);
  useEffect(() => {
    const onLanguageChanged = () =>
      setLanguageRevision((revision) => revision + 1);
    i18n.on('languageChanged', onLanguageChanged);
    return () => i18n.off('languageChanged', onLanguageChanged);
  }, []);

  const list = useChallenges({ enabled: active });
  const { challenges } = list;
  // Days are counted in each challenge's own time zone, as on the server.
  // Worked out on every render, so a day turning over is picked up too.
  const weekly = active
    ? challenges.filter(
        (c) =>
          c.rules.period === 'week' &&
          challengeState(c, challengeToday(c.time_zone, new Date())) ===
            'running'
      )
    : [];
  const hasWeekly = weekly.length > 0;
  const weeklyIds = weekly.map((c) => c.id);
  const standings = useChallengesStandings(weeklyIds, null);
  // Still loading, or a read failed: keep what is scheduled rather than
  // cancel it on a launch without data (nothing here is persisted).
  const waiting =
    active &&
    (list.isLoading ||
      list.isError ||
      standings.isLoading ||
      standings.isError);
  const { preferences } = usePreferences({ enabled: hasWeekly });
  const energyUnit = useEnergyUnit();
  const distanceUnit: ChallengeDistanceUnit =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';

  // Cheap to rebuild; the signature below decides whether anything changed.
  const notices = buildChallengeWeekNotices(
    weekly,
    standings.byId,
    { distanceUnit, energyUnit },
    t,
    new Date()
  );
  const signature = JSON.stringify([
    waiting,
    languageRevision,
    notices.map((n) => [
      n.challengeId,
      n.fireAt.getTime(),
      n.challengeName,
      n.leaderName,
      n.leaderTotal,
      n.leaderIsMe,
      n.own,
    ]),
  ]);
  const waitingRef = useRef(waiting);
  useEffect(() => {
    waitingRef.current = waiting;
  }, [waiting]);
  const noticesRef = useRef(notices);
  useEffect(() => {
    noticesRef.current = notices;
  }, [notices]);

  useEffect(() => {
    if (waitingRef.current) return;
    void enqueueChallengeWeekNotificationTask(async () => {
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
