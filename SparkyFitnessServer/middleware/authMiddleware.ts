import { APIError } from 'better-auth/api';
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
const authUnavailableRetryAfterSeconds = 5;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const authenticate = async (req: any, res: any, next: any) => {
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
        headers: req.headers,
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
      // Read-only API keys (issue #2678) may only read. The check sits here so
      // it covers every route behind `authenticate`, including /mcp.
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
      req.authenticatedUserId = session.user.id;
      req.originalUserId = req.authenticatedUserId;
      req.user = session.user; // Full user object (includes role)

      // Asynchronously update last login if it hasn't been updated in the last hour
      const lastLogin =
        (session.user as any).lastLoginAt ||
        (session.user as any).last_login_at;
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (!lastLogin || new Date(lastLogin) < oneHourAgo) {
        const nowStr = new Date().toISOString();
        (session.user as any).lastLoginAt = nowStr;
        (session.user as any).last_login_at = nowStr;
        userRepository.updateUserLastLogin(session.user.id).catch((err) => {
          log('error', 'Failed to update user last login in middleware:', err);
        });
      }
      // Handle 'sparky_active_user_id' cookie for context switching
      const activeUserId = req.cookies.sparky_active_user_id;
      if (activeUserId && activeUserId !== req.authenticatedUserId) {
        // Must stay in sync with authService.switchUserContext: any permission
        // that lets a delegate switch context must also be honored here, or the
        // cookie is set on switch but silently reverted on every later request.
        const [hasReports, hasDiary, hasCheckin, hasMedications] =
          await Promise.all([
            canAccessUserData(activeUserId, 'reports', req.authenticatedUserId),
            canAccessUserData(activeUserId, 'diary', req.authenticatedUserId),
            canAccessUserData(activeUserId, 'checkin', req.authenticatedUserId),
            canAccessUserData(
              activeUserId,
              'medications',
              req.authenticatedUserId
            ),
          ]);
        if (hasReports || hasDiary || hasCheckin || hasMedications) {
          req.activeUserId = activeUserId;
          log(
            'info',
            `Authentication: Context switched. User ${req.authenticatedUserId} acting as ${req.activeUserId}`
          );
        } else {
          log(
            'warn',
            `Authentication: Context access denied for User ${req.authenticatedUserId} -> ${activeUserId}`
          );
          req.activeUserId = req.authenticatedUserId;
        }
      } else {
        req.activeUserId = req.authenticatedUserId;
      }
      req.userId = req.activeUserId; // RLS context
      // Ensure user initialization
      try {
        await userRepository.ensureUserInitialization(
          session.user.id,
          session.user.name
        );
      } catch (err) {
        log(
          'error',
          `Lazy Initialization failed for user ${session.user.id}:`,
          err
        );
      }
      return dbContextStorage.run(
        { authenticatedUserId: req.originalUserId || req.authenticatedUserId },
        next
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
  return res.status(401).json({ error: 'Authentication required.' });
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isAdmin = async (req: any, res: any, next: any) => {
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
export { isAdmin };
export default {
  authenticate,
  isAdmin,
};
