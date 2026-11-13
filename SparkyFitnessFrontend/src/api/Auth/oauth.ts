import { apiCall } from '@/api/api';
import { authClient, followOAuthRedirectOrThrow } from '@/lib/auth-client';
import i18n from 'i18next';

export interface OAuthConsentDetails {
  client: {
    clientId: string;
    name: string | null;
    uri: string | null;
    icon: string | null;
  };
  scopes: string[];
  redirectUri: string;
}

export interface OAuthAuthorization {
  consentId: string;
  clientId: string;
  name: string | null;
  uri: string | null;
  icon: string | null;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OAuthAuthorizationsResponse {
  enabled: boolean;
  authorizations: OAuthAuthorization[];
}

export function getOAuthConsentDetails(
  signedQuery: string
): Promise<OAuthConsentDetails> {
  return apiCall(
    `/auth/oauth-consent-details?query=${encodeURIComponent(signedQuery)}`,
    { method: 'GET' }
  );
}

export function getOAuthAuthorizations(): Promise<OAuthAuthorizationsResponse> {
  return apiCall('/identity/user/oauth-authorizations', { method: 'GET' });
}

export function revokeOAuthAuthorization(consentId: string): Promise<void> {
  return apiCall(`/identity/user/oauth-authorizations/${consentId}`, {
    method: 'DELETE',
  });
}

export async function submitOAuthConsent(accept: boolean): Promise<void> {
  const { data, error } = await authClient.oauth2.consent({ accept });
  if (error) throw error;
  followOAuthRedirectOrThrow(data, i18n.t('auth.oauth.missingRedirectUrl'));
}
