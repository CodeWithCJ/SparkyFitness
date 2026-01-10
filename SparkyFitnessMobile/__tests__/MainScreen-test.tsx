import { render, screen } from '@testing-library/react-native';

import MainScreen from '@/src/screens/MainScreen';
import { NavigationContainer } from '@react-navigation/native';
import SettingsScreen from '@/src/screens/SettingsScreen';
import { createStackNavigator } from '@react-navigation/stack';

const Stack = createStackNavigator();

const AppNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={MainScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

describe('<MainScreen />', () => {
  test('renders Open Web Dashboard button', async () => {
    render(<AppNavigator />);
    expect(screen.getByText('Open Web Dashboard')).toBeVisible();
    
  });
});
