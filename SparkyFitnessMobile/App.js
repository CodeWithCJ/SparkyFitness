import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import MainScreen from './src/screens/MainScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import LogScreen from './src/screens/LogScreen';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { configureBackgroundSync } from './src/services/backgroundSyncService';
import { Platform } from 'react-native';

const Stack = createStackNavigator();

const App = () => {
  useEffect(() => {
    const initBackgroundFetch = async () => {
      await configureBackgroundSync();
    };
    initBackgroundFetch();
  }, []);

  return (
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Main">
          <Stack.Screen name="Main" component={MainScreen} options={{ title: 'SparkyFitness' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
          <Stack.Screen name="Logs" component={LogScreen} options={{ title: 'Logs' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
};

export default App;