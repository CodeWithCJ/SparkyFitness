import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ServerConfigModal from '../../src/components/ServerConfigModal';
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
  saveServerConfig,
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

const mockLogin = login as jest.MockedFunction<typeof login>;
const mockClearAuthCookies = clearAuthCookies as jest.MockedFunction<typeof clearAuthCookies>;
const mockFetchMfaFactors = fetchMfaFactors as jest.MockedFunction<typeof fetchMfaFactors>;
const mockVerifyTotp = verifyTotp as jest.MockedFunction<typeof verifyTotp>;
const mockSendEmailOtp = sendEmailOtp as jest.MockedFunction<typeof sendEmailOtp>;
const mockVerifyEmailOtp = verifyEmailOtp as jest.MockedFunction<typeof verifyEmailOtp>;
const mockSaveServerConfig = saveServerConfig as jest.MockedFunction<typeof saveServerConfig>;

const defaultProps = {
  visible: true,
  editingConfig: null,
  onSuccess: jest.fn(),
  onDismiss: jest.fn(),
};

function renderModal(props: Partial<React.ComponentProps<typeof ServerConfigModal>> = {}) {
  return render(<ServerConfigModal {...defaultProps} {...props} />);
}

async function waitForForm(result: ReturnType<typeof renderModal>) {
  await waitFor(() =>
    expect(result.getByPlaceholderText('https://your-server-url.com')).toBeTruthy(),
  );
}

function pressConnectButton(result: ReturnType<typeof renderModal>) {
  fireEvent.press(result.getByText('Connect'));
}

describe('ServerConfigModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClearAuthCookies.mockResolvedValue(undefined);
    mockSaveServerConfig.mockResolvedValue(undefined);
  });

  describe('form rendering', () => {
    it('renders the form with URL input and Sign In tab by default', async () => {
      const result = renderModal();
      await waitForForm(result);

      expect(result.getByPlaceholderText('https://your-server-url.com')).toBeTruthy();
      expect(result.getByPlaceholderText('email@example.com')).toBeTruthy();
      expect(result.getByPlaceholderText('Password')).toBeTruthy();
      expect(result.getByText('Sign In')).toBeTruthy();
      expect(result.getByText('API Key')).toBeTruthy();
      expect(result.getByText('Connect')).toBeTruthy();
      expect(result.getByText('Cancel')).toBeTruthy();
    });

    it('shows API key field when API Key tab is selected', async () => {
      const result = renderModal();
      await waitForForm(result);

      fireEvent.press(result.getByText('API Key'));

      expect(result.getByPlaceholderText('Uds3d8i...')).toBeTruthy();
      expect(result.queryByPlaceholderText('email@example.com')).toBeNull();
      expect(result.queryByPlaceholderText('Password')).toBeNull();
    });

    it('shows Add Server title when no editing config', async () => {
      const result = renderModal();
      await waitForForm(result);

      expect(result.getByText('Add Server')).toBeTruthy();
    });

    it('shows Edit Server title when editing config', async () => {
      const result = renderModal({
        editingConfig: {
          id: 'cfg-1',
          url: 'https://example.com',
          apiKey: 'key-1',
          authType: 'apiKey',
        },
      });
      await waitForForm(result);

      expect(result.getByText('Edit Server')).toBeTruthy();
    });

    it('pre-fills URL and defaults to API Key tab when editing an API key config', async () => {
      const result = renderModal({
        editingConfig: {
          id: 'cfg-1',
          url: 'https://example.com',
          apiKey: 'my-key',
          authType: 'apiKey',
        },
      });
      await waitForForm(result);

      expect(result.getByDisplayValue('https://example.com')).toBeTruthy();
      // API Key tab should be active, so API key field is shown
      expect(result.getByPlaceholderText('Uds3d8i...')).toBeTruthy();
    });

    it('pre-fills URL and defaults to Sign In tab when editing a session config', async () => {
      const result = renderModal({
        editingConfig: {
          id: 'cfg-1',
          url: 'https://example.com',
          apiKey: '',
          authType: 'session',
          sessionToken: 'tok',
        },
      });
      await waitForForm(result);

      expect(result.getByDisplayValue('https://example.com')).toBeTruthy();
      expect(result.getByPlaceholderText('email@example.com')).toBeTruthy();
    });

    it('respects defaultAuthTab prop', async () => {
      const result = renderModal({ defaultAuthTab: 'apiKey' });
      await waitForForm(result);

      expect(result.getByPlaceholderText('Uds3d8i...')).toBeTruthy();
    });
  });

  describe('sign in validation', () => {
    it('shows error when server URL is empty', async () => {
      const result = renderModal();
      await waitForForm(result);

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('Enter a valid SparkyFitness URL')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when email is empty', async () => {
      const result = renderModal();
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('Please enter your email.')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when password is empty', async () => {
      const result = renderModal();
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(
        result.getByPlaceholderText('email@example.com'),
        'user@example.com',
      );

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('Please enter your password.')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });
  });

  describe('successful sign in', () => {
    it('calls login, saves config, and calls onSuccess', async () => {
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'new-session-token',
        user: { email: 'user@example.com' },
      });

      const onSuccess = jest.fn();
      const result = renderModal({ onSuccess });
      await waitForForm(result);

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
        pressConnectButton(result);
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
      expect(onSuccess).toHaveBeenCalled();
    });

    it('strips trailing slash from server URL', async () => {
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'tok',
        user: { email: 'a@b.com' },
      });

      const result = renderModal();
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com/',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://my-server.com' }),
      );
    });

    it('uses existing config ID when editing', async () => {
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'new-token',
        user: { email: 'user@example.com' },
      });

      const onSuccess = jest.fn();
      const result = renderModal({
        onSuccess,
        editingConfig: {
          id: 'cfg-1',
          url: 'https://existing-server.com',
          apiKey: '',
          authType: 'session',
          sessionToken: 'old-token',
        },
      });
      await waitForForm(result);

      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'user@example.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cfg-1',
          url: 'https://existing-server.com',
          authType: 'session',
          sessionToken: 'new-token',
        }),
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  describe('login errors', () => {
    it('displays LoginError message', async () => {
      mockLogin.mockRejectedValue(new LoginError('Invalid credentials', 401));

      const result = renderModal();
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrong');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('Invalid credentials')).toBeTruthy();
    });

    it('displays generic error for non-LoginError exceptions', async () => {
      mockLogin.mockRejectedValue(new Error('Network error'));

      const result = renderModal();
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(
        result.getByText('Could not connect to server. Check the URL and try again.'),
      ).toBeTruthy();
    });
  });

  describe('API key flow', () => {
    it('validates API key is required', async () => {
      const result = renderModal();
      await waitForForm(result);

      fireEvent.press(result.getByText('API Key'));
      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('Please enter an API key.')).toBeTruthy();
    });

    it('tests connection and saves on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }) as jest.Mock;

      const onSuccess = jest.fn();
      const result = renderModal({ onSuccess });
      await waitForForm(result);

      fireEvent.press(result.getByText('API Key'));
      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('Uds3d8i...'), 'my-api-key');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://my-server.com/api/identity/user',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-api-key',
          }),
        }),
      );
      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://my-server.com',
          apiKey: 'my-api-key',
          authType: 'apiKey',
        }),
      );
      expect(onSuccess).toHaveBeenCalled();
    });

    it('shows error on invalid API key (401)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      }) as jest.Mock;

      const result = renderModal();
      await waitForForm(result);

      fireEvent.press(result.getByText('API Key'));
      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('Uds3d8i...'), 'bad-key');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('Invalid API key. Please check and try again.')).toBeTruthy();
      expect(mockSaveServerConfig).not.toHaveBeenCalled();
    });

    it('shows error on connection failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as jest.Mock;

      const result = renderModal();
      await waitForForm(result);

      fireEvent.press(result.getByText('API Key'));
      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('Uds3d8i...'), 'my-key');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(
        result.getByText('Could not connect to server: Network error'),
      ).toBeTruthy();
      expect(mockSaveServerConfig).not.toHaveBeenCalled();
    });
  });

  describe('MFA flow', () => {
    async function navigateToMfa(
      result: ReturnType<typeof renderModal>,
      factors = { mfaTotpEnabled: true, mfaEmailEnabled: false },
    ) {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockResolvedValue(factors);

      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'user@test.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
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

      const onSuccess = jest.fn();
      const result = renderModal({ onSuccess });
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
      expect(onSuccess).toHaveBeenCalled();
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

      const onSuccess = jest.fn();
      const result = renderModal({ onSuccess });
      await navigateToMfa(result, {
        mfaTotpEnabled: true,
        mfaEmailEnabled: true,
      });

      await act(async () => {
        fireEvent.press(result.getByText('Email Code'));
      });

      expect(
        result.getByText(
          'Tap the button below to receive a verification code by email.',
        ),
      ).toBeTruthy();

      await act(async () => {
        fireEvent.press(result.getByText('Send Code'));
      });

      expect(mockSendEmailOtp).toHaveBeenCalled();
      expect(result.getByText('Enter the code sent to your email.')).toBeTruthy();
      expect(result.getByText('Resend Code')).toBeTruthy();

      fireEvent.changeText(result.getByPlaceholderText('000000'), '654321');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

      expect(mockVerifyEmailOtp).toHaveBeenCalledWith(
        'https://my-server.com',
        '654321',
      );
      expect(onSuccess).toHaveBeenCalled();
    });

    it('navigates back to form from MFA and clears cookies', async () => {
      const result = renderModal();
      await navigateToMfa(result);

      expect(result.getByText('Two-Factor Authentication')).toBeTruthy();

      await act(async () => {
        fireEvent.press(result.getByText('Back'));
      });

      expect(mockClearAuthCookies).toHaveBeenCalled();
      expect(result.getByText('Add Server')).toBeTruthy();
    });
  });

  describe('MFA error handling', () => {
    async function setupMfaForm(result: ReturnType<typeof renderModal>) {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockResolvedValue({
        mfaTotpEnabled: true,
        mfaEmailEnabled: false,
      });

      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
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

    it('returns to form on expired session', async () => {
      mockVerifyTotp.mockRejectedValue(
        new LoginError('INVALID_TWO_FACTOR_COOKIE', 401),
      );

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('000000'), '222222');

      await act(async () => {
        fireEvent.press(result.getByText('Verify'));
      });

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
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      await act(async () => {
        fireEvent.press(result.getByText('Send Code'));
      });

      expect(result.getByText('Email send failed')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('calls onDismiss when Cancel is pressed', async () => {
      const onDismiss = jest.fn();
      const result = renderModal({ onDismiss });
      await waitForForm(result);

      fireEvent.press(result.getByText('Cancel'));

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('state reset', () => {
    it('resets form state when modal becomes visible', async () => {
      mockLogin.mockRejectedValueOnce(new LoginError('Bad', 401));

      const result = renderModal();
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'wrong');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('Bad')).toBeTruthy();

      // Hide and re-show modal
      result.rerender(<ServerConfigModal {...defaultProps} visible={false} />);
      result.rerender(<ServerConfigModal {...defaultProps} visible={true} />);

      await waitFor(() => {
        expect(result.getByPlaceholderText('email@example.com').props.value).toBe('');
        expect(result.getByPlaceholderText('Password').props.value).toBe('');
      });
    });
  });

  describe('save without auth (editing)', () => {
    const editingConfig = {
      id: 'cfg-1',
      url: 'https://old-server.com',
      apiKey: '',
      authType: 'session' as const,
      sessionToken: 'old-token',
      proxyHeaders: [{ key: 'X-Auth', value: 'abc' }],
    };

    it('shows Save button when editing an existing config', async () => {
      const result = renderModal({ editingConfig });
      await waitForForm(result);

      expect(result.getByText('Save Without Connecting')).toBeTruthy();
      expect(result.getByText('Connect')).toBeTruthy();
    });

    it('does not show Save button when adding a new config', async () => {
      const result = renderModal({ editingConfig: null });
      await waitForForm(result);

      expect(result.queryByText('Save Without Connecting')).toBeNull();
      expect(result.getByText('Connect')).toBeTruthy();
    });

    it('saves URL and proxy header changes without auth validation', async () => {
      const onSuccess = jest.fn();
      const result = renderModal({ editingConfig, onSuccess });
      await waitForForm(result);

      // Change the URL
      fireEvent.changeText(
        result.getByDisplayValue('https://old-server.com'),
        'https://new-server.com',
      );

      await act(async () => {
        fireEvent.press(result.getByText('Save Without Connecting'));
      });

      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cfg-1',
          url: 'https://new-server.com',
          authType: 'session',
          sessionToken: 'old-token',
          proxyHeaders: [{ key: 'X-Auth', value: 'abc' }],
        }),
      );
      expect(onSuccess).toHaveBeenCalled();
    });

    it('validates URL is required for Save', async () => {
      const result = renderModal({ editingConfig });
      await waitForForm(result);

      fireEvent.changeText(
        result.getByDisplayValue('https://old-server.com'),
        '',
      );

      await act(async () => {
        fireEvent.press(result.getByText('Save Without Connecting'));
      });

      expect(result.getByText('Enter a valid SparkyFitness URL')).toBeTruthy();
      expect(mockSaveServerConfig).not.toHaveBeenCalled();
    });

    it('saves entered API key when user switches to API Key tab', async () => {
      const onSuccess = jest.fn();
      const result = renderModal({ editingConfig, onSuccess });
      await waitForForm(result);

      // Switch to API Key tab and enter a key
      fireEvent.press(result.getByText('API Key'));
      fireEvent.changeText(result.getByPlaceholderText('Uds3d8i...'), 'new-api-key');

      await act(async () => {
        fireEvent.press(result.getByText('Save Without Connecting'));
      });

      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cfg-1',
          authType: 'apiKey',
          apiKey: 'new-api-key',
          sessionToken: '',
        }),
      );
      expect(onSuccess).toHaveBeenCalled();
    });

    it('preserves existing auth when API Key tab is active but key is empty', async () => {
      const onSuccess = jest.fn();
      const result = renderModal({ editingConfig, onSuccess });
      await waitForForm(result);

      // Switch to API Key tab but leave key empty
      fireEvent.press(result.getByText('API Key'));

      await act(async () => {
        fireEvent.press(result.getByText('Save Without Connecting'));
      });

      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cfg-1',
          authType: 'session',
          sessionToken: 'old-token',
        }),
      );
    });
  });

  describe('session sign-in preserves existing API key', () => {
    it('preserves saved API key when completing session sign-in on existing config', async () => {
      mockLogin.mockResolvedValue({
        type: 'success',
        sessionToken: 'new-session-token',
        user: { email: 'user@example.com' },
      });

      const onSuccess = jest.fn();
      const result = renderModal({
        onSuccess,
        editingConfig: {
          id: 'cfg-1',
          url: 'https://example.com',
          apiKey: 'saved-fallback-key',
          authType: 'session',
          sessionToken: 'expired-token',
        },
      });
      await waitForForm(result);

      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'user@example.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cfg-1',
          apiKey: 'saved-fallback-key',
          authType: 'session',
          sessionToken: 'new-session-token',
        }),
      );
    });
  });

  describe('fetchMfaFactors fallback', () => {
    it('defaults to TOTP when fetchMfaFactors fails', async () => {
      mockLogin.mockResolvedValue({ type: 'mfa_required' });
      mockFetchMfaFactors.mockRejectedValue(new Error('Failed'));

      const result = renderModal();
      await waitForForm(result);

      fireEvent.changeText(
        result.getByPlaceholderText('https://your-server-url.com'),
        'https://my-server.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('email@example.com'), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('Password'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(
        result.getByText('Enter the code from your authenticator app.'),
      ).toBeTruthy();
    });
  });
});
