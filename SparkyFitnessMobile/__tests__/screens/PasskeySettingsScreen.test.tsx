import React from 'react';
import { Alert, type AlertButton } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import PasskeySettingsScreen from '../../src/screens/PasskeySettingsScreen';
import {
  getPasskeys,
  addPasskey,
  deletePasskey,
  fetchAuthSettings,
  LoginError,
  setPendingProxyHeaders,
  clearPendingProxyHeaders,
} from '../../src/services/api/authService';
import {
  getActiveServerConfig,
  type ServerConfig,
} from '../../src/services/storage';
import { useServerConfigs } from '../../src/hooks';

jest.mock('../../src/services/api/authService', () => ({
  getPasskeys: jest.fn(),
  addPasskey: jest.fn(),
  deletePasskey: jest.fn(),
  fetchAuthSettings: jest.fn(),
  LoginError: jest.requireActual('../../src/services/api/authErrors')
    .LoginError,
  setPendingProxyHeaders: jest.fn(),
  clearPendingProxyHeaders: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  ...jest.requireActual('../../src/services/storage'),
  getActiveServerConfig: jest.fn(),
}));

jest.mock('../../src/hooks', () => ({
  useServerConfigs: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ReauthModal', () => {
  const { Pressable, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      visible,
      onLoginSuccess,
    }: {
      visible: boolean;
      onLoginSuccess: () => void;
    }) =>
      visible ? (
        <Pressable onPress={onLoginSuccess}>
          <Text>stub-reauth-success</Text>
        </Pressable>
      ) : null,
  };
});

const mockGetPasskeys = getPasskeys as jest.MockedFunction<typeof getPasskeys>;
const mockAddPasskey = addPasskey as jest.MockedFunction<typeof addPasskey>;
const mockDeletePasskey = deletePasskey as jest.MockedFunction<
  typeof deletePasskey
>;
const mockFetchAuthSettings = fetchAuthSettings as jest.MockedFunction<
  typeof fetchAuthSettings
>;
const mockSetPendingProxyHeaders =
  setPendingProxyHeaders as jest.MockedFunction<typeof setPendingProxyHeaders>;
const mockClearPendingProxyHeaders =
  clearPendingProxyHeaders as jest.MockedFunction<
    typeof clearPendingProxyHeaders
  >;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;
const mockUseServerConfigs = useServerConfigs as jest.MockedFunction<
  typeof useServerConfigs
>;

const activeConfig: ServerConfig = {
  id: 'cfg-1',
  url: 'https://my-server.com',
  apiKey: '',
  authType: 'session',
  sessionToken: 'session-token',
  proxyHeaders: [{ name: 'X-Access-Token', value: 'secret' }],
};

const renderScreen = () =>
  render(
    <PasskeySettingsScreen
      navigation={{} as never}
      route={{ key: 'k', name: 'PasskeySettings' } as never}
    />
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockUseServerConfigs.mockReturnValue({ activeConfig } as ReturnType<
    typeof useServerConfigs
  >);
  mockFetchAuthSettings.mockResolvedValue({
    trusted_origin: null,
    email: { enabled: true },
    oidc: { enabled: false, providers: [] },
    signup_disabled: false,
    passkey: { enabled: true },
  });
  mockGetPasskeys.mockResolvedValue([]);
  mockGetActiveServerConfig.mockResolvedValue(activeConfig);
});

describe('PasskeySettingsScreen', () => {
  it('sets and clears the proxy headers around the initial passkey list load', async () => {
    renderScreen();

    await waitFor(() => expect(mockGetPasskeys).toHaveBeenCalled());

    expect(mockSetPendingProxyHeaders).toHaveBeenCalledWith({
      'X-Access-Token': 'secret',
    });
    expect(mockClearPendingProxyHeaders).toHaveBeenCalled();
    const setOrder = mockSetPendingProxyHeaders.mock.invocationCallOrder[0];
    const getOrder = mockGetPasskeys.mock.invocationCallOrder[0];
    const clearOrder = mockClearPendingProxyHeaders.mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(getOrder);
    expect(clearOrder).toBeGreaterThan(getOrder);
  });

  it('sets the proxy headers before adding a passkey and clears them after', async () => {
    mockAddPasskey.mockResolvedValue(undefined);
    const result = renderScreen();

    await waitFor(() => expect(mockGetPasskeys).toHaveBeenCalled());
    mockSetPendingProxyHeaders.mockClear();
    mockClearPendingProxyHeaders.mockClear();

    fireEvent.press(result.getByText('Add Passkey'));
    fireEvent.changeText(
      result.getByPlaceholderText(/e\.g\. (My iPhone|My Android Phone)/),
      'My device'
    );

    await act(async () => {
      fireEvent.press(result.getByText('Continue'));
    });

    expect(mockAddPasskey).toHaveBeenCalledWith(
      'https://my-server.com',
      'session-token',
      'My device'
    );
    expect(mockSetPendingProxyHeaders).toHaveBeenCalledWith({
      'X-Access-Token': 'secret',
    });
    const setOrder = mockSetPendingProxyHeaders.mock.invocationCallOrder[0];
    const addOrder = mockAddPasskey.mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(addOrder);
    expect(mockClearPendingProxyHeaders).toHaveBeenCalled();
  });

  it('retries after reauth using the freshly-read config proxy headers', async () => {
    mockAddPasskey
      .mockRejectedValueOnce(new LoginError('SESSION_NOT_FRESH', 403))
      .mockResolvedValueOnce(undefined);
    const freshConfig: ServerConfig = {
      ...activeConfig,
      sessionToken: 'fresh-token',
      proxyHeaders: [{ name: 'X-Access-Token', value: 'fresh-secret' }],
    };
    mockGetActiveServerConfig.mockResolvedValue(freshConfig);

    const result = renderScreen();
    await waitFor(() => expect(mockGetPasskeys).toHaveBeenCalled());

    fireEvent.press(result.getByText('Add Passkey'));
    fireEvent.changeText(
      result.getByPlaceholderText(/e\.g\. (My iPhone|My Android Phone)/),
      'My device'
    );

    await act(async () => {
      fireEvent.press(result.getByText('Continue'));
    });

    await waitFor(() =>
      expect(result.getByText('stub-reauth-success')).toBeTruthy()
    );
    mockSetPendingProxyHeaders.mockClear();

    await act(async () => {
      fireEvent.press(result.getByText('stub-reauth-success'));
    });

    expect(mockAddPasskey).toHaveBeenLastCalledWith(
      'https://my-server.com',
      'fresh-token',
      'My device'
    );
    expect(mockSetPendingProxyHeaders).toHaveBeenCalledWith({
      'X-Access-Token': 'fresh-secret',
    });
  });

  it('sets and clears the proxy headers around deleting a passkey', async () => {
    mockGetPasskeys.mockResolvedValue([
      { id: 'pk-1', name: 'My device', createdAt: new Date().toISOString() },
    ]);
    mockDeletePasskey.mockResolvedValue(undefined);
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);

    const result = renderScreen();
    await waitFor(() => expect(mockGetPasskeys).toHaveBeenCalled());
    mockSetPendingProxyHeaders.mockClear();
    mockClearPendingProxyHeaders.mockClear();

    fireEvent.press(result.getByLabelText('Delete passkey'));
    const buttons = alertSpy.mock.calls[0][2] as AlertButton[];

    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });

    expect(mockDeletePasskey).toHaveBeenCalledWith(
      'https://my-server.com',
      'session-token',
      'pk-1'
    );
    expect(mockSetPendingProxyHeaders).toHaveBeenCalledWith({
      'X-Access-Token': 'secret',
    });
    const setOrder = mockSetPendingProxyHeaders.mock.invocationCallOrder[0];
    const deleteOrder = mockDeletePasskey.mock.invocationCallOrder[0];
    expect(setOrder).toBeLessThan(deleteOrder);
    expect(mockClearPendingProxyHeaders).toHaveBeenCalled();

    alertSpy.mockRestore();
  });
});
