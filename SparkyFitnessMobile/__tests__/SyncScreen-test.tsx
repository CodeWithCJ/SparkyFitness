import { render, screen } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';

import SyncScreen from '@/src/screens/SyncScreen';
import { NavigationContainer } from '@react-navigation/native';
import SettingsScreen from '@/src/screens/SettingsScreen';
import { createStackNavigator } from '@react-navigation/stack';
import { createTestQueryClient } from './hooks/queryTestUtils';

const Stack = createStackNavigator();

const queryClient = createTestQueryClient();

const AppNavigator = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={SyncScreen as React.ComponentType} />
          <Stack.Screen name="Settings" component={SettingsScreen as React.ComponentType} />
        </Stack.Navigator>
      </NavigationContainer>
    </QueryClientProvider>
  );
};

describe('<SyncScreen />', () => {
  afterEach(() => {
    queryClient.clear();
  });

  test('renders Sync Now button', async () => {
    render(<AppNavigator />);
    expect(await screen.findByText('Sync Now')).toBeVisible();
  });
});
