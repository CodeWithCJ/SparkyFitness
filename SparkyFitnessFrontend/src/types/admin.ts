export interface GlobalSettings {
  enable_email_password_login: boolean;
  is_oidc_active: boolean;
  is_mfa_mandatory: boolean;
  allow_user_ai_config?: boolean;
  is_email_login_env_configured?: boolean;
  is_oidc_active_env_configured?: boolean;
  telegram_bot_token?: string | null;
  telegram_bot_name?: string | null;
}

export interface OidcProvider {
  id?: string;
  issuer_url: string;
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  scope: string;
  token_endpoint_auth_method: string;
  response_types: string[];
  is_active: boolean;
  display_name?: string;
  logo_url?: string;
  auto_register?: boolean;
  signing_algorithm?: string;
  profile_signing_algorithm?: string;
  timeout?: number;
  domain?: string;
  provider_id?: string;
  is_env_configured?: boolean;
}

export interface CreateOidcProvider {
  id: string;
  message: string;
}
