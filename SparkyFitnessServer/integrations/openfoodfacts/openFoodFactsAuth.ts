import { log } from '../../config/logging.js';
import pkg from '../../package.json' with { type: 'json' };

interface SessionCacheEntry {
  session: string | null;
  expiresAt: number;
}

interface OpenFoodFactsProviderDetails {
  provider_type?: string;
  app_id?: string | null;
  app_key?: string | null;
}

// Per-process in-memory cache of OFF session cookies. Keyed by
// `${authenticatedUserId}:${providerId}` so a cached cookie for user A can
// never be served to user B. Not persisted — each server process keeps its
// own cache, which is acceptable at our traffic profile.
const sessionCache = new Map<string, SessionCacheEntry>();
// Coalesce concurrent logins for the same cache key into a single in-flight
// promise, so a burst of requests after TTL expiry only triggers one login
// against OFF rather than a stampede.
const inFlightLogins = new Map<string, Promise<string | null>>();

const POSITIVE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const NEGATIVE_TTL_MS = 30 * 1000; // 30 seconds
const LOGIN_URL = 'https://world.openfoodfacts.org/cgi/session.pl';
const USER_AGENT = `${pkg.name}/${pkg.version} (https://github.com/CodeWithCJ/SparkyFitness)`;

function cacheKey(userId: string, providerId: string): string {
  return `${userId}:${providerId}`;
}

function getCachedEntry(key: string): SessionCacheEntry | null {
  const entry = sessionCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    sessionCache.delete(key);
    return null;
  }
  return entry;
}

function parseSessionCookie(response: Response): string | null {
  // Node 20+ supports Headers.getSetCookie() which returns all Set-Cookie
  // headers as an array — the single-value .get('set-cookie') folds them
  // into one comma-joined string that can't be parsed reliably.
  let setCookies: string[] = [];
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
    raw?: () => Record<string, string[]>;
  };
  if (headers && typeof headers.getSetCookie === 'function') {
    setCookies = headers.getSetCookie();
  } else if (headers && typeof headers.raw === 'function') {
    setCookies = headers.raw()['set-cookie'] || [];
  }
  for (const cookieStr of setCookies) {
    const match = /(?:^|;\s*)session=([^;]+)/.exec(cookieStr);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

async function loginToOpenFoodFacts(
  userId: string,
  password: string
): Promise<string | null> {
  const body = new URLSearchParams({
    user_id: userId,
    password,
    '.submit': 'Sign-in',
  }).toString();

  log('info', `OpenFoodFacts: attempting login for user_id="${userId}"`);
  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    redirect: 'manual',
  });

  const session = parseSessionCookie(response);
  if (!session) {
    log(
      'info',
      `OpenFoodFacts: login returned no session cookie for ${userId}`
    );
    return null;
  }

  // OFF returns 200 with an HTML page containing an error marker when the
  // credentials are wrong but still sets a cookie; guard against that.
  try {
    const text = await response.text();
    if (/Incorrect user name or password/i.test(text)) {
      log('info', `OpenFoodFacts: login rejected for ${userId}`);
      return null;
    }
  } catch {
    // Body read failures are non-fatal — trust the cookie we already parsed.
  }

  return session;
}

async function getOpenFoodFactsSessionCookie(
  authenticatedUserId: string,
  providerId: string
): Promise<string | null> {
  if (!authenticatedUserId || !providerId) {
    return null;
  }
  const key = cacheKey(authenticatedUserId, providerId);

  const cached = getCachedEntry(key);
  if (cached) {
    return cached.session;
  }

  const existing = inFlightLogins.get(key);
  if (existing) {
    return existing;
  }

  // Lazy-require to avoid a circular dependency:
  //   externalProviderService → openFoodFactsAuth (invalidate hook)
  //   openFoodFactsAuth → externalProviderService (cred fetch)

  const loginPromise: Promise<string | null> = (async () => {
    let providerDetails: OpenFoodFactsProviderDetails | null;
    try {
      const { default: externalProviderService } =
        await import('../../services/externalProviderService.js');
      providerDetails =
        await externalProviderService.getExternalDataProviderDetails(
          authenticatedUserId,
          providerId
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(
        'debug',
        `OpenFoodFacts: provider lookup rejected for user ${authenticatedUserId}, provider ${providerId}: ${message}`
      );
      sessionCache.set(key, {
        session: null,
        expiresAt: Date.now() + NEGATIVE_TTL_MS,
      });
      return null;
    }

    if (
      !providerDetails ||
      providerDetails.provider_type !== 'openfoodfacts' ||
      !providerDetails.app_id ||
      !providerDetails.app_key
    ) {
      sessionCache.set(key, {
        session: null,
        expiresAt: Date.now() + NEGATIVE_TTL_MS,
      });
      return null;
    }

    let session: string | null = null;
    try {
      session = await loginToOpenFoodFacts(
        providerDetails.app_id,
        providerDetails.app_key
      );
    } catch (error) {
      log('warn', `OpenFoodFacts login threw for ${key}:`, error);
    }

    if (!session) {
      sessionCache.set(key, {
        session: null,
        expiresAt: Date.now() + NEGATIVE_TTL_MS,
      });
      return null;
    }

    sessionCache.set(key, {
      session,
      expiresAt: Date.now() + POSITIVE_TTL_MS,
    });
    return session;
  })();

  inFlightLogins.set(key, loginPromise);
  try {
    return await loginPromise;
  } finally {
    inFlightLogins.delete(key);
  }
}

function invalidateOpenFoodFactsSession(
  authenticatedUserId: string,
  providerId: string
): void {
  if (!authenticatedUserId || !providerId) return;
  sessionCache.delete(cacheKey(authenticatedUserId, providerId));
}

// Exposed for tests only — lets a test reset cache state between cases
// without digging into the module internals.
function __resetForTests(): void {
  sessionCache.clear();
  inFlightLogins.clear();
}

export {
  getOpenFoodFactsSessionCookie,
  invalidateOpenFoodFactsSession,
  loginToOpenFoodFacts,
  __resetForTests,
};
