export interface AuthResponse {
  userId: string;
  token: string;
  role: string;
  message: string;
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