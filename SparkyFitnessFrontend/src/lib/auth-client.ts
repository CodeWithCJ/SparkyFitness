import { createAuthClient } from "better-auth/react";
import { magicLinkClient, adminClient, twoFactorClient, apiKeyClient } from "better-auth/client/plugins";
import { ssoClient } from "@better-auth/sso/client";
import { passkeyClient } from "@better-auth/passkey/client";

export const authClient = createAuthClient({
    // Use /auth as the base URL. Vite proxy will handle the redirection to the backend.
    baseURL: window.location.origin + "/auth",
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
