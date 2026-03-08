import { NativeModules } from 'react-native';
import { clearSessionToken, ServerConfig } from '../storage';

export class LoginError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'LoginError';
  }
}

interface LoginSuccess {
  type: 'success';
  sessionToken: string;
  user: {
    email: string;
    role?: string;
  };
}

interface LoginMfaRequired {
  type: 'mfa_required';
}

type LoginResult = LoginSuccess | LoginMfaRequired;

export interface MfaFactors {
  mfaTotpEnabled: boolean;
  mfaEmailEnabled: boolean;
}

interface MfaVerifyResult {
  sessionToken: string;
  user: {
    email: string;
    role?: string;
  };
}

interface AuthSettingsResponse {
  trusted_origin?: string | null;
}

let onSessionExpiredCallback: ((configId: string) => void) | null = null;
let sessionExpiredSuppressed = false;

export const setOnSessionExpired = (cb: (configId: string) => void): void => {
  onSessionExpiredCallback = cb;
};

export const suppressSessionExpired = (suppressed: boolean): void => {
  sessionExpiredSuppressed = suppressed;
};

export const notifySessionExpired = (configId: string): void => {
  if (sessionExpiredSuppressed) return;
  onSessionExpiredCallback?.(configId);
};

let onNoConfigsCallback: (() => void) | null = null;

export const setOnNoConfigs = (cb: () => void): void => {
  onNoConfigsCallback = cb;
};

export const notifyNoConfigs = (): void => {
  onNoConfigsCallback?.();
};

let pendingProxyHeaders: Record<string, string> = {};
export const setPendingProxyHeaders = (headers: Record<string, string>): void => {
  pendingProxyHeaders = headers;
};
export const clearPendingProxyHeaders = (): void => {
  pendingProxyHeaders = {};
};

/**
 * Returns the appropriate Authorization header for the given config.
 * Session configs use the session token; API key configs use the API key.
 */
export const getAuthHeaders = (config: ServerConfig): Record<string, string> => {
  if (config.authType === 'session' && config.sessionToken) {
    return { Authorization: `Bearer ${config.sessionToken}` };
  }
  return { Authorization: `Bearer ${config.apiKey}` };
};

/** Inline URL normalization to avoid circular dependency with apiClient. */
const normalizeUrl = (url: string): string => {
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

const getJsonHeaders = (): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...pendingProxyHeaders,
});

const trustedOriginCache = new Map<string, string | null>();

type NetworkingModule = {
  clearCookies: (callback: (result: boolean) => void) => void;
};

const networkingModule = NativeModules.Networking as NetworkingModule | undefined;

const normalizeOrigin = (origin?: string | null): string | undefined => {
  if (!origin) {
    return undefined;
  }

  try {
    return new URL(origin).origin;
  } catch {
    return undefined;
  }
};

const getFallbackAuthOrigin = (serverUrl: string): string | undefined => {
  try {
    return new URL(serverUrl).origin;
  } catch {
    return undefined;
  }
};

const getTrustedAuthOrigin = async (serverUrl: string): Promise<string | undefined> => {
  const baseUrl = normalizeUrl(serverUrl);

  if (trustedOriginCache.has(baseUrl)) {
    return trustedOriginCache.get(baseUrl) ?? undefined;
  }

  let trustedOrigin: string | undefined;

  try {
    const response = await fetch(`${baseUrl}/api/auth/settings`, {
      method: 'GET',
      credentials: 'omit',
      headers: { ...pendingProxyHeaders },
    });

    if (response.ok) {
      const body = (await response.json()) as AuthSettingsResponse;
      trustedOrigin = normalizeOrigin(body.trusted_origin);
    }
  } catch (error) {
    console.warn('[AuthService] Failed to fetch auth settings for MFA.', error);
  }

  if (!trustedOrigin) {
    trustedOrigin = getFallbackAuthOrigin(baseUrl);
  }

  trustedOriginCache.set(baseUrl, trustedOrigin ?? null);
  return trustedOrigin;
};

const getMfaHeaders = async (serverUrl: string): Promise<Record<string, string>> => {
  const origin = await getTrustedAuthOrigin(serverUrl);

  if (!origin) {
    return getJsonHeaders();
  }

  return {
    ...getJsonHeaders(),
    Origin: origin,
  };
};

const parseAuthErrorText = (errorText: string): string => {
  try {
    const parsed = JSON.parse(errorText) as {
      code?: string;
      error?: string;
      message?: string;
    };
    const message = parsed.message ?? parsed.error;

    if (message && parsed.code) {
      return `${message} (${parsed.code})`;
    }

    if (message) {
      return message;
    }

    if (parsed.code) {
      return parsed.code;
    }
  } catch {
    // Fall back to the raw response body.
  }

  return errorText.trim();
};

export const clearAuthCookies = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    try {
      networkingModule?.clearCookies(() => resolve());
      if (!networkingModule) {
        resolve();
      }
    } catch (error) {
      console.warn('[AuthService] Failed to clear auth cookies.', error);
      resolve();
    }
  });
};

/**
 * Signs in with email/password and returns a session token + user info.
 * The caller is responsible for creating/saving the ServerConfig.
 */
export const login = async (
  serverUrl: string,
  email: string,
  password: string,
): Promise<LoginResult> => {
  const baseUrl = normalizeUrl(serverUrl);

  if (!__DEV__ && !baseUrl.startsWith('https://')) {
    throw new LoginError('A secure (HTTPS) server URL is required to sign in.');
  }

  // Native fetch persists cookies, so start a fresh sign-in without stale Better Auth cookies.
  await clearAuthCookies();

  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers: getJsonHeaders(),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorText = parseAuthErrorText(await response.text());
    throw new LoginError(
      `Sign-in failed: ${response.status} - ${errorText}`,
      response.status,
    );
  }

  const body = await response.json();

  if (body.twoFactorRedirect === true) {
    return { type: 'mfa_required' };
  }

  if (!body.token) {
    throw new LoginError('Sign-in response did not include a session token.');
  }

  return {
    type: 'success',
    sessionToken: body.token,
    user: {
      email: body.user?.email ?? email,
      role: body.user?.role,
    },
  };
};

/**
 * Queries which MFA methods are enabled for a given email.
 */
export const fetchMfaFactors = async (
  serverUrl: string,
  email: string,
): Promise<MfaFactors> => {
  const baseUrl = normalizeUrl(serverUrl);
  const response = await fetch(
    `${baseUrl}/api/auth/mfa-factors?email=${encodeURIComponent(email)}`,
    {
      credentials: 'omit',
      headers: { ...pendingProxyHeaders },
    },
  );

  if (!response.ok) {
    throw new LoginError('Failed to fetch MFA factors.', response.status);
  }

  const body = await response.json();
  return {
    mfaTotpEnabled: body.mfa_totp_enabled ?? false,
    mfaEmailEnabled: body.mfa_email_enabled ?? false,
  };
};

/**
 * Verifies a TOTP code during the MFA sign-in flow.
 * The mfaCookie from the sign-in response must be forwarded so better-auth
 * can identify the pending two-factor session.
 */
export const verifyTotp = async (
  serverUrl: string,
  code: string,
): Promise<MfaVerifyResult> => {
  const baseUrl = normalizeUrl(serverUrl);
  const headers = await getMfaHeaders(baseUrl);

  const response = await fetch(`${baseUrl}/api/auth/two-factor/verify-totp`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new LoginError(parseAuthErrorText(await response.text()), response.status);
  }

  const body = await response.json();
  if (!body.token) {
    throw new LoginError('Verification response did not include a session token.');
  }

  return {
    sessionToken: body.token,
    user: {
      email: body.user?.email ?? '',
      role: body.user?.role,
    },
  };
};

/**
 * Triggers the server to send an email OTP code to the user.
 */
export const sendEmailOtp = async (
  serverUrl: string,
): Promise<void> => {
  const baseUrl = normalizeUrl(serverUrl);
  const headers = await getMfaHeaders(baseUrl);

  const response = await fetch(`${baseUrl}/api/auth/two-factor/send-otp`, {
    method: 'POST',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    throw new LoginError(parseAuthErrorText(await response.text()), response.status);
  }
};

/**
 * Verifies an email OTP code during the MFA sign-in flow.
 */
export const verifyEmailOtp = async (
  serverUrl: string,
  code: string,
): Promise<MfaVerifyResult> => {
  const baseUrl = normalizeUrl(serverUrl);
  const headers = await getMfaHeaders(baseUrl);

  const response = await fetch(`${baseUrl}/api/auth/two-factor/verify-otp`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ code }),
  });

  if (!response.ok) {
    throw new LoginError(parseAuthErrorText(await response.text()), response.status);
  }

  const body = await response.json();
  if (!body.token) {
    throw new LoginError('Verification response did not include a session token.');
  }

  return {
    sessionToken: body.token,
    user: {
      email: body.user?.email ?? '',
      role: body.user?.role,
    },
  };
};

/**
 * Clears the session token for the given config.
 */
export const logout = async (configId: string): Promise<void> => {
  await clearSessionToken(configId);
  await clearAuthCookies();
  console.log(`[AuthService] Session token cleared for config ${configId}`);
};
