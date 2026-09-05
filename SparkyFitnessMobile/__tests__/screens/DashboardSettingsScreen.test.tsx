import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DashboardSettingsScreen from '../../src/screens/DashboardSettingsScreen';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks', () => ({
  useServerConnection: jest.fn(() => ({
    isConnected: false,
    isLoading: false,
  })),
  useCustomNutrients: jest.fn(() => ({
    customNutrients: [],
    isLoading: false,
  })),
  useNutrientDisplayPreferences: jest.fn(() => ({
    preferences: [],
    isLoading: false,
  })),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const renderScreen = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ frame, insets }}>
        <DashboardSettingsScreen
          {...({ navigation, route: { params: {} } } as never)}
        />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

describe('DashboardSettingsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders a Health Trends row', () => {
    const { getByTestId, getByText } = renderScreen();

    expect(getByTestId('dashboard-settings-health-trends')).toBeTruthy();
    expect(getByText('Health Trends')).toBeTruthy();
  });

  test('the Health Trends row navigates to the Health Trends settings screen', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('dashboard-settings-health-trends'));

    expect(navigation.navigate).toHaveBeenCalledWith('HealthTrendsSettings');
  });
});
