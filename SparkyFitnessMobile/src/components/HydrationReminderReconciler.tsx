import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useDailySummary } from '../hooks/useDailySummary';
import { useServerConnection } from '../hooks/useServerConnection';
import { useHydrationReminderReconciler } from '../hooks/useHydrationReminder';
import { waterIntakeLogQueryKey } from '../hooks/queryKeys';
import { fetchWaterIntakeLog } from '../services/api/measurementsApi';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { getTodayDate } from '../utils/dateUtils';
import { latestLoggedAt } from '../utils/hydrationReminder';

/**
 * Headless owner of hydration reminder reconciliation — renders nothing.
 *
 * Always reads today, not the Dashboard's selected date: a reminder is about
 * drinking now. Queries stay disabled while reminders are off or the server
 * is unreachable (matching the Dashboard), but the hook still runs so turning
 * reminders off cancels what was scheduled.
 */
const HydrationReminderReconciler: React.FC = () => {
  const remindersActive = useAppPreferencesStore(
    (s) => s.notificationsEnabled && s.waterReminderEnabled
  );
  const { isConnected } = useServerConnection();
  const queriesEnabled = remindersActive && isConnected;
  const today = getTodayDate();

  const { summary, refetch: refetchSummary } = useDailySummary({
    date: today,
    enabled: queriesEnabled,
  });
  const { data: logEntries, refetch: refetchLog } = useQuery({
    queryKey: waterIntakeLogQueryKey(today),
    queryFn: () => fetchWaterIntakeLog(today),
    enabled: queriesEnabled,
  });

  const lastLoggedAt = useMemo(() => latestLoggedAt(logEntries), [logEntries]);

  const refetch = useCallback(() => {
    if (!queriesEnabled) return;
    void refetchSummary();
    void refetchLog();
  }, [queriesEnabled, refetchSummary, refetchLog]);

  useHydrationReminderReconciler({
    today,
    lastLoggedAt,
    waterMl: summary?.waterConsumed ?? 0,
    waterGoalMl: summary?.waterGoal ?? null,
    isLoading: summary === undefined || logEntries === undefined,
    refetch,
  });

  return null;
};

export default HydrationReminderReconciler;
