import './global.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, Platform, Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import {
  NavigationContainer,
  type NavigationProp,
  type Theme,
} from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { QueryClientProvider } from '@tanstack/react-query';
import { useUniwind, useCSSVariable } from 'uniwind';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { queryClient, serverConnectionQueryKey } from './src/hooks';

import { createStackNavigator } from '@react-navigation/stack';
import SyncScreen from './src/screens/SyncScreen';
import WorkoutsScreen from './src/screens/WorkoutsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import DiaryScreen from './src/screens/DiaryScreen';
import LogScreen from './src/screens/LogScreen';
import FoodSearchScreen from './src/screens/FoodSearchScreen';
import FoodEntryAddScreen from './src/screens/FoodEntryAddScreen';
import FoodEntryViewScreen from './src/screens/FoodEntryViewScreen';
import FoodFormScreen from './src/screens/FoodFormScreen';
import FoodScanScreen from './src/screens/FoodScanScreen';
import WorkoutFormScreen from './src/screens/WorkoutFormScreen';
import ActivityFormScreen from './src/screens/ActivityFormScreen';
import WorkoutDetailScreen from './src/screens/WorkoutDetailScreen';
import ExerciseSearchScreen from './src/screens/ExerciseSearchScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import ReauthModal from './src/components/ReauthModal';
import ServerConfigModal from './src/components/ServerConfigModal';
import { useAuth } from './src/hooks/useAuth';
import { loadBackgroundSyncEnabled, loadTimeRange, getActiveServerConfig } from './src/services/storage';
import type { TimeRange } from './src/services/storage';
import { initHealthConnect, loadHealthPreference } from './src/services/healthConnectService';
import { HEALTH_METRICS } from './src/HealthMetrics';
import { useSyncHealthData } from './src/hooks';
import { configureBackgroundSync, performBackgroundSync } from './src/services/backgroundSyncService';
import { startObservers, stopObservers } from './src/services/healthConnectService';
import { initializeTheme } from './src/services/themeService';
import { useStartExercise } from './src/hooks/useStartExercise';
import { initLogService } from './src/services/LogService';
import { ensureTimezoneBootstrapped } from './src/services/api/preferencesApi';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Toast from 'react-native-toast-message';
import type { RootStackParamList, TabParamList } from './src/types/navigation';
import AddSheet, { type AddSheetRef } from './src/components/AddSheet';
import { toastConfig } from './src/components/ui/toastConfig';
import CustomTabBar from './src/components/CustomTabBar';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createStackNavigator<RootStackParamList>();
const EmptyScreen = () => null;

function AppContent() {
  const { theme } = useUniwind();
  const {
    showReauthModal, showSetupModal, showApiKeySwitchModal,
    expiredConfigId, switchToApiKeyConfig,
    dismissModal, handleLoginSuccess, handleSwitchToApiKey, handleSwitchToApiKeyDone,
  } = useAuth();

  const [initialRoute, setInitialRoute] = useState<'Tabs' | 'Onboarding' | null>(null);

  useEffect(() => {
    const determine = async () => {
      try {
        const config = await getActiveServerConfig();
        setInitialRoute(config ? 'Tabs' : 'Onboarding');
      } catch {
        setInitialRoute('Onboarding');
      } finally {
        await SplashScreen.hideAsync();
      }
    };
    determine();
  }, []);

  const addSheetRef = useRef<AddSheetRef>(null);
  const navigationRef = useRef<NavigationProp<TabParamList> | null>(null);

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
    if (!navigation) return undefined;

    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
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

  const addSheetNavigation = useMemo(() => ({
    navigate: (screen: string, params?: Record<string, unknown>) => {
      navigationRef.current?.getParent()?.navigate(screen, params);
    },
  }), []);

  const handleAddExercise = useStartExercise({
    navigation: addSheetNavigation,
    getDate: getActiveDiaryDate,
  });

  const syncMutation = useSyncHealthData();

  const handleSyncHealthData = useCallback(async () => {
    if (syncMutation.isPending) return;

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

  useEffect(() => {
    let cancelled = false;

    // Initialize theme from storage on app start
    initializeTheme();

    // Reset the auto-open flag on every app start
    const initializeApp = async () => {
      // Remove the flag so the dashboard will auto-open on first SyncScreen visit
      await AsyncStorage.removeItem('@HealthConnect:hasAutoOpenedDashboard');
    };

    initializeApp();

    // Initialize log service (warms cache, prunes old logs, registers AppState listener)
    initLogService().catch(error => {
      console.error('[App] Failed to initialize log service:', error);
    });

    const initializeSyncServices = async () => {
      // Bootstrap timezone before any sync path is configured so the server
      // has a stable timezone for the very first sync.
      const timezone = await ensureTimezoneBootstrapped();
      if (!timezone) {
        console.warn('[App] Timezone bootstrap did not resolve a timezone before sync setup.');
      }

      if (cancelled) return;

      try {
        await configureBackgroundSync();
      } catch (error) {
        console.error('[App] Failed to configure background sync:', error);
      }

      if (cancelled || Platform.OS !== 'ios') return;

      try {
        const enabled = await loadBackgroundSyncEnabled();
        if (!enabled || cancelled) return;

        startObservers(() => {
          performBackgroundSync('healthkit-observer').catch(error => {
            console.error('[App] Observer-triggered sync failed:', error);
          });
        });
      } catch (error) {
        console.error('[App] Failed to configure HealthKit observers:', error);
      }
    };

    initializeSyncServices().catch(error => {
      console.error('[App] Failed to initialize sync services:', error);
    });

    return () => {
      cancelled = true;
      if (Platform.OS === 'ios') {
        stopObservers();
      }
    };
  }, []);

  if (!initialRoute) return null;

  return (
    <NavigationContainer theme={navigationTheme}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{ gestureEnabled: false }}
          />
          <Stack.Screen name="Tabs" options={{ gestureEnabled: false }}>
            {() => (
              <Tab.Navigator
                initialRouteName="Dashboard"
                screenOptions={{
                  headerShown: false,
                }}
                tabBar={(props) => <CustomTabBar {...props} />}
              >
                <Tab.Screen name="Dashboard" component={DashboardScreen} />
                <Tab.Screen name="Diary" component={DiaryScreen} />
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
                <Tab.Screen name="Workouts" component={WorkoutsScreen} />
                <Tab.Screen name="Settings" component={SettingsScreen} />
              </Tab.Navigator>
            )}
          </Stack.Screen>
          <Stack.Screen
            name="FoodSearch"
            component={FoodSearchScreen}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="FoodEntryAdd"
            component={FoodEntryAddScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="FoodForm"
            component={FoodFormScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="FoodScan"
            component={FoodScanScreen}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="FoodEntryView"
            component={FoodEntryViewScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="ExerciseSearch"
            component={ExerciseSearchScreen}
            options={{
              presentation: 'modal',
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="WorkoutForm"
            component={WorkoutFormScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="ActivityForm"
            component={ActivityFormScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="WorkoutDetail"
            component={WorkoutDetailScreen}
            options={{
              headerShown: false,
              gestureEnabled: true,
              gestureDirection: 'horizontal',
            }}
          />
          <Stack.Screen
            name="Logs"
            component={LogScreen}
            options={{
              headerShown: true,
              title: 'Logs',
              headerBackTitle: 'Back',
            }}
          />
          <Stack.Screen
            name="Sync"
            component={SyncScreen}
            options={{
              headerShown: false,
            }}
          />
        </Stack.Navigator>
        <AddSheet ref={addSheetRef} onAddFood={handleAddFood} onAddExercise={handleAddExercise} onSyncHealthData={handleSyncHealthData} onBarcodeScan={handleBarcodeScan} />
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
      <GestureHandlerRootView className="flex-1">
        <BottomSheetModalProvider>
          <AppContent />
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}

export default App;
