import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSyncHealthData } from './useSyncHealthData';
import {
  loadTimeRange,
  getActiveServerConfig,
  loadSyncOnOpenEnabled,
} from '../services/storage';
import type { TimeRange } from '../services/storage';
import { initHealthConnect, loadHealthPreference } from '../services/healthConnectService';
import { HEALTH_METRICS } from '../HealthMetrics';
import { flushPendingHealthSyncCacheRefresh } from '../services/backgroundSyncService';
import {
  tryClaimAutoSync,
  isForegroundAutoSyncWindowOpen,
  setForegroundAutoSyncWindowOpen,
  shouldRunForegroundResumeAutoSync,
  recordAutoSyncTime,
} from '../services/autoSyncCoordinator';
import { addLog } from '../services/LogService';

const AUTO_SYNC_WATCHDOG_MS = 90_000;

interface AutoSyncOnOpenArgs {
  initialRoute: 'Tabs' | 'Onboarding' | null;
  syncMutation: ReturnType<typeof useSyncHealthData>;
}

/**
 * Owns the sync-on-open orchestration: cold-start sync once the user lands on
 * Tabs, foreground-return sync after the app has been backgrounded long
 * enough, and the foreground auto-sync window that tells iOS HealthKit
 * observers to yield while one of those deliberate syncs is running.
 */
export function useAutoSyncOnOpen({ initialRoute, syncMutation }: AutoSyncOnOpenArgs) {
  const foregroundAutoSyncWindowRef = useRef(false);
  const backgroundEnteredAtRef = useRef<number | null>(null);
  const wasInBackgroundRef = useRef(false);

  const setForegroundAutoSyncWindowState = useCallback((isOpen: boolean) => {
    foregroundAutoSyncWindowRef.current = isOpen;
    setForegroundAutoSyncWindowOpen(isOpen);
  }, []);

  // Yield only during a deliberate foreground auto-sync window (cold-start or
  // foreground-return). Outside that narrow window, let background delivery fire normally.
  const shouldYieldObserverSync = useCallback(() => (
    AppState.currentState === 'active' &&
    foregroundAutoSyncWindowRef.current &&
    isForegroundAutoSyncWindowOpen()
  ), []);

  const triggerAutoSync = useCallback(async (configId: string, release: () => void) => {
    let committed = false;
    try {
      if (syncMutation.isPending) return;

      const initialized = await initHealthConnect();
      if (!initialized) return;

      const loadedTimeRange = await loadTimeRange();
      const timeRange: TimeRange = loadedTimeRange ?? '3d';
      const healthMetricStates: Record<string, boolean> = {};
      await Promise.all(
        HEALTH_METRICS.map(async (metric) => {
          const enabled = await loadHealthPreference<boolean>(metric.preferenceKey);
          healthMetricStates[metric.stateKey] = enabled === true;
        }),
      );

      committed = true;
      syncMutation.mutate({
        timeRange,
        healthMetricStates,
      }, {
        onSuccess: () => {
          void recordAutoSyncTime(configId);
        },
        onSettled: () => {
          release();
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Auto sync on open failed: ${message}`, 'ERROR');
    } finally {
      if (!committed) release();
    }
  }, [syncMutation]);

  const triggerAutoSyncRef = useRef(triggerAutoSync);
  useEffect(() => {
    triggerAutoSyncRef.current = triggerAutoSync;
  }, [triggerAutoSync]);

  useEffect(() => {
    if (initialRoute !== 'Tabs') return;

    const triggerColdStartSync = async () => {
      const syncOnOpen = await loadSyncOnOpenEnabled();
      if (!syncOnOpen) return;
      const config = await getActiveServerConfig();
      if (!config) return;

      setForegroundAutoSyncWindowState(true);
      const coordRelease = tryClaimAutoSync();
      if (!coordRelease) {
        setForegroundAutoSyncWindowState(false);
        return;
      }

      const cleanup = () => {
        setForegroundAutoSyncWindowState(false);
        coordRelease();
      };
      const watchdog = setTimeout(cleanup, AUTO_SYNC_WATCHDOG_MS);
      const safeCleanup = () => {
        clearTimeout(watchdog);
        cleanup();
      };

      await triggerAutoSyncRef.current(config.id, safeCleanup);
    };

    triggerColdStartSync().catch(error => {
      setForegroundAutoSyncWindowState(false);
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Cold-start sync on open failed: ${message}`, 'ERROR');
    });
  }, [initialRoute, setForegroundAutoSyncWindowState]);

  useEffect(() => {
    const FOREGROUND_SYNC_MIN_AWAY_MS = 5 * 60 * 1000;

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      try {
        if (nextAppState === 'background') {
          backgroundEnteredAtRef.current = Date.now();
          wasInBackgroundRef.current = true;
          return;
        }

        if (nextAppState !== 'active') return;

        await flushPendingHealthSyncCacheRefresh();
        if (!wasInBackgroundRef.current) return;

        const enteredAt = backgroundEnteredAtRef.current;
        wasInBackgroundRef.current = false;
        backgroundEnteredAtRef.current = null;

        const timeAway = enteredAt !== null ? Date.now() - enteredAt : Infinity;
        if (timeAway < FOREGROUND_SYNC_MIN_AWAY_MS) return;

        const config = await getActiveServerConfig();
        if (!config) return;

        const syncOnOpen = await loadSyncOnOpenEnabled();
        if (!syncOnOpen) return;
        if (!(await shouldRunForegroundResumeAutoSync(config.id))) return;

        setForegroundAutoSyncWindowState(true);
        const coordRelease = tryClaimAutoSync();
        if (!coordRelease) {
          setForegroundAutoSyncWindowState(false);
          return;
        }

        const cleanup = () => {
          setForegroundAutoSyncWindowState(false);
          coordRelease();
        };
        const watchdog = setTimeout(cleanup, AUTO_SYNC_WATCHDOG_MS);
        const safeCleanup = () => {
          clearTimeout(watchdog);
          cleanup();
        };

        await triggerAutoSyncRef.current(config.id, safeCleanup);
      } catch (error) {
        setForegroundAutoSyncWindowState(false);
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Foreground-return sync on open failed: ${message}`, 'ERROR');
      }
    });

    return () => subscription.remove();
  }, [setForegroundAutoSyncWindowState]);

  return { shouldYieldObserverSync };
}
