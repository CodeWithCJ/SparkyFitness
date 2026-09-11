import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { CommonActions } from '@react-navigation/native';
import { queryClient } from './queryClient';
import { serverConnectionQueryKey } from './queryKeys';
import { useSyncHealthData } from './useSyncHealthData';
import { promptForActiveWorkoutConflict } from './useStartLiveWorkout';
import { loadTimeRange } from '../services/storage';
import type { TimeRange } from '../services/storage';
import {
  initHealthConnect,
  loadHealthPreference,
} from '../services/healthConnectService';
import { HEALTH_METRICS } from '../HealthMetrics';
import { isSyncClaimed } from '../services/autoSyncCoordinator';
import { loadActiveDraft, clearDraft } from '../services/workoutDraftService';
import { navigationRef as rootNavigationRef } from '../components/ActiveWorkoutBar';
import { NON_ADD_TABS, type NonAddTabName } from '../components/TabsLayout';
import type { RootStackParamList } from '../types/navigation';

function getServerConnectionMessage(
  t: (key: string, options: { defaultValue: string }) => string,
  key: string,
  fallback: string
): string {
  switch (key) {
    case 'addSheetActions.configureForExercise':
      return t('addSheetActions.configureForExercise', {
        defaultValue:
          'Configure your server connection in Settings to add an exercise.',
      });
    case 'addSheetActions.configureForWorkout':
      return t('addSheetActions.configureForWorkout', {
        defaultValue:
          'Configure your server connection in Settings to start a workout.',
      });
    default:
      return fallback;
  }
}

type TabStateSnapshot = {
  index?: number;
  routes: {
    name: string;
    params?: unknown;
    state?: TabStateSnapshot;
  }[];
};

function findRouteState(
  state: TabStateSnapshot | undefined,
  routeName: string
): TabStateSnapshot | undefined {
  if (!state) return undefined;

  const activeRoute = state.routes[state.index ?? 0];
  if (activeRoute?.name === routeName && activeRoute.state) {
    return activeRoute.state;
  }

  for (const route of state.routes) {
    if (route.name === routeName && route.state) {
      return route.state;
    }
    const nested = findRouteState(route.state, routeName);
    if (nested) return nested;
  }

  return undefined;
}

function findRouteParams<T extends object>(
  state: TabStateSnapshot | undefined,
  routeName: string
): T | undefined {
  if (!state) return undefined;

  const activeRoute = state.routes[state.index ?? 0];
  if (activeRoute?.name === routeName) {
    return activeRoute.params as T | undefined;
  }

  for (const route of state.routes) {
    if (route.name === routeName) {
      return route.params as T | undefined;
    }
    const nested = findRouteParams<T>(route.state, routeName);
    if (nested) return nested;
  }

  return undefined;
}

interface AddSheetActionsArgs {
  syncMutation: ReturnType<typeof useSyncHealthData>;
}

/**
 * Owns the AddSheet's actions and their navigation plumbing: resolving the
 * diary date the sheet was opened over, routing each sheet row to its screen,
 * draft/active-workout conflict prompts, manual health sync, and returning the
 * user to their last content tab after a dismissal without an action.
 */
export function useAddSheetActions({ syncMutation }: AddSheetActionsArgs) {
  const { t } = useTranslation();
  const lastActiveTabRef = useRef<NonAddTabName>('Dashboard');
  const addSheetDismissNavigationTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const rememberActiveTab = useCallback((routeName: string) => {
    if ((NON_ADD_TABS as readonly string[]).includes(routeName)) {
      lastActiveTabRef.current = routeName as NonAddTabName;
    }
  }, []);
  const getLastActiveTab = useCallback(() => lastActiveTabRef.current, []);

  useEffect(() => {
    return () => {
      if (addSheetDismissNavigationTimeoutRef.current != null) {
        clearTimeout(addSheetDismissNavigationTimeoutRef.current);
      }
    };
  }, []);

  const getActiveDiaryDate = useCallback(() => {
    const rootOrTabState = rootNavigationRef.isReady()
      ? (rootNavigationRef.getRootState() as TabStateSnapshot | undefined)
      : undefined;

    const tabState = rootOrTabState?.routes?.some(
      (route) => route.name === 'Tabs'
    )
      ? findRouteState(rootOrTabState, 'Tabs')
      : rootOrTabState;
    const diaryState = findRouteState(tabState, 'Diary');
    const diaryParams =
      findRouteParams<{ selectedDate?: string }>(diaryState, 'DiaryRoot') ??
      findRouteParams<{ selectedDate?: string }>(tabState, 'Diary');

    return diaryParams?.selectedDate;
  }, []);

  const navigateFromSheet = useCallback(
    <T extends keyof RootStackParamList>(
      screen: T,
      params?: RootStackParamList[T]
    ) => {
      if (rootNavigationRef.isReady()) {
        rootNavigationRef.dispatch(
          CommonActions.navigate({ name: screen, params })
        );
      }
    },
    []
  );

  const handleAddFood = useCallback(() => {
    const date = getActiveDiaryDate();
    navigateFromSheet('FoodSearch', { date });
  }, [getActiveDiaryDate, navigateFromSheet]);

  const handleBarcodeScan = useCallback(() => {
    const date = getActiveDiaryDate();
    navigateFromSheet('FoodScan', { date });
  }, [getActiveDiaryDate, navigateFromSheet]);

  const checkServerConnected = useCallback(
    (message: string, defaultMessage: string): boolean => {
      const isConnected = queryClient.getQueryData(serverConnectionQueryKey);
      if (!isConnected) {
        Alert.alert(
          t('addSheetActions.noServerTitle', {
            defaultValue: 'No Server Connected',
          }),
          getServerConnectionMessage(t, message, defaultMessage),
          [
            {
              text: t('common.cancel', { defaultValue: 'Cancel' }),
              style: 'cancel',
            },
            {
              text: t('common.goToSettings', {
                defaultValue: 'Go to Settings',
              }),
              onPress: () => navigateFromSheet('Tabs', { screen: 'Settings' }),
            },
          ]
        );
        return false;
      }
      return true;
    },
    [navigateFromSheet, t]
  );

  const handleStartExerciseForm = useCallback(
    async (screen: 'WorkoutAdd' | 'ActivityAdd') => {
      if (
        !checkServerConnected(
          'addSheetActions.configureForExercise',
          'Configure your server connection in Settings to add an exercise.'
        )
      ) {
        return;
      }

      const date = getActiveDiaryDate();
      const draft = await loadActiveDraft();
      if (draft) {
        Alert.alert(
          t('addSheetActions.draft.title', {
            defaultValue: 'Draft in Progress',
          }),
          t('addSheetActions.draft.message', {
            defaultValue:
              'You have an unsaved {{type}} draft. What would you like to do?',
            type:
              draft.type === 'workout'
                ? t('addSheetActions.draft.workout', {
                    defaultValue: 'workout',
                  })
                : t('addSheetActions.draft.activity', {
                    defaultValue: 'activity',
                  }),
          }),
          [
            {
              text: t('common.cancel', { defaultValue: 'Cancel' }),
              style: 'cancel',
            },
            {
              text: t('addSheetActions.draft.resume', {
                defaultValue: 'Resume Draft',
              }),
              onPress: () => {
                if (draft.type === 'workout') {
                  navigateFromSheet('WorkoutAdd');
                } else {
                  navigateFromSheet('ActivityAdd');
                }
              },
            },
            {
              text: t('addSheetActions.draft.discard', {
                defaultValue: 'Discard & Continue',
              }),
              style: 'destructive',
              onPress: async () => {
                await clearDraft();
                navigateFromSheet(screen, { date, skipDraftLoad: true });
              },
            },
          ]
        );
        return;
      }

      navigateFromSheet(screen, { date, skipDraftLoad: true });
    },
    [checkServerConnected, navigateFromSheet, getActiveDiaryDate, t]
  );

  // Live start: no draft guard (form drafts belong to the Log Workout path) and
  // no diary date (a live workout is logged to today). Tapping while a workout
  // is already running prompts to go back to it or clear it and start over.
  const handleStartWorkout = useCallback(() => {
    if (
      !checkServerConnected(
        'addSheetActions.configureForWorkout',
        'Configure your server connection in Settings to start a workout.'
      )
    ) {
      return;
    }
    const prompted = promptForActiveWorkoutConflict(
      queryClient,
      {
        onGoToWorkout: () => navigateFromSheet('ActiveWorkout'),
        onClearAndStart: () => navigateFromSheet('PresetSearch'),
      },
      t
    );
    if (prompted) return;
    navigateFromSheet('PresetSearch');
  }, [checkServerConnected, navigateFromSheet, t]);

  const handleLogWorkout = useCallback(
    () => handleStartExerciseForm('WorkoutAdd'),
    [handleStartExerciseForm]
  );
  const handleAddActivity = useCallback(
    () => handleStartExerciseForm('ActivityAdd'),
    [handleStartExerciseForm]
  );

  const handleAddMeasurements = useCallback(() => {
    const date = getActiveDiaryDate();
    navigateFromSheet('MeasurementsAdd', { date });
  }, [getActiveDiaryDate, navigateFromSheet]);

  const handleAddProgressPhotos = useCallback(() => {
    const date = getActiveDiaryDate();
    navigateFromSheet('ProgressPhotos', { date });
  }, [getActiveDiaryDate, navigateFromSheet]);

  const handleAskSparky = useCallback(() => {
    navigateFromSheet('Chat');
  }, [navigateFromSheet]);

  const handleOpenCycle = useCallback(() => {
    navigateFromSheet('CycleLogModal');
  }, [navigateFromSheet]);

  const handleSyncHealthData = useCallback(async () => {
    if (syncMutation.isPending || isSyncClaimed()) return;

    const initialized = await initHealthConnect();
    if (!initialized) {
      Alert.alert(
        t('addSheetActions.healthUnavailable.title', {
          defaultValue: 'Health Data Unavailable',
        }),
        t('addSheetActions.healthUnavailable.message', {
          defaultValue:
            'Could not initialize health data access. Check your permissions in Settings.',
        })
      );
      return;
    }

    const loadedTimeRange = await loadTimeRange();
    const timeRange: TimeRange = loadedTimeRange ?? '3d';

    const healthMetricStates: Record<string, boolean> = {};
    for (const metric of HEALTH_METRICS) {
      const enabled = await loadHealthPreference<boolean>(metric.preferenceKey);
      healthMetricStates[metric.stateKey] = enabled === true;
    }

    syncMutation.mutate({ timeRange, healthMetricStates });
  }, [syncMutation, t]);

  const handleAddSheetDismissWithoutAction = useCallback(() => {
    if (!rootNavigationRef.isReady()) return;

    const navigateBackToPreviousTab = () => {
      if (!rootNavigationRef.isReady()) return;

      rootNavigationRef.dispatch(
        CommonActions.navigate('Tabs', {
          screen: lastActiveTabRef.current,
        })
      );
    };

    if (addSheetDismissNavigationTimeoutRef.current != null) {
      clearTimeout(addSheetDismissNavigationTimeoutRef.current);
      addSheetDismissNavigationTimeoutRef.current = null;
    }

    // Native tabs can briefly re-select the Add route while the bottom sheet
    // dismissal animation settles. These idempotent retries keep the user on
    // the last content tab without depending on one exact UIKit transition tick.
    navigateBackToPreviousTab();

    requestAnimationFrame(navigateBackToPreviousTab);
    addSheetDismissNavigationTimeoutRef.current = setTimeout(() => {
      addSheetDismissNavigationTimeoutRef.current = null;
      navigateBackToPreviousTab();
    }, 150);
  }, []);

  return {
    rememberActiveTab,
    getLastActiveTab,
    handleAddFood,
    handleBarcodeScan,
    handleStartWorkout,
    handleLogWorkout,
    handleAddActivity,
    handleAddMeasurements,
    handleAddProgressPhotos,
    handleAskSparky,
    handleOpenCycle,
    handleSyncHealthData,
    handleAddSheetDismissWithoutAction,
  };
}
