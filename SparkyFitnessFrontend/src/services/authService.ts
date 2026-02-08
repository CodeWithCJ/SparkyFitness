import { authClient } from '../lib/auth-client';
import { AuthResponse, LoginSettings } from '../types/auth';

export const requestMagicLink = async (email: string): Promise<void> => {
  const { error } = await authClient.signIn.magicLink({
    email,
    callbackURL: window.location.origin,
  });
  if (error) throw error;
};

export const registerUser = async (email: string, password: string, fullName: string): Promise<AuthResponse> => {
  const { data, error } = await authClient.signUp.email({
    email,
    password,
    name: fullName,
  });

  if (error) {
    if (error.status === 409) {
      const err = new Error('User with this email already exists.');
      (err as any).code = '23505';
      throw err;
    }
    throw error;
  }

  return {
    message: 'User registered successfully',
    userId: (data as any)?.user?.id,
    role: ((data as any)?.user as any)?.role || 'user',
    fullName: (data as any)?.user?.name || '',
  } as AuthResponse;
};


export const loginUser = async (email: string, password: string): Promise<AuthResponse> => {
  const { data, error } = await authClient.signIn.email({
    email,
    password,
  });


  if (error) {
    if (error.status === 401) {
      throw new Error('Invalid credentials.');
    }
    throw error;
  }

  // Better Auth native 2FA handling
  if ((data as any)?.twoFactorRedirect) {
    return {
      userId: (data as any)?.user?.id || '',
      email: (data as any)?.user?.email || email,
      status: 'MFA_REQUIRED',
      twoFactorRedirect: true,
      mfa_totp_enabled: (data as any)?.user?.twoFactorEnabled,
      mfa_email_enabled: (data as any)?.user?.mfaEmailEnabled,
    } as AuthResponse;
  }

  return {
    message: 'Login successful',
    userId: (data as any)?.user?.id,
    role: ((data as any)?.user as any)?.role || 'user',
    fullName: (data as any)?.user?.name || '',
  } as AuthResponse;
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: window.location.origin + '/reset-password',
  });
  if (error) throw error;
};

export const resetPassword = async (token: string, newPassword: string): Promise<void> => {
  const { error } = await authClient.resetPassword({
    newPassword,
    token,
  });
  if (error) throw error;
};

export const logoutUser = async (): Promise<void> => {
  await authClient.signOut();
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
  window.location.href = '/';
};

export const initiateOidcLogin = async (providerId: string, requestSignUp: boolean = false) => {
  await authClient.signIn.sso({
    providerId: providerId,
    callbackURL: window.location.origin,
    errorCallbackURL: window.location.origin,
    requestSignUp: requestSignUp,
  });
};

export const getOidcProviders = async (): Promise<any[]> => {
  const response = await fetch('/api/auth/settings');
  if (!response.ok) return [];
  const data = await response.json();
  return data.oidc?.providers || [];
};

export const checkOidcAvailability = async (): Promise<boolean> => {
  const providers = await getOidcProviders();
  return providers.length > 0;
};

export const getLoginSettings = async (): Promise<LoginSettings> => {
  const response = await fetch('/api/auth/settings');
  if (!response.ok) {
    return {
      email: { enabled: true },
      oidc: { enabled: false, providers: [] },
    };
  }
  return await response.json();
};

export const verifyMagicLink = async (token: string): Promise<AuthResponse> => {
  // In Better Auth 1.0, verification can also be done via signIn.magicLink token property
  // if the plugin is configured to support manual verification.
  const { data, error } = await (authClient as any).signIn.magicLink({
    token,
  });

  if (error) throw error;

  // Better Auth native 2FA handling after Magic Link
  if ((data as any)?.twoFactorRedirect) {
    return {
      userId: (data as any)?.user?.id || '',
      email: (data as any)?.user?.email || '',
      status: 'MFA_REQUIRED',
      twoFactorRedirect: true,
      mfa_totp_enabled: (data as any)?.user?.twoFactorEnabled,
      mfa_email_enabled: (data as any)?.user?.mfaEmailEnabled,
    } as AuthResponse;
  }

  return {
    message: 'Magic link login successful',
    userId: (data as any)?.user?.id,
    role: ((data as any)?.user as any)?.role || 'user',
    fullName: (data as any)?.user?.name || '',
  } as AuthResponse;
};
