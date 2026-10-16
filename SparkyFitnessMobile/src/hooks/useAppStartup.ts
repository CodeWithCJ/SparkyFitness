import { useEffect } from 'react';
import i18n from '../localization/i18n';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initWorkoutNotificationActions } from '../stores/activeWorkoutStore';
import { loadBackgroundSyncEnabled } from '../services/storage';
import {
  startObservers,
  stopObservers,
} from '../services/healthConnectService';
import {
  configureBackgroundSync,
  performBackgroundSync,
  flushPendingHealthSyncCacheRefresh,
} from '../services/backgroundSyncService';
import { tryClaimAutoSync } from '../services/autoSyncCoordinator';
import { initializeTheme } from '../services/themeService';
import { addLog, initLogService } from '../services/LogService';
import {
  initNotifications,
  registerLocalizedNotificationPresentation,
} from '../services/notifications';
import { initMedicationNotificationActions } from '../services/medicationNotificationHandler';
import { ensureSymptomNotificationCategory } from '../services/symptomReminderService';
import { initWorkoutLiveActivity } from '../services/workoutLiveActivity';
import { initRunLiveActivity } from '../services/runLiveActivity';
import { ensureTimezoneBootstrapped } from '../services/api/preferencesApi';
import { loadSpeechVoices } from '../services/speechVoice';
import { cancelLegacyRunReminders } from '../services/legacyRunReminders';

interface AppStartupArgs {
  /**
   * When true, an observer-triggered HealthKit sync should not run because a
   * deliberate foreground auto-sync window is open. See useAutoSyncOnOpen.
   */
  shouldYieldObserverSync: () => boolean;
}

/**
 * One-time app startup: theme, notifications, notification actions, the
 * workout Live Activity, the log service, and the sync services (timezone
 * bootstrap, background sync, iOS HealthKit observers).
 */
export function useAppStartup({ shouldYieldObserverSync }: AppStartupArgs) {
  useEffect(() => {
    let cancelled = false;
    const onLanguageChanged = () => {
      void registerLocalizedNotificationPresentation().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        addLog(
          `[App] Failed to refresh localized notification presentation: ${message}`,
          'ERROR'
        );
      });
    };
    i18n.on('languageChanged', onLanguageChanged);

    // Initialize theme from storage on app start
    initializeTheme();

    // Reset the auto-open flag on every app start
    const initializeApp = async () => {
      // Remove the flag so the dashboard will auto-open on first SyncScreen visit
      await AsyncStorage.removeItem('@HealthConnect:hasAutoOpenedDashboard');
      await initNotifications();
      void cancelLegacyRunReminders();
      // So the first spoken cue already uses the chosen voice.
      void loadSpeechVoices();
    };

    initializeApp().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(
        `[App] Failed to initialize app startup state: ${message}`,
        'ERROR'
      );
    });

    initWorkoutNotificationActions();
    initMedicationNotificationActions();
    void ensureSymptomNotificationCategory();

    // Keeps the iOS Live Activity or Android ongoing notification in sync
    // with the active-workout store.
    initWorkoutLiveActivity().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(
        `[App] Failed to initialize workout Live Activity: ${message}`,
        'ERROR'
      );
    });

    // Dynamic Island / Lock Screen card for phone GPS runs and watch runs.
    initRunLiveActivity().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(
        `[App] Failed to initialize run Live Activity: ${message}`,
        'ERROR'
      );
    });

    // Initialize log service (warms cache, prunes old logs, registers AppState listener)
    initLogService().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Failed to initialize log service: ${message}`, 'ERROR');
    });

    const initializeSyncServices = async () => {
      // Bootstrap timezone before any sync path is configured so the server
      // has a stable timezone for the very first sync.
      const timezone = await ensureTimezoneBootstrapped();
      if (!timezone) {
        addLog(
          '[App] Timezone bootstrap did not resolve a timezone before sync setup.',
          'WARNING'
        );
      }

      if (cancelled) return;

      try {
        await configureBackgroundSync();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(
          `[App] Failed to configure background sync: ${message}`,
          'ERROR'
        );
      }

      if (cancelled || Platform.OS !== 'ios') return;

      try {
        const enabled = await loadBackgroundSyncEnabled();
        if (!enabled || cancelled) return;

        startObservers(() => {
          if (shouldYieldObserverSync()) return;

          const release = tryClaimAutoSync();
          if (!release) return;

          performBackgroundSync('healthkit-observer')
            .catch((error) => {
              const message =
                error instanceof Error ? error.message : String(error);
              addLog(
                `[App] Observer-triggered sync failed: ${message}`,
                'ERROR'
              );
            })
            .finally(() => {
              release();
            });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(
          `[App] Failed to configure HealthKit observers: ${message}`,
          'ERROR'
        );
      }
    };

    initializeSyncServices().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Failed to initialize sync services: ${message}`, 'ERROR');
    });

    flushPendingHealthSyncCacheRefresh().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(
        `[App] Failed to flush pending health sync refresh: ${message}`,
        'ERROR'
      );
    });

    return () => {
      cancelled = true;
      i18n.off('languageChanged', onLanguageChanged);
      if (Platform.OS === 'ios') {
        stopObservers();
      }
    };
  }, [shouldYieldObserverSync]);
}
