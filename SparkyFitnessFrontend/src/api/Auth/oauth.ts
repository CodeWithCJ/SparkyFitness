import { apiCall } from '@/api/api';
import { authClient, followOAuthRedirect } from '@/lib/auth-client';

export interface OAuthConsentDetails {
  client: {
    clientId: string;
    name: string | null;
    uri: string | null;
    icon: string | null;
  };
  scopes: string[];
}

export function getOAuthConsentDetails(
  signedQuery: string
): Promise<OAuthConsentDetails> {
  return apiCall(
    `/auth/oauth-consent-details?query=${encodeURIComponent(signedQuery)}`,
    { method: 'GET' }
  );
}

export async function submitOAuthConsent(accept: boolean): Promise<void> {
  const { data, error } = await authClient.oauth2.consent({ accept });
  if (error) throw error;
  if (!followOAuthRedirect(data)) {
    throw new Error('The OAuth provider did not return a redirect URL.');
  }
}
