import { serializeSignedCookie } from 'better-call';
import { auth } from '../auth.js';
import { log } from '../config/logging.js';

interface BearerBridgeRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface BearerBridgeResult {
  /** The raw API key when the Bearer token was an API key, otherwise null. */
  apiKeyToken: string | null;
}

/**
 * Translates an incoming `Authorization: Bearer <token>` header into the form
 * Better Auth expects, mutating `req.headers` in place:
 *
 *  - API keys (64+ characters, no dots) → `x-api-key` header.
 *  - Session tokens → a signed `<prefix>.session_token` cookie so `getSession()`
 *    resolves them. This is done manually (instead of the bearer plugin) to work
 *    around a compatibility issue with Buffer secrets in `@better-auth/utils/hmac`.
 *
 * Returns the raw API key when the Bearer token was one (so callers can manage
 * per-key rate-limit caching). Safe to call when no Bearer header is present.
 *
 * This is the single source of truth for Bearer→cookie translation, shared by
 * `middleware/authMiddleware.ts` and the early `/api/auth` interceptor in
 * `SparkyFitnessServer.ts`.
 */
export async function bridgeBearerAuthHeader(
  req: BearerBridgeRequest
): Promise<BearerBridgeResult> {
  const authorization = req.headers.authorization;
  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return { apiKeyToken: null };
  }

  const token = authorization.split(' ')[1];
  if (!token) {
    return { apiKeyToken: null };
  }

  // API key: 64+ characters with no dots.
  if (token.length >= 64 && !token.includes('.')) {
    req.headers['x-api-key'] = token;
    delete req.headers.authorization;
    log(
      'debug',
      'Authentication: Mapped Bearer token to x-api-key (API key detected).'
    );
    return { apiKeyToken: token };
  }

  // Session token: sign it and inject as a session cookie.
  const prefix = auth.options.advanced?.cookiePrefix || 'better-auth';
  const secureCookiePrefix = auth.options.advanced?.useSecureCookies
    ? '__Secure-'
    : '';
  const cookieName = `${secureCookiePrefix}${prefix}.session_token`;
  const signed = await serializeSignedCookie(
    cookieName,
    token,
    // @ts-expect-error auth.options.secret is typed string | undefined but is a Buffer at runtime
    auth.options.secret
  );
  const cookieHeader = signed.split(';')[0];
  const existingCookie = req.headers.cookie;
  req.headers.cookie =
    typeof existingCookie === 'string' && existingCookie
      ? `${existingCookie}; ${cookieHeader}`
      : cookieHeader;
  delete req.headers.authorization;
  log(
    'debug',
    'Authentication: Converted Bearer session token to session cookie.'
  );
  return { apiKeyToken: null };
}
