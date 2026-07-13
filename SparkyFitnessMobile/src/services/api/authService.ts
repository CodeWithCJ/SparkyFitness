import { NativeModules, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createAuthClient } from 'better-auth/client';
import { expoClient } from '@better-auth/expo/client';
import { ssoClient } from '@better-auth/sso/client';
import * as WebBrowser from 'expo-web-browser';
import { clearSessionToken, ServerConfig } from '../storage';
import { addLog } from '../LogService';
import { LoginError } from './authErrors';
import {
  CONNECTION_CHECK_TIMEOUT_MS,
  DEFAULT_API_TIMEOUT_MS,
  fetchWithTimeout,
} from '../../utils/concurrency';

// Re-exported so existing `import { LoginError } from '.../authService'` call
// sites keep working; the class itself lives in the dependency-light authErrors
// module so error-only consumers don't pull better-auth into their graph.
export { LoginError };

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

export const _clearTrustedOriginCache = (): void => {
  trustedOriginCache.clear();
};

export const _setTrustedOriginCache = (url: string, origin: string | null): void => {
  trustedOriginCache.set(normalizeUrl(url), origin);
};

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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[AuthService] Invalid trusted_origin from server: ${origin} (${message})`, 'WARNING');
    return undefined;
  }
};

const getFallbackAuthOrigin = (serverUrl: string): string | undefined => {
  try {
    return new URL(serverUrl).origin;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[AuthService] Invalid server URL for auth origin: ${serverUrl} (${message})`, 'WARNING');
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
    const response = await fetchWithTimeout(`${baseUrl}/api/auth/settings`, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
      headers: { ...pendingProxyHeaders },
    }, CONNECTION_CHECK_TIMEOUT_MS);

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

// Headers for Better Auth endpoint requests (sign-in, two-factor verify/send-otp).
// Adds the trusted Origin header Better Auth requires on top of the JSON headers.
const getBetterAuthHeaders = async (serverUrl: string): Promise<Record<string, string>> => {
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

  const response = await fetchWithTimeout(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    credentials: 'include',
    headers: await getBetterAuthHeaders(baseUrl),
    body: JSON.stringify({ email, password }),
  }, DEFAULT_API_TIMEOUT_MS);

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
  const response = await fetchWithTimeout(
    `${baseUrl}/api/auth/mfa-factors?email=${encodeURIComponent(email)}`,
    {
      credentials: 'omit',
      cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
      headers: { ...pendingProxyHeaders },
    },
    DEFAULT_API_TIMEOUT_MS,
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
  const headers = await getBetterAuthHeaders(baseUrl);

  const response = await fetchWithTimeout(`${baseUrl}/api/auth/two-factor/verify-totp`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ code }),
  }, DEFAULT_API_TIMEOUT_MS);

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
  const headers = await getBetterAuthHeaders(baseUrl);

  const response = await fetchWithTimeout(`${baseUrl}/api/auth/two-factor/send-otp`, {
    method: 'POST',
    credentials: 'include',
    headers,
  }, DEFAULT_API_TIMEOUT_MS);

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
  const headers = await getBetterAuthHeaders(baseUrl);

  const response = await fetchWithTimeout(`${baseUrl}/api/auth/two-factor/verify-otp`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({ code }),
  }, DEFAULT_API_TIMEOUT_MS);

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

export interface OidcProvider {
  id: string;
  display_name: string;
  logo_url?: string;
  auto_register?: boolean;
}

export interface AuthSettings {
  trusted_origin: string | null;
  email: {
    enabled: boolean;
  };
  oidc: {
    enabled: boolean;
    providers: OidcProvider[];
    auto_redirect?: boolean;
  };
  signup_disabled: boolean;
}

/**
 * Queries the public auth settings from the frontend/server.
 */
export const fetchAuthSettings = async (
  serverUrl: string,
  customHeaders?: Record<string, string>
): Promise<AuthSettings> => {
  const baseUrl = normalizeUrl(serverUrl);
  const response = await fetchWithTimeout(`${baseUrl}/api/auth/settings`, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: {
      ...pendingProxyHeaders,
      ...customHeaders,
    },
  }, CONNECTION_CHECK_TIMEOUT_MS);

  if (!response.ok) {
    throw new LoginError('Failed to fetch authentication settings.', response.status);
  }

  return await response.json();
};

const SSO_STORAGE_PREFIX = 'sparky_sso';
const SSO_CALLBACK_URL = 'sparkyfitnessmobile://oauth-callback';

/**
 * Transient Better Auth client used ONLY for the SSO browser dance; the rest
 * of the app keeps apiFetch + Bearer tokens. Created per login attempt so the
 * baseURL and current pendingProxyHeaders are always fresh.
 */
const createSsoAuthClient = (baseUrl: string, authHeaders?: Record<string, string>) =>
  createAuthClient({
    baseURL: `${baseUrl}/api/auth`,
    plugins: [
      ssoClient(),
      expoClient({
        scheme: 'sparkyfitnessmobile',
        storagePrefix: SSO_STORAGE_PREFIX,
        // Must match the server's advanced.cookiePrefix so the client
        // recognizes and stores the session cookie. Also include standard
        // better-auth for passkey challenge cookies.
        cookiePrefix: ['sparky', 'better-auth'],
        storage: SecureStore,
      }),
    ],
    fetchOptions: {
      timeout: DEFAULT_API_TIMEOUT_MS,
      headers: {
        ...pendingProxyHeaders,
        ...authHeaders,
      },
    },
  });

/**
 * The expo client persists the relayed cookies under
 * `${storagePrefix}_cookie` / `${storagePrefix}_session_data` in SecureStore.
 * Clear them so each SSO attempt starts fresh and no cookie from a previous
 * server/user leaks into the next dance.
 */
const clearSsoDanceCookies = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(`${SSO_STORAGE_PREFIX}_cookie`);
  await SecureStore.deleteItemAsync(`${SSO_STORAGE_PREFIX}_session_data`);
};

/**
 * Triggers the native OS-level browser session to log in via OIDC/SSO using
 * the official Better Auth Expo integration.
 */
export const loginWithOidc = async (
  serverUrl: string,
  providerId: string,
): Promise<LoginResult> => {
  const baseUrl = normalizeUrl(serverUrl);

  if (!__DEV__ && !baseUrl.startsWith('https://')) {
    throw new LoginError('A secure (HTTPS) server URL is required to sign in.');
  }

  // Native fetch persists cookies; a stale session cookie could resolve the
  // OLD session in getSession below. Clear both cookie stores first.
  await clearAuthCookies();
  await clearSsoDanceCookies();

  const authClient = createSsoAuthClient(baseUrl);

  addLog(`[AuthService] Initiating OIDC login for provider: ${providerId}`, 'INFO');

  // Resolves only after the system-browser dance completes; the expo client
  // stores the session cookie relayed on the app-scheme redirect in SecureStore.
  const { error } = await authClient.signIn.sso({
    providerId,
    callbackURL: SSO_CALLBACK_URL,
  });

  if (error) {
    addLog(`[AuthService] OIDC sign-in failed: ${error.message ?? error.statusText}`, 'ERROR');
    throw new LoginError(error.message ?? 'SSO sign-in failed.', error.status);
  }

  addLog(`[AuthService] Browser flow finished. Fetching session details...`, 'INFO');

  // getSession sends the stored cookie; the response contains the RAW session
  // token, which is what apiClient's Bearer header / server authMiddleware expect.
  const { data } = await authClient.getSession();
  const sessionToken = data?.session?.token;

  if (!sessionToken) {
    addLog('[AuthService] No session established after OIDC flow (cancelled or failed).', 'ERROR');
    throw new LoginError('SSO sign-in was cancelled or did not complete.');
  }

  // config.sessionToken becomes the single source of truth from here on.
  await clearSsoDanceCookies();

  return {
    type: 'success',
    sessionToken,
    user: {
      email: data.user.email,
      role: (data.user as { role?: string }).role,
    },
  };
};

/**
 * Certain browsers such as Fennec are signed by FDroid
 * and therefore unavailable to use passkeys on Android.
 */
const PASSKEY_CAPABLE_BROWSERS = [
  'com.android.chrome',
  'org.mozilla.firefox',
  'com.sec.android.app.sbrowser',
  'com.microsoft.emmx',
];

/**
 * Picks the Custom Tabs browser for passkey ceremonies. Returns undefined to
 * use the default browser when it is already passkey-capable, when no capable
 * browser is installed, or on iOS (where the system browser always works).
 */
const getPasskeyBrowserPackage = async (): Promise<string | undefined> => {
  if (Platform.OS !== 'android') {
    return undefined;
  }
  try {
    const { defaultBrowserPackage, browserPackages, servicePackages } =
      await WebBrowser.getCustomTabsSupportingBrowsersAsync();
    if (defaultBrowserPackage && PASSKEY_CAPABLE_BROWSERS.includes(defaultBrowserPackage)) {
      return undefined;
    }
    // When a default browser is set, Android filters VIEW-intent queries
    // (browserPackages) down to just that default. The CustomTabsService
    // query (servicePackages) is not filtered and lists every
    // Custom-Tabs-capable browser, so check both.
    const installed = new Set([...servicePackages, ...browserPackages]);
    const fallback = PASSKEY_CAPABLE_BROWSERS.find((pkg) => installed.has(pkg));
    if (fallback) {
      addLog(
        `[AuthService] Default browser (${defaultBrowserPackage ?? 'none'}) may not support passkeys; opening ceremony in ${fallback}`,
        'INFO'
      );
    } else {
      addLog(
        `[AuthService] No allowlisted passkey browser installed; using default (${defaultBrowserPackage ?? 'none'})`,
        'DEBUG',
        [...installed]
      );
    }
    return fallback;
  } catch (err) {
    addLog(`[AuthService] Could not inspect installed browsers: ${err}`, 'WARNING');
    return undefined;
  }
};

/**
 * Triggers native passkey (WebAuthn/FIDO2) sign-in flow.
 */
export const loginWithPasskey = async (serverUrl: string): Promise<LoginSuccess> => {
  const baseUrl = normalizeUrl(serverUrl);

  if (!__DEV__ && !baseUrl.startsWith('https://')) {
    throw new LoginError('A secure (HTTPS) server URL is required to sign in.');
  }

  await clearAuthCookies();
  await clearSsoDanceCookies();

  addLog('[AuthService] Initiating browser-based passkey login flow', 'INFO');

  const authUrl = `${baseUrl}/api/auth/web-login/passkey`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, SSO_CALLBACK_URL, {
    browserPackage: await getPasskeyBrowserPackage(),
  });

  if (result.type !== 'success') {
    addLog('[AuthService] Browser-based passkey login was cancelled or failed.', 'ERROR');
    throw new LoginError('Passkey authentication cancelled or did not complete.');
  }

  if (!result.url) {
    addLog('[AuthService] Browser-based passkey login returned no redirect URL.', 'ERROR');
    throw new LoginError('Passkey authentication cancelled or did not complete.');
  }

  let sessionToken: string | null = null;
  let email: string | null = null;
  let role: string | undefined = undefined;

  try {
    // Session details ride in the URL fragment (after #), never the query
    // string, so the raw token is not sent to the server or captured in proxy
    // / access logs. Parse the fragment directly.
    const fragment = result.url.split('#')[1] ?? '';
    const params = new URLSearchParams(fragment);
    sessionToken = params.get('token');
    email = params.get('email');
    role = params.get('role') || undefined;
  } catch (parseErr) {
    addLog(`[AuthService] Error parsing redirect URL: ${parseErr}`, 'ERROR');
  }

  if (!sessionToken || !email) {
    addLog('[AuthService] No session details in redirect URL.', 'ERROR');
    throw new LoginError('Passkey authentication was cancelled or did not complete.');
  }

  addLog('[AuthService] Passkey login flow completed successfully.', 'INFO');

  return {
    type: 'success',
    sessionToken,
    user: {
      email,
      role,
    },
  };
};

export interface MobilePasskeyRecord {
  id: string;
  name: string | null;
  createdAt: string | Date;
}

/**
 * Retrieves the list of passkeys registered for the current authenticated user.
 */
export const getPasskeys = async (serverUrl: string, sessionToken: string): Promise<MobilePasskeyRecord[]> => {
  const baseUrl = normalizeUrl(serverUrl);
  const authClient = createSsoAuthClient(baseUrl, { Authorization: `Bearer ${sessionToken}` });

  addLog('[AuthService] Fetching registered passkeys', 'INFO');
  const res = await authClient.$fetch<MobilePasskeyRecord[]>('/passkey/list-user-passkeys', {
    method: 'GET',
  });

  if (res.error) {
    const msg = res.error.message || 'Failed to fetch passkeys';
    addLog(`[AuthService] Failed to fetch passkeys: ${msg}`, 'ERROR');
    throw new Error(msg);
  }

  return res.data || [];
};

/**
 * Mints a single-use, short-lived passkey registration ticket from the server.
 * The ticket (not the raw session token) is what gets handed to the browser
 * registration page, so the long-lived session token never appears in a URL.
 *
 * Throws `LoginError('SESSION_NOT_FRESH', 403)` when the server rejects the
 * session as stale — the caller should re-authenticate and retry.
 */
export const requestPasskeyRegistrationTicket = async (
  serverUrl: string,
  sessionToken: string
): Promise<string> => {
  const baseUrl = normalizeUrl(serverUrl);
  const res = await fetchWithTimeout(`${baseUrl}/api/auth/web-login/register-ticket`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...pendingProxyHeaders,
      Authorization: `Bearer ${sessionToken}`,
    },
  }, DEFAULT_API_TIMEOUT_MS);

  if (res.status === 403) {
    const body = await res.json().catch(() => ({}));
    if (body?.code === 'SESSION_NOT_FRESH') {
      throw new LoginError('SESSION_NOT_FRESH', 403);
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || 'Failed to start passkey registration.');
  }

  const data = await res.json();
  if (!data?.ticket) {
    throw new Error('Server did not return a registration ticket.');
  }
  return data.ticket as string;
};

/**
 * Registers a new passkey with the server via the browser bridge. Mints a
 * one-time ticket first (so the raw session token never rides in a URL), then
 * opens the register page with the ticket in the URL fragment.
 */
export const addPasskey = async (
  serverUrl: string,
  sessionToken: string,
  name: string
): Promise<void> => {
  const baseUrl = normalizeUrl(serverUrl);

  addLog('[AuthService] Requesting passkey registration ticket', 'INFO');
  const ticket = await requestPasskeyRegistrationTicket(baseUrl, sessionToken);

  addLog('[AuthService] Opening browser-based passkey registration flow', 'INFO');
  // Ticket rides in the fragment (never sent to the server) and is single-use,
  // so it can't be replayed even if the URL leaks.
  const registerUrl = `${baseUrl}/api/auth/web-login/register-passkey#ticket=${encodeURIComponent(
    ticket
  )}&name=${encodeURIComponent(name)}`;

  const result = await WebBrowser.openAuthSessionAsync(registerUrl, SSO_CALLBACK_URL, {
    browserPackage: await getPasskeyBrowserPackage(),
  });

  if (result.type !== 'success' || !result.url) {
    addLog('[AuthService] Browser-based passkey registration was cancelled or failed.', 'ERROR');
    throw new Error('Passkey registration cancelled or did not complete.');
  }

  if (result.url.includes('status=expired')) {
    throw new Error('This registration link expired. Please try again.');
  }
  if (!result.url.includes('status=success')) {
    throw new Error('Passkey registration did not succeed.');
  }

  addLog('[AuthService] Passkey successfully registered via browser flow.', 'INFO');
};

/**
 * Deletes a registered passkey.
 */
export const deletePasskey = async (serverUrl: string, sessionToken: string, id: string): Promise<void> => {
  const baseUrl = normalizeUrl(serverUrl);

  addLog(`[AuthService] Deleting passkey: ${id}`, 'INFO');
  // Use a plain fetch (not the better-auth client) so the Authorization header
  // is sent exactly as given — the better-fetch client dropped it when per-call
  // headers were supplied, leaving delete requests unauthenticated. The server's
  // /api/auth interceptor converts this Bearer token into the session cookie.
  const response = await fetchWithTimeout(`${baseUrl}/api/auth/passkey/delete-passkey`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...pendingProxyHeaders,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
      // Better Auth rejects state-changing requests with a missing/null Origin.
      // The app scheme is a trusted origin (see auth.ts trustedOrigins), so send
      // it explicitly — native fetch (unlike a browser) allows setting Origin.
      Origin: 'sparkyfitnessmobile://',
    },
    body: JSON.stringify({ id }),
  }, DEFAULT_API_TIMEOUT_MS);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let msg = 'Failed to delete passkey';
    try {
      msg = JSON.parse(errText).message || msg;
    } catch {
      // non-JSON error body; keep the default message
    }
    addLog(`[AuthService] Failed to delete passkey: ${msg}`, 'ERROR');
    throw new Error(msg);
  }
};

