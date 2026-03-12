import './global.css'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, Platform, Alert, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  NavigationContainer,
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
import LoginModal from './src/components/LoginModal';
import ServerConfigModal from './src/components/ServerConfigModal';
import { useAuth } from './src/hooks/useAuth';
import { saveServerConfig, getActiveServerConfig, loadBackgroundSyncEnabled } from './src/services/storage';
import { loadSessionDraft, clearSessionDraft } from './src/services/workoutDraftService';
import { notifyNoConfigs } from './src/services/api/authService';
import { configureBackgroundSync, performBackgroundSync } from './src/services/backgroundSyncService';
import { startObservers, stopObservers } from './src/services/healthConnectService';
import { initializeTheme } from './src/services/themeService';
import { initLogService } from './src/services/LogService';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import type { RootStackParamList, TabParamList } from './src/types/navigation';
import AddSheet, { type AddSheetRef } from './src/components/AddSheet';

const Tab = createNativeBottomTabNavigator<TabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

type TabIcons = {
  workouts: ImageSourcePropType;
  dashboard: ImageSourcePropType;
  book: ImageSourcePropType;
  settings: ImageSourcePropType;
  add: ImageSourcePropType;
};

function AppContent() {
  const { theme } = useUniwind();
  const { showLoginModal, expiredConfigId, dismissLoginModal, handleLoginSuccess } = useAuth();
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyUrl, setApiKeyUrl] = useState('');
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyProxyHeaders, setApiKeyProxyHeaders] = useState<import('./src/services/storage').ProxyHeader[]>([]);

  const addSheetRef = useRef<AddSheetRef>(null);
  const navigationRef = useRef<any>(null);

  const [primary, chrome, chromeBorder, bgPrimary, textPrimary, tabActive, tabInactive] = useCSSVariable([
    '--color-accent-primary',
    '--color-chrome',
    '--color-chrome-border',
    '--color-background',
    '--color-text-primary',
    '--color-tab-active',
    '--color-tab-inactive',
  ]) as [string, string, string, string, string, string, string];
  const [icons, setIcons] = useState<TabIcons | null>(null);

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

  const handleAddFood = useCallback(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    const diaryParams =
      activeRoute.name === 'Diary'
        ? (activeRoute.params as { selectedDate?: string } | undefined)
        : undefined;
    const date = diaryParams?.selectedDate;
    navigation.getParent()?.navigate('FoodSearch', { date });
  }, []);

  const handleAddWorkout = useCallback(async () => {
    const navigation = navigationRef.current;
    if (!navigation) return;

    const isConnected = queryClient.getQueryData(serverConnectionQueryKey);
    if (!isConnected) {
      Alert.alert(
        'No Server Connected',
        'Configure your server connection in Settings to start a workout.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to Settings',
            onPress: () => navigation.getParent()?.navigate('Tabs', { screen: 'Settings' }),
          },
        ],
      );
      return;
    }

    const draft = await loadSessionDraft();
    if (draft && draft.type === 'workout' && draft.exercises.length > 0) {
      Alert.alert('Resume Workout?', 'You have a workout in progress.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Fresh',
          style: 'destructive',
          onPress: async () => {
            await clearSessionDraft();
            navigation.getParent()?.navigate('WorkoutForm');
          },
        },
        {
          text: 'Resume',
          onPress: () => navigation.getParent()?.navigate('WorkoutForm'),
        },
      ]);
    } else {
      navigation.getParent()?.navigate('WorkoutForm');
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      Promise.all([
        Ionicons.getImageSource('barbell-outline', 24, '#999999'),
        Ionicons.getImageSource('grid', 24, '#999999'),
        Ionicons.getImageSource('book', 24, '#999999'),
        Ionicons.getImageSource('settings', 24, '#999999'),
        Ionicons.getImageSource('add-circle', 24, '#999999'),
      ]).then(([workouts, dashboard, book, settings, add]) => {
        if (workouts && dashboard && book && settings && add) {
          setIcons({ workouts, dashboard, book, settings, add });
        }
      }).catch(error => {
        console.error('Failed to load tab icons:', error);
      });
    }
  }, []);

  useEffect(() => {
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

    // Configure background sync without blocking app startup
    configureBackgroundSync().catch(error => {
      console.error('[App] Failed to configure background sync:', error);
    });

    // Register HealthKit background delivery and observer subscriptions (iOS)
    // Only if the user has background sync enabled — otherwise observers would
    // bypass the preference and continue syncing in the background.
    // When the user toggles the setting at runtime, SettingsScreen calls
    // startObservers/stopObservers directly, so the lifecycle stays in sync.
    if (Platform.OS === 'ios') {
      loadBackgroundSyncEnabled().then(enabled => {
        if (!enabled) return;

        startObservers(() => {
          performBackgroundSync('healthkit-observer').catch(error => {
            console.error('[App] Observer-triggered sync failed:', error);
          });
        });
      });

      return () => stopObservers();
    }
  }, []);

  if (Platform.OS !== 'ios' && !icons) {
    return null;
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" options={{ gestureEnabled: false }}>
            {() => (
              <Tab.Navigator
                initialRouteName="Dashboard"
                tabBarActiveTintColor={tabActive}
                tabBarInactiveTintColor={tabInactive}
                activeIndicatorColor={isDarkMode ? '#424242' : '#E7EAEC'}
                tabBarStyle={Platform.OS !== 'ios' ? { backgroundColor: chrome } : undefined}
                labeled={true}
              >
                <Tab.Screen
                  name="Dashboard"
                  component={DashboardScreen}
                  options={{
                    tabBarIcon: () =>
                      Platform.OS === 'ios' ? { sfSymbol: 'square.grid.2x2.fill' } : icons!.dashboard,
                  }}
                />
                <Tab.Screen
                  name="Diary"
                  component={DiaryScreen}
                  options={{
                    tabBarIcon: () =>
                      Platform.OS === 'ios' ? { sfSymbol: 'book.fill' } : icons!.book,
                  }}
                />
                <Tab.Screen
                  name="Add"
                  component={() => null}
                  options={{
                    preventsDefault: true,
                    tabBarIcon: () =>
                      Platform.OS === 'ios' ? { sfSymbol: 'plus.circle.fill' } : icons!.add,
                  }}
                  listeners={({ navigation }) => ({
                    tabPress: () => {
                      navigationRef.current = navigation;
                      addSheetRef.current?.present();
                    },
                  })}
                />
                <Tab.Screen
                  name="Workouts"
                  component={WorkoutsScreen}
                  options={{
                    tabBarIcon: () =>
                      Platform.OS === 'ios' ? { sfSymbol: 'dumbbell.fill' } : icons!.workouts,
                  }}
                />
                <Tab.Screen
                  name="Settings"
                  component={SettingsScreen}
                  options={{
                    tabBarIcon: () =>
                      Platform.OS === 'ios' ? { sfSymbol: 'gearshape.fill' } : icons!.settings,
                  }}
                />
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
            name="WorkoutForm"
            component={WorkoutFormScreen}
            options={{
              headerShown: false,
              gestureEnabled: false,
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
        <AddSheet ref={addSheetRef} onAddFood={handleAddFood} onAddWorkout={handleAddWorkout} />
        <LoginModal
          visible={showLoginModal}
          defaultConfigId={expiredConfigId}
          onLoginSuccess={() => {
            handleLoginSuccess();
            queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
          }}
          onUseApiKey={(serverUrl, proxyHeaders) => {
            dismissLoginModal();
            setApiKeyUrl(serverUrl);
            setApiKeyValue('');
            setApiKeyProxyHeaders(proxyHeaders);
            setShowApiKeyModal(true);
          }}
          onDismiss={dismissLoginModal}
        />
        <ServerConfigModal
          visible={showApiKeyModal}
          url={apiKeyUrl}
          setUrl={setApiKeyUrl}
          apiKey={apiKeyValue}
          setApiKey={setApiKeyValue}
          proxyHeaders={apiKeyProxyHeaders}
          setProxyHeaders={setApiKeyProxyHeaders}
          isEditing={false}
          onSave={async () => {
            const url = apiKeyUrl.trim().replace(/\/+$/, '');
            if (!url || !apiKeyValue.trim()) {
              Alert.alert('Missing fields', 'Please enter both a server URL and API key.');
              return;
            }
            if (__DEV__ === false && !url.startsWith('https://')) {
              Alert.alert('Insecure URL', 'Please use an HTTPS URL for production.');
              return;
            }
            await saveServerConfig({
              id: Date.now().toString(),
              url,
              apiKey: apiKeyValue.trim(),
              authType: 'apiKey',
              proxyHeaders: apiKeyProxyHeaders,
            });
            setShowApiKeyModal(false);
            dismissLoginModal();
            queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
          }}
          onClose={async () => {
            setShowApiKeyModal(false);
            const config = await getActiveServerConfig();
            if (!config) {
              notifyNoConfigs();
            }
          }}
        />
      </SafeAreaProvider>
    </NavigationContainer>
  );
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
