import './global.css'
import { useCallback, useEffect, useMemo } from 'react';
import { StatusBar, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as SplashScreen from 'expo-splash-screen';
import * as NavigationBar from 'expo-navigation-bar';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
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

import { queryClient, serverConnectionQueryKey, serverConfigsQueryKey, useSyncHealthData, useCycleMode } from './src/hooks';
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
  SafeExercisesLibrary,
  SafeWorkoutPresetsLibrary,
  SafeFoodDetail,
  SafeMealDetail,
  SafeExerciseDetail,
  SafeWorkoutPresetDetail,
  SafeFoodSearch,
  SafeFoodEntryAdd,
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
  SafeLogs,
  SafeSync,
  SafeImportHistory,
  SafeMeasurementsAdd,
  SafeChat,
  SafeCalorieSettings,
  SafeMealTypeSettings,
  SafeFoodSettings,
  SafeDashboardSettings,
  SafeDiarySettings,
  SafeWorkoutSettings,
  SafeServerSettings,
  SafePasskeySettings,
  SafeAppSettings,
  SafeNotificationSettings,
  SafeAbout,
  SafeWhatsNew,
  SafeDailyNutritionDetails,
  SafeNutrientTrends,
  SafeCycleSettings,
  SafeCycleOnboarding,
  SafeCycleHub,
  SafeCycleLogModal,
  SafePregnancySetup,
  SafeMedicationsList,
  SafeMedicationDetail,
  SafeMedicationForm,
  SafeMedicationScheduleForm,
} from './src/navigation/safeScreens';
import ReauthModal from './src/components/ReauthModal';
import ServerConfigModal from './src/components/ServerConfigModal';
import { useAuth } from './src/hooks/useAuth';
import { addLog } from './src/services/LogService';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { FullWindowOverlay } from 'react-native-screens';
import type { RootStackParamList } from './src/types/navigation';
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
import ActiveWorkoutKeepAwake from './src/components/ActiveWorkoutKeepAwake';
import MedicationReminderReconciler from './src/components/MedicationReminderReconciler';
import { useNativeIOSTabsActive, useNativeIOSHeadersActive } from './src/services/nativeTabBarPreference';
import { useWidgetLanguageRefresh } from './src/hooks/useWidgetLanguageRefresh';
import { useIOSWidgetLanguageRefresh } from './src/hooks/useIOSWidgetLanguageRefresh';

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator<RootStackParamList>();

const androidModalAnimation =
  Platform.OS === 'android' ? ({ animation: 'slide_from_bottom' } as const) : {};

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
    handleAskSparky,
    handleOpenCycle,
    handleSyncHealthData,
    handleAddSheetDismissWithoutAction,
  } = useAddSheetActions({ syncMutation });

  const { enabled: cycleEnabled, mode: cycleMode, discreetMode: cycleDiscreet } = useCycleMode();
  const cycleSheetLabel = cycleDiscreet
    ? t('addSheet.wellness', { defaultValue: 'Wellness' })
    : cycleMode === 'pregnant' || cycleMode === 'postpartum'
      ? t('addSheet.logPregnancyEntry', { defaultValue: 'Log Pregnancy Entry' })
      : t('addSheet.logCycle', { defaultValue: 'Log Cycle' });

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
        // Tapping the workout Live Activity opens its associated URL.
        ActiveWorkout: 'active-workout',
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
            name="CalorieSettings"
            component={SafeCalorieSettings}
            options={createStackScreenOptions(t('screens.calorieSettings', { defaultValue: 'Calorie Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="FoodSettings"
            component={SafeFoodSettings}
            options={createStackScreenOptions(t('screens.foodSettings', { defaultValue: 'Food Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="MealTypeSettings"
            component={SafeMealTypeSettings}
            options={createStackScreenOptions(t('screens.mealTypes', { defaultValue: 'Meal Types' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="DashboardSettings"
            component={SafeDashboardSettings}
            options={createStackScreenOptions(t('screens.dashboardSettings', { defaultValue: 'Dashboard Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="DiarySettings"
            component={SafeDiarySettings}
            options={createStackScreenOptions(t('screens.diarySettings', { defaultValue: 'Diary Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
          />
          <Stack.Screen
            name="WorkoutSettings"
            component={SafeWorkoutSettings}
            options={createStackScreenOptions(t('screens.workoutSettings', { defaultValue: 'Workout Settings' }), { headerBackTitle: t('navigation.settings', { defaultValue: 'Settings' }) })}
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
        </Stack.Navigator>
        <AddSheet ref={addSheetRef} onAddFood={handleAddFood} onStartWorkout={handleStartWorkout} onAddActivity={handleAddActivity} onLogWorkout={handleLogWorkout} onSyncHealthData={handleSyncHealthData} onBarcodeScan={handleBarcodeScan} onAddMeasurements={handleAddMeasurements} onAskSparky={handleAskSparky} onOpenCycle={handleOpenCycle} showCycleCard={cycleEnabled} cycleLabel={cycleSheetLabel} onDismissWithoutAction={handleAddSheetDismissWithoutAction} />
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
