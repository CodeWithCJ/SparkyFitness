import { createAuthClient } from 'better-auth/react';
import {
  magicLinkClient,
  twoFactorClient,
  adminClient,
  emailOTPClient,
} from 'better-auth/client/plugins';
import { apiKeyClient } from '@better-auth/api-key/client';
import { ssoClient } from '@better-auth/sso/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';

export function followOAuthRedirect(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;

  const redirectUrl =
    'redirect_uri' in data && typeof data.redirect_uri === 'string'
      ? data.redirect_uri
      : 'redirect' in data &&
          data.redirect === true &&
          'url' in data &&
          typeof data.url === 'string'
        ? data.url
        : null;
  if (!redirectUrl) return false;

  window.location.assign(redirectUrl);
  return true;
}

export function followOAuthRedirectOrThrow(
  data: unknown,
  missingRedirectMessage: string
): void {
  if (!followOAuthRedirect(data)) {
    throw new Error(missingRedirectMessage);
  }
}

export const authClient = createAuthClient({
  // Use /api/auth as the base URL.
  baseURL: window.location.origin + '/api/auth',
  // Every plugin must keep its own inferred type. Widening any one of them to
  // the bare `BetterAuthClientPlugin` interface (`adminClient() as unknown as
  // BetterAuthClientPlugin` used to sit here) erases that plugin's actions, and
  // since 1.7 that collapses the whole inferred client to an index signature --
  // every `authClient.x` then fails `noPropertyAccessFromIndexSignature` and
  // `useSession()` data degrades to `never`. Do not re-add a cast here.
  plugins: [
    magicLinkClient(),
    adminClient(),
    twoFactorClient(),
    emailOTPClient(),
    ssoClient(),
    passkeyClient(),
    apiKeyClient(),
    oauthProviderClient(),
  ],
  // Completely disable session polling to prevent automatic refreshes on tab focus
  fetchOptions: {
    onError: async (error) => {
      console.error('[Auth Client] Error:', error);
    },
  },
});
