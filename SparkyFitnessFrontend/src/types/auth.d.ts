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

export interface OidcProvider {
    id: string;
    display_name: string;
    logo_url: string;
    auto_register?: boolean;
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