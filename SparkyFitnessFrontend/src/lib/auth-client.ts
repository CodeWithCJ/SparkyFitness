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
import { BetterAuthClientPlugin } from 'better-auth';

export const authClient = createAuthClient({
  // Use /api/auth as the base URL.
  baseURL: window.location.origin + '/api/auth',
  plugins: [
    magicLinkClient(),
    adminClient() as unknown as BetterAuthClientPlugin,
    twoFactorClient(),
    emailOTPClient(),
    ssoClient(),
    passkeyClient(),
    apiKeyClient(),
  ],
  // Completely disable session polling to prevent automatic refreshes on tab focus
  fetchOptions: {
    onError: async (error) => {
      console.error('[Auth Client] Error:', error);
    },
  },
});
