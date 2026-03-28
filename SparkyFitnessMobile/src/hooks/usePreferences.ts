import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPreferences, updatePreferences } from '../services/api/preferencesApi';
import { UserPreferences } from '../types/preferences';
import { preferencesQueryKey } from './queryKeys';
import { addLog } from '../services/LogService';

const TIMEZONE_SYNC_RETRY_BASE_DELAY_MS = 1000;
const TIMEZONE_SYNC_RETRY_MAX_DELAY_MS = 30000;

function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getTimezoneSyncRetryDelayMs(attempt: number): number {
  return Math.min(
    TIMEZONE_SYNC_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    TIMEZONE_SYNC_RETRY_MAX_DELAY_MS,
  );
}

function clearRetryTimeout(timeoutRef: {
  current: ReturnType<typeof setTimeout> | null;
}): void {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}

interface UsePreferencesOptions {
  enabled?: boolean;
}

export function usePreferences({ enabled = true }: UsePreferencesOptions = {}) {
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const [retryTick, setRetryTick] = useState(0);

  const query = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: fetchPreferences,
    staleTime: 1000 * 60 * 30, // 30 minutes - preferences rarely change
    enabled,
  });

  useEffect(() => {
    return () => {
      clearRetryTimeout(retryTimeoutRef);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearRetryTimeout(retryTimeoutRef);
      return;
    }
    if (!query.data || syncingRef.current) return;

    const deviceTz = getDeviceTimezone();
    if (query.data.timezone === deviceTz) {
      clearRetryTimeout(retryTimeoutRef);
      retryAttemptRef.current = 0;
      return;
    }

    syncingRef.current = true;
    clearRetryTimeout(retryTimeoutRef);
    addLog(`[Preferences] Syncing device timezone: ${deviceTz}`, 'INFO');
    updatePreferences({ timezone: deviceTz })
      .then(() => {
        retryAttemptRef.current = 0;
        queryClient.setQueryData<UserPreferences>(preferencesQueryKey, (old) =>
          old ? { ...old, timezone: deviceTz } : old,
        );
      })
      .catch((err) => {
        retryAttemptRef.current += 1;
        const retryDelayMs = getTimezoneSyncRetryDelayMs(retryAttemptRef.current);
        addLog(
          `[Preferences] Timezone sync failed: ${err}. Retrying in ${retryDelayMs}ms`,
          'WARNING',
        );
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          setRetryTick((value) => value + 1);
        }, retryDelayMs);
      })
      .finally(() => {
        syncingRef.current = false;
      });
  }, [enabled, query.data, queryClient, retryTick]);

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
