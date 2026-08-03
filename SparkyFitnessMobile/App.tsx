import './global.css'
import { useCallback, useEffect, useMemo } from 'react';
import { StatusBar, Platform } from 'react-native';
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
import { Uniwind, useUniwind, useCSSVariable } from 'uniwind';

import { queryClient, serverConnectionQueryKey, serverConfigsQueryKey, useSyncHealthData, useCycleMode } from './src/hooks';
import { useInitialRoute, useAppStartup } from './src/hooks/useAppStartup';
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
  SafeMeasurementsAdd,
  SafeChat,
  SafeCalorieSettings,
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

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator<RootStackParamList>();

const androidModalAnimation =
  Platform.OS === 'android' ? ({ animation: 'slide_from_bottom' } as const) : {};

function AppContent() {
  const { theme } = useUniwind();
  const {
    showReauthModal, showSetupModal, showApiKeySwitchModal,
    expiredConfigId, switchToApiKeyConfig,
    dismissModal, handleLoginSuccess, handleSwitchToApiKey, handleSwitchToApiKeyDone,
  } = useAuth();

  const { initialRoute, linkingEnabled, setLinkingEnabled } = useInitialRoute();
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
    ? 'Wellness'
    : cycleMode === 'pregnant' || cycleMode === 'postpartum'
      ? 'Log Pregnancy Entry'
      : 'Log Cycle';

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
            options={createStackScreenOptions('Foods', { headerBackTitle: 'Library' })}
          />
          <Stack.Screen
            name="MealsLibrary"
            component={SafeMealsLibrary}
            options={createStackScreenOptions('Meals', { headerBackTitle: 'Library' })}
          />
          <Stack.Screen
            name="ExercisesLibrary"
            component={SafeExercisesLibrary}
            options={createStackScreenOptions('Exercises', { headerBackTitle: 'Library' })}
          />
          <Stack.Screen
            name="WorkoutPresetsLibrary"
            component={SafeWorkoutPresetsLibrary}
            options={createStackScreenOptions('Workout Presets', { headerBackTitle: 'Library' })}
          />
          <Stack.Screen
            name="WorkoutPresetDetail"
            component={SafeWorkoutPresetDetail}
            options={({ route }) => createStackScreenOptions(route.params.updatedPreset?.name ?? route.params.preset.name, { headerBackTitle: 'Presets' })}
          />
          <Stack.Screen
            name="FoodDetail"
            component={SafeFoodDetail}
            options={({ route }) => createStackScreenOptions(route.params.updatedItem?.name ?? route.params.item.name, { headerBackTitle: 'Foods' })}
          />
          <Stack.Screen
            name="MealDetail"
            component={SafeMealDetail}
            options={createStackScreenOptions('', { headerBackTitle: 'Meals' })}
          />
          <Stack.Screen
            name="ExerciseDetail"
            component={SafeExerciseDetail}
            options={({ route }) => createStackScreenOptions(route.params.updatedItem?.name ?? route.params.item.name, {
              headerBackTitle: 'Exercises',
              // iOS 26 defaults the pop gesture to full-screen swipes; keep it
              // edge-only here so interior right-swipes switch tabs instead of
              // navigating back.
              fullScreenGestureEnabled: false,
            })}
          />
          <Stack.Screen
            name="FoodSearch"
            component={SafeFoodSearch}
            options={createStackScreenOptions('Add Food', {
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
                ? 'New Food'
                : route.params.mode === 'edit-food'
                  ? 'Edit Food'
                  : 'Adjust Nutrition',
              {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
              },
            )}
          />
          <Stack.Screen
            name="EditBarcode"
            component={SafeEditBarcode}
            options={createStackScreenOptions('Barcodes', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="ExerciseForm"
            component={SafeExerciseForm}
            options={({ route }) => createStackScreenOptions(
              route.params.mode === 'edit-exercise' ? 'Edit Exercise' : 'New Exercise',
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
              route.params.mode === 'edit-preset' ? 'Edit Preset' : 'New Preset',
              {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
              },
            )}
          />
          <Stack.Screen
            name="FoodScan"
            component={SafeFoodScan}
            options={createStackScreenOptions('Scan Food', {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="FoodPhotoIntro"
            component={SafeFoodPhotoIntro}
            options={createStackScreenOptions('Photo Food', {
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
            options={createStackScreenOptions('Sparky', { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="MealAdd"
            component={SafeMealAdd}
            options={({ route }) => createStackScreenOptions(
              route.params?.mode === 'edit' ? 'Edit Meal' : 'Create Meal',
              {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
              },
            )}
          />
          <Stack.Screen
            name="FoodEntryView"
            component={SafeFoodEntryView}
            options={({ route }) => createStackScreenOptions(route.params.entry.food_name ?? 'Food Entry', { headerBackTitle: 'Diary' })}
          />
          <Stack.Screen
            name="EditLoggedMeal"
            component={SafeEditLoggedMeal}
            options={createStackScreenOptions('Edit Meal', { headerBackTitle: 'Diary' })}
          />
          <Stack.Screen
            name="MealTypeDetail"
            component={SafeMealTypeDetail}
            options={({ route }) => createStackScreenOptions(route.params.mealLabel ?? 'Meal', { headerBackTitle: 'Diary' })}
          />
          <Stack.Screen
            name="DailyNutritionDetails"
            component={SafeDailyNutritionDetails}
            options={createStackScreenOptions('Nutrition Details', {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="NutrientTrends"
            component={SafeNutrientTrends}
            options={createStackScreenOptions('Trends', { headerBackTitle: 'Details' })}
          />
          <Stack.Screen
            name="ExerciseSearch"
            component={SafeExerciseSearch}
            options={createStackScreenOptions('Select Exercise', {
              presentation: 'modal',
            })}
          />
          <Stack.Screen
            name="PresetSearch"
            component={SafePresetSearch}
            options={createStackScreenOptions('Start Workout')}
          />
          <Stack.Screen
            name="WorkoutAdd"
            component={SafeWorkoutAdd}
            options={({ route }) => createStackScreenOptions(route.params?.session ? 'Edit Workout' : 'New Workout')}
          />
          <Stack.Screen
            name="ActivityAdd"
            component={SafeActivityAdd}
            options={({ route }) => createStackScreenOptions(route.params?.entry ? 'Edit Activity' : 'New Activity')}
          />
          <Stack.Screen
            name="WorkoutDetail"
            component={SafeWorkoutDetail}
            options={({ route }) =>
              createStackScreenOptions(route.params?.session?.name ?? 'Workout', {
                headerBackTitle: 'Diary',
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
            options={({ route }) => createStackScreenOptions(route.params.session.name ?? 'Activity', { headerBackTitle: 'Diary' })}
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
            options={createStackScreenOptions('Logs', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="Sync"
            component={SafeSync}
            options={createStackScreenOptions('Health Sync', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="MeasurementsAdd"
            component={SafeMeasurementsAdd}
            options={createStackScreenOptions('Measurements', {
              presentation: 'modal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="CalorieSettings"
            component={SafeCalorieSettings}
            options={createStackScreenOptions('Calorie Settings', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="FoodSettings"
            component={SafeFoodSettings}
            options={createStackScreenOptions('Food Settings', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="DashboardSettings"
            component={SafeDashboardSettings}
            options={createStackScreenOptions('Dashboard Settings', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="DiarySettings"
            component={SafeDiarySettings}
            options={createStackScreenOptions('Diary Settings', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="WorkoutSettings"
            component={SafeWorkoutSettings}
            options={createStackScreenOptions('Workout Settings', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="ServerSettings"
            component={SafeServerSettings}
            options={createStackScreenOptions('Server Settings', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="PasskeySettings"
            component={SafePasskeySettings}
            options={createStackScreenOptions('Passkeys', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="AppSettings"
            component={SafeAppSettings}
            options={createStackScreenOptions('App Settings', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="NotificationSettings"
            component={SafeNotificationSettings}
            options={createStackScreenOptions('Notifications', { headerBackTitle: 'App Settings' })}
          />
          <Stack.Screen
            name="About"
            component={SafeAbout}
            options={createStackScreenOptions('About', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="WhatsNew"
            component={SafeWhatsNew}
            options={createStackScreenOptions("What's New", { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="CycleSettings"
            component={SafeCycleSettings}
            options={createStackScreenOptions('Cycle & Pregnancy', { headerBackTitle: 'Settings' })}
          />
          <Stack.Screen
            name="CycleOnboarding"
            component={SafeCycleOnboarding}
            options={createStackScreenOptions('Cycle Setup', {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="CycleHub"
            component={SafeCycleHub}
            options={createStackScreenOptions('Wellness Hub', { headerBackTitle: 'Dashboard' })}
          />
          <Stack.Screen
            name="CycleLogModal"
            component={SafeCycleLogModal}
            options={createStackScreenOptions('Log Daily Entry', {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="PregnancySetup"
            component={SafePregnancySetup}
            options={createStackScreenOptions('Pregnancy Setup', {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MedicationsList"
            component={SafeMedicationsList}
            options={createStackScreenOptions('Medications', { headerBackButtonDisplayMode: 'minimal' })}
          />
          <Stack.Screen
            name="MedicationDetail"
            component={SafeMedicationDetail}
            options={createStackScreenOptions('Medication', { headerBackTitle: 'Medications' })}
          />
          <Stack.Screen
            name="MedicationForm"
            component={SafeMedicationForm}
            options={createStackScreenOptions('Medication', {
              presentation: 'modal',
              headerBackButtonDisplayMode: 'minimal',
              ...(Platform.OS === 'android' ? androidModalAnimation : {}),
            })}
          />
          <Stack.Screen
            name="MedicationScheduleForm"
            component={SafeMedicationScheduleForm}
            options={createStackScreenOptions('Medication', {
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
            <AppContent />
          </BottomSheetModalProvider>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </QueryClientProvider>
  );
}

export default App;
