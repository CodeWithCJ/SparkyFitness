import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SettingsScreen from '../../src/screens/SettingsScreen';
import {
  usePreferences,
  useServerConfigs,
  useServerConnection,
} from '../../src/hooks';
import { loadLastSyncedTime } from '../../src/services/storage';

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');

  return {
    ...actual,
    useFocusEffect: (callback: () => void | (() => void)) => {
      const React = require('react');
      React.useEffect(callback, [callback]);
    },
  };
});

jest.mock('../../src/hooks', () => ({
  queryClient: {
    getQueryCache: () => ({ getAll: () => [] }),
  },
  usePreferences: jest.fn(),
  useServerConfigs: jest.fn(),
  useServerConnection: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  loadLastSyncedTime: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSTabsActive: jest.fn(() => false),
}));

const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockUseServerConfigs = useServerConfigs as jest.MockedFunction<
  typeof useServerConfigs
>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;
const mockLoadLastSyncedTime = loadLastSyncedTime as jest.MockedFunction<
  typeof loadLastSyncedTime
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('SettingsScreen', () => {
  const navigation = { navigate: jest.fn() } as any;
  const route = {
    key: 'Settings-key',
    name: 'Settings' as const,
    params: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseServerConnection.mockReturnValue({
      isConnected: false,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUseServerConfigs.mockReturnValue({
      configs: [],
      activeConfig: null,
      isLoading: false,
      refetch: jest.fn(),
    } as any);
    mockUsePreferences.mockReturnValue({
      preferences: null,
      isLoading: false,
      isError: false,
    } as any);
    mockLoadLastSyncedTime.mockResolvedValue(null);
  });

  it('renders the Saudi Arabic settings journey and opens server settings', async () => {
    const screen = render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <SettingsScreen navigation={navigation} route={route} />
      </SafeAreaProvider>,
    );

    expect(screen.getByText('الإعدادات')).toBeTruthy();
    expect(screen.getByText('الخادم')).toBeTruthy();
    expect(screen.getByText('اضغط لإضافة خادم')).toBeTruthy();
    expect(screen.getByText('مزامنة البيانات الصحية')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('ما سبق زامنت')).toBeTruthy());
    expect(screen.getByText('إعدادات التطبيق')).toBeTruthy();
    expect(screen.getByText('وش الجديد')).toBeTruthy();
    expect(screen.getByText('السجل التقني')).toBeTruthy();
    expect(screen.getByText('مشاركة تقرير التشخيص')).toBeTruthy();

    fireEvent.press(screen.getByText('الخادم'));
    expect(navigation.navigate).toHaveBeenCalledWith('ServerSettings');
  });
});
