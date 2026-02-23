import './global.css'
import React, { useEffect, useState } from 'react';
import { StatusBar, Platform, type ImageSourcePropType } from 'react-native';
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
import { queryClient } from './src/hooks';

import { createStackNavigator } from '@react-navigation/stack';
import SyncScreen from './src/screens/SyncScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import DiaryScreen from './src/screens/DiaryScreen';
import LogScreen from './src/screens/LogScreen';
import AddFoodEntryScreen from './src/screens/AddFoodEntryScreen';
import FoodItemInfoScreen from './src/screens/FoodItemInfoScreen';
import { configureBackgroundSync } from './src/services/backgroundSyncService';
import { initializeTheme } from './src/services/themeService';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';

const Tab = createNativeBottomTabNavigator();
const Stack = createStackNavigator();

type TabIcons = {
  sync: ImageSourcePropType;
  dashboard: ImageSourcePropType;
  book: ImageSourcePropType;
  settings: ImageSourcePropType;
  add: ImageSourcePropType;
};

function AppContent() {
  const { theme } = useUniwind();
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

  // Create navigation theme that matches app colors
  const navigationTheme: Theme = {
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
  };

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      Promise.all([
        Ionicons.getImageSource('sync', 24, '#999999'),
        Ionicons.getImageSource('grid', 24, '#999999'),
        Ionicons.getImageSource('book', 24, '#999999'),
        Ionicons.getImageSource('settings', 24, '#999999'),
        Ionicons.getImageSource('add-circle', 24, '#999999'),
      ]).then(([sync, dashboard, book, settings, add]) => {
        if (sync && dashboard && book && settings && add) {
          setIcons({ sync, dashboard, book, settings, add });
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

    // Configure background sync without blocking app startup
    configureBackgroundSync().catch(error => {
      console.error('[App] Failed to configure background sync:', error);
    });
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
                      navigation.navigate('AddFoodEntry');
                    },
                  })}
                />
                <Tab.Screen
                  name="Sync"
                  component={SyncScreen}
                  options={{
                    tabBarIcon: () =>
                      Platform.OS === 'ios' ? { sfSymbol: 'arrow.triangle.2.circlepath' } : icons!.sync,
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
            name="AddFoodEntry"
            component={AddFoodEntryScreen}
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="FoodItemInfo"
            component={FoodItemInfoScreen}
            options={{ headerShown: false }}
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
        </Stack.Navigator>
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
