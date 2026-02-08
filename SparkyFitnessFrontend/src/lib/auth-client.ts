import { createAuthClient } from "better-auth/react";
import { magicLinkClient, adminClient, twoFactorClient, apiKeyClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
    // Use /api/auth as the base URL.
    baseURL: window.location.origin + "/api/auth",
    plugins: [
        magicLinkClient(),
        adminClient(),
        twoFactorClient(),
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
