import React, { useEffect, useState } from 'react';
import { StatusBar, Platform, type ImageSourcePropType } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
} from '@react-navigation/native';

import AsyncStorage from '@react-native-async-storage/async-storage';

import MainScreen from './src/screens/MainScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LogScreen from './src/screens/LogScreen';
import { configureBackgroundSync } from './src/services/backgroundSyncService';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';


const Tab = createNativeBottomTabNavigator();

type TabIcons = {
  home: ImageSourcePropType;
  settings: ImageSourcePropType;
  document: ImageSourcePropType;
};

function AppContent() {
  const { isDarkMode } = useTheme();
  const [icons, setIcons] = useState<TabIcons | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      Promise.all([
        Ionicons.getImageSource('home', 24, '#999999'),
        Ionicons.getImageSource('settings', 24, '#999999'),
        Ionicons.getImageSource('document-text', 24, '#999999'),
      ]).then(([home, settings, document]) => {
        if (home && settings && document) {
          setIcons({ home, settings, document });
        }
      });
    }
  }, []);

  useEffect(() => {
    // Reset the auto-open flag on every app start
    const initializeApp = async () => {
      // Remove the flag so the dashboard will auto-open on first MainScreen visit
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
    <NavigationContainer theme={isDarkMode ? DarkTheme : DefaultTheme}>
      <SafeAreaProvider>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <Tab.Navigator initialRouteName="Main">
          <Tab.Screen
            name="Main"
            component={MainScreen}
            options={{
              tabBarIcon: () =>
                Platform.OS === 'ios' ? { sfSymbol: 'house' } : icons!.home,
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              tabBarIcon: () =>
                Platform.OS === 'ios' ? { sfSymbol: 'gear' } : icons!.settings,
            }}
          />
          <Tab.Screen
            name="Logs"
            component={LogScreen}
            options={{
              tabBarIcon: () =>
                Platform.OS === 'ios' ? { sfSymbol: 'document' } : icons!.document,
            }}
          />
        </Tab.Navigator>

      </SafeAreaProvider>
    </NavigationContainer>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
