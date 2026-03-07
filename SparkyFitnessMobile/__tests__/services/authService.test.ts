import {
  getAuthHeaders,
  setOnSessionExpired,
  notifySessionExpired,
  setOnNoConfigs,
  notifyNoConfigs,
  login,
  LoginError,
  fetchMfaFactors,
  verifyTotp,
  sendEmailOtp,
  verifyEmailOtp,
  logout,
  clearAuthCookies,
} from '../../src/services/api/authService';
import { clearSessionToken, ServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/storage', () => ({
  clearSessionToken: jest.fn(),
}));

const mockClearSessionToken = clearSessionToken as jest.MockedFunction<
  typeof clearSessionToken
>;

describe('authService', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Clear stale callbacks between tests
    setOnSessionExpired(() => {});
    setOnNoConfigs(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- getAuthHeaders ---

  describe('getAuthHeaders', () => {
    test('returns session token when authType is session and token is present', () => {
      const config: ServerConfig = {
        id: '1',
        url: 'https://example.com',
        apiKey: 'my-api-key',
        authType: 'session',
        sessionToken: 'my-session-token',
      };

      expect(getAuthHeaders(config)).toEqual({
        Authorization: 'Bearer my-session-token',
      });
    });

    test('returns apiKey when authType is not session', () => {
      const config: ServerConfig = {
        id: '1',
        url: 'https://example.com',
        apiKey: 'my-api-key',
      };

      expect(getAuthHeaders(config)).toEqual({
        Authorization: 'Bearer my-api-key',
      });
    });

    test('falls back to apiKey when authType is session but sessionToken is missing', () => {
      const config: ServerConfig = {
        id: '1',
        url: 'https://example.com',
        apiKey: 'my-api-key',
        authType: 'session',
      };

      expect(getAuthHeaders(config)).toEqual({
        Authorization: 'Bearer my-api-key',
      });
    });
  });

  // --- Callback registration ---

  describe('setOnSessionExpired / notifySessionExpired', () => {
    test('registered callback fires with configId', () => {
      const cb = jest.fn();
      setOnSessionExpired(cb);
      notifySessionExpired('config-42');

      expect(cb).toHaveBeenCalledWith('config-42');
    });

    test('no-op when no callback registered', () => {
      // Reset to truly empty by setting a no-op then overwriting the module-level var
      // via the exported setter with an explicit cast
      setOnSessionExpired(undefined as any);
      expect(() => notifySessionExpired('config-42')).not.toThrow();
    });
  });

  describe('setOnNoConfigs / notifyNoConfigs', () => {
    test('registered callback fires', () => {
      const cb = jest.fn();
      setOnNoConfigs(cb);
      notifyNoConfigs();

      expect(cb).toHaveBeenCalled();
    });

    test('no-op when no callback registered', () => {
      setOnNoConfigs(undefined as any);
      expect(() => notifyNoConfigs()).not.toThrow();
    });
  });

  // --- login ---

  describe('login', () => {
    const serverUrl = 'https://login-test.example.com';

    test('returns success with session token and user on successful login', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'session-abc',
            user: { email: 'user@test.com', role: 'admin' },
          }),
      });

      const result = await login(serverUrl, 'user@test.com', 'password123');

      expect(result).toEqual({
        type: 'success',
        sessionToken: 'session-abc',
        user: { email: 'user@test.com', role: 'admin' },
      });
    });

    test('returns mfa_required when twoFactorRedirect is true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ twoFactorRedirect: true }),
      });

      const result = await login(serverUrl, 'user@test.com', 'password123');

      expect(result).toEqual({ type: 'mfa_required' });
    });

    test('throws LoginError on non-OK response with JSON error body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () =>
          Promise.resolve(
            JSON.stringify({ message: 'Invalid credentials', code: 'AUTH_FAILED' }),
          ),
      });

      await expect(login(serverUrl, 'user@test.com', 'wrong')).rejects.toThrow(
        'Sign-in failed: 401 - Invalid credentials (AUTH_FAILED)',
      );
    });

    test('throws LoginError on non-OK response with non-JSON body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(login(serverUrl, 'user@test.com', 'pass')).rejects.toThrow(
        'Sign-in failed: 500 - Internal Server Error',
      );
    });

    test('throws LoginError when response has no token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { email: 'user@test.com' } }),
      });

      await expect(login(serverUrl, 'user@test.com', 'pass')).rejects.toThrow(
        'Sign-in response did not include a session token.',
      );
    });

    test('sends POST to sign-in endpoint with correct body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ token: 't', user: { email: 'u@t.com' } }),
      });

      await login(serverUrl, 'u@t.com', 'p');

      expect(mockFetch).toHaveBeenCalledWith(
        `${serverUrl}/api/auth/sign-in/email`,
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'u@t.com', password: 'p' }),
        }),
      );
    });

    test('normalizes trailing slash in server URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ token: 't', user: { email: 'u@t.com' } }),
      });

      await login('https://trailing-slash.example.com/', 'u@t.com', 'p');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://trailing-slash.example.com/api/auth/sign-in/email',
        expect.anything(),
      );
    });

    test('throws LoginError with message-only JSON error body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () =>
          Promise.resolve(JSON.stringify({ message: 'Account locked' })),
      });

      await expect(login(serverUrl, 'user@test.com', 'pass')).rejects.toThrow(
        'Sign-in failed: 403 - Account locked',
      );
    });

    test('LoginError includes statusCode and correct name', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      try {
        await login(serverUrl, 'user@test.com', 'wrong');
        fail('Expected LoginError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LoginError);
        expect((error as LoginError).statusCode).toBe(401);
        expect((error as LoginError).name).toBe('LoginError');
      }
    });

    test('propagates network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

      await expect(
        login(serverUrl, 'user@test.com', 'pass'),
      ).rejects.toThrow('Network request failed');
    });

    describe('HTTPS enforcement', () => {
      const originalDev = (global as any).__DEV__;

      afterEach(() => {
        (global as any).__DEV__ = originalDev;
      });

      test('throws LoginError for HTTP URL in production', async () => {
        (global as any).__DEV__ = false;

        await expect(
          login('http://insecure.example.com', 'u@t.com', 'p'),
        ).rejects.toThrow('A secure (HTTPS) server URL is required to sign in.');

        expect(mockFetch).not.toHaveBeenCalled();
      });

      test('allows HTTP URL in dev mode', async () => {
        (global as any).__DEV__ = true;
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ token: 't', user: { email: 'u@t.com' } }),
        });

        const result = await login('http://localhost:3000', 'u@t.com', 'p');

        expect(result.type).toBe('success');
      });
    });
  });

  // --- fetchMfaFactors ---

  describe('fetchMfaFactors', () => {
    const serverUrl = 'https://mfa-factors.example.com';

    test('returns parsed MFA factors on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ mfa_totp_enabled: true, mfa_email_enabled: true }),
      });

      const result = await fetchMfaFactors(serverUrl, 'user@test.com');

      expect(result).toEqual({
        mfaTotpEnabled: true,
        mfaEmailEnabled: true,
      });
    });

    test('defaults to false when fields are missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await fetchMfaFactors(serverUrl, 'user@test.com');

      expect(result).toEqual({
        mfaTotpEnabled: false,
        mfaEmailEnabled: false,
      });
    });

    test('throws LoginError on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(
        fetchMfaFactors(serverUrl, 'user@test.com'),
      ).rejects.toThrow('Failed to fetch MFA factors.');
    });

    test('encodes email in query parameter', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await fetchMfaFactors(serverUrl, 'user+special@test.com');

      expect(mockFetch).toHaveBeenCalledWith(
        `${serverUrl}/api/auth/mfa-factors?email=user%2Bspecial%40test.com`,
        expect.objectContaining({ credentials: 'omit' }),
      );
    });
  });

  // --- verifyTotp ---

  describe('verifyTotp', () => {
    const mockAuthSettingsResponse = (trustedOrigin?: string | null) => ({
      ok: true,
      json: () => Promise.resolve({ trusted_origin: trustedOrigin }),
    });

    const mockSuccessVerifyResponse = () => ({
      ok: true,
      json: () =>
        Promise.resolve({
          token: 'totp-session-token',
          user: { email: 'user@test.com', role: 'user' },
        }),
    });

    test('returns session token and user on success', async () => {
      const serverUrl = 'https://totp-success.example.com';
      mockFetch
        .mockResolvedValueOnce(mockAuthSettingsResponse('https://auth.example.com'))
        .mockResolvedValueOnce(mockSuccessVerifyResponse());

      const result = await verifyTotp(serverUrl, '123456');

      expect(result).toEqual({
        sessionToken: 'totp-session-token',
        user: { email: 'user@test.com', role: 'user' },
      });
    });

    test('throws LoginError on non-OK response with parsed error', async () => {
      const serverUrl = 'https://totp-error.example.com';
      mockFetch
        .mockResolvedValueOnce(mockAuthSettingsResponse(null))
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () => Promise.resolve(JSON.stringify({ message: 'Invalid code' })),
        });

      await expect(verifyTotp(serverUrl, '000000')).rejects.toThrow('Invalid code');
    });

    test('throws LoginError when response has no token', async () => {
      const serverUrl = 'https://totp-no-token.example.com';
      mockFetch
        .mockResolvedValueOnce(mockAuthSettingsResponse(null))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { email: 'u@t.com' } }),
        });

      await expect(verifyTotp(serverUrl, '123456')).rejects.toThrow(
        'Verification response did not include a session token.',
      );
    });

    test('includes Origin header from server-provided trusted_origin', async () => {
      const serverUrl = 'https://totp-origin.example.com';
      mockFetch
        .mockResolvedValueOnce(
          mockAuthSettingsResponse('https://trusted.example.com'),
        )
        .mockResolvedValueOnce(mockSuccessVerifyResponse());

      await verifyTotp(serverUrl, '123456');

      const verifyCall = mockFetch.mock.calls[1];
      expect(verifyCall[1].headers).toEqual(
        expect.objectContaining({
          Origin: 'https://trusted.example.com',
          'Content-Type': 'application/json',
        }),
      );
    });

    test('falls back to server-derived origin when auth settings fetch fails', async () => {
      const serverUrl = 'https://totp-settings-fail.example.com';
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockSuccessVerifyResponse());

      await verifyTotp(serverUrl, '123456');

      const verifyCall = mockFetch.mock.calls[1];
      expect(verifyCall[1].headers).toEqual(
        expect.objectContaining({
          Origin: 'https://totp-settings-fail.example.com',
        }),
      );
    });

    test('falls back to URL-derived origin when trusted_origin is null', async () => {
      const serverUrl = 'https://totp-fallback.example.com';
      mockFetch
        .mockResolvedValueOnce(mockAuthSettingsResponse(null))
        .mockResolvedValueOnce(mockSuccessVerifyResponse());

      await verifyTotp(serverUrl, '123456');

      const verifyCall = mockFetch.mock.calls[1];
      expect(verifyCall[1].headers).toEqual(
        expect.objectContaining({
          Origin: 'https://totp-fallback.example.com',
        }),
      );
    });
  });

  // --- sendEmailOtp ---

  describe('sendEmailOtp', () => {
    test('resolves on success', async () => {
      const serverUrl = 'https://send-otp-ok.example.com';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ trusted_origin: null }),
        })
        .mockResolvedValueOnce({ ok: true });

      await expect(sendEmailOtp(serverUrl)).resolves.toBeUndefined();
    });

    test('throws LoginError on non-OK response', async () => {
      const serverUrl = 'https://send-otp-fail.example.com';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ trusted_origin: null }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve(JSON.stringify({ code: 'RATE_LIMITED' })),
        });

      await expect(sendEmailOtp(serverUrl)).rejects.toThrow('RATE_LIMITED');
    });

    test('includes Origin header in request', async () => {
      const serverUrl = 'https://send-otp-origin.example.com';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ trusted_origin: 'https://my-auth.example.com' }),
        })
        .mockResolvedValueOnce({ ok: true });

      await sendEmailOtp(serverUrl);

      const sendCall = mockFetch.mock.calls[1];
      expect(sendCall[0]).toBe(
        `${serverUrl}/api/auth/two-factor/send-otp`,
      );
      expect(sendCall[1].headers).toEqual(
        expect.objectContaining({
          Origin: 'https://my-auth.example.com',
        }),
      );
    });
  });

  // --- verifyEmailOtp ---

  describe('verifyEmailOtp', () => {
    test('returns session token and user on success', async () => {
      const serverUrl = 'https://email-otp-ok.example.com';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ trusted_origin: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              token: 'email-otp-token',
              user: { email: 'user@test.com' },
            }),
        });

      const result = await verifyEmailOtp(serverUrl, '654321');

      expect(result).toEqual({
        sessionToken: 'email-otp-token',
        user: { email: 'user@test.com', role: undefined },
      });
    });

    test('throws LoginError on non-OK response', async () => {
      const serverUrl = 'https://email-otp-err.example.com';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ trusted_origin: null }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: () =>
            Promise.resolve(JSON.stringify({ error: 'Code expired' })),
        });

      await expect(verifyEmailOtp(serverUrl, '000000')).rejects.toThrow(
        'Code expired',
      );
    });

    test('throws LoginError when response has no token', async () => {
      const serverUrl = 'https://email-otp-notoken.example.com';
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ trusted_origin: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { email: 'u@t.com' } }),
        });

      await expect(verifyEmailOtp(serverUrl, '123456')).rejects.toThrow(
        'Verification response did not include a session token.',
      );
    });
  });

  // --- logout ---

  describe('logout', () => {
    test('clears session token and cookies for the given config ID', async () => {
      mockClearSessionToken.mockResolvedValueOnce();

      await logout('config-99');

      expect(mockClearSessionToken).toHaveBeenCalledWith('config-99');
    });
  });

  // --- clearAuthCookies ---

  describe('clearAuthCookies', () => {
    test('resolves when NativeModules.Networking is undefined', async () => {
      await expect(clearAuthCookies()).resolves.toBeUndefined();
    });
  });

  // --- Trusted origin caching ---

  describe('trusted origin caching', () => {
    test('second call with same URL skips auth settings fetch', async () => {
      const serverUrl = 'https://cache-test.example.com';

      // First verifyTotp: fetches auth settings + verify endpoint
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              trusted_origin: 'https://cached-origin.example.com',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              token: 'token-1',
              user: { email: 'u@t.com' },
            }),
        });

      await verifyTotp(serverUrl, '111111');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second verifyTotp with same URL: only the verify endpoint fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            token: 'token-2',
            user: { email: 'u@t.com' },
          }),
      });

      await verifyTotp(serverUrl, '222222');

      // Total: 2 from first call + 1 from second call = 3
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });
});
