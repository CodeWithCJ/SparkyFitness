/**
 * Better Auth always mounts at the unprefixed `/api/auth` path internally
 * (see auth.ts's `basePath`), because that is what the server actually
 * receives once a reverse proxy has stripped SPARKY_BASE_PATH before
 * forwarding the request. Its generated URLs (password-reset links,
 * magic-link emails, OAuth/OIDC redirect URIs) are built from that same
 * unprefixed base, so under a sub-path deployment they omit the prefix a
 * browser needs to route back through the proxy to this app.
 *
 * These helpers re-insert the sub-path into those *public* URLs only,
 * without touching the internal routing base path.
 */

function toParseableUrl(rawUrl: string): string {
  return rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
}

/** Extracts SPARKY_FITNESS_FRONTEND_URL's path (e.g. `/sparky`), or `''` for a root deployment. */
export function getFrontendSubPath(frontendUrl: string | undefined): string {
  if (!frontendUrl) {
    return '';
  }
  try {
    const pathname = new URL(toParseableUrl(frontendUrl)).pathname.replace(
      /\/+$/,
      ''
    );
    return pathname;
  } catch {
    return '';
  }
}

/** Inserts `subPath` into a Better Auth-generated public URL's path, once. */
export function withPublicAuthPrefix(url: string, subPath: string): string {
  if (!subPath) {
    return url;
  }
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith(subPath)) {
      return url;
    }
    parsed.pathname = `${subPath}${parsed.pathname}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Builds the shared SSO/OIDC callback URL (`{subPath}/api/auth/sso/callback`)
 * for the `sso()` plugin's `redirectURI` option. Returns `undefined` for a
 * root deployment so the plugin keeps its default per-provider callback
 * path — existing OIDC providers already registered with that URL keep
 * working unchanged.
 */
export function getSharedSsoRedirectUri(
  frontendUrl: string | undefined,
  subPath: string
): string | undefined {
  if (!subPath || !frontendUrl) {
    return undefined;
  }
  try {
    const origin = new URL(toParseableUrl(frontendUrl)).origin;
    return `${origin}${subPath}/api/auth/sso/callback`;
  } catch {
    return undefined;
  }
}
