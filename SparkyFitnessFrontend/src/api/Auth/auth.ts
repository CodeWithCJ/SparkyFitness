import { authClient } from '@/lib/auth-client';
import type { AccessibleUser, AuthResponse, LoginSettings } from '@/types/auth';
import { apiCall } from '../api';

interface AuthError extends Error {
  code?: string;
  status?: number;
}

interface BetterAuthUser {
  id: string;
  email: string;
  name: string;
  role?: string;
  twoFactorEnabled?: boolean;
  mfaEmailEnabled?: boolean;
}

interface BetterAuthResponse {
  user: BetterAuthUser;
  twoFactorRedirect?: boolean;
}

export interface IdentityUserResponse {
  activeUserId: string;
  fullName: string | null;
  activeUserFullName?: string;
  activeUserEmail: string;
}

export interface SwitchContextResponse {
  activeUserId?: string;
}

export const requestMagicLink = async (email: string): Promise<void> => {
  const { error } = await authClient.signIn.magicLink({
    email,
    callbackURL: window.location.origin,
  });
  if (error) throw error;
};

export const registerUser = async (
  email: string,
  password: string,
  fullName: string
): Promise<AuthResponse> => {
  const { data, error } = await authClient.signUp.email({
    email,
    password,
    name: fullName,
  });

  if (error) {
    if (error.status === 409) {
      const err = new Error(
        'User with this email already exists.'
      ) as AuthError;
      err.code = '23505';
      throw err;
    }
    throw error;
  }

  const authData = data as BetterAuthResponse | null;

  return {
    message: 'User registered successfully',
    userId: authData?.user?.id,
    role: authData?.user?.role || 'user',
    fullName: authData?.user?.name || '',
  } as AuthResponse;
};

export const loginUser = async (
  email: string,
  password: string
): Promise<AuthResponse> => {
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

  const authData = data as BetterAuthResponse | null;
  // Better Auth native 2FA handling
  if (authData?.twoFactorRedirect) {
    return {
      userId: authData?.user?.id || '',
      email: authData?.user?.email || email,
      status: 'MFA_REQUIRED',
      twoFactorRedirect: true,
      mfa_totp_enabled: authData?.user?.twoFactorEnabled,
      mfa_email_enabled: authData?.user?.mfaEmailEnabled,
    } as AuthResponse;
  }

  return {
    message: 'Login successful',
    userId: authData?.user?.id,
    role: authData?.user?.role || 'user',
    fullName: authData?.user?.name || '',
  } as AuthResponse;
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await authClient.requestPasswordReset({
    email,
    redirectTo: window.location.origin + '/reset-password',
  });
  if (error) throw error;
};

export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<void> => {
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

export interface OidcLoginParams {
  providerId: string;
  requestSignUp?: boolean;
}
export const initiateOidcLogin = async ({
  providerId,
  requestSignUp = false,
}: OidcLoginParams) => {
  await authClient.signIn.sso({
    providerId: providerId,
    callbackURL: window.location.origin,
    errorCallbackURL: window.location.origin,
    requestSignUp: requestSignUp,
  });
};

export const getLoginSettings = async (): Promise<LoginSettings> => {
  try {
    return await apiCall('/auth/settings', {
      method: 'GET',
    });
  } catch (error) {
    return {
      email: { enabled: true },
      oidc: { enabled: false, providers: [] },
    };
  }
};

export const getMfaFactors = async (email: string) => {
  return await apiCall(`/auth/mfa-factors?email=${encodeURIComponent(email)}`, {
    method: 'GET',
  });
};

export const fetchIdentityUser = async (): Promise<IdentityUserResponse> => {
  return apiCall('/identity/user', {
    method: 'GET',
  });
};

export const switchUserContext = async (
  targetUserId: string
): Promise<SwitchContextResponse> => {
  return apiCall('/identity/switch-context', {
    method: 'POST',
    body: { targetUserId },
  });
};

export const getAccessibleUsers = async (): Promise<AccessibleUser[]> => {
  const data = await apiCall('/identity/users/accessible-users', {
    method: 'GET',
  });

  return (data || []).map((item) => ({
    user_id: item.user_id,
    full_name: item.full_name,
    email: item.email,
    permissions:
      typeof item.permissions === 'object' && item.permissions
        ? {
            diary:
              item.permissions.diary ||
              item.permissions.calorie ||
              item.permissions.can_manage_diary ||
              false,
            checkin:
              item.permissions.checkin ||
              item.permissions.can_manage_checkin ||
              false,
            reports:
              item.permissions.reports ||
              item.permissions.can_view_reports ||
              false,
            food_list:
              item.permissions.food_list ||
              item.permissions.can_view_food_library ||
              false,
            calorie: item.permissions.calorie || false,
          }
        : {
            diary: false,
            checkin: false,
            reports: false,
            food_list: false,
            calorie: false,
          },
    access_end_date: item.access_end_date,
  }));
};
