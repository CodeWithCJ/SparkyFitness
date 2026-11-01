import type { NextFunction, Request, Response } from 'express';
import type { JWTPayload } from 'jose';
import { fromNodeHeaders } from 'better-auth/node';
import { APIError } from 'better-auth/api';
import { requireMcpAuth } from '@better-auth/mcp';
import { log } from '../config/logging.js';
import userRepository from '../models/userRepository.js';
import { auth } from '../auth.js';
import { canAccessUserData } from '../utils/permissionUtils.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import { dbContextStorage } from '../db/poolManager.js';
import { isConnectionError } from '../db/connectRetry.js';
import {
  getCachedSession,
  setCachedSession,
} from '../utils/apiKeySessionCache.js';
import { bridgeBearerAuthHeader } from '../utils/bearerAuthBridge.js';
import {
  isApiKeyReadOnly,
  isRequestAllowedForReadOnlyKey,
} from '../utils/apiKeyScope.js';
import {
  getMcpLoopbackJwksUrl,
  getMcpOAuthAvailability,
  getMcpResourceMetadataUrl,
  getMcpResourceUrl,
  getPublicOrigin,
  MCP_OAUTH_SCOPE,
} from '../utils/mcpOAuth.js';
import { isMcpOAuthEnabled } from '../models/globalSettingsRepository.js';
import { isOAuthAuthorizationActive } from '../models/oauthClientRepository.js';

type ParamsDictionary = Record<string, string | string[]>;
type AuthRequest<P extends ParamsDictionary = ParamsDictionary> = Request<P>;

type AuthenticatedUser = Record<string, unknown> & {
  id: string;
  name?: string | null;
};

async function finishAuthentication<P extends ParamsDictionary>(
  req: AuthRequest<P>,
  res: Response,
  next: NextFunction,
  user: AuthenticatedUser,
  apiKeyReadOnly: boolean
) {
  if (
    apiKeyReadOnly &&
    !isRequestAllowedForReadOnlyKey(req.method, req.originalUrl ?? req.path)
  ) {
    log(
      'warn',
      `Authentication: Read-only API key refused for ${req.method} ${req.path}`
    );
    return res.status(403).json({ error: 'This API key is read-only.' });
  }

  req.apiKeyReadOnly = apiKeyReadOnly;
  req.authenticatedUserId = user.id;
  req.originalUserId = user.id;
  req.user = user;

  const lastLogin = user.lastLoginAt ?? user.last_login_at;
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const lastLoginAt =
    typeof lastLogin === 'string' || lastLogin instanceof Date
      ? new Date(lastLogin).getTime()
      : Number.NaN;
  if (!Number.isFinite(lastLoginAt) || lastLoginAt < oneHourAgo) {
    const nowStr = new Date().toISOString();
    user.lastLoginAt = nowStr;
    user.last_login_at = nowStr;
    userRepository.updateUserLastLogin(user.id).catch((err: unknown) => {
      log('error', 'Failed to update user last login in middleware:', err);
    });
  }

  const activeUserId =
    typeof req.cookies?.sparky_active_user_id === 'string'
      ? req.cookies.sparky_active_user_id
      : undefined;
  if (activeUserId && activeUserId !== user.id) {
    const [hasReports, hasDiary, hasCheckin, hasMedications] =
      await Promise.all([
        canAccessUserData(activeUserId, 'reports', user.id),
        canAccessUserData(activeUserId, 'diary', user.id),
        canAccessUserData(activeUserId, 'checkin', user.id),
        canAccessUserData(activeUserId, 'medications', user.id),
      ]);
    if (hasReports || hasDiary || hasCheckin || hasMedications) {
      req.activeUserId = activeUserId;
      log(
        'info',
        `Authentication: Context switched. User ${user.id} acting as ${activeUserId}`
      );
    } else {
      log(
        'warn',
        `Authentication: Context access denied for User ${user.id} -> ${activeUserId}`
      );
      req.activeUserId = user.id;
    }
  } else {
    req.activeUserId = user.id;
  }
  req.userId = req.activeUserId;

  try {
    await userRepository.ensureUserInitialization(
      user.id,
      typeof user.name === 'string'
        ? user.name
        : typeof user.email === 'string'
          ? user.email.split('@')[0] || 'User'
          : 'User'
    );
  } catch (err) {
    log('error', `Lazy Initialization failed for user ${user.id}:`, err);
  }

  return dbContextStorage.run({ authenticatedUserId: user.id }, next);
}

const authUnavailableRetryAfterSeconds = 5;

const authenticate = async <P extends ParamsDictionary>(
  req: AuthRequest<P>,
  res: Response,
  next: NextFunction
) => {
  //log("debug", `authenticate middleware: req.path = ${req.path}, req.headers.cookie = ${req.headers.cookie}`);
  // 1. Better Auth Session & API Key Check (Unified Identity)
  // Tracks the raw API key when this request is API-key-authed, so we can
  // short-circuit Better Auth's per-request verify (which ticks the per-key
  // rate-limit bucket — see issue #1302).
  try {
    // Route Bearer tokens to the correct auth mechanism (shared with the early
    // /api/auth interceptor in SparkyFitnessServer.ts):
    // - API keys (64+ alphanumeric chars, no dots) → x-api-key header
    // - Session tokens (shorter, or contain dots) → signed session cookie
    let apiKeyToken: string | null = (await bridgeBearerAuthHeader(req))
      .apiKeyToken;
    // Pre-existing x-api-key header (i.e. not from the Bearer mapping above)
    // is also subject to the same per-key rate-limit ticking. Treat it the
    // same as a mapped Bearer for cache purposes.
    if (!apiKeyToken && typeof req.headers['x-api-key'] === 'string') {
      apiKeyToken = req.headers['x-api-key'];
    }
    // Short-circuit Better Auth's per-request verify when we have a cached
    // session for this API key. Better Auth's api-key plugin treats every
    // getSession() call as a verification tick and increments
    // api_key.request_count, which trivially exhausts the default
    // 100-req/60s bucket under normal mobile/SPA traffic (issue #1302).
    // Session cookie auth is unaffected and never cached here.
    let session: Awaited<ReturnType<typeof auth.api.getSession>> | null = null;
    // The key's scope is cached with its session, so a read-only key costs one
    // permissions lookup per cache window rather than one per request.
    let apiKeyReadOnly = false;
    if (apiKeyToken) {
      const cached = getCachedSession(apiKeyToken) as {
        session: typeof session;
        readOnly: boolean;
      } | null;
      if (cached) {
        session = cached.session;
        apiKeyReadOnly = cached.readOnly;
      }
    }
    if (!session) {
      session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (session && session.user && apiKeyToken) {
        apiKeyReadOnly = await isApiKeyReadOnly(
          session.user.id,
          session.session?.id
        );
        setCachedSession(apiKeyToken, { session, readOnly: apiKeyReadOnly });
      }
    }
    if (session && session.user) {
      return finishAuthentication(
        req,
        res,
        next,
        session.user as AuthenticatedUser,
        apiKeyReadOnly
      );
    }
  } catch (error) {
    log('error', 'Error checking Better Auth identity:', error);
    // @ts-expect-error TS(2571): Object is of type 'unknown'.
    const code = error?.body?.code;
    if (code === 'RATE_LIMITED') {
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      const retryAfterMs = error.body?.details?.tryAgainIn;
      if (retryAfterMs) {
        res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      }
      return res.status(429).json({ error: 'Rate limit exceeded.' });
    }
    if (code === 'KEY_DISABLED') {
      return res.status(403).json({ error: 'API key is disabled.' });
    }
    if (code === 'KEY_EXPIRED') {
      return res.status(401).json({ error: 'API key has expired.' });
    }
    if (code === 'USAGE_EXCEEDED') {
      return res.status(429).json({ error: 'API key usage limit exceeded.' });
    }
    // Only Better Auth's own 4xx answers mean there is no valid identity.
    // Anything else thrown here means the identity could not be checked (no
    // check in this block refuses by throwing), and a 401 would make clients
    // sign the user out over a database restart or a server bug. Better Auth
    // reports any failure of its session lookup, a lost database included, as
    // a 500 APIError without the cause, so that counts as unavailable too.
    const status = error instanceof APIError ? error.statusCode : undefined;
    const rejected =
      typeof status === 'number' && status >= 400 && status < 500;
    if (!rejected) {
      if (
        isConnectionError(error) ||
        (typeof status === 'number' && status >= 500)
      ) {
        res.set('Retry-After', String(authUnavailableRetryAfterSeconds));
        return res
          .status(503)
          .json({ error: 'Authentication is temporarily unavailable.' });
      }
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
  // No valid authentication found
  log('warn', `Authentication: No valid identity provided for ${req.path}`);
  if (req.mcpOAuthChallenge) {
    res.set('WWW-Authenticate', req.mcpOAuthChallenge);
  }
  return res.status(401).json({ error: 'Authentication required.' });
};

/**
 * Accepts an OAuth access token for /mcp before the legacy Bearer bridge runs.
 * Failed OAuth verification falls back to the unchanged API-key/session path,
 * and its challenge is attached only if that fallback also returns 401.
 */
const authenticateMcp = async <P extends ParamsDictionary>(
  req: AuthRequest<P>,
  res: Response,
  next: NextFunction
) => {
  if (!(await isMcpOAuthEnabled()) || !getMcpOAuthAvailability().available) {
    return authenticate(req, res, next);
  }

  req.mcpOAuthChallenge = `Bearer resource_metadata="${getMcpResourceMetadataUrl()}"`;
  const authorization = req.headers.authorization;
  const bearerToken =
    typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : null;
  const looksLikeApiKey =
    !!bearerToken && bearerToken.length >= 64 && !bearerToken.includes('.');

  if (bearerToken && !looksLikeApiKey) {
    try {
      const verified: JWTPayload[] = [];
      const verifier = requireMcpAuth(
        auth,
        (_request, verifiedClaims) => {
          verified.push(verifiedClaims);
          return new globalThis.Response(null, { status: 204 });
        },
        {
          resource: getMcpResourceUrl(),
          jwksUrl: getMcpLoopbackJwksUrl(),
          requiredScopes: [MCP_OAUTH_SCOPE],
          challengeScopes: [MCP_OAUTH_SCOPE],
        }
      );
      const requestUrl = new URL(req.originalUrl, getPublicOrigin()).toString();
      const verificationResponse = await verifier(
        new globalThis.Request(requestUrl, {
          method: req.method,
          headers: fromNodeHeaders(req.headers),
        })
      );
      const challenge = verificationResponse.headers.get('www-authenticate');
      if (challenge) req.mcpOAuthChallenge = challenge;

      const claims = verified[0];
      const subject = claims?.sub;
      const clientId = claims?.client_id;
      const issuedAt = claims?.iat;
      if (
        verificationResponse.ok &&
        typeof subject === 'string' &&
        typeof clientId === 'string' &&
        typeof issuedAt === 'number' &&
        (await isOAuthAuthorizationActive(subject, clientId, issuedAt))
      ) {
        const user = await userRepository.findAuthIdentityById(subject);
        if (user) {
          return finishAuthentication(
            req,
            res,
            next,
            user as AuthenticatedUser,
            false
          );
        }
        log(
          'warn',
          `[MCP OAuth] Token subject does not match a user: ${subject}`
        );
      }
    } catch (error) {
      // OAuth infrastructure failures must not become a 500 or bypass the
      // existing API-key/session fallback. The normal authentication path
      // below will return the OAuth challenge only if all methods fail.
      log('warn', `[MCP OAuth] Token validation failed: ${String(error)}`);
    }
  }

  return authenticate(req, res, next);
};

const isAdmin = async <P extends ParamsDictionary>(
  req: AuthRequest<P>,
  res: Response,
  next: NextFunction
) => {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  // Admin predicate lives in utils/adminCheck.ts (checks the AUTHENTICATED user,
  // never the context-switched one, to prevent privilege escalation).
  if (await resolveIsAdmin(req.user, req.authenticatedUserId)) {
    return next();
  }
  log('warn', `Admin Check: Access denied for User ${req.userId}`);
  return res.status(403).json({ error: 'Admin access required.' });
};
export { authenticate };
export { authenticateMcp };
export { isAdmin };
export default {
  authenticate,
  authenticateMcp,
  isAdmin,
};
