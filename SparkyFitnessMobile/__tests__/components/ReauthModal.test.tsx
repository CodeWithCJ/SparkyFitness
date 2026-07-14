import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ReauthModal from '../../src/components/ReauthModal';
import {
  fetchAuthSettings,
  loginWithOidc,
  type AuthSettings,
} from '../../src/services/api/authService';
import {
  getAllServerConfigs,
  saveServerConfig,
  type ServerConfig,
} from '../../src/services/storage';

jest.mock('../../src/services/api/authService', () => ({
  login: jest.fn(),
  LoginError: jest.requireActual('../../src/services/api/authErrors').LoginError,
  clearAuthCookies: jest.fn().mockResolvedValue(undefined),
  fetchMfaFactors: jest.fn(),
  verifyTotp: jest.fn(),
  sendEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
  setPendingProxyHeaders: jest.fn(),
  clearPendingProxyHeaders: jest.fn(),
  fetchAuthSettings: jest.fn(),
  loginWithOidc: jest.fn(),
  loginWithPasskey: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  getAllServerConfigs: jest.fn(),
  saveServerConfig: jest.fn().mockResolvedValue(undefined),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID={`icon-${props.name}`} />,
  };
});

const mockFetchAuthSettings = fetchAuthSettings as jest.MockedFunction<typeof fetchAuthSettings>;
const mockLoginWithOidc = loginWithOidc as jest.MockedFunction<typeof loginWithOidc>;
const mockGetAllServerConfigs = getAllServerConfigs as jest.MockedFunction<typeof getAllServerConfigs>;
const mockSaveServerConfig = saveServerConfig as jest.MockedFunction<typeof saveServerConfig>;

const sessionConfig: ServerConfig = {
  id: 'config-1',
  url: 'https://my-server.com',
  apiKey: '',
  authType: 'session',
  sessionToken: 'expired-token',
};

const emailAuthSettings: AuthSettings = {
  trusted_origin: null,
  email: { enabled: true },
  oidc: { enabled: false, providers: [] },
  signup_disabled: false,
};

const oidcAuthSettings: AuthSettings = {
  ...emailAuthSettings,
  oidc: {
    enabled: true,
    providers: [{ id: 'google', display_name: 'Sign in with Google' }],
  },
};

const defaultProps = {
  visible: true,
  expiredConfigId: 'config-1',
  onLoginSuccess: jest.fn(),
  onSwitchToApiKey: jest.fn(),
  onDismiss: jest.fn(),
};

function renderModal(props: Partial<React.ComponentProps<typeof ReauthModal>> = {}) {
  return render(<ReauthModal {...defaultProps} {...props} />);
}

/** Flushes the config load and the auth-settings fetch it triggers. */
async function flushAsync() {
  await act(async () => {});
}

describe('ReauthModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllServerConfigs.mockResolvedValue([sessionConfig]);
    mockFetchAuthSettings.mockResolvedValue(emailAuthSettings);
    mockSaveServerConfig.mockResolvedValue(undefined);
  });

  it('shows email fields, passkey, and Sign In for an email-enabled server', async () => {
    const result = renderModal();
    await flushAsync();

    expect(result.getByPlaceholderText('email@example.com')).toBeTruthy();
    expect(result.getByPlaceholderText('Password')).toBeTruthy();
    expect(result.getByText('Sign In')).toBeTruthy();
    expect(result.getByText('Sign in with Passkey')).toBeTruthy();
    expect(result.queryByText('Or sign in with')).toBeNull();
  });

  it('shows OIDC provider buttons from the server auth settings', async () => {
    mockFetchAuthSettings.mockResolvedValue(oidcAuthSettings);

    const result = renderModal();
    await flushAsync();

    expect(result.getByText('Or sign in with')).toBeTruthy();
    expect(result.getByText('Sign in with Google')).toBeTruthy();
  });

  it('signs in via an OIDC provider and saves the refreshed session', async () => {
    mockFetchAuthSettings.mockResolvedValue(oidcAuthSettings);
    mockLoginWithOidc.mockResolvedValue({ type: 'success', sessionToken: 'fresh-token' });
    const onLoginSuccess = jest.fn();

    const result = renderModal({ onLoginSuccess });
    await flushAsync();

    await act(async () => {
      fireEvent.press(result.getByText('Sign in with Google'));
    });

    expect(mockLoginWithOidc).toHaveBeenCalledWith('https://my-server.com', 'google');
    expect(mockSaveServerConfig).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'config-1', sessionToken: 'fresh-token' }),
    );
    expect(onLoginSuccess).toHaveBeenCalled();
  });

  it('hides email fields and Sign In when the server disables email auth', async () => {
    mockFetchAuthSettings.mockResolvedValue({
      ...oidcAuthSettings,
      email: { enabled: false },
    });

    const result = renderModal();
    await flushAsync();

    expect(result.queryByPlaceholderText('email@example.com')).toBeNull();
    expect(result.queryByText('Sign In')).toBeNull();
    expect(result.getByText('Sign in with Google')).toBeTruthy();
    expect(result.getByText('Sign in with Passkey')).toBeTruthy();
  });

  it('falls back to email fields when the settings fetch fails', async () => {
    mockFetchAuthSettings.mockRejectedValue(new Error('network'));

    const result = renderModal();
    await flushAsync();

    expect(result.getByPlaceholderText('email@example.com')).toBeTruthy();
    expect(result.getByText('Sign In')).toBeTruthy();
  });

  it('calls onSwitchToApiKey with the selected config', async () => {
    const onSwitchToApiKey = jest.fn();
    const result = renderModal({ onSwitchToApiKey });
    await flushAsync();

    fireEvent.press(result.getByText('Use API Key Instead'));

    expect(onSwitchToApiKey).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'config-1' }),
    );
  });

  it('calls onDismiss when the close button is pressed', async () => {
    const onDismiss = jest.fn();
    const result = renderModal({ onDismiss });
    await flushAsync();

    fireEvent.press(result.getByLabelText('Close'));

    expect(onDismiss).toHaveBeenCalled();
  });
});
