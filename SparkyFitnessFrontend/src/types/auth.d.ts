export interface AuthResponse {
  userId: string;
  email?: string; // Add email property
  token?: string; // Token is optional, as it won't be present if MFA is required
  role?: string; // Role is optional, as it won't be present if MFA is required
  message?: string; // Make message optional as it might not always be present with MFA_REQUIRED
  status?: 'MFA_REQUIRED' | 'LOGIN_SUCCESS'; // Add status for MFA and successful login
  mfa_totp_enabled?: boolean;
  mfa_email_enabled?: boolean;
  needs_mfa_setup?: boolean;
  mfaToken?: string; // Add mfaToken for MFA challenge flow
}

export interface OidcProvider {
  id: number;
  display_name: string;
  logo_url: string;
}

export interface LoginSettings {
  email: {
    enabled: boolean;
  };
  oidc: {
    enabled: boolean;
    providers: OidcProvider[];
  };
  warning?: string | null;
}
export type AuthType = 'password' | 'oidc' | 'magic_link';