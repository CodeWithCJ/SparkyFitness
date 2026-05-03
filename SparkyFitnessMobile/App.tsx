import './global.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, Platform, Alert, AppState, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  CommonActions,
  NavigationContainer,
  type LinkingOptions,
  type NavigationProp,
  type Theme,
} from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import { useUniwind, useCSSVariable } from 'uniwind';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient, serverConnectionQueryKey , useSyncHealthData } from './src/hooks';

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SyncScreen from './src/screens/SyncScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import DiaryScreen from './src/screens/DiaryScreen';
import LogScreen from './src/screens/LogScreen';
import FoodSearchScreen from './src/screens/FoodSearchScreen';
import FoodEntryAddScreen from './src/screens/FoodEntryAddScreen';
import FoodEntryViewScreen from './src/screens/FoodEntryViewScreen';
import MealTypeDetailScreen from './src/screens/MealTypeDetailScreen';
import FoodFormScreen from './src/screens/FoodFormScreen';
import ExerciseFormScreen from './src/screens/ExerciseFormScreen';
import WorkoutPresetFormScreen from './src/screens/WorkoutPresetFormScreen';
import FoodScanScreen from './src/screens/FoodScanScreen';
import FoodsLibraryScreen from './src/screens/FoodsLibraryScreen';
import MealsLibraryScreen from './src/screens/MealsLibraryScreen';
import ExercisesLibraryScreen from './src/screens/ExercisesLibraryScreen';
import WorkoutPresetsLibraryScreen from './src/screens/WorkoutPresetsLibraryScreen';
import FoodDetailScreen from './src/screens/FoodDetailScreen';
import MealDetailScreen from './src/screens/MealDetailScreen';
import ExerciseDetailScreen from './src/screens/ExerciseDetailScreen';
import WorkoutPresetDetailScreen from './src/screens/WorkoutPresetDetailScreen';
import MealAddScreen from './src/screens/MealAddScreen';
import WorkoutAddScreen from './src/screens/WorkoutAddScreen';
import ActivityAddScreen from './src/screens/ActivityAddScreen';
import WorkoutDetailScreen from './src/screens/WorkoutDetailScreen';
import ActivityDetailScreen from './src/screens/ActivityDetailScreen';
import ExerciseSearchScreen from './src/screens/ExerciseSearchScreen';
import PresetSearchScreen from './src/screens/PresetSearchScreen';
import CalorieSettingsScreen from './src/screens/CalorieSettingsScreen';
import FoodSettingsScreen from './src/screens/FoodSettingsScreen';
import MeasurementsAddScreen from './src/screens/MeasurementsAddScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ReauthModal from './src/components/ReauthModal';
import ServerConfigModal from './src/components/ServerConfigModal';
import { useAuth } from './src/hooks/useAuth';
import {
  loadBackgroundSyncEnabled,
  loadTimeRange,
  getActiveServerConfig,
  loadSyncOnOpenEnabled,
} from './src/services/storage';
import type { TimeRange } from './src/services/storage';
import { initHealthConnect, loadHealthPreference , startObservers, stopObservers } from './src/services/healthConnectService';
import { HEALTH_METRICS } from './src/HealthMetrics';
import {
  configureBackgroundSync,
  performBackgroundSync,
  flushPendingHealthSyncCacheRefresh,
} from './src/services/backgroundSyncService';
import {
  tryClaimAutoSync,
  isSyncClaimed,
  isForegroundAutoSyncWindowOpen,
  setForegroundAutoSyncWindowOpen,
  shouldRunForegroundResumeAutoSync,
  recordAutoSyncTime,
} from './src/services/autoSyncCoordinator';
import { initializeTheme } from './src/services/themeService';
import { loadActiveDraft, clearDraft } from './src/services/workoutDraftService';
import { addLog, initLogService } from './src/services/LogService';
import { initNotifications } from './src/services/notifications';
import { ensureTimezoneBootstrapped } from './src/services/api/preferencesApi';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Toast from 'react-native-toast-message';
import type { RootStackParamList, TabParamList } from './src/types/navigation';
import AddSheet, { addSheetRef } from './src/components/AddSheet';
import { toastConfig } from './src/components/ui/toastConfig';
import CustomTabBar from './src/components/CustomTabBar';
import ActiveWorkoutBar, { navigationRef as rootNavigationRef } from './src/components/ActiveWorkoutBar';
import { withErrorBoundary } from './src/components/ScreenErrorBoundary';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

type TabStateSnapshot = {
  index?: number;
  routes: Array<{
    name: string;
    params?: unknown;
  }>;
};
const EmptyScreen = () => null;
const AUTO_SYNC_WATCHDOG_MS = 90_000;
const androidModalAnimation =
  Platform.OS === 'android' ? ({ animation: 'slide_from_bottom' } as const) : {};

// Tab screens — no Go Back (tab bar provides navigation)
const SafeDashboard = withErrorBoundary(DashboardScreen, 'Dashboard');
const SafeDiary = withErrorBoundary(DiaryScreen, 'Diary');
const SafeLibrary = withErrorBoundary(LibraryScreen, 'Library');

// Onboarding — no Go Back (initial route for new users)
const SafeOnboarding = withErrorBoundary(OnboardingScreen, 'Onboarding');

// Stack screens — with Go Back
const SafeFoodsLibrary = withErrorBoundary(FoodsLibraryScreen, 'FoodsLibrary', { canGoBack: true });
const SafeMealsLibrary = withErrorBoundary(MealsLibraryScreen, 'MealsLibrary', { canGoBack: true });
const SafeExercisesLibrary = withErrorBoundary(ExercisesLibraryScreen, 'ExercisesLibrary', { canGoBack: true });
const SafeWorkoutPresetsLibrary = withErrorBoundary(WorkoutPresetsLibraryScreen, 'WorkoutPresetsLibrary', { canGoBack: true });
const SafeFoodDetail = withErrorBoundary(FoodDetailScreen, 'FoodDetail', { canGoBack: true });
const SafeMealDetail = withErrorBoundary(MealDetailScreen, 'MealDetail', { canGoBack: true });
const SafeExerciseDetail = withErrorBoundary(ExerciseDetailScreen, 'ExerciseDetail', { canGoBack: true });
const SafeWorkoutPresetDetail = withErrorBoundary(WorkoutPresetDetailScreen, 'WorkoutPresetDetail', { canGoBack: true });
const SafeFoodSearch = withErrorBoundary(FoodSearchScreen, 'FoodSearch', { canGoBack: true });
const SafeFoodEntryAdd = withErrorBoundary(FoodEntryAddScreen, 'FoodEntryAdd', { canGoBack: true });
const SafeFoodForm = withErrorBoundary(FoodFormScreen, 'FoodForm', { canGoBack: true });
const SafeExerciseForm = withErrorBoundary(ExerciseFormScreen, 'ExerciseForm', { canGoBack: true });
const SafeWorkoutPresetForm = withErrorBoundary(WorkoutPresetFormScreen, 'WorkoutPresetForm', { canGoBack: true });
const SafeFoodScan = withErrorBoundary(FoodScanScreen, 'FoodScan', { canGoBack: true });
const SafeMealAdd = withErrorBoundary(MealAddScreen, 'MealAdd', { canGoBack: true });
const SafeFoodEntryView = withErrorBoundary(FoodEntryViewScreen, 'FoodEntryView', { canGoBack: true });
const SafeMealTypeDetail = withErrorBoundary(MealTypeDetailScreen, 'MealTypeDetail', { canGoBack: true });
const SafeExerciseSearch = withErrorBoundary(ExerciseSearchScreen, 'ExerciseSearch', { canGoBack: true });
const SafePresetSearch = withErrorBoundary(PresetSearchScreen, 'PresetSearch', { canGoBack: true });
const SafeWorkoutAdd = withErrorBoundary(WorkoutAddScreen, 'WorkoutAdd', { canGoBack: true });
const SafeActivityAdd = withErrorBoundary(ActivityAddScreen, 'ActivityAdd', { canGoBack: true });
const SafeWorkoutDetail = withErrorBoundary(WorkoutDetailScreen, 'WorkoutDetail', { canGoBack: true });
const SafeActivityDetail = withErrorBoundary(ActivityDetailScreen, 'ActivityDetail', { canGoBack: true });
const SafeLogs = withErrorBoundary(LogScreen, 'Logs', { canGoBack: true });
const SafeSync = withErrorBoundary(SyncScreen, 'Sync', { canGoBack: true });
const SafeMeasurementsAdd = withErrorBoundary(MeasurementsAddScreen, 'MeasurementsAdd', { canGoBack: true });
const SafeCalorieSettings = withErrorBoundary(CalorieSettingsScreen, 'CalorieSettings', { canGoBack: true });
const SafeFoodSettings = withErrorBoundary(FoodSettingsScreen, 'FoodSettings', { canGoBack: true });

function AppContent() {
  const { theme } = useUniwind();
  const {
    showReauthModal, showSetupModal, showApiKeySwitchModal,
    expiredConfigId, switchToApiKeyConfig,
    dismissModal, handleLoginSuccess, handleSwitchToApiKey, handleSwitchToApiKeyDone,
  } = useAuth();

  const [initialRoute, setInitialRoute] = useState<'Tabs' | 'Onboarding' | null>(null);
  const [linkingEnabled, setLinkingEnabled] = useState(false);

  useEffect(() => {
    const determine = async () => {
      try {
        const config = await getActiveServerConfig();
        const route = config ? 'Tabs' : 'Onboarding';
        setInitialRoute(route);
        setLinkingEnabled(route === 'Tabs');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to load active server config on startup: ${message}`, 'ERROR');
        setInitialRoute('Onboarding');
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    determine();
  }, []);

  const navigationRef = useRef<NavigationProp<TabParamList> | null>(null);
  const foregroundAutoSyncWindowRef = useRef(false);
  const backgroundEnteredAtRef = useRef<number | null>(null);
  const wasInBackgroundRef = useRef(false);
  const setForegroundAutoSyncWindowState = useCallback((isOpen: boolean) => {
    foregroundAutoSyncWindowRef.current = isOpen;
    setForegroundAutoSyncWindowOpen(isOpen);
  }, []);

  const [primary, chrome, chromeBorder, bgPrimary, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-chrome',
    '--color-chrome-border',
    '--color-background',
    '--color-text-primary',
  ]) as [string, string, string, string, string];

  // Determine if we're in dark mode based on current theme
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  const navigationTheme = useMemo<Theme>(() => ({
    dark: isDarkMode,
    colors: {
      primary: primary,
      background: bgPrimary,
      card: chrome,
      text: textPrimary,
      border: chromeBorder,
      notification: primary,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '600' },
      heavy: { fontFamily: 'System', fontWeight: '700' },
    },
  }), [isDarkMode, primary, bgPrimary, chrome, textPrimary, chromeBorder]);

  const getActiveDiaryDate = useCallback(() => {
    const navigation = navigationRef.current;
    const state =
      navigation?.getState() ??
      (rootNavigationRef.isReady()
        ? (rootNavigationRef
            .getRootState()
            .routes.find((route) => route.name === 'Tabs')
            ?.state as TabStateSnapshot | undefined)
        : undefined);
    if (!state) return undefined;

    const activeRoute = state.routes[state.index ?? 0];
    const diaryParams =
      activeRoute.name === 'Diary'
        ? (activeRoute.params as { selectedDate?: string } | undefined)
        : undefined;

    return diaryParams?.selectedDate;
  }, []);

  const handleAddFood = useCallback(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const date = getActiveDiaryDate();
    navigation.getParent()?.navigate('FoodSearch', { date });
  }, [getActiveDiaryDate]);

  const handleBarcodeScan = useCallback(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const date = getActiveDiaryDate();
    navigation.getParent()?.navigate('FoodScan', { date });
  }, [getActiveDiaryDate]);

  const navigateFromSheet = useCallback((screen: keyof RootStackParamList, params?: RootStackParamList[keyof RootStackParamList]) => {
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.dispatch(CommonActions.navigate({ name: screen, params }));
      return;
    }

    navigationRef.current?.getParent()?.dispatch(CommonActions.navigate({ name: screen, params }));
  }, []);

  const handleStartExerciseForm = useCallback(
    async (screen: 'WorkoutAdd' | 'ActivityAdd' | 'PresetSearch') => {
      const isConnected = queryClient.getQueryData(serverConnectionQueryKey);
      if (!isConnected) {
        Alert.alert(
          'No Server Connected',
          'Configure your server connection in Settings to add an exercise.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Go to Settings',
              onPress: () => navigateFromSheet('Tabs', { screen: 'Settings' }),
            },
          ],
        );
        return;
      }

      const date = getActiveDiaryDate();
      const draft = await loadActiveDraft();
      if (draft) {
        Alert.alert(
          'Draft in Progress',
          `You have an unsaved ${draft.type === 'workout' ? 'workout' : 'activity'} draft. What would you like to do?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Resume Draft',
              onPress: () => {
                if (draft.type === 'workout') {
                  navigateFromSheet('WorkoutAdd');
                } else {
                  navigateFromSheet('ActivityAdd');
                }
              },
            },
            {
              text: 'Discard & Continue',
              style: 'destructive',
              onPress: async () => {
                await clearDraft();
                if (screen === 'PresetSearch') {
                  navigateFromSheet('PresetSearch', { date });
                } else {
                  navigateFromSheet(screen, { date, skipDraftLoad: true });
                }
              },
            },
          ],
        );
        return;
      }

      if (screen === 'PresetSearch') {
        navigateFromSheet('PresetSearch', { date });
      } else {
        navigateFromSheet(screen, { date, skipDraftLoad: true });
      }
    },
    [navigateFromSheet, getActiveDiaryDate],
  );

  const handleAddWorkout = useCallback(() => handleStartExerciseForm('WorkoutAdd'), [handleStartExerciseForm]);
  const handleAddActivity = useCallback(() => handleStartExerciseForm('ActivityAdd'), [handleStartExerciseForm]);
  const handleAddFromPreset = useCallback(() => handleStartExerciseForm('PresetSearch'), [handleStartExerciseForm]);

  const syncMutation = useSyncHealthData();

  const handleAddMeasurements = useCallback(() => {
    const date = getActiveDiaryDate();
    navigateFromSheet('MeasurementsAdd', { date });
  }, [getActiveDiaryDate, navigateFromSheet]);

  const handleSyncHealthData = useCallback(async () => {
    if (syncMutation.isPending || isSyncClaimed()) return;

    const initialized = await initHealthConnect();
    if (!initialized) {
      Alert.alert('Health Data Unavailable', 'Could not initialize health data access. Check your permissions in Settings.');
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
  }, [syncMutation]);

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
    let cancelled = false;

    // Initialize theme from storage on app start
    initializeTheme();

    // Reset the auto-open flag on every app start
    const initializeApp = async () => {
      // Remove the flag so the dashboard will auto-open on first SyncScreen visit
      await AsyncStorage.removeItem('@HealthConnect:hasAutoOpenedDashboard');
      await initNotifications();
    };

    initializeApp();

    // Initialize log service (warms cache, prunes old logs, registers AppState listener)
    initLogService().catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Failed to initialize log service: ${message}`, 'ERROR');
    });

    const initializeSyncServices = async () => {
      // Bootstrap timezone before any sync path is configured so the server
      // has a stable timezone for the very first sync.
      const timezone = await ensureTimezoneBootstrapped();
      if (!timezone) {
        addLog('[App] Timezone bootstrap did not resolve a timezone before sync setup.', 'WARNING');
      }

      if (cancelled) return;

      try {
        await configureBackgroundSync();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to configure background sync: ${message}`, 'ERROR');
      }

      if (cancelled || Platform.OS !== 'ios') return;

      try {
        const enabled = await loadBackgroundSyncEnabled();
        if (!enabled || cancelled) return;

        startObservers(() => {
          // Yield only during a deliberate foreground auto-sync window (cold-start or
          // foreground-return). Outside that narrow window, let background delivery fire normally.
          if (
            AppState.currentState === 'active' &&
            foregroundAutoSyncWindowRef.current &&
            isForegroundAutoSyncWindowOpen()
          ) {
            return;
          }

          const release = tryClaimAutoSync();
          if (!release) return;

          performBackgroundSync('healthkit-observer')
            .catch(error => {
              const message = error instanceof Error ? error.message : String(error);
              addLog(`[App] Observer-triggered sync failed: ${message}`, 'ERROR');
            })
            .finally(() => {
              release();
            });
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to configure HealthKit observers: ${message}`, 'ERROR');
      }
    };

    initializeSyncServices().catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Failed to initialize sync services: ${message}`, 'ERROR');
    });

    flushPendingHealthSyncCacheRefresh().catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Failed to flush pending health sync refresh: ${message}`, 'ERROR');
    });

    return () => {
      cancelled = true;
      if (Platform.OS === 'ios') {
        stopObservers();
      }
    };
  }, [setForegroundAutoSyncWindowState]);

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

  const linking = useMemo<LinkingOptions<RootStackParamList>>(() => ({
    prefixes: ['sparkyfitnessmobile://'],
    config: {
      initialRouteName: 'Tabs',
      screens: {
        Tabs: {
          screens: {
            Dashboard: '',
          },
        },
        FoodScan: 'scan',
        FoodSearch: 'search',
      },
    },
  }), []);

  if (!initialRoute) return null;

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      theme={navigationTheme}
      linking={linkingEnabled ? linking : undefined}
      onStateChange={(state) => {
        // Enable deep-link handling once the user has left Onboarding.
        // Without this, widget URLs are ignored for the rest of the session
        // after first-run setup completes.
        if (linkingEnabled) return;
        const topRoute = state?.routes[state.index ?? 0]?.name;
        if (topRoute === 'Tabs') {
          setLinkingEnabled(true);
        }
      }}
    >
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bgPrimary } }} initialRouteName={initialRoute}>
          <Stack.Screen
            name="Onboarding"
            component={SafeOnboarding}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="Tabs" options={{ gestureEnabled: false }}>
            {() => (
              <Tab.Navigator
                initialRouteName="Dashboard"
                screenOptions={{
                  headerShown: false,
                }}
                tabBar={(props) => (
                  // Wrap the tab bar so the active workout HUD can sit
                  // directly on top of it. Order matters: CustomTabBar is
                  // a later sibling than ActiveWorkoutBar, so its Add button
                  // (which uses -mt-5 to rise above the tab bar's top edge)
                  // paints on top of the embedded bar — matching the mockup
                  // where the + button visually bridges both bars.
                  <View collapsable={false}>
                    <ActiveWorkoutBar variant="embedded" />
                    <CustomTabBar {...props} />
                  </View>
                )}
              >
                <Tab.Screen name="Dashboard" component={SafeDashboard} />
                <Tab.Screen name="Diary" component={SafeDiary} />
                <Tab.Screen
                  name="Add"
                  component={EmptyScreen}
                  listeners={({ navigation }) => ({
                    tabPress: (e) => {
                      e.preventDefault();
                      navigationRef.current = navigation;
                      addSheetRef.current?.present();
                    },
                  })}
                />
                <Tab.Screen name="Library" component={SafeLibrary} />
                <Tab.Screen name="Settings" component={SettingsScreen} />
              </Tab.Navigator>
            )}
          </Stack.Screen>
          <Stack.Screen
            name="FoodsLibrary"
            component={SafeFoodsLibrary}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="MealsLibrary"
            component={SafeMealsLibrary}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="ExercisesLibrary"
            component={SafeExercisesLibrary}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="WorkoutPresetsLibrary"
            component={SafeWorkoutPresetsLibrary}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="WorkoutPresetDetail"
            component={SafeWorkoutPresetDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="FoodDetail"
            component={SafeFoodDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="MealDetail"
            component={SafeMealDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="ExerciseDetail"
            component={SafeExerciseDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="FoodSearch"
            component={SafeFoodSearch}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="FoodEntryAdd"
            component={SafeFoodEntryAdd}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="FoodForm"
            component={SafeFoodForm}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="ExerciseForm"
            component={SafeExerciseForm}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="WorkoutPresetForm"
            component={SafeWorkoutPresetForm}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="FoodScan"
            component={SafeFoodScan}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="MealAdd"
            component={SafeMealAdd}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="FoodEntryView"
            component={SafeFoodEntryView}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="MealTypeDetail"
            component={SafeMealTypeDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="ExerciseSearch"
            component={SafeExerciseSearch}
            options={{
              headerShown: false,
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="PresetSearch"
            component={SafePresetSearch}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="WorkoutAdd"
            component={SafeWorkoutAdd}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="ActivityAdd"
            component={SafeActivityAdd}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="WorkoutDetail"
            component={SafeWorkoutDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="ActivityDetail"
            component={SafeActivityDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="Logs"
            component={SafeLogs}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="Sync"
            component={SafeSync}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="MeasurementsAdd"
            component={SafeMeasurementsAdd}
            options={{
              headerShown: false,
              presentation: 'modal',
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="CalorieSettings"
            component={SafeCalorieSettings}
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="FoodSettings"
            component={SafeFoodSettings}
            options={{
              headerShown: false,
            }}
          />
        </Stack.Navigator>
        <AddSheet ref={addSheetRef} onAddFood={handleAddFood} onAddWorkout={handleAddWorkout} onAddActivity={handleAddActivity} onAddFromPreset={handleAddFromPreset} onSyncHealthData={handleSyncHealthData} onBarcodeScan={handleBarcodeScan} onAddMeasurements={handleAddMeasurements} />
        <ReauthModal
          visible={showReauthModal}
          expiredConfigId={expiredConfigId}
          onLoginSuccess={() => {
            handleLoginSuccess();
            queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
          }}
          onSwitchToApiKey={handleSwitchToApiKey}
          onDismiss={dismissModal}
        />
        <ServerConfigModal
          visible={showSetupModal || showApiKeySwitchModal}
          editingConfig={switchToApiKeyConfig}
          defaultAuthTab={showApiKeySwitchModal ? 'apiKey' : undefined}
          onSuccess={() => {
            if (showApiKeySwitchModal) {
              handleSwitchToApiKeyDone();
            } else {
              handleLoginSuccess();
            }
            queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
          }}
          onDismiss={() => {
            if (showApiKeySwitchModal) {
              handleSwitchToApiKeyDone();
            } else {
              dismissModal();
            }
          }}
        />
        <ActiveWorkoutBar />
        <SafeAreaToast />
      </SafeAreaProvider>
    </NavigationContainer>
  );
}

function SafeAreaToast() {
  const insets = useSafeAreaInsets();
  return <Toast config={toastConfig} topOffset={insets.top + 8} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <KeyboardProvider>
        <GestureHandlerRootView className="flex-1">
          <BottomSheetModalProvider>
            <AppContent />
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </QueryClientProvider>
  );
}

export default App;
