import { createAuthMiddleware } from 'better-auth/api';
import type { BetterAuthPlugin } from 'better-auth';

/**
 * The official @better-auth/expo server plugin relays the session Set-Cookie
 * as a ?cookie= query param on app-scheme redirects so the Expo client can
 * store it, but its after-hook only matches /callback, /oauth2/callback,
 * /magic-link/verify and /verify-email. The @better-auth/sso plugin redirects
 * from /sso/callback/:providerId, so this plugin replicates the same relay
 * for that path.
 */
export const expoSsoCookieRelay = () =>
  ({
    id: 'expo-sso-cookie-relay',
    hooks: {
      after: [
        {
          matcher: (ctx) => !!ctx.path?.startsWith('/sso/callback'),
          handler: createAuthMiddleware(async (ctx) => {
            const headers = ctx.context.responseHeaders;
            const location = headers?.get('location');
            if (!location) return;
            let redirectURL: URL;
            try {
              redirectURL = new URL(location);
            } catch {
              return;
            }
            // Browser redirects (web SSO) keep normal cookies — only rewrite
            // app-scheme redirects like sparkyfitnessmobile://oauth-callback.
            if (
              redirectURL.protocol === 'http:' ||
              redirectURL.protocol === 'https:'
            ) {
              return;
            }
            if (!ctx.context.isTrustedOrigin(location)) return;
            const cookie = headers?.get('set-cookie');
            if (!cookie) return;
            redirectURL.searchParams.set('cookie', cookie);
            ctx.setHeader('location', redirectURL.toString());
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
