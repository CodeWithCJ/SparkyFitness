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
import { getBasePath } from '@/utils/basePath';

export function getAuthBaseUrl(): string {
  return window.location.origin + getBasePath() + '/api/auth';
}

export const authClient = createAuthClient({
  // Use /api/auth as the base URL, adjusted for the configured sub-path.
  baseURL: getAuthBaseUrl(),
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
