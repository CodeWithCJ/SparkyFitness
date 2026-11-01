import './global.css'
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  StackActions,
  type LinkingOptions,
  type Theme,
} from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import { FoodImageSourceProvider } from './src/components/FoodImageSourceProvider';
import { LightboxProvider } from './src/components/LightboxProvider';
import { Uniwind, useUniwind, useCSSVariable } from 'uniwind';

import { queryClient, serverConnectionQueryKey, serverConfigsQueryKey, useSyncHealthData, useCycleMode, useServerConnection, drainQuickActionNavigation, useControlRouteHandoff, useQuickActions, useWatchCheckInBridge, useWatchFastingBridge, useWatchPlanSync, useWatchRecordingBridge, useWatchSetTargetsSync, useWatchWorkoutBridge, useWatchWorkoutEdit, useWatchRunBridge, useWatchRouteBridge, usePreferences } from './src/hooks';
import { useCycleSheetLabel } from './src/hooks/useAddMenuItemLabel';
import { configureRunLiveActivity } from './src/services/runLiveActivity';
import { useWatchWorkoutStart } from './src/hooks/useWatchWorkoutStart';
import { useLiveWorkoutInputsCapture } from './src/hooks/useLiveWorkoutInputsCapture';
import {
  useStartLiveWorkout,
  type StartLiveWorkoutNavigation,
} from './src/hooks/useStartLiveWorkout';
import WatchConnectivity from './modules/watch-connectivity';
import { useAppStartup } from './src/hooks/useAppStartup';
import { useAppBootstrap } from './src/hooks/useAppBootstrap';
import { useAppLanguageForegroundSync } from './src/hooks/useAppLanguageForegroundSync';
import { useAutoSyncOnOpen } from './src/hooks/useAutoSyncOnOpen';
import { useAddSheetActions } from './src/hooks/useAddSheetActions';

import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import FoodPhotoFlow from './src/components/FoodPhotoFlow';
import {
  SafeOnboarding,
  SafeFoodsLibrary,
  SafeMealsLibrary,
  SafeMealPlans,
  SafePersonalRecords,
  SafeWatchRunLive,
  SafeRunPrograms,
  SafeRunProgramCalendar,
  SafeRunProgramEdit,
  SafeRoutes,
  SafeRouteDetail,
  SafeRouteDraw,
  SafeRouteGenerate,
  SafeRunProgramRace,
  SafeFitnessTest,
  SafeFitnessTestResult,
  SafeRunProgramWorkout,
  SafeMealPlanForm,
  SafeWorkoutPlans,
  SafeWorkoutPlanForm,
  SafeWaterContainers,
  SafeWaterContainerEdit,
  SafeActionTags,
  SafeActionTagForm,
  SafeActionTagScan,
  SafeExercisesLibrary,
  SafeWorkoutPresetsLibrary,
  SafeFoodDetail,
  SafeMealDetail,
  SafeExerciseDetail,
  SafeWorkoutPresetDetail,
  SafeFoodSearch,
  SafeFoodEntryAdd,
  SafeFoodEntryMultiAdd,
  SafeFoodForm,
  SafeEditBarcode,
  SafeExerciseForm,
  SafeWorkoutPresetForm,
  SafeFoodScan,
  SafeFoodPhotoIntro,
  SafeMealAdd,
  SafeFoodEntryView,
  SafeEditLoggedMeal,
  SafeMealTypeDetail,
  SafeExerciseSearch,
  SafePresetSearch,
  SafeWorkoutAdd,
  SafeActivityAdd,
  SafeWorkoutDetail,
  SafeActiveWorkout,
  SafeWorkoutComplete,
  SafeActivityDetail,
  SafeFastingDetail,
  SafeFastingSettings,
  SafeMindfulnessDetail,
  SafeSleepDetail,
  SafeLogs,
  SafeSync,
  SafeImportHistory,
  SafeMeasurementsAdd,
  SafeMindfulnessLog,
  SafeProgressPhotos,
  SafeProgressPhotoCompare,
  SafeProgressPhotoTimelapse,
  SafeChat,
  SafeChatSettings,
  SafeCalorieSettings,
  SafeGoals,
  SafeWeeklyGoalPlanEdit,
  SafeMealTypeSettings,
  SafeEquipment,
  SafeShoes,
  SafeShoeForm,
  SafePlateInventory,
  SafeAiSettings,
  SafeFoodSettings,
  SafeCustomNutrients,
  SafeCustomNutrientForm,
  SafeNutrientDisplaySettings,
  SafeAllergenSettings,
  SafeDashboardSettings,
  SafeHealthTrendsSettings,
  SafeWatchSettings,
  SafeAddMenuSettings,
  SafeDiarySettings,
  SafeCustomCategories,
  SafeCustomCategoryEdit,
  SafeWorkoutSettings,
  SafeWarmupSettings,
  SafeHeartRateZonesSettings,
  SafeServerSettings,
  SafePasskeySettings,
  SafeAppSettings,
  SafeNotificationSettings,
  SafeAbout,
  SafeWhatsNew,
  SafeDailyNutritionDetails,
  SafeNutrientTrends,
  SafeExerciseStatistics,
  SafeReports,
  SafeNutritionReport,
  SafeSleepAnalytics,
  SafeMoodReport,
  SafeHeartRateReport,
  SafeCompareReport,
  SafeHydrationReport,
  SafeSubstancesReport,
  SafeMeasurementsReport,
  SafeReportsSettings,
  SafeCardioSession,
  SafeActivityShare,
  SafeRecordActivity,
  SafeRunSummary,
  SafeFamilyMembers,
  SafeFamilyDiary,
  SafeFamilyMealDetail,
  SafeFamilyCopyReview,
  SafeCycleSettings,
  SafeCycleOnboarding,
  SafeCycleHub,
  SafeCycleLogModal,
  SafePregnancySetup,
  SafeMedicationsList,
  SafeMedicationAdherence,
  SafeMedicationEntryEdit,
  SafeMedicationDetail,
  SafeMedicationForm,
  SafeMedicationScheduleForm,
  SafeGlp1Tracker,
  SafeGlp1PenForm,
  SafeGlp1TitrationForm,
  SafeSymptomLog,
  SafeMoodLog,
  SafeMoodDay,
  SafeSymptomHistory,
  SafeSymptomEpisodeDetail,
  SafeManageSymptoms,
  SafeSymptomDefinitionEditor,
} from './src/navigation/safeScreens';
import ReauthModal from './src/components/ReauthModal';
import ServerConfigModal from './src/components/ServerConfigModal';
import { useAuth } from './src/hooks/useAuth';
import { addLog } from './src/services/LogService';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { FullWindowOverlay } from 'react-native-screens';
import type { RootStackParamList } from './src/types/navigation';
import type { WorkoutCelebration } from './src/utils/workoutCelebration';
import AddSheet, { addSheetRef } from './src/components/AddSheet';
import { toastConfig } from './src/components/ui/toastConfig';
import { TabsLayout } from './src/components/TabsLayout';
import { createIOSSmallNativeHeaderOptions } from './src/utils/nativeHeaderItems';
import { useHeaderActionColors } from './src/hooks/useHeaderActionColors';
import ActiveWorkoutBar, {
  navigationRef as rootNavigationRef,
  notifyActiveWorkoutBarStackTransition,
  notifyActiveWorkoutBarSwipeProgress,
} from './src/components/ActiveWorkoutBar';
import { ActiveWorkoutTransitionScreenLayout } from './src/components/ActiveWorkoutTransitionProbe';
import PendingPresetUpdatePrompt from './src/components/PendingPresetUpdatePrompt';
import { usePendingPresetUpdateStore } from './src/stores/pendingPresetUpdateStore';
import ActiveWorkoutKeepAwake from './src/components/ActiveWorkoutKeepAwake';
import MedicationReminderReconciler from './src/components/MedicationReminderReconciler';
import MoodCheckinReminderReconciler from './src/components/MoodCheckinReminderReconciler';
import { useNativeIOSTabsActive, useNativeIOSHeadersActive } from './src/services/nativeTabBarPreference';
import { useWidgetLanguageRefresh } from './src/hooks/useWidgetLanguageRefresh';
import { useIOSWidgetLanguageRefresh } from './src/hooks/useIOSWidgetLanguageRefresh';

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator<RootStackParamList>();

const androidModalAnimation =
  Platform.OS === 'android' ? ({ animation: 'slide_from_bottom' } as const) : {};

/**
 * Renders inside <NavigationContainer> so useServerConnection's
 * refetch-on-focus (which needs useNavigation) has a navigation context to
 * attach to. AppContent can't call this directly — it's the component that
 * creates NavigationContainer, so its own hook calls run before that
 * context exists, which is what was throwing "Couldn't find a navigation
 * object" on every render.
 *
 * Apple Watch companion: the watch captures weight / body fat locally and
 * hands them over via WatchConnectivity, because it cannot reach the server
 * itself (auth lives here). Gated on an active server connection so a
 * check-in is not rejected and acked as failed while offline — the watch
 * keeps it queued and retries when the phone is reachable again.
 */
function WatchCheckInGate() {
  const { isConnected: isServerConnected } = useServerConnection();
  useWatchCheckInBridge(isServerConnected);
  useWatchFastingBridge(isServerConnected);
  return null;
}

/**
 * App icon long-press shortcuts (iOS Home Screen, Android launcher). Needs a
 * server connection, since the iOS "Log water" posts straight to the server.
 */
function QuickActionsGate() {
  const { isConnected: isServerConnected } = useServerConnection();
  useQuickActions(isServerConnected);
  // The Scan food and Log food controls hand their screen over through the app group.
  useControlRouteHandoff(isServerConnected);
  return null;
}

/**
 * Unlike `WatchCheckInGate`, listeners stay up while the server is offline
 * so a set or heart-rate batch is not dropped. The /health poll only runs
 * when WatchConnectivity is available and a telemetry buffer still needs a
 * flush. Android, and an idle iPhone, do not poll for a feature they are
 * not using.
 */
// A workout the wearer ended on the watch clears the phone's live session
// from outside any screen. If the phone is sitting on that workout, move it
// to the same completion screen the phone's own Finish lands on; anywhere
// else, clearing is enough (the active-workout bar just disappears).
function handleWatchFinishedWorkout(
  celebration: WorkoutCelebration | null,
  sessionId: string
) {
  // Always held for the prompt mounted in the navigator, even when the
  // completion screen opens: that prompt is what asks the watch first, and
  // the completion screen then leaves the check to it.
  const holdsPresetCheck = celebration?.sourcePresetId != null;
  if (celebration != null && holdsPresetCheck) {
    usePendingPresetUpdateStore.getState().setPending({ celebration, sessionId });
  }
  if (!rootNavigationRef.isReady()) return;
  if (rootNavigationRef.getCurrentRoute()?.name !== 'ActiveWorkout') return;
  if (celebration != null) {
    rootNavigationRef.dispatch(
      StackActions.replace('WorkoutComplete', {
        ...celebration,
        presetCheckHandledElsewhere: holdsPresetCheck,
      })
    );
  } else if (rootNavigationRef.canGoBack()) {
    rootNavigationRef.goBack();
  }
}

function WatchWorkoutGate() {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const distanceUnit =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';
  useEffect(() => {
    configureRunLiveActivity({ t, distanceUnit });
  }, [t, distanceUnit]);
  const watchSupported = WatchConnectivity?.isSupported() === true;
  const [telemetryPending, setTelemetryPending] = useState(false);
  const { isConnected: isServerConnected } = useServerConnection({
    enablePolling: watchSupported && telemetryPending,
  });
  const watchStartNavigation = useMemo(
    () =>
      ({
        // Starting from the wrist must not replace whatever screen the phone
        // is on. The active-workout bar appears on its own once the session
        // exists. `navigate` is only the conflict prompt's "Go to Workout".
        isFocused: () => false,
        replace: () => {},
        navigate: (screen: 'ActiveWorkout') => {
          if (rootNavigationRef.isReady()) rootNavigationRef.navigate(screen);
        },
      }) as unknown as StartLiveWorkoutNavigation,
    []
  );
  const { startLiveWorkout } = useStartLiveWorkout(watchStartNavigation);
  useWatchWorkoutBridge(
    watchSupported,
    isServerConnected,
    setTelemetryPending,
    handleWatchFinishedWorkout
  );
  // A watch-started workout never opens the active-workout screen, which is
  // what normally loads the history its targets are resolved from.
  useLiveWorkoutInputsCapture(isServerConnected);
  useWatchSetTargetsSync(watchSupported);
  useWatchRecordingBridge(watchSupported);
  useWatchRunBridge(watchSupported, isServerConnected);
  useWatchRouteBridge(watchSupported);
  useWatchWorkoutStart(watchSupported, isServerConnected, startLiveWorkout);
  useWatchPlanSync(watchSupported);
  useWatchWorkoutEdit(watchSupported);
  return null;
}

function AppContent() {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const {
    showReauthModal, showSetupModal, showApiKeySwitchModal,
    expiredConfigId, switchToApiKeyConfig,
    dismissModal, handleLoginSuccess, handleSwitchToApiKey, handleSwitchToApiKeyDone,
  } = useAuth();

  // Language bootstrap + initial route. `useAppBootstrap` initializes the
  // effective locale (Android 13+ native LocaleManager, Android <=12 local
  // i18next preference) before the app renders, then resolves the first route
  // from the active server config.
  const { initialRoute, linkingEnabled, setLinkingEnabled } = useAppBootstrap();

  // Adopt language changes made outside the app (Android App Languages) when
  // the app returns to the foreground.
  useAppLanguageForegroundSync();

  // Keep the native surfaces (Android Glance widgets, iOS WidgetKit, Workout
  // Live Activity) in sync with the effective app locale. These hooks listen
  // to i18n 'languageChanged' and reload/update the native surfaces without
  // touching any React Native screen strings.
  useWidgetLanguageRefresh();
  useIOSWidgetLanguageRefresh();

  const usesLiquidGlassNavigation = useNativeIOSTabsActive();
  const usesNativeIOSHeaders = useNativeIOSHeadersActive();

  const syncMutation = useSyncHealthData();
  const { shouldYieldObserverSync } = useAutoSyncOnOpen({ initialRoute, syncMutation });
  useAppStartup({ shouldYieldObserverSync });

  const {
    rememberActiveTab,
    getLastActiveTab,
    handleAddFood,
    handleBarcodeScan,
    handleStartWorkout,
    handleLogWorkout,
    handleAddActivity,
    handleAddMeasurements,
    handleAddProgressPhotos,
    handleAddSymptoms,
    handleAddMood,
    handleStartCheckIn,
    handleAddMindfulness,
    handleRecordActivity,
    handleAskSparky,
    handleOpenCycle,
    handleSyncHealthData,
    handleAddSheetDismissWithoutAction,
  } = useAddSheetActions({ syncMutation });

  const { enabled: cycleEnabled } = useCycleMode();
  const cycleSheetLabel = useCycleSheetLabel();

  const [primary, chromeBorder, bgPrimary, textPrimary] = useCSSVariable([
    '--color-accent-primary',
    '--color-chrome-border',
    '--color-background',
    '--color-text-primary',
  ]) as [string, string, string, string];
  const { defaultColor: headerActionColor } = useHeaderActionColors();
  const iosSmallHeaderOptions = useMemo(
    () => createIOSSmallNativeHeaderOptions(headerActionColor, textPrimary),
    [headerActionColor, textPrimary],
  );
  const createStackScreenOptions = useCallback(
    (
      title: string,
      options: NativeStackNavigationOptions = {},
    ): NativeStackNavigationOptions => (
      usesNativeIOSHeaders
        ? {
            ...iosSmallHeaderOptions,
            title,
            gestureEnabled: true,
            ...options,
          }
        : {
            headerShown: false,
            gestureEnabled: true,
            ...options,
          }
    ),
    [iosSmallHeaderOptions, usesNativeIOSHeaders],
  );

  // Determine if we're in dark mode based on current theme
  const isDarkMode = theme === 'dark' || theme === 'amoled';

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    try {
      NavigationBar.setStyle(isDarkMode ? 'dark' : 'light');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[App] Failed to update Android navigation bar style: ${message}`, 'WARNING');
    }
  }, [isDarkMode]);

  const navigationTheme = useMemo<Theme>(() => {
    const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;

    return {
      ...baseTheme,
      dark: isDarkMode,
      colors: {
        ...baseTheme.colors,
        primary,
        background: bgPrimary,
        // Native iOS 26 Liquid Glass reads the navigation card color during
        // tab/header transitions. Keep it solid and in-sync with the app
        // background to avoid light-mode flashes/flicker in dark themes.
        card: bgPrimary,
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
    };
  }, [isDarkMode, primary, bgPrimary, textPrimary, chromeBorder]);

  const linking = useMemo<LinkingOptions<RootStackParamList>>(() => ({
    prefixes: ['sparkyfitnessmobile://', 'https://tag.sparkyfitness.com'],
    config: {
      initialRouteName: 'Tabs',
      screens: {
        Tabs: {
          screens: {
            Dashboard: '',
            // The Android Calories left Quick Settings tile and the wider
            // widgets' Diary shortcut open the diary.
            Diary: 'diary',
          },
        },
        FoodScan: 'scan',
        FoodSearch: 'search',
        // The Android calorie and macro widgets' fasting shortcut.
        FastingDetail: 'fasting',
        ChatSettings: 'settings/voice',
        HeartRateZonesSettings: 'settings/heart-rate-zones',
        // Tapping the workout Live Activity opens its associated URL.
        ActiveWorkout: 'active-workout',
        // The run Live Activity opens the recording screen.
        RecordActivity: 'record-activity',
        // Route generation; without a routing provider the screen explains that.
        RouteGenerate: 'routes/generate',
        // An NFC tag tap: https://tag.sparkyfitness.com/t/<code> (#941).
        ActionTagScan: 't/:code',
      },
    },
  }), []);

  if (!initialRoute) return null;

  return (
    <NavigationContainer
      ref={rootNavigationRef}
      theme={navigationTheme}
      linking={linkingEnabled ? linking : undefined}
      onReady={drainQuickActionNavigation}
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
      <WatchCheckInGate />
      <QuickActionsGate />
      <WatchWorkoutGate />
      <PendingPresetUpdatePrompt />
      <SafeAreaProvider>
        {/* Inside SafeAreaProvider on purpose: the viewer positions its close
            button against the insets, so mounting it at the app root crashes
            with "No safe area value available". */}
        <LightboxProvider>
        <UniwindInsetsBridge />
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
        <Stack.Navigator
          screenLayout={usesLiquidGlassNavigation
            ? ({ children, route }) => (
              <ActiveWorkoutTransitionScreenLayout routeName={route.name} routeKey={route.key}>
                {children}
              </ActiveWorkoutTransitionScreenLayout>
            )
            : undefined}
          screenListeners={usesLiquidGlassNavigation
            ? {
              transitionStart: (event) => {
                notifyActiveWorkoutBarStackTransition('start', Boolean(event.data?.closing), event.target);
              },
              transitionEnd: (event) => {
                const closing = Boolean(event.data?.closing);
                if (!closing) notifyActiveWorkoutBarSwipeProgress(0);
                notifyActiveWorkoutBarStackTransition('end', closing, event.target);
              },
              gestureCancel: (event) => {
                notifyActiveWorkoutBarSwipeProgress(0);
                notifyActiveWorkoutBarStackTransition('end', false, event.target);
              },
            }
            : undefined}
          screenOptions={{
            headerShown: false,
            animation: 'default',
            contentStyle: { backgroundColor: bgPrimary },
            headerTintColor: Platform.OS === 'android' ? textPrimary : undefined,
          }}
          initialRouteName={initialRoute}
        >
          <Stack.Screen
            name="Onboarding"
            component={SafeOnboarding}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="Tabs" options={{ gestureEnabled: false }}>
            {() => (
              <TabsLayout
                onAddPress={() => addSheetRef.current?.present()}
                rememberActiveTab={rememberActiveTab}
                getLastActiveTab={getLastActiveTab}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="FamilyMembers"
            component={SafeFamilyMembers}
            options={createStackScreenOptions(t('familyDiary.title', { defaultValue: 'Family Diaries' }), {
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="FamilyDiary"
            component={SafeFamilyDiary}
            options={({ route }) => createStackScreenOptions(
              route.params.familyUser.displayName.trim() || t('familyDiary.unnamedMember', { defaultValue: 'Family member' }),
              { headerBackButtonDisplayMode: 'minimal' },
            )}
          />
          <Stack.Screen
            name="FamilyMealDetail"
            component={SafeFamilyMealDetail}
            options={({ route }) => createStackScreenOptions(route.params.mealTypeName, {
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="FamilyCopyReview"
            component={SafeFamilyCopyReview}
            options={createStackScreenOptions(t('familyDiary.copyReview', { defaultValue: 'Review copy' }), {
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="FoodsLibrary"
            component={SafeFoodsLibrary}
            options={createStackScreenOptions(t('screens.foods', { defaultValue: 'Foods' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="MealsLibrary"
            component={SafeMealsLibrary}
            options={createStackScreenOptions(t('screens.meals', { defaultValue: 'Meals' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="MealPlans"
            component={SafeMealPlans}
            options={createStackScreenOptions(t('mealPlans.title', { defaultValue: 'Meal plans' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="RunPrograms"
            component={SafeRunPrograms}
            options={createStackScreenOptions(t('screens.runPrograms', { defaultValue: 'Training programs' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="RunProgramCalendar"
            component={SafeRunProgramCalendar}
            options={createStackScreenOptions(t('screens.runProgramCalendar', { defaultValue: 'Program calendar' }), { headerBackTitle: t('screens.runPrograms', { defaultValue: 'Training programs' }) })}
          />
          <Stack.Screen
            name="RunProgramRace"
            component={SafeRunProgramRace}
            options={createStackScreenOptions(t('screens.runProgramRace', { defaultValue: 'Plan a race' }), { headerBackTitle: t('screens.runPrograms', { defaultValue: 'Training programs' }) })}
          />
          <Stack.Screen
            name="FitnessTest"
            component={SafeFitnessTest}
            options={createStackScreenOptions(t('screens.fitnessTest', { defaultValue: 'Fitness tests' }), { headerBackTitle: t('screens.runPrograms', { defaultValue: 'Training programs' }) })}
          />
          <Stack.Screen
            name="FitnessTestResult"
            component={SafeFitnessTestResult}
            options={createStackScreenOptions(t('screens.fitnessTestResult', { defaultValue: 'Fitness test' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="RunProgramEdit"
            component={SafeRunProgramEdit}
            options={createStackScreenOptions(t('screens.runProgramEdit', { defaultValue: 'Edit plan' }), { headerBackTitle: t('screens.runPrograms', { defaultValue: 'Training programs' }) })}
          />
          <Stack.Screen
            name="RunProgramWorkout"
            component={SafeRunProgramWorkout}
            options={createStackScreenOptions(t('screens.runProgramWorkout', { defaultValue: 'Workout' }), { headerBackTitle: t('screens.runProgramCalendar', { defaultValue: 'Program calendar' }) })}
          />
          <Stack.Screen
            name="Routes"
            component={SafeRoutes}
            options={createStackScreenOptions(t('screens.routes', { defaultValue: 'Routes' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="RouteDetail"
            component={SafeRouteDetail}
            options={createStackScreenOptions(t('screens.routes', { defaultValue: 'Routes' }), { headerBackTitle: t('screens.routes', { defaultValue: 'Routes' }) })}
          />
          <Stack.Screen
            name="RouteDraw"
            component={SafeRouteDraw}
            options={createStackScreenOptions(t('screens.routeDraw', { defaultValue: 'Draw a route' }), { headerBackTitle: t('screens.routes', { defaultValue: 'Routes' }) })}
          />
          <Stack.Screen
            name="RouteGenerate"
            component={SafeRouteGenerate}
            options={createStackScreenOptions(t('screens.routeGenerate', { defaultValue: 'Generate a route' }), { headerBackTitle: t('screens.routes', { defaultValue: 'Routes' }) })}
          />
          <Stack.Screen
            name="PersonalRecords"
            component={SafePersonalRecords}
            options={createStackScreenOptions(t('screens.personalRecords', { defaultValue: 'Personal records' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="WatchRunLive"
            component={SafeWatchRunLive}
            options={createStackScreenOptions(t('screens.watchRunLive', { defaultValue: 'On your watch' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="MealPlanForm"
            component={SafeMealPlanForm}
            options={createStackScreenOptions(t('mealPlans.title', { defaultValue: 'Meal plans' }), { headerBackTitle: t('common.back', { defaultValue: 'Back' }) })}
          />
          <Stack.Screen
            name="WorkoutPlans"
            component={SafeWorkoutPlans}
            options={createStackScreenOptions(t('workoutPlans.title', { defaultValue: 'Workout plans' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="WorkoutPlanForm"
            component={SafeWorkoutPlanForm}
            options={createStackScreenOptions(t('workoutPlans.title', { defaultValue: 'Workout plans' }), { headerBackTitle: t('common.back', { defaultValue: 'Back' }) })}
          />
          <Stack.Screen
            name="WaterContainers"
            component={SafeWaterContainers}
            options={createStackScreenOptions(t('waterContainers.title', { defaultValue: 'Water containers' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="WaterContainerEdit"
            component={SafeWaterContainerEdit}
            options={createStackScreenOptions(t('waterContainerEdit.editTitle', { defaultValue: 'Edit container' }), { headerBackTitle: t('common.back', { defaultValue: 'Back' }) })}
          />
          <Stack.Screen
            name="ActionTags"
            component={SafeActionTags}
            options={createStackScreenOptions(t('actionTags.title', { defaultValue: 'NFC tags' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="ActionTagForm"
            component={SafeActionTagForm}
            options={createStackScreenOptions(t('actionTags.form.createTitle', { defaultValue: 'Set up NFC tag' }), { headerBackTitle: t('common.back', { defaultValue: 'Back' }) })}
          />
          <Stack.Screen
            name="ActionTagScan"
            component={SafeActionTagScan}
            options={createStackScreenOptions(t('actionTags.scan.title', { defaultValue: 'NFC tag' }))}
          />
          <Stack.Screen
            name="ExercisesLibrary"
            component={SafeExercisesLibrary}
            options={createStackScreenOptions(t('screens.exercises', { defaultValue: 'Exercises' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="WorkoutPresetsLibrary"
            component={SafeWorkoutPresetsLibrary}
            options={createStackScreenOptions(t('screens.workoutPresets', { defaultValue: 'Workout Presets' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="WorkoutPresetDetail"
            component={SafeWorkoutPresetDetail}
            options={({ route }) => createStackScreenOptions(route.params.updatedPreset?.name ?? route.params.preset.name, { headerBackTitle: t('navigation.presets', { defaultValue: 'Presets' }) })}
          />
          <Stack.Screen
            name="FoodDetail"
            component={SafeFoodDetail}
            options={({ route }) => createStackScreenOptions(route.params.updatedItem?.name ?? route.params.item.name, { headerBackTitle: t('screens.foods', { defaultValue: 'Foods' }) })}
          />
          <Stack.Screen
            name="MealDetail"
            component={SafeMealDetail}
            options={createStackScreenOptions(t('screens.meal', { defaultValue: 'Meal' }), { headerBackTitle: t('screens.meals', { defaultValue: 'Meals' }) })}
          />
          <Stack.Screen
            name="ExerciseDetail"
            component={SafeExerciseDetail}
            options={({ route }) => createStackScreenOptions(route.params.updatedItem?.name ?? route.params.item.name, {
              headerBackTitle: t('screens.exercises', { defaultValue: 'Exercises' }),
              // iOS 26 defaults the pop gesture to full-screen swipes; keep it
              // edge-only here so interior right-swipes switch tabs instead of
              // navigating back.
              fullScreenGestureEnabled: false,
            })}
          />
          <Stack.Screen
            name="FoodSearch"
            component={SafeFoodSearch}
            options={createStackScreenOptions(t('screens.addFood', { defaultValue: 'Add Food' }), {
              headerBackVisible: false,
              // 'modal' (not 'fullScreenModal') so iOS keeps the swipe-down
              // dismiss gesture — UIModalPresentationFullScreen has no
              // interactive dismissal.
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="FoodEntryAdd"
            component={SafeFoodEntryAdd}
            options={({ route }) => createStackScreenOptions(route.params.item.name, {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="FoodEntryMultiAdd"
            component={SafeFoodEntryMultiAdd}
            options={createStackScreenOptions(t('foodEntryMultiAdd.title', { defaultValue: 'Review' }), {
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="FoodForm"
            component={SafeFoodForm}
            options={({ route }) => createStackScreenOptions(
              route.params.mode === 'create-food'
                ? t('screens.newFood', { defaultValue: 'New Food' })
                : route.params.mode === 'edit-food'
                  ? t('screens.editFood', { defaultValue: 'Edit Food' })
                  : t('screens.adjustNutrition', { defaultValue: 'Adjust Nutrition' }),
              {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
              },
            )}
          />
          <Stack.Screen
            name="EditBarcode"
            component={SafeEditBarcode}
            options={createStackScreenOptions(t('screens.barcodes', { defaultValue: 'Barcodes' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="ExerciseForm"
            component={SafeExerciseForm}
            options={({ route }) => createStackScreenOptions(
              route.params.mode === 'edit-exercise' ? t('screens.editExercise', { defaultValue: 'Edit Exercise' }) : t('screens.newExercise', { defaultValue: 'New Exercise' }),
              {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
              },
            )}
          />
          <Stack.Screen
            name="WorkoutPresetForm"
            component={SafeWorkoutPresetForm}
            options={({ route }) => createStackScreenOptions(
              route.params.mode === 'edit-preset' ? t('screens.editPreset', { defaultValue: 'Edit Preset' }) : t('screens.newPreset', { defaultValue: 'New Preset' }),
              {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
              },
            )}
          />
          <Stack.Screen
            name="FoodScan"
            component={SafeFoodScan}
            options={createStackScreenOptions(t('screens.scanFood', { defaultValue: 'Scan Food' }), {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="FoodPhotoIntro"
            component={SafeFoodPhotoIntro}
            options={createStackScreenOptions(t('screens.photoFood', { defaultValue: 'Photo Food' }), {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="FoodPhotoFlow"
            component={FoodPhotoFlow}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              ...androidModalAnimation,
            }}
          />
          <Stack.Screen
            name="Chat"
            component={SafeChat}
            options={createStackScreenOptions(t('screens.sparky', { defaultValue: 'Sparky' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="MealAdd"
            component={SafeMealAdd}
            options={({ route }) => createStackScreenOptions(
              route.params?.mode === 'edit' ? t('screens.editMeal', { defaultValue: 'Edit Meal' }) : t('screens.createMeal', { defaultValue: 'Create Meal' }),
              {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
              },
            )}
          />
          <Stack.Screen
            name="FoodEntryView"
            component={SafeFoodEntryView}
            options={({ route }) => createStackScreenOptions(route.params.entry.food_name ?? t('screens.foodEntry', { defaultValue: 'Food Entry' }), { headerBackTitle: t('navigation.diary', { defaultValue: 'Diary' }) })}
          />
          <Stack.Screen
            name="EditLoggedMeal"
            component={SafeEditLoggedMeal}
            options={createStackScreenOptions(t('screens.editMeal', { defaultValue: 'Edit Meal' }), { headerBackTitle: t('navigation.diary', { defaultValue: 'Diary' }) })}
          />
          <Stack.Screen
            name="MealTypeDetail"
            component={SafeMealTypeDetail}
            options={({ route }) => createStackScreenOptions(route.params.mealLabel ?? t('screens.meal', { defaultValue: 'Meal' }), { headerBackTitle: t('navigation.diary', { defaultValue: 'Diary' }) })}
          />
          <Stack.Screen
            name="DailyNutritionDetails"
            component={SafeDailyNutritionDetails}
            options={createStackScreenOptions(t('screens.nutritionDetails', { defaultValue: 'Nutrition Details' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="NutrientTrends"
            component={SafeNutrientTrends}
            options={createStackScreenOptions(t('screens.trends', { defaultValue: 'Trends' }), { headerBackTitle: t('navigation.details', { defaultValue: 'Details' }) })}
          />
          <Stack.Screen
            name="ExerciseStatistics"
            component={SafeExerciseStatistics}
            options={createStackScreenOptions(t('screens.exerciseStatistics', { defaultValue: 'Exercise Statistics' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="Reports"
            component={SafeReports}
            options={createStackScreenOptions(t('screens.reports', { defaultValue: 'Reports' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="NutritionReport"
            component={SafeNutritionReport}
            options={createStackScreenOptions(t('screens.nutritionReport', { defaultValue: 'Nutrition' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="SleepAnalytics"
            component={SafeSleepAnalytics}
            options={createStackScreenOptions(t('screens.sleepAnalytics', { defaultValue: 'Sleep Analytics' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="MoodReport"
            component={SafeMoodReport}
            options={createStackScreenOptions(t('screens.moodReport', { defaultValue: 'Mood' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="HeartRateReport"
            component={SafeHeartRateReport}
            options={createStackScreenOptions(t('screens.heartRateReport', { defaultValue: 'Heart Rate' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="CompareReport"
            component={SafeCompareReport}
            options={createStackScreenOptions(t('screens.compareReport', { defaultValue: 'Compare' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="HydrationReport"
            component={SafeHydrationReport}
            options={createStackScreenOptions(t('screens.hydrationReport', { defaultValue: 'Hydration' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="SubstancesReport"
            component={SafeSubstancesReport}
            options={createStackScreenOptions(t('screens.substancesReport', { defaultValue: 'Caffeine and alcohol' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="MeasurementsReport"
            component={SafeMeasurementsReport}
            options={createStackScreenOptions(t('screens.measurementsReport', { defaultValue: 'Measurements' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="ReportsSettings"
            component={SafeReportsSettings}
            options={createStackScreenOptions(t('screens.reportsSettings', { defaultValue: 'Customize Reports' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="CardioSession"
            component={SafeCardioSession}
            options={createStackScreenOptions(t('screens.cardioSession', { defaultValue: 'Cardio Session' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="ActivityShare"
            component={SafeActivityShare}
            options={createStackScreenOptions(t('screens.activityShare', { defaultValue: 'Share Activity' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="RecordActivity"
            component={SafeRecordActivity}
            options={createStackScreenOptions(t('screens.recordActivity', { defaultValue: 'Record Activity' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="RunSummary"
            component={SafeRunSummary}
            options={createStackScreenOptions(t('screens.runSummary', { defaultValue: 'Activity saved' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="ExerciseSearch"
            component={SafeExerciseSearch}
            options={createStackScreenOptions(t('screens.selectExercise', { defaultValue: 'Select Exercise' }), {
              presentation: 'modal',
            })}
          />
          <Stack.Screen
            name="PresetSearch"
            component={SafePresetSearch}
            options={createStackScreenOptions(t('screens.startWorkout', { defaultValue: 'Start Workout' }))}
          />
          <Stack.Screen
            name="WorkoutAdd"
            component={SafeWorkoutAdd}
            options={({ route }) => createStackScreenOptions(route.params?.session ? t('screens.editWorkout', { defaultValue: 'Edit Workout' }) : t('screens.newWorkout', { defaultValue: 'New Workout' }))}
          />
          <Stack.Screen
            name="ActivityAdd"
            component={SafeActivityAdd}
            options={({ route }) => createStackScreenOptions(route.params?.entry ? t('screens.editActivity', { defaultValue: 'Edit Activity' }) : t('screens.newActivity', { defaultValue: 'New Activity' }))}
          />
          <Stack.Screen
            name="WorkoutDetail"
            component={SafeWorkoutDetail}
            options={({ route }) =>
              createStackScreenOptions(route.params?.session?.name ?? t('screens.workout', { defaultValue: 'Workout' }), {
                headerBackTitle: t('navigation.diary', { defaultValue: 'Diary' }),
              })
            }
          />
          <Stack.Screen
            name="ActiveWorkout"
            component={SafeActiveWorkout}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="WorkoutComplete"
            component={SafeWorkoutComplete}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="ActivityDetail"
            component={SafeActivityDetail}
            options={({ route }) => createStackScreenOptions(route.params.session.name ?? t('screens.activity', { defaultValue: 'Activity' }), { headerBackTitle: t('navigation.diary', { defaultValue: 'Diary' }) })}
          />
          <Stack.Screen
            name="FastingDetail"
            component={SafeFastingDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="FastingSettings"
            component={SafeFastingSettings}
            options={createStackScreenOptions(t('screens.fastingSettings', { defaultValue: 'Fasting Settings' }), { headerBackTitle: t('screens.fasting', { defaultValue: 'Fasting' }) })}
          />
          <Stack.Screen
            name="MindfulnessDetail"
            component={SafeMindfulnessDetail}
            options={{
              headerShown: false,
              gestureEnabled: true,
            }}
          />
          <Stack.Screen
            name="SleepDetail"
            component={SafeSleepDetail}
            options={createStackScreenOptions(t('screens.sleep', { defaultValue: 'Sleep' }), { headerBackTitle: t('navigation.diary', { defaultValue: 'Diary' }) })}
          />
          <Stack.Screen
            name="Logs"
            component={SafeLogs}
            options={createStackScreenOptions(t('screens.logs', { defaultValue: 'Logs' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="Sync"
            component={SafeSync}
            options={createStackScreenOptions(t('screens.healthSync', { defaultValue: 'Health Sync' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="ImportHistory"
            component={SafeImportHistory}
            options={createStackScreenOptions(t('screens.importHistory', { defaultValue: 'Import History' }), { headerBackTitle: t('screens.healthSync', { defaultValue: 'Health Sync' }) })}
          />
          <Stack.Screen
            name="MeasurementsAdd"
            component={SafeMeasurementsAdd}
            options={createStackScreenOptions(t('screens.measurements', { defaultValue: 'Measurements' }), {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MindfulnessLog"
            component={SafeMindfulnessLog}
            options={createStackScreenOptions(t('mindfulness.modal.addTitle', { defaultValue: 'Log Mindful Session' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="ProgressPhotos"
            component={SafeProgressPhotos}
            options={({ route }) =>
              createStackScreenOptions(t('screens.progressPhotos', { defaultValue: 'Progress Photos' }), {
                headerBackButtonDisplayMode: 'minimal',
                // The guided check-in's last step is a sheet, like the two
                // steps before it; on its own the screen is pushed.
                ...(route.params?.guidedCheckIn
                  ? {
                      presentation: 'modal' as const,
                      ...(Platform.OS === 'android' ? androidModalAnimation : {}),
                    }
                  : {}),
              })}
          />
          <Stack.Screen
            name="ProgressPhotoCompare"
            component={SafeProgressPhotoCompare}
            options={createStackScreenOptions(t('screens.progressPhotoCompare', { defaultValue: 'Compare' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="ProgressPhotoTimelapse"
            component={SafeProgressPhotoTimelapse}
            options={createStackScreenOptions(t('screens.progressPhotoTimelapse', { defaultValue: 'Time-lapse' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="Goals"
            component={SafeGoals}
            options={createStackScreenOptions(t('goals.title', { defaultValue: 'Goals' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="WeeklyGoalPlanEdit"
            component={SafeWeeklyGoalPlanEdit}
            options={createStackScreenOptions(t('goals.weekly.editTitle', { defaultValue: 'Weekly plan' }), { headerBackTitle: t('goals.title', { defaultValue: 'Goals' }) })}
          />
          <Stack.Screen
            name="CalorieSettings"
            component={SafeCalorieSettings}
            options={createStackScreenOptions(t('screens.calorieSettings', { defaultValue: 'Calorie Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="ChatSettings"
            component={SafeChatSettings}
            options={createStackScreenOptions(t('voiceSettings.open', { defaultValue: 'Voice settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="FoodSettings"
            component={SafeFoodSettings}
            options={createStackScreenOptions(t('screens.foodSettings', { defaultValue: 'Food Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="CustomNutrients"
            component={SafeCustomNutrients}
            options={createStackScreenOptions(t('customNutrients.title', { defaultValue: 'Custom Nutrients' }), { headerBackTitle: t('screens.foodSettings', { defaultValue: 'Food Settings' }) })}
          />
          <Stack.Screen
            name="CustomNutrientForm"
            component={SafeCustomNutrientForm}
            options={createStackScreenOptions(t('customNutrients.editTitle', { defaultValue: 'Edit nutrient' }), { headerBackTitle: t('common.back', { defaultValue: 'Back' }) })}
          />
          <Stack.Screen
            name="NutrientDisplaySettings"
            component={SafeNutrientDisplaySettings}
            options={createStackScreenOptions(t('nutrientDisplay.title', { defaultValue: 'Nutrient Display' }), { headerBackTitle: t('screens.foodSettings', { defaultValue: 'Food Settings' }) })}
          />
          <Stack.Screen
            name="AllergenSettings"
            component={SafeAllergenSettings}
            options={createStackScreenOptions(t('screens.allergenSettings', { defaultValue: 'Allergens' }), { headerBackTitle: t('screens.foodSettings', { defaultValue: 'Food Settings' }) })}
          />
          <Stack.Screen
            name="MealTypeSettings"
            component={SafeMealTypeSettings}
            options={createStackScreenOptions(t('screens.mealTypes', { defaultValue: 'Meal Types' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="Equipment"
            component={SafeEquipment}
            options={createStackScreenOptions(t('equipmentHub.title', { defaultValue: 'Equipment' }), { headerBackTitle: t('navigation.library', { defaultValue: 'Library' }) })}
          />
          <Stack.Screen
            name="Shoes"
            component={SafeShoes}
            options={createStackScreenOptions(t('shoes.title', { defaultValue: 'Shoes' }), { headerBackTitle: t('equipmentHub.title', { defaultValue: 'Equipment' }) })}
          />
          <Stack.Screen
            name="ShoeForm"
            component={SafeShoeForm}
            options={createStackScreenOptions(t('shoes.title', { defaultValue: 'Shoes' }), { headerBackTitle: t('shoes.title', { defaultValue: 'Shoes' }) })}
          />
          <Stack.Screen
            name="PlateInventory"
            component={SafePlateInventory}
            options={createStackScreenOptions(t('plates.title', { defaultValue: 'Plates & bars' }), { headerBackTitle: t('equipmentHub.title', { defaultValue: 'Equipment' }) })}
          />
          <Stack.Screen
            name="DashboardSettings"
            component={SafeDashboardSettings}
            options={createStackScreenOptions(t('screens.dashboardSettings', { defaultValue: 'Dashboard Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="HealthTrendsSettings"
            component={SafeHealthTrendsSettings}
            options={createStackScreenOptions(t('screens.healthTrendsSettings', { defaultValue: 'Health Trends' }), { headerBackTitle: t('screens.dashboardSettings', { defaultValue: 'Dashboard Settings' }) })}
          />
          <Stack.Screen
            name="DiarySettings"
            component={SafeDiarySettings}
            options={createStackScreenOptions(t('screens.diarySettings', { defaultValue: 'Diary Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="CustomCategories"
            component={SafeCustomCategories}
            options={createStackScreenOptions(t('customCategories.title', { defaultValue: 'Custom measurements' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="CustomCategoryEdit"
            component={SafeCustomCategoryEdit}
            options={createStackScreenOptions(t('customCategoryEdit.editTitle', { defaultValue: 'Edit category' }), { headerBackTitle: t('common.back', { defaultValue: 'Back' }) })}
          />
          <Stack.Screen
            name="WatchSettings"
            component={SafeWatchSettings}
            options={createStackScreenOptions(t('screens.watchSettings', { defaultValue: 'Apple Watch' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="AddMenuSettings"
            component={SafeAddMenuSettings}
            options={createStackScreenOptions(t('screens.addMenuSettings', { defaultValue: 'Quick Actions' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="WorkoutSettings"
            component={SafeWorkoutSettings}
            options={createStackScreenOptions(t('screens.workoutSettings', { defaultValue: 'Workout Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="WarmupSettings"
            component={SafeWarmupSettings}
            options={createStackScreenOptions(t('screens.warmupSettings', { defaultValue: 'Warm-up Calculator' }), { headerBackTitle: t('screens.workoutSettings', { defaultValue: 'Workout Settings' }) })}
          />
          <Stack.Screen
            name="HeartRateZonesSettings"
            component={SafeHeartRateZonesSettings}
            options={createStackScreenOptions(t('screens.heartRateZonesSettings', { defaultValue: 'Heart Rate Zones' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="ServerSettings"
            component={SafeServerSettings}
            options={createStackScreenOptions(t('screens.serverSettings', { defaultValue: 'Server Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="PasskeySettings"
            component={SafePasskeySettings}
            options={createStackScreenOptions(t('screens.passkeys', { defaultValue: 'Passkeys' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="AppSettings"
            component={SafeAppSettings}
            options={createStackScreenOptions(t('settings.app', { defaultValue: 'App Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={SafeNotificationSettings}
            options={createStackScreenOptions(t('notifications.title', { defaultValue: 'Notifications' }), { headerBackTitle: t('settings.app', { defaultValue: 'App Settings' }) })}
          />
          <Stack.Screen
            name="About"
            component={SafeAbout}
            options={createStackScreenOptions(t('screens.about', { defaultValue: 'About' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="WhatsNew"
            component={SafeWhatsNew}
            options={createStackScreenOptions(t('screens.whatsNew', { defaultValue: "What's New" }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="CycleSettings"
            component={SafeCycleSettings}
            options={createStackScreenOptions(t('screens.cyclePregnancy', { defaultValue: 'Cycle & Pregnancy' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="CycleOnboarding"
            component={SafeCycleOnboarding}
            options={createStackScreenOptions(t('screens.cycleSetup', { defaultValue: 'Cycle Setup' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="CycleHub"
            component={SafeCycleHub}
            options={createStackScreenOptions(t('screens.wellnessHub', { defaultValue: 'Wellness Hub' }), { headerBackTitle: t('navigation.dashboard', { defaultValue: 'Dashboard' }) })}
          />
          <Stack.Screen
            name="CycleLogModal"
            component={SafeCycleLogModal}
            options={createStackScreenOptions(t('screens.logDailyEntry', { defaultValue: 'Log Daily Entry' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="PregnancySetup"
            component={SafePregnancySetup}
            options={createStackScreenOptions(t('screens.pregnancySetup', { defaultValue: 'Pregnancy Setup' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MedicationsList"
            component={SafeMedicationsList}
            options={createStackScreenOptions(t('screens.medications', { defaultValue: 'Medications' }), { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="MedicationAdherence"
            component={SafeMedicationAdherence}
            options={createStackScreenOptions(t('medications.adherence.screenTitle', { defaultValue: 'Adherence' }), { headerBackTitle: t('screens.medications', { defaultValue: 'Medications' }) })}
          />
          <Stack.Screen
            name="MedicationEntryEdit"
            component={SafeMedicationEntryEdit}
            options={createStackScreenOptions(t('medications.entryEdit.title', { defaultValue: 'Edit logged dose' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MedicationDetail"
            component={SafeMedicationDetail}
            options={createStackScreenOptions(t('screens.medication', { defaultValue: 'Medication' }), { headerBackTitle: t('screens.medications', { defaultValue: 'Medications' }) })}
          />
          <Stack.Screen
            name="MedicationForm"
            component={SafeMedicationForm}
            options={createStackScreenOptions(t('screens.medication', { defaultValue: 'Medication' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MedicationScheduleForm"
            component={SafeMedicationScheduleForm}
            options={createStackScreenOptions(t('screens.medication', { defaultValue: 'Medication' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="Glp1Tracker"
            component={SafeGlp1Tracker}
            options={createStackScreenOptions(t('medications.glp1.tracker.title', { defaultValue: 'GLP-1 tracker' }), { headerBackTitle: t('screens.medication', { defaultValue: 'Medication' }) })}
          />
          <Stack.Screen
            name="Glp1PenForm"
            component={SafeGlp1PenForm}
            options={createStackScreenOptions(t('medications.glp1.form.newPen', { defaultValue: 'New pen or vial' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="Glp1TitrationForm"
            component={SafeGlp1TitrationForm}
            options={createStackScreenOptions(t('medications.glp1.titration.newStep', { defaultValue: 'New step' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="SymptomLog"
            component={SafeSymptomLog}
            options={createStackScreenOptions(t('screens.symptomLog', { defaultValue: 'Log Symptom' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MoodLog"
            component={SafeMoodLog}
            options={createStackScreenOptions(t('screens.moodLog', { defaultValue: 'Mood' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MoodDay"
            component={SafeMoodDay}
            options={createStackScreenOptions(t('screens.moodLog', { defaultValue: 'Mood' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="AiSettings"
            component={SafeAiSettings}
            options={createStackScreenOptions(t('screens.aiSettings', { defaultValue: 'AI' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="SymptomHistory"
            component={SafeSymptomHistory}
            options={createStackScreenOptions(t('screens.symptomHistory', { defaultValue: 'Symptom History' }), {
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="SymptomEpisodeDetail"
            component={SafeSymptomEpisodeDetail}
            options={createStackScreenOptions(t('screens.symptomEpisodeDetail', { defaultValue: 'Episode Details' }), {
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="ManageSymptoms"
            component={SafeManageSymptoms}
            options={createStackScreenOptions(t('screens.manageSymptoms', { defaultValue: 'Manage Symptoms' }), {
              headerBackButtonDisplayMode: 'minimal',
            })}
          />
          <Stack.Screen
            name="SymptomDefinitionEditor"
            component={SafeSymptomDefinitionEditor}
            options={createStackScreenOptions(t('screens.symptomDefinition', { defaultValue: 'Symptom Details' }), {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
        </Stack.Navigator>
        <AddSheet
          ref={addSheetRef}
          onAddFood={handleAddFood}
          onStartWorkout={handleStartWorkout}
          onAddActivity={handleAddActivity}
          onLogWorkout={handleLogWorkout}
          onSyncHealthData={handleSyncHealthData}
          onBarcodeScan={handleBarcodeScan}
          onAddMeasurements={handleAddMeasurements}
          onAddProgressPhotos={handleAddProgressPhotos}
          onAddSymptoms={handleAddSymptoms}
          onAddMood={handleAddMood}
          onAddMindfulness={handleAddMindfulness}
          onRecordActivity={handleRecordActivity}
          onAskSparky={handleAskSparky}
          onStartCheckIn={handleStartCheckIn}
          onOpenCycle={handleOpenCycle}
          showCycleCard={cycleEnabled}
          cycleLabel={cycleSheetLabel}
          onDismissWithoutAction={handleAddSheetDismissWithoutAction}
        />
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
            queryClient.invalidateQueries({ queryKey: serverConfigsQueryKey });
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
        <ActiveWorkoutKeepAwake />
        <MedicationReminderReconciler />
        <MoodCheckinReminderReconciler />
        <SafeAreaToast />
        </LightboxProvider>
      </SafeAreaProvider>
    </NavigationContainer>
  );
}

function SafeAreaToast() {
  const insets = useSafeAreaInsets();
  const toast = <Toast config={toastConfig} topOffset={insets.top + 8} />;
  // On iOS a plain Toast renders in the normal view tree, so it appears *under*
  // native modals (rename dialogs, form sheets, anchored menus). A
  // FullWindowOverlay hoists it above every window — matching how the app's
  // bottom sheets escape modal contexts. Android modal layering doesn't have
  // this problem, and FullWindowOverlay is a no-op there.
  return Platform.OS === 'ios' ? <FullWindowOverlay>{toast}</FullWindowOverlay> : toast;
}

function UniwindInsetsBridge() {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    Uniwind.updateInsets(insets);
  }, [insets]);
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <KeyboardProvider>
        <GestureHandlerRootView className="flex-1">
          <BottomSheetModalProvider>
            {/* One resolver for the whole app: food/meal image paths only need
                the active server's origin and proxy headers, so there is no
                reason for each screen to own a copy (or its own cache). */}
            <FoodImageSourceProvider>
              <AppContent />
            </FoodImageSourceProvider>
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </QueryClientProvider>
  );
}

export default App;
