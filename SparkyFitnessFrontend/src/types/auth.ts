import { OidcProvider } from './admin';

export interface AuthResponse {
  userId: string;
  email?: string;
  fullName?: string;
  token?: string;
  role?: string;
  message?: string;
  status?: 'MFA_REQUIRED' | 'LOGIN_SUCCESS';
  twoFactorRedirect?: boolean; // Better Auth native 2FA flag
  mfa_totp_enabled?: boolean;
  mfa_email_enabled?: boolean;
  needs_mfa_setup?: boolean;
  mfaToken?: string;
}

export interface LoginSettings {
  email: {
    enabled: boolean;
  };
  oidc: {
    enabled: boolean;
    providers: OidcProvider[];
    /** When true (e.g. SPARKY_FITNESS_OIDC_AUTO_REDIRECT), allow auto-redirect to single provider when email login is disabled. */
    auto_redirect?: boolean;
  };
  warning?: string | null;
}

export interface AccessibleUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  permissions: {
    diary: boolean;
    checkin: boolean;
    reports: boolean;
    food_list: boolean;
    calorie: boolean;
  };
  access_end_date: string | null;
}
