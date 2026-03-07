import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import LoginModal from '../../src/components/LoginModal';
import {
  login,
  LoginError,
  clearAuthCookies,
  fetchMfaFactors,
  verifyTotp,
  sendEmailOtp,
  verifyEmailOtp,
} from '../../src/services/api/authService';
import {
  getAllServerConfigs,
  getActiveServerConfig,
  saveServerConfig,
  type ServerConfig,
} from '../../src/services/storage';

jest.mock('../../src/services/api/authService', () => ({
  login: jest.fn(),
  LoginError: jest.requireActual('../../src/services/api/authService').LoginError,
  clearAuthCookies: jest.fn().mockResolvedValue(undefined),
  fetchMfaFactors: jest.fn(),
  verifyTotp: jest.fn(),
  sendEmailOtp: jest.fn(),
  verifyEmailOtp: jest.fn(),
  setPendingProxyHeaders: jest.fn(),
  clearPendingProxyHeaders: jest.fn(),
}));

jest.mock('../../src/services/storage', () => ({
  getAllServerConfigs: jest.fn(),
  getActiveServerConfig: jest.fn(),
  saveServerConfig: jest.fn().mockResolvedValue(undefined),
  proxyHeadersToRecord: jest.requireActual('../../src/services/storage').proxyHeadersToRecord,
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID={`icon-${props.name}`} />,
  };
});

const mockLogin = login as jest.MockedFunction<typeof login>;
const mockClearAuthCookies = clearAuthCookies as jest.MockedFunction<typeof clearAuthCookies>;
const mockFetchMfaFactors = fetchMfaFactors as jest.MockedFunction<typeof fetchMfaFactors>;
const mockVerifyTotp = verifyTotp as jest.MockedFunction<typeof verifyTotp>;
const mockSendEmailOtp = sendEmailOtp as jest.MockedFunction<typeof sendEmailOtp>;
const mockVerifyEmailOtp = verifyEmailOtp as jest.MockedFunction<typeof verifyEmailOtp>;
const mockGetAllServerConfigs = getAllServerConfigs as jest.MockedFunction<typeof getAllServerConfigs>;
const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<typeof getActiveServerConfig>;
const mockSaveServerConfig = saveServerConfig as jest.MockedFunction<typeof saveServerConfig>;

const defaultProps = {
  visible: true,
  onLoginSuccess: jest.fn(),
  onUseApiKey: jest.fn(),
  onDismiss: jest.fn(),
};

const existingConfig: ServerConfig = {
  id: 'cfg-1',
  url: 'https://existing-server.com',
  apiKey: 'key-1',
  authType: 'session' as const,
  sessionToken: 'old-token',
};

function renderModal(props: Partial<React.ComponentProps<typeof LoginModal>> = {}) {
  return render(<LoginModal {...defaultProps} {...props} />);
}

/** Wait for the credentials form to be ready, then return a press helper for the Sign In button. */
async function waitForCredentialsForm(result: ReturnType<typeof renderModal>) {
  await waitFor(() =>
    expect(result.getByPlaceholderText('email@example.com')).toBeTruthy(),
  );
}

/** Press the "Sign In" button (the second element — the first is the heading). */
function pressSignInButton(result: ReturnType<typeof renderModal>) {
  const buttons = result.getAllByText('Sign In');
  fireEvent.press(buttons[buttons.length - 1]);
}

describe('LoginModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllServerConfigs.mockResolvedValue([]);
    mockGetActiveServerConfig.mockResolvedValue(null);
    mockClearAuthCookies.mockResolvedValue(undefined);
    mockSaveServerConfig.mockResolvedValue(undefined);
  });

  describe('credentials form', () => {
    it('renders the sign-in form with server URL input when no existing configs', async () => {
      const result = renderModal();
      await waitForCredentialsForm(result);

      expect(result.getByPlaceholderText('https://your-server-url.com')).toBeTruthy();
      expect(result.getByPlaceholderText('Password')).toBeTruthy();
      expect(result.getByText('Use API Key Instead')).toBeTruthy();
    });

    it('shows server selection when existing configs are present', async () => {
      mockGetAllServerConfigs.mockResolvedValue([existingConfig]);
      mockGetActiveServerConfig.mockResolvedValue(existingConfig);

      const { getByText, queryByPlaceholderText } = renderModal();

      await waitFor(() => {
        expect(getByText('https://existing-server.com')).toBeTruthy();
      });
      expect(queryByPlaceholderText('https://your-server-url.com')).toBeNull();
      expect(getByText('Later')).toBeTruthy();
    });

    it('selects config matching defaultConfigId', async () => {
      const config2: ServerConfig = {
        id: 'cfg-2',
        url: 'https://second-server.com',
        apiKey: 'key-2',
      };
      mockGetAllServerConfigs.mockResolvedValue([existingConfig, config2]);
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'tok',
        user: { email: 'a@b.com' },
      });

      const result = renderModal({ defaultConfigId: 'cfg-2' });

      await waitFor(() => {
        expect(result.getByText('https://second-server.com')).toBeTruthy();
      });

      // The radio-button-on icon should appear for the selected config (cfg-2),
      // while cfg-1 should show radio-button-off
      const radioOn = result.getAllByTestId('icon-radio-button-on');
      const radioOff = result.getAllByTestId('icon-radio-button-off');
      expect(radioOn).toHaveLength(1);
      expect(radioOff).toHaveLength(1);

      // Submitting should use the selected config's URL
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });

      expect(mockLogin).toHaveBeenCalledWith(
        'https://second-server.com',
        'a@b.com',
        'pass',
      );
    });

    it('does not show Later button when there are no existing configs', async () => {
      const result = renderModal();
      await waitForCredentialsForm(result);

      expect(result.queryByText('Later')).toBeNull();
    });
  });

  describe('validation', () => {
    it('shows error when server URL is empty', async () => {
      const result = renderModal();
      await waitForCredentialsForm(result);

      await act(async () => {
        pressSignInButton(result);
      });

      expect(result.getByText('Please enter a server URL.')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when email is empty', async () => {
      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );

      await act(async () => {
        pressSignInButton(result);
      });

      expect(result.getByText('Please enter your email.')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when password is empty', async () => {
      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(
        result.getByPlaceholderText('email@example.com'),
        'user@example.com',
      );

      await act(async () => {
        pressSignInButton(result);
      });

      expect(result.getByText('Please enter your password.')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('successful login', () => {
    it('calls login, saves config, and calls onLoginSuccess', async () => {
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'new-session-token',
        user: { email: 'user@example.com' },
      });

      const onLoginSuccess = jest.fn();
      const result = renderModal({ onLoginSuccess });
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(
        result.getByPlaceholderText('email@example.com'),
        'user@example.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'password123');

      await act(async () => {
        pressSignInButton(result);
      });

      expect(mockLogin).toHaveBeenCalledWith(
        'https://my-server.com',
        'user@example.com',
        'password123',
      );
      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://my-server.com',
          authType: 'session',
          sessionToken: 'new-session-token',
        }),
      );
      expect(onLoginSuccess).toHaveBeenCalled();
    });

    it('strips trailing slash from server URL when saving new config', async () => {
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'tok',
        user: { email: 'a@b.com' },
      });

      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com/',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });

      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://my-server.com' }),
      );
    });

    it('updates existing config when a server is selected', async () => {
      mockGetAllServerConfigs.mockResolvedValue([existingConfig]);
      mockGetActiveServerConfig.mockResolvedValue(existingConfig);
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'new-token',
        user: { email: 'user@example.com' },
      });

      const onLoginSuccess = jest.fn();
      const result = renderModal({ onLoginSuccess });

      await waitFor(() =>
        expect(result.getByText('https://existing-server.com')).toBeTruthy(),
      );

      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'user@example.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });

      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cfg-1',
          url: 'https://existing-server.com',
          authType: 'session',
          sessionToken: 'new-token',
        }),
      );
      expect(onLoginSuccess).toHaveBeenCalled();
    });
  });

  describe('login errors', () => {
    it('displays LoginError message', async () => {
      mockLogin.mockRejectedValue(new LoginError('Invalid credentials', 401));

      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrong');

      await act(async () => {
        pressSignInButton(result);
      });

      expect(result.getByText('Invalid credentials')).toBeTruthy();
    });

    it('displays generic error for non-LoginError exceptions', async () => {
      mockLogin.mockRejectedValue(new Error('Network error'));

      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });

      expect(
        result.getByText('Could not connect to server. Check the URL and try again.'),
      ).toBeTruthy();
    });
  });

  describe('MFA flow', () => {
    async function navigateToMfa(
      result: ReturnType<typeof renderModal>,
      factors = { mfaTotpEnabled: true, mfaEmailEnabled: false },
    ) {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockResolvedValue(factors);

      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'user@test.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });
    }

    it('transitions to MFA form when login returns mfa_required', async () => {
      const result = renderModal();
      await navigateToMfa(result);

      expect(result.getByText('Two-Factor Authentication')).toBeTruthy();
      expect(
        result.getByText('Enter the code from your authenticator app.'),
      ).toBeTruthy();
    });

    it('verifies TOTP code and completes login', async () => {
      mockVerifyTotp.mockResolvedValue({
        sessionToken: 'mfa-token',
        user: { email: 'user@test.com' },
      });

      const onLoginSuccess = jest.fn();
      const result = renderModal({ onLoginSuccess });
      await navigateToMfa(result);

      fireEvent.changeText(result.getByPlaceholderText('000000'), '123456');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

      expect(mockVerifyTotp).toHaveBeenCalledWith('https://my-server.com', '123456');
      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          authType: 'session',
          sessionToken: 'mfa-token',
        }),
      );
      expect(onLoginSuccess).toHaveBeenCalled();
    });

    it('shows method toggle when both TOTP and email are enabled', async () => {
      const result = renderModal();
      await navigateToMfa(result, {
        mfaTotpEnabled: true,
        mfaEmailEnabled: true,
      });

      expect(result.getByText('Authenticator App')).toBeTruthy();
      expect(result.getByText('Email Code')).toBeTruthy();
    });

    it('handles email OTP flow: send code then verify', async () => {
      mockSendEmailOtp.mockResolvedValue(undefined);
      mockVerifyEmailOtp.mockResolvedValue({
        sessionToken: 'email-mfa-token',
        user: { email: 'user@test.com' },
      });

      const onLoginSuccess = jest.fn();
      const result = renderModal({ onLoginSuccess });
      await navigateToMfa(result, {
        mfaTotpEnabled: true,
        mfaEmailEnabled: true,
      });

      // Switch to email method
      await act(async () => {
        fireEvent.press(result.getByText('Email Code'));
      });

      expect(
        result.getByText(
          'Tap the button below to receive a verification code by email.',
        ),
      ).toBeTruthy();

      // Send code
      await act(async () => {
        fireEvent.press(result.getByText('Send Code'));
      });

      expect(mockSendEmailOtp).toHaveBeenCalled();
      expect(result.getByText('Enter the code sent to your email.')).toBeTruthy();
      expect(result.getByText('Resend Code')).toBeTruthy();

      // Enter and verify code
      fireEvent.changeText(result.getByPlaceholderText('000000'), '654321');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

      expect(mockVerifyEmailOtp).toHaveBeenCalledWith(
        'https://my-server.com',
        '654321',
      );
      expect(onLoginSuccess).toHaveBeenCalled();
    });

    it('navigates back to credentials from MFA and clears cookies', async () => {
      const result = renderModal();
      await navigateToMfa(result);

      expect(result.getByText('Two-Factor Authentication')).toBeTruthy();

      await act(async () => {
        fireEvent.press(result.getByText('Back'));
      });

      expect(mockClearAuthCookies).toHaveBeenCalled();
      // After going back, the heading should revert to "Sign In"
      expect(result.getAllByText('Sign In').length).toBeGreaterThan(0);
    });
  });

  describe('MFA error handling', () => {
    async function setupMfaForm(result: ReturnType<typeof renderModal>) {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockResolvedValue({
        mfaTotpEnabled: true,
        mfaEmailEnabled: false,
      });

      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });
    }

    it('shows invalid code error', async () => {
      mockVerifyTotp.mockRejectedValue(
        new LoginError('invalid code', 400),
      );

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('000000'), '000000');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

      expect(
        result.getByText('Invalid verification code. Please try again.'),
      ).toBeTruthy();
    });

    it('shows rate limit error on 429', async () => {
      mockVerifyTotp.mockRejectedValue(new LoginError('Too many', 429));

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('000000'), '111111');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

      expect(
        result.getByText('Too many attempts. Please wait a moment and try again.'),
      ).toBeTruthy();
    });

    it('returns to credentials on expired session', async () => {
      mockVerifyTotp.mockRejectedValue(
        new LoginError('INVALID_TWO_FACTOR_COOKIE', 401),
      );

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('000000'), '222222');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

      // Should navigate back to credentials form
      await waitFor(() => {
        expect(result.getByPlaceholderText('email@example.com')).toBeTruthy();
      });
    });

    it('shows generic error for non-LoginError MFA failures', async () => {
      mockVerifyTotp.mockRejectedValue(new Error('Network error'));

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('000000'), '333333');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

      expect(
        result.getByText('Verification failed. Please try again.'),
      ).toBeTruthy();
    });

    it('shows error when send email OTP fails', async () => {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockResolvedValue({
        mfaTotpEnabled: false,
        mfaEmailEnabled: true,
      });
      mockSendEmailOtp.mockRejectedValue(
        new LoginError('Email send failed', 500),
      );

      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });

      // Should default to email since totp is disabled
      await act(async () => {
        fireEvent.press(result.getByText('Send Code'));
      });

      expect(result.getByText('Email send failed')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('calls onUseApiKey with current URL from credentials form', async () => {
      const onUseApiKey = jest.fn();
      const result = renderModal({ onUseApiKey });
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );

      fireEvent.press(result.getAllByText('Use API Key Instead')[0]);

      expect(onUseApiKey).toHaveBeenCalledWith('https://my-server.com', []);
    });

    it('calls onDismiss when Later is pressed', async () => {
      mockGetAllServerConfigs.mockResolvedValue([existingConfig]);
      mockGetActiveServerConfig.mockResolvedValue(existingConfig);

      const onDismiss = jest.fn();
      const { getByText } = renderModal({ onDismiss });

      await waitFor(() =>
        expect(getByText('https://existing-server.com')).toBeTruthy(),
      );

      fireEvent.press(getByText('Later'));

      expect(onDismiss).toHaveBeenCalled();
    });

    it('calls onUseApiKey from MFA form', async () => {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockResolvedValue({
        mfaTotpEnabled: true,
        mfaEmailEnabled: false,
      });

      const onUseApiKey = jest.fn();
      const result = renderModal({ onUseApiKey });
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });

      // Verify we're on the MFA screen before tapping Use API Key
      expect(result.getByText('Two-Factor Authentication')).toBeTruthy();

      fireEvent.press(result.getAllByText('Use API Key Instead')[0]);

      expect(onUseApiKey).toHaveBeenCalledWith('https://my-server.com', []);
    });

    it('does not reuse stale local proxy headers for saved configs', async () => {
      const onUseApiKey = jest.fn();
      const result = renderModal({ onUseApiKey });
      await waitForCredentialsForm(result);

      fireEvent.press(result.getByText('Proxy Headers'));
      fireEvent.changeText(
        result.getByPlaceholderText('Header name (e.g. X-Access-Token)'),
        'X-Proxy-Token',
      );
      fireEvent.changeText(result.getByPlaceholderText('Header value'), 'secret-token');
      fireEvent.press(result.getByText('Save'));

      result.rerender(<LoginModal {...defaultProps} onUseApiKey={onUseApiKey} visible={false} />);

      mockGetAllServerConfigs.mockResolvedValue([existingConfig]);
      mockGetActiveServerConfig.mockResolvedValue(existingConfig);

      result.rerender(<LoginModal {...defaultProps} onUseApiKey={onUseApiKey} visible={true} />);

      await waitFor(() =>
        expect(result.getByText('https://existing-server.com')).toBeTruthy(),
      );

      fireEvent.press(result.getAllByText('Use API Key Instead')[0]);

      expect(onUseApiKey).toHaveBeenCalledWith('https://existing-server.com', []);
    });
  });

  describe('state reset', () => {
    it('resets form state when modal becomes visible', async () => {
      mockLogin.mockRejectedValueOnce(new LoginError('Bad', 401));

      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrong');

      await act(async () => {
        pressSignInButton(result);
      });

      expect(result.getByText('Bad')).toBeTruthy();

      // Hide and re-show modal
      result.rerender(<LoginModal {...defaultProps} visible={false} />);
      result.rerender(<LoginModal {...defaultProps} visible={true} />);

      await waitFor(() => {
        expect(result.getByPlaceholderText('email@example.com').props.value).toBe('');
        expect(result.getByPlaceholderText('Password').props.value).toBe('');
      });
    });
  });

  describe('fetchMfaFactors fallback', () => {
    it('defaults to TOTP when fetchMfaFactors fails', async () => {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockRejectedValue(new Error('Failed'));

      const result = renderModal();
      await waitForCredentialsForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressSignInButton(result);
      });

      // Should show TOTP instructions (fallback)
      expect(
        result.getByText('Enter the code from your authenticator app.'),
      ).toBeTruthy();
    });
  });
});
