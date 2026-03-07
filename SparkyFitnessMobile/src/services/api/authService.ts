import { clearSessionToken, ServerConfig } from '../storage';

export class LoginError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'LoginError';
  }
}

export class MfaRequiredError extends Error {
  constructor() {
    super('This account has two-factor authentication enabled. Please use an API key instead.');
    this.name = 'MfaRequiredError';
  }
}

interface LoginResult {
  sessionToken: string;
  user: {
    email: string;
    role?: string;
    twoFactorEnabled?: boolean;
  };
}

let onSessionExpiredCallback: ((configId: string) => void) | null = null;

export const setOnSessionExpired = (cb: (configId: string) => void): void => {
  onSessionExpiredCallback = cb;
};

export const notifySessionExpired = (configId: string): void => {
  onSessionExpiredCallback?.(configId);
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

  const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new LoginError(
      `Sign-in failed: ${response.status} - ${errorText}`,
      response.status,
    );
  }

  const body = await response.json();

  if (body.twoFactorRedirect === true) {
    throw new MfaRequiredError();
  }

  if (!body.token) {
    throw new LoginError('Sign-in response did not include a session token.');
  }

  return {
    sessionToken: body.token,
    user: {
      email: body.user?.email ?? email,
      role: body.user?.role,
      twoFactorEnabled: body.user?.twoFactorEnabled,
    },
  };
};

/**
 * Clears the session token for the given config.
 */
export const logout = async (configId: string): Promise<void> => {
  await clearSessionToken(configId);
  console.log(`[AuthService] Session token cleared for config ${configId}`);
};
