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
  fetchAuthSettings,
  type AuthSettings,
} from '../../src/services/api/authService';
import {
  saveServerConfig,
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
const mockFetchAuthSettings = fetchAuthSettings as jest.MockedFunction<typeof fetchAuthSettings>;
const mockSaveServerConfig = saveServerConfig as jest.MockedFunction<typeof saveServerConfig>;

const URL_PLACEHOLDER = 'https://sparky.example.com';
const EMAIL_PLACEHOLDER = 'name@example.com';

/** Default settings: email sign-in enabled, no OIDC. */
const emailAuthSettings: AuthSettings = {
  trusted_origin: null,
  email: { enabled: true },
  oidc: { enabled: false, providers: [] },
  signup_disabled: false,
};

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
    expect(result.getByPlaceholderText(URL_PLACEHOLDER)).toBeTruthy(),
  );
}

/**
 * The auth options (tabs, email/password, Connect) are only rendered after the
 * server's auth settings are fetched. The Arabic sign-in segment label
 * which renders exactly once whenever email auth is enabled.
 */
async function waitForAuthReady(result: ReturnType<typeof renderModal>) {
  await waitFor(() => expect(result.getByText('تسجيل الدخول')).toBeTruthy(), {
    timeout: 3000,
  });
}

/** Types a URL and waits for the dynamically-fetched auth options to render. */
async function enterUrl(
  result: ReturnType<typeof renderModal>,
  url = 'https://my-server.com',
) {
  fireEvent.changeText(result.getByPlaceholderText(URL_PLACEHOLDER), url);
  await waitForAuthReady(result);
}

function pressConnectButton(result: ReturnType<typeof renderModal>) {
  fireEvent.press(result.getByText('اتصال'));
}

describe('ServerConfigModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClearAuthCookies.mockResolvedValue(undefined);
    mockSaveServerConfig.mockResolvedValue(undefined);
    mockFetchAuthSettings.mockResolvedValue(emailAuthSettings);
  });

  describe('form rendering', () => {
    it('reveals auth options after a URL is entered', async () => {
      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result);

      expect(result.getByPlaceholderText(URL_PLACEHOLDER)).toBeTruthy();
      expect(result.getByPlaceholderText(EMAIL_PLACEHOLDER)).toBeTruthy();
      expect(result.getByPlaceholderText('كلمة المرور')).toBeTruthy();
      expect(result.getByText('تسجيل الدخول')).toBeTruthy();
      expect(result.getByText('مفتاح API')).toBeTruthy();
      expect(result.getByText('اتصال')).toBeTruthy();
      expect(result.getByText('إلغاء')).toBeTruthy();
    });

    it('shows API key field when API Key tab is selected', async () => {
      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result);

      fireEvent.press(result.getByText('مفتاح API'));

      expect(result.getByPlaceholderText('Uds3d8i...')).toBeTruthy();
      expect(result.queryByPlaceholderText(EMAIL_PLACEHOLDER)).toBeNull();
      expect(result.queryByPlaceholderText('كلمة المرور')).toBeNull();
    });

    it('shows Add Server title when no editing config', async () => {
      const result = renderModal();
      await waitForForm(result);

      expect(result.getByText('إضافة خادم')).toBeTruthy();
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

      expect(result.getByText('تعديل الخادم')).toBeTruthy();
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
      await waitForAuthReady(result);

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
      await waitForAuthReady(result);

      expect(result.getByDisplayValue('https://example.com')).toBeTruthy();
      expect(result.getByPlaceholderText(EMAIL_PLACEHOLDER)).toBeTruthy();
    });

    it('respects defaultAuthTab prop', async () => {
      const result = renderModal({ defaultAuthTab: 'apiKey' });
      await waitForForm(result);
      await enterUrl(result);

      expect(result.getByPlaceholderText('Uds3d8i...')).toBeTruthy();
    });
  });

  describe('sign in validation', () => {
    it('does not show auth options until a URL is entered', async () => {
      const result = renderModal();
      await waitForForm(result);

      expect(result.queryByText('اتصال')).toBeNull();
      expect(result.queryByPlaceholderText(EMAIL_PLACEHOLDER)).toBeNull();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when email is empty', async () => {
      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result);

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('اكتب بريدك الإلكتروني.')).toBeTruthy();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    it('shows error when password is empty', async () => {
      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result);

      fireEvent.changeText(
        result.getByPlaceholderText(EMAIL_PLACEHOLDER),
        'user@example.com',
      );

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('اكتب كلمة المرور.')).toBeTruthy();
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
      await enterUrl(result);

      fireEvent.changeText(
        result.getByPlaceholderText(EMAIL_PLACEHOLDER),
        'user@example.com',
      );
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'password123');

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
      await enterUrl(result, 'https://my-server.com/');

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

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
      await waitForAuthReady(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'user@example.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

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
      await enterUrl(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'wrong');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة.')).toBeTruthy();
    });

    it('displays generic error for non-LoginError exceptions', async () => {
      mockLogin.mockRejectedValue(new Error('Network error'));

      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result, 'https://server.com');

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(
        result.getByText('ما قدرنا نتصل بالخادم. تأكد من الرابط وحاول مرة ثانية.'),
      ).toBeTruthy();
    });
  });

  describe('API key flow', () => {
    it('validates API key is required', async () => {
      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result);

      fireEvent.press(result.getByText('مفتاح API'));

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('اكتب مفتاح API.')).toBeTruthy();
    });

    it('tests connection and saves on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      }) as jest.Mock;

      const onSuccess = jest.fn();
      const result = renderModal({ onSuccess });
      await waitForForm(result);
      await enterUrl(result);

      fireEvent.press(result.getByText('مفتاح API'));
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
      await enterUrl(result);

      fireEvent.press(result.getByText('مفتاح API'));
      fireEvent.changeText(result.getByPlaceholderText('Uds3d8i...'), 'bad-key');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('مفتاح API غير صحيح. تأكد منه وحاول مرة ثانية.')).toBeTruthy();
      expect(mockSaveServerConfig).not.toHaveBeenCalled();
    });

    it('shows error on connection failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error')) as jest.Mock;

      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result);

      fireEvent.press(result.getByText('مفتاح API'));
      fireEvent.changeText(result.getByPlaceholderText('Uds3d8i...'), 'my-key');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(
        result.getByText('ما قدرنا نتصل بالخادم باستخدام مفتاح API.'),
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
      await enterUrl(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'user@test.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });
    }

    it('transitions to MFA form when login returns mfa_required', async () => {
      const result = renderModal();
      await navigateToMfa(result);

      expect(result.getByText('التحقق بخطوتين')).toBeTruthy();
      expect(
        result.getByText('اكتب الرمز الظاهر في تطبيق المصادقة.'),
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

      fireEvent.changeText(result.getByPlaceholderText('٠٠٠٠٠٠'), '١٢٣٤٥٦');

      await act(async () => {
        fireEvent.press(result.getByText('تحقق'));
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

      expect(result.getByText('تطبيق المصادقة')).toBeTruthy();
      expect(result.getByText('رمز البريد')).toBeTruthy();
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
        fireEvent.press(result.getByText('رمز البريد'));
      });

      expect(
        result.getByText(
          'اضغط الزر تحت عشان نرسل رمز التحقق لبريدك.',
        ),
      ).toBeTruthy();

      await act(async () => {
        fireEvent.press(result.getByText('إرسال الرمز'));
      });

      expect(mockSendEmailOtp).toHaveBeenCalled();
      expect(result.getByText('اكتب الرمز اللي أرسلناه لبريدك.')).toBeTruthy();
      expect(result.getByText('إعادة إرسال الرمز')).toBeTruthy();

      fireEvent.changeText(result.getByPlaceholderText('٠٠٠٠٠٠'), '٦٥٤٣٢١');

      await act(async () => {
        fireEvent.press(result.getByText('تحقق'));
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

      expect(result.getByText('التحقق بخطوتين')).toBeTruthy();

      await act(async () => {
        fireEvent.press(result.getByText('رجوع'));
      });

      expect(mockClearAuthCookies).toHaveBeenCalled();
      expect(result.getByText('إضافة خادم')).toBeTruthy();
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
      await enterUrl(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

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

      fireEvent.changeText(result.getByPlaceholderText('٠٠٠٠٠٠'), '٠٠٠٠٠٠');

      await act(async () => {
        fireEvent.press(result.getByText('تحقق'));
      });

      expect(
        result.getByText('رمز التحقق غير صحيح. حاول مرة ثانية.'),
      ).toBeTruthy();
    });

    it('shows rate limit error on 429', async () => {
      mockVerifyTotp.mockRejectedValue(new LoginError('Too many', 429));

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('٠٠٠٠٠٠'), '١١١١١١');

      await act(async () => {
        fireEvent.press(result.getByText('تحقق'));
      });

      expect(
        result.getByText('المحاولات كثيرة. انتظر شوي وحاول مرة ثانية.'),
      ).toBeTruthy();
    });

    it('returns to form on expired session', async () => {
      mockVerifyTotp.mockRejectedValue(
        new LoginError('INVALID_TWO_FACTOR_COOKIE', 401),
      );

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('٠٠٠٠٠٠'), '٢٢٢٢٢٢');

      await act(async () => {
        fireEvent.press(result.getByText('تحقق'));
      });

      await waitFor(() => {
        expect(result.getByPlaceholderText(EMAIL_PLACEHOLDER)).toBeTruthy();
      });
    });

    it('shows generic error for non-LoginError MFA failures', async () => {
      mockVerifyTotp.mockRejectedValue(new Error('Network error'));

      const result = renderModal();
      await setupMfaForm(result);

      fireEvent.changeText(result.getByPlaceholderText('٠٠٠٠٠٠'), '٣٣٣٣٣٣');

      await act(async () => {
        fireEvent.press(result.getByText('تحقق'));
      });

      expect(
        result.getByText('ما قدرنا نتحقق من الرمز. حاول مرة ثانية.'),
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
      await enterUrl(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      await act(async () => {
        fireEvent.press(result.getByText('إرسال الرمز'));
      });

      expect(result.getByText('ما قدرنا نرسل رمز البريد. حاول مرة ثانية.')).toBeTruthy();
    });
  });

  describe('callbacks', () => {
    it('calls onDismiss when Cancel is pressed', async () => {
      const onDismiss = jest.fn();
      const result = renderModal({ onDismiss });
      await waitForForm(result);

      fireEvent.press(result.getByText('إلغاء'));

      expect(onDismiss).toHaveBeenCalled();
    });
  });

  describe('state reset', () => {
    it('resets form state when modal becomes visible', async () => {
      mockLogin.mockRejectedValueOnce(new LoginError('Bad', 401));

      const result = renderModal();
      await waitForForm(result);
      await enterUrl(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'wrong');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(result.getByText('البريد الإلكتروني أو كلمة المرور غير صحيحة.')).toBeTruthy();

      // Hide and re-show modal
      result.rerender(<ServerConfigModal {...defaultProps} visible={false} />);
      result.rerender(<ServerConfigModal {...defaultProps} visible={true} />);

      // URL is cleared on reset, so the auth options (email field) collapse away.
      await waitFor(() => {
        expect(result.getByPlaceholderText(URL_PLACEHOLDER).props.value).toBe('');
      });
      expect(result.queryByPlaceholderText(EMAIL_PLACEHOLDER)).toBeNull();
    });
  });

  describe('save without auth (editing)', () => {
    const editingConfig = {
      id: 'cfg-1',
      url: 'https://old-server.com',
      apiKey: '',
      authType: 'session' as const,
      sessionToken: 'old-token',
      proxyHeaders: [{ name: 'X-Auth', value: 'abc' }],
    };

    it('shows Save button when editing an existing config', async () => {
      const result = renderModal({ editingConfig });
      await waitForForm(result);
      await waitForAuthReady(result);

      expect(result.getByText('حفظ')).toBeTruthy();
      expect(result.getByText('اتصال')).toBeTruthy();
    });

    it('does not show Save button when adding a new config', async () => {
      const result = renderModal({ editingConfig: null });
      await waitForForm(result);
      await enterUrl(result);

      expect(result.queryByText('حفظ')).toBeNull();
      expect(result.getByText('اتصال')).toBeTruthy();
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
        fireEvent.press(result.getByText('حفظ'));
      });

      expect(mockLogin).not.toHaveBeenCalled();
      expect(mockSaveServerConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cfg-1',
          url: 'https://new-server.com',
          authType: 'session',
          sessionToken: 'old-token',
          proxyHeaders: [{ name: 'X-Auth', value: 'abc' }],
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
        fireEvent.press(result.getByText('حفظ'));
      });

      expect(result.getByText('أدخل رابطًا صحيحًا لسباركي فتنس.')).toBeTruthy();
      expect(mockSaveServerConfig).not.toHaveBeenCalled();
    });

    it('saves entered API key when user switches to API Key tab', async () => {
      const onSuccess = jest.fn();
      const result = renderModal({ editingConfig, onSuccess });
      await waitForForm(result);
      await waitForAuthReady(result);

      // Switch to API Key tab and enter a key
      fireEvent.press(result.getByText('مفتاح API'));
      fireEvent.changeText(result.getByPlaceholderText('Uds3d8i...'), 'new-api-key');

      await act(async () => {
        fireEvent.press(result.getByText('حفظ'));
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
      await waitForAuthReady(result);

      // Switch to API Key tab but leave key empty
      fireEvent.press(result.getByText('مفتاح API'));

      await act(async () => {
        fireEvent.press(result.getByText('حفظ'));
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
      await waitForAuthReady(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'user@example.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

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
      await enterUrl(result);

      fireEvent.changeText(result.getByPlaceholderText(EMAIL_PLACEHOLDER), 'a@b.com');
      fireEvent.changeText(result.getByPlaceholderText('كلمة المرور'), 'pass');

      await act(async () => {
        pressConnectButton(result);
      });

      expect(
        result.getByText('اكتب الرمز الظاهر في تطبيق المصادقة.'),
      ).toBeTruthy();
    });
  });
});
