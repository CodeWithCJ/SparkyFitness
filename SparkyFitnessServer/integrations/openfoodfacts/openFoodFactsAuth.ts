import crypto from 'crypto';
import { log } from '../../config/logging.js';
import pkg from '../../package.json' with { type: 'json' };
import { ENCRYPTION_KEY } from '../../security/encryption.js';

interface SessionCacheEntry {
  session: string | null;
  baseUrl: string;
  configurationIdentity: string | null;
  expiresAt: number;
}

export interface OpenFoodFactsProviderConfiguration {
  id?: string | null;
  user_id?: string | null;
  provider_type?: string;
  app_id?: string | null;
  app_key?: string | null;
  base_url?: string | null;
  is_public?: boolean;
  is_active?: boolean | null;
}

export interface ResolvedOpenFoodFactsProvider {
  session: string | null;
  baseUrl: string;
  configurationIdentity: string | null;
}

export type OpenFoodFactsCredentialScope = 'personal' | 'global';

export const DEFAULT_OFF_BASE_URL = 'https://world.openfoodfacts.org';

export function normalizeBaseUrl(url?: string | null): string {
  const trimmed = url?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : DEFAULT_OFF_BASE_URL;
}

function isSecureCredentialTarget(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).protocol === 'https:';
  } catch {
    return false;
  }
}

export function createOpenFoodFactsProviderConfigurationIdentity(
  provider: OpenFoodFactsProviderConfiguration
): string {
  const configuration = JSON.stringify({
    id: provider.id ?? null,
    userId: provider.user_id ?? null,
    providerType: provider.provider_type ?? null,
    isActive: provider.is_active ?? null,
    isPublic: provider.is_public ?? null,
    baseUrl: normalizeBaseUrl(provider.base_url),
    username: provider.app_id ?? null,
    password: provider.app_key ?? null,
  });
  return crypto
    .createHmac('sha256', ENCRYPTION_KEY)
    .update(configuration)
    .digest('hex');
}

export function openFoodFactsStagingAuthHeaders(
  baseUrl: string
): Record<string, string> {
  try {
    const parsed = new URL(normalizeBaseUrl(baseUrl));
    if (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'world.openfoodfacts.net'
    ) {
      // OFF documents off:off as the public HTTP Basic gate for its staging
      // environment. The contributor account still authenticates separately.
      return { Authorization: 'Basic b2ZmOm9mZg==' };
    }
  } catch {
    // URL validation is handled by the caller at its normal API boundary.
  }
  return {};
}

export class InsecureOpenFoodFactsWriteUrlError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'InsecureOpenFoodFactsWriteUrlError';
  }
}

export function assertSecureOpenFoodFactsWriteBaseUrl(
  url?: string | null
): string {
  const normalized = normalizeBaseUrl(url);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new InsecureOpenFoodFactsWriteUrlError(
      'Open Food Facts contribution base URL is malformed.'
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new InsecureOpenFoodFactsWriteUrlError(
      'Authenticated Open Food Facts contributions require an HTTPS base URL.'
    );
  }
  if (parsed.username || parsed.password) {
    throw new InsecureOpenFoodFactsWriteUrlError(
      'Open Food Facts contribution base URL must not include embedded credentials.'
    );
  }
  return normalized;
}

// Per-process in-memory cache of OFF session cookies. Personal accounts are
// isolated by authenticated user. An explicitly selected global provider uses
// one shared provider key so a server-wide account does not create a separate
// OFF session for every SparkyFitness user.
const sessionCache = new Map<string, SessionCacheEntry>();
// Coalesce concurrent logins for the same cache key into a single in-flight
// promise, so a burst of requests after TTL expiry only triggers one login
// against OFF rather than a stampede.
interface InFlightLoginEntry {
  generation: number;
  configurationIdentity: string | null;
  promise: Promise<ResolvedOpenFoodFactsProvider>;
}

const inFlightLogins = new Map<string, InFlightLoginEntry>();
// Invalidation advances a per-key generation. Login promises capture the
// generation they started in and may only populate the cache while it is still
// current. This prevents a slow login using replaced credentials from
// resurrecting its session after the provider update invalidated that key.
const cacheGenerations = new Map<string, number>();

const POSITIVE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const NEGATIVE_TTL_MS = 30 * 1000; // 30 seconds
const LOGIN_TIMEOUT_MS = 30 * 1000;
const USER_AGENT = `${pkg.name}/${pkg.version} (https://github.com/CodeWithCJ/SparkyFitness)`;

function cacheKey(
  userId: string,
  providerId: string,
  credentialScope: OpenFoodFactsCredentialScope = 'personal'
): string {
  return credentialScope === 'global'
    ? `global:${providerId}`
    : `user:${userId}:${providerId}`;
}

function cacheGeneration(key: string): number {
  return cacheGenerations.get(key) ?? 0;
}

function invalidateCacheKey(key: string): void {
  sessionCache.delete(key);
  cacheGenerations.set(key, cacheGeneration(key) + 1);
  inFlightLogins.delete(key);
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
  password: string,
  baseUrl: string = DEFAULT_OFF_BASE_URL
): Promise<string | null> {
  if (!isSecureCredentialTarget(baseUrl)) {
    return null;
  }

  const body = new URLSearchParams({
    user_id: userId,
    password,
    '.submit': 'Sign-in',
  }).toString();

  log('info', 'OpenFoodFacts: attempting contributor login');
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error('Open Food Facts login timed out.'));
  }, LOGIN_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/cgi/session.pl`, {
      method: 'POST',
      headers: {
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...openFoodFactsStagingAuthHeaders(baseUrl),
      },
      body,
      redirect: 'manual',
      signal: controller.signal,
    });

    const session = parseSessionCookie(response);
    if (!session) {
      log('info', 'OpenFoodFacts: login returned no session cookie');
      return null;
    }

    // OFF returns 200 with an HTML page containing an error marker when the
    // credentials are wrong but still sets a cookie; guard against that.
    try {
      const text = await response.text();
      if (/Incorrect user name or password/i.test(text)) {
        log('info', 'OpenFoodFacts: contributor login rejected');
        return null;
      }
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // Body read failures are non-fatal — trust the cookie we already parsed.
    }

    return session;
  } finally {
    clearTimeout(timeout);
  }
}

function negativeCacheSet(
  key: string,
  baseUrl: string,
  configurationIdentity: string | null,
  generation: number
): ResolvedOpenFoodFactsProvider {
  if (cacheGeneration(key) === generation) {
    sessionCache.set(key, {
      session: null,
      baseUrl,
      configurationIdentity,
      expiresAt: Date.now() + NEGATIVE_TTL_MS,
    });
  }
  return { session: null, baseUrl, configurationIdentity };
}

async function loadProviderDetails(
  authenticatedUserId: string,
  providerId: string
): Promise<OpenFoodFactsProviderConfiguration | null> {
  try {
    const { default: externalProviderService } =
      await import('../../services/externalProviderService.js');
    return await externalProviderService.getExternalDataProviderDetails(
      authenticatedUserId,
      providerId
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(
      'debug',
      `OpenFoodFacts: provider lookup rejected for user ${authenticatedUserId}, provider ${providerId}: ${message}`
    );
    return null;
  }
}

// Resolves both the session cookie (if the provider has credentials) and the
// base URL (self-hosted or the public default) for a single OFF provider
// lookup. Session-cookie auth and base-URL customization are independent —
// a self-hosted provider with no login credentials still resolves its
// base_url here, it just gets `session: null`.
async function resolveOpenFoodFactsProvider(
  authenticatedUserId: string,
  providerId: string,
  credentialScope: OpenFoodFactsCredentialScope = 'personal',
  requireSecureWriteUrl = false
): Promise<ResolvedOpenFoodFactsProvider> {
  if (!authenticatedUserId || !providerId) {
    return {
      session: null,
      baseUrl: DEFAULT_OFF_BASE_URL,
      configurationIdentity: null,
    };
  }

  const key = cacheKey(authenticatedUserId, providerId, credentialScope);
  let generation = cacheGeneration(key);

  // A global cache entry is intentionally shared across SparkyFitness users,
  // so re-check that each caller can still access an active public row before
  // returning the shared OFF session.
  const preloadedProviderDetails =
    credentialScope === 'global' || requireSecureWriteUrl
      ? await loadProviderDetails(authenticatedUserId, providerId)
      : null;
  if (
    (credentialScope === 'global' || requireSecureWriteUrl) &&
    cacheGeneration(key) !== generation
  ) {
    return resolveOpenFoodFactsProvider(
      authenticatedUserId,
      providerId,
      credentialScope,
      requireSecureWriteUrl
    );
  }
  if (
    credentialScope === 'global' &&
    (!preloadedProviderDetails ||
      preloadedProviderDetails.is_public !== true ||
      preloadedProviderDetails.is_active !== true)
  ) {
    return {
      session: null,
      baseUrl: DEFAULT_OFF_BASE_URL,
      configurationIdentity: null,
    };
  }
  if (requireSecureWriteUrl && !preloadedProviderDetails) {
    return {
      session: null,
      baseUrl: DEFAULT_OFF_BASE_URL,
      configurationIdentity: null,
    };
  }
  if (requireSecureWriteUrl && preloadedProviderDetails) {
    assertSecureOpenFoodFactsWriteBaseUrl(preloadedProviderDetails.base_url);
  }

  const preloadedConfigurationIdentity = preloadedProviderDetails
    ? createOpenFoodFactsProviderConfigurationIdentity(preloadedProviderDetails)
    : null;

  const cached = getCachedEntry(key);
  if (cached) {
    if (
      preloadedConfigurationIdentity !== null &&
      cached.configurationIdentity !== preloadedConfigurationIdentity
    ) {
      invalidateCacheKey(key);
    } else {
      return {
        session: cached.session,
        baseUrl: cached.baseUrl,
        configurationIdentity: cached.configurationIdentity,
      };
    }
  }

  generation = cacheGeneration(key);
  const existing = inFlightLogins.get(key);
  if (existing) {
    if (
      preloadedConfigurationIdentity !== null &&
      existing.configurationIdentity !== preloadedConfigurationIdentity
    ) {
      invalidateCacheKey(key);
      generation = cacheGeneration(key);
    } else if (existing.generation === generation) {
      return existing.promise;
    }
  }

  // Lazy-require to avoid a circular dependency:
  //   externalProviderService → openFoodFactsAuth (invalidate hook)
  //   openFoodFactsAuth → externalProviderService (cred fetch)

  const loginPromise: Promise<ResolvedOpenFoodFactsProvider> = (async () => {
    const providerDetails =
      preloadedProviderDetails ||
      (await loadProviderDetails(authenticatedUserId, providerId));
    if (cacheGeneration(key) !== generation) {
      return resolveOpenFoodFactsProvider(
        authenticatedUserId,
        providerId,
        credentialScope,
        requireSecureWriteUrl
      );
    }
    if (!providerDetails) {
      return negativeCacheSet(key, DEFAULT_OFF_BASE_URL, null, generation);
    }

    const configurationIdentity =
      createOpenFoodFactsProviderConfigurationIdentity(providerDetails);

    if (providerDetails.provider_type !== 'openfoodfacts') {
      return negativeCacheSet(
        key,
        DEFAULT_OFF_BASE_URL,
        configurationIdentity,
        generation
      );
    }

    const baseUrl = requireSecureWriteUrl
      ? assertSecureOpenFoodFactsWriteBaseUrl(providerDetails.base_url)
      : normalizeBaseUrl(providerDetails.base_url);

    if (
      !providerDetails.app_id ||
      !providerDetails.app_key ||
      !isSecureCredentialTarget(baseUrl)
    ) {
      return negativeCacheSet(key, baseUrl, configurationIdentity, generation);
    }

    let session: string | null = null;
    try {
      session = await loginToOpenFoodFacts(
        providerDetails.app_id,
        providerDetails.app_key,
        baseUrl
      );
    } catch (error) {
      log('warn', `OpenFoodFacts login threw for ${key}:`, error);
    }

    if (!session) {
      return negativeCacheSet(key, baseUrl, configurationIdentity, generation);
    }

    if (cacheGeneration(key) === generation) {
      sessionCache.set(key, {
        session,
        baseUrl,
        configurationIdentity,
        expiresAt: Date.now() + POSITIVE_TTL_MS,
      });
    }
    return { session, baseUrl, configurationIdentity };
  })();

  inFlightLogins.set(key, {
    generation,
    configurationIdentity: preloadedConfigurationIdentity,
    promise: loginPromise,
  });
  try {
    return await loginPromise;
  } finally {
    if (inFlightLogins.get(key)?.promise === loginPromise) {
      inFlightLogins.delete(key);
    }
  }
}

async function getOpenFoodFactsSessionCookie(
  authenticatedUserId: string,
  providerId: string
): Promise<string | null> {
  const { session } = await resolveOpenFoodFactsProvider(
    authenticatedUserId,
    providerId
  );
  return session;
}

function invalidateOpenFoodFactsSession(
  authenticatedUserId: string,
  providerId: string,
  credentialScope?: OpenFoodFactsCredentialScope
): void {
  if (!authenticatedUserId || !providerId) return;
  if (credentialScope) {
    invalidateCacheKey(
      cacheKey(authenticatedUserId, providerId, credentialScope)
    );
    return;
  }
  invalidateCacheKey(cacheKey(authenticatedUserId, providerId));
  invalidateCacheKey(cacheKey(authenticatedUserId, providerId, 'global'));
}

// Exposed for tests only — lets a test reset cache state between cases
// without digging into the module internals.
function __resetForTests(): void {
  sessionCache.clear();
  inFlightLogins.clear();
  cacheGenerations.clear();
}

export {
  getOpenFoodFactsSessionCookie,
  resolveOpenFoodFactsProvider,
  invalidateOpenFoodFactsSession,
  loginToOpenFoodFacts,
  __resetForTests,
};
