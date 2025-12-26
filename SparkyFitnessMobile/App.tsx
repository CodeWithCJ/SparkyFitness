import React, { useEffect } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import MainScreen from './src/screens/MainScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LogScreen from './src/screens/LogScreen';
import { configureBackgroundSync } from './src/services/backgroundSyncService';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
const Stack = createStackNavigator();

function AppContent() {
  const { isDarkMode } = useTheme();

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

  return (
    <NavigationContainer theme={isDarkMode ? DarkTheme : DefaultTheme}>
      <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <Stack.Navigator initialRouteName="Main">
        <Stack.Screen name="Main" component={MainScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Logs" component={LogScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
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

const styles = StyleSheet.create({
  // No specific styles needed here as screens will define their own
});

export default App;
