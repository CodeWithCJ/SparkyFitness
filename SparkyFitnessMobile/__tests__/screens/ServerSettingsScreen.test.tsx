import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import ServerSettingsScreen from '../../src/screens/ServerSettingsScreen';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  deleteServerConfig,
  getAllServerConfigs,
  setActiveServerConfig,
  type ServerConfig,
} from '../../src/services/storage';
import {
  notifyIdentityChanged,
  notifyNoConfigs,
} from '../../src/services/api/authService';
import { useServerConfigs, useServerConnection } from '../../src/hooks';

const mockGoBack = jest.fn();
const mockNavigation = {
  goBack: mockGoBack,
  navigate: jest.fn(),
  setOptions: jest.fn(),
} as any;
const mockRoute = {
  key: 'server-settings',
  name: 'ServerSettings' as const,
  params: undefined,
};

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

jest.mock('../../src/services/storage', () => ({
  deleteServerConfig: jest.fn().mockResolvedValue(undefined),
  getAllServerConfigs: jest.fn(),
  setActiveServerConfig: jest.fn().mockResolvedValue(undefined),
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/services/api/authService', () => ({
  notifyIdentityChanged: jest.fn(),
  notifyNoConfigs: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockRefetchConnection = jest.fn().mockResolvedValue({ data: true });

jest.mock('../../src/hooks', () => {
  const actualQueryKeys = jest.requireActual('../../src/hooks/queryKeys');
  return {
    useServerConfigs: jest.fn(),
    useServerConnection: jest.fn(),
    serverConfigsQueryKey: actualQueryKeys.serverConfigsQueryKey,
    serverConnectionQueryKey: actualQueryKeys.serverConnectionQueryKey,
  };
});

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const mockRefetchQueries = jest.fn().mockResolvedValue(undefined);
const mockClear = jest.fn();
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
      refetchQueries: mockRefetchQueries,
      clear: mockClear,
    }),
  };
});

const mockUseServerConfigs = useServerConfigs as jest.MockedFunction<
  typeof useServerConfigs
>;
const mockUseServerConnection = useServerConnection as jest.MockedFunction<
  typeof useServerConnection
>;
const mockGetAllServerConfigs = getAllServerConfigs as jest.MockedFunction<
  typeof getAllServerConfigs
>;
const mockSetActiveServerConfig = setActiveServerConfig as jest.MockedFunction<
  typeof setActiveServerConfig
>;
const mockDeleteServerConfig = deleteServerConfig as jest.MockedFunction<
  typeof deleteServerConfig
>;
const mockNotifyNoConfigs = notifyNoConfigs as jest.MockedFunction<
  typeof notifyNoConfigs
>;
const mockNotifyIdentityChanged = notifyIdentityChanged as jest.MockedFunction<
  typeof notifyIdentityChanged
>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const buildConfig = (id: string, url: string): ServerConfig => ({
  id,
  url,
  apiKey: 'k',
});

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={{ insets, frame }}>
      <ServerSettingsScreen navigation={mockNavigation} route={mockRoute} />
    </SafeAreaProvider>
  );

describe('ServerSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(Toast, 'show').mockImplementation(() => {});

    mockUseServerConnection.mockReturnValue({
      isConnected: true,
      isLoading: false,
      isError: false,
      refetch: mockRefetchConnection,
    } as any);
  });

  test('promotes the next config to active when deleting the active server with another present', async () => {
    const active = buildConfig('a', 'https://a.example.com');
    const other = buildConfig('b', 'https://b.example.com');

    mockUseServerConfigs.mockReturnValue({
      allConfigs: [active, other],
      activeConfig: active,
      refetch: jest.fn(),
      isLoading: false,
    });

    // After delete, only `other` remains
    mockGetAllServerConfigs.mockResolvedValue([other]);

    const { getByLabelText } = renderScreen();

    // Tap the active card to open the menu
    fireEvent.press(getByLabelText('Options for https://a.example.com'));

    // Pull the Delete button from the alert and trigger it
    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const deleteButton = alertButtons.find((b: any) => b.text === 'Delete');

    await act(async () => {
      await deleteButton.onPress();
    });

    await waitFor(() => {
      expect(mockDeleteServerConfig).toHaveBeenCalledWith('a');
      expect(mockSetActiveServerConfig).toHaveBeenCalledWith('b');
      expect(mockNotifyNoConfigs).not.toHaveBeenCalled();
      // The app is now on another account, so the caches have to go.
      expect(mockNotifyIdentityChanged).toHaveBeenCalledTimes(1);
    });
  });

  test('does not announce an identity change when deleting a non-active server', async () => {
    const active = buildConfig('a', 'https://a.example.com');
    const other = buildConfig('b', 'https://b.example.com');

    mockUseServerConfigs.mockReturnValue({
      allConfigs: [active, other],
      activeConfig: active,
      refetch: jest.fn(),
      isLoading: false,
    });

    mockGetAllServerConfigs.mockResolvedValue([active]);

    const { getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('Options for https://b.example.com'));

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const deleteButton = alertButtons.find((b: any) => b.text === 'Delete');

    await act(async () => {
      await deleteButton.onPress();
    });

    await waitFor(() => {
      expect(mockDeleteServerConfig).toHaveBeenCalledWith('b');
    });
    expect(mockSetActiveServerConfig).not.toHaveBeenCalled();
    expect(mockNotifyIdentityChanged).not.toHaveBeenCalled();
  });

  test('announces an identity change when activating a different server', async () => {
    const active = buildConfig('a', 'https://a.example.com');
    const other = buildConfig('b', 'https://b.example.com');

    mockUseServerConfigs.mockReturnValue({
      allConfigs: [active, other],
      activeConfig: active,
      refetch: jest.fn(),
      isLoading: false,
    });

    const { getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('Options for https://b.example.com'));

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const setActiveButton = alertButtons.find(
      (b: any) => b.text === 'Set Active'
    );

    await act(async () => {
      await setActiveButton.onPress();
    });

    await waitFor(() => {
      expect(mockSetActiveServerConfig).toHaveBeenCalledWith('b');
      expect(mockNotifyIdentityChanged).toHaveBeenCalledTimes(1);
    });
  });

  test('calls notifyNoConfigs when deleting the last configured server', async () => {
    const only = buildConfig('only', 'https://only.example.com');

    mockUseServerConfigs.mockReturnValue({
      allConfigs: [only],
      activeConfig: only,
      refetch: jest.fn(),
      isLoading: false,
    });

    mockGetAllServerConfigs.mockResolvedValue([]);

    const { getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('Options for https://only.example.com'));
    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const deleteButton = alertButtons.find((b: any) => b.text === 'Delete');

    await act(async () => {
      await deleteButton.onPress();
    });

    await waitFor(() => {
      expect(mockDeleteServerConfig).toHaveBeenCalledWith('only');
      expect(mockSetActiveServerConfig).not.toHaveBeenCalled();
      // Nothing is left to read the caches, but the next server added would.
      expect(mockNotifyIdentityChanged).toHaveBeenCalledTimes(1);
    });

    // The "Success" alert should have buttons; press OK to fire notifyNoConfigs
    const successCall = (Alert.alert as jest.Mock).mock.calls.find(
      (call) => call[0] === 'Success'
    );
    expect(successCall).toBeTruthy();
    const okButton = successCall![2].find((b: any) => b.text === 'OK');
    okButton.onPress();
    expect(mockNotifyNoConfigs).toHaveBeenCalled();
  });

  test('Test Connection toasts success on connected refetch', async () => {
    const active = buildConfig('a', 'https://a.example.com');
    mockUseServerConfigs.mockReturnValue({
      allConfigs: [active],
      activeConfig: active,
      refetch: jest.fn(),
      isLoading: false,
    });
    mockRefetchConnection.mockResolvedValueOnce({ data: true });

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Test Connection'));
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', text1: 'Connected' })
      );
    });
  });

  test('Test Connection toasts failure when refetch returns no data', async () => {
    const active = buildConfig('a', 'https://a.example.com');
    mockUseServerConfigs.mockReturnValue({
      allConfigs: [active],
      activeConfig: active,
      refetch: jest.fn(),
      isLoading: false,
    });
    mockRefetchConnection.mockResolvedValueOnce({ data: false });

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Test Connection'));
    });

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', text1: 'Connection failed' })
      );
    });
  });
  test('provides Polish server translations and interpolates server errors', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('pl');

    expect(i18n.t('serverSettingsUi.activeServer')).toBe('Aktywny serwer');
    expect(i18n.t('serverSettingsUi.openWeb')).toBe('Otwórz WWW');
    expect(i18n.t('serverSettingsUi.testConnection')).toBe(
      'Sprawdź połączenie'
    );
    expect(i18n.t('auth.addServer')).toBe('Dodaj serwer');
    expect(
      i18n.t('serverSettingsUi.setActiveFailed', {
        error: 'timeout',
        defaultValue: 'Failed to set active server configuration: {{error}}',
      })
    ).toBe('Nie udało się ustawić aktywnej konfiguracji serwera: timeout');

    await i18n.changeLanguage('en');
  });
});
