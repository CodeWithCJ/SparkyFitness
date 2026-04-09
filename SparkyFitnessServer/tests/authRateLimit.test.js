import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Integration tests for auth rate limiting.
 *
 * Two layers are tested:
 * 1. Better Auth's built-in rate limiter — applies to endpoints handled by
 *    betterAuthHandler (sign-in, sign-up, etc.). Tested by calling
 *    onRequestRateLimit directly with a synthetic context.
 * 2. Inline Express middleware — applies to /mfa-factors, which bypasses
 *    betterAuthHandler. Tested by calling the middleware with mock req/res.
 *
 * IMPORTANT: Each test must use a unique IP address. The rate limiter's
 * in-memory store persists across tests and is keyed by ip|path.
 */
// Rate limit config matching auth.js (storage: "memory" is test-only to
// avoid needing a database; production uses Better Auth's default storage)
const RATE_LIMIT_CONFIG = {
  enabled: true,
  window: 60,
  max: 100,
  storage: 'memory',
};
const BASE_URL = 'https://example.com/api/auth';
function makeRequest(endpoint, ip = '127.0.0.1') {
  return {
    url: `${BASE_URL}${endpoint}`,
    method: 'POST',
    headers: new Headers({ 'x-forwarded-for': ip }),
  };
}
function makeContext() {
  return {
    baseURL: BASE_URL,
    rateLimit: { ...RATE_LIMIT_CONFIG },
    options: {
      rateLimit: { ...RATE_LIMIT_CONFIG },
      plugins: [],
      advanced: { trustProxy: true },
      trustedOrigins: ['https://example.com'],
    },
  };
}
describe('Auth rate limit integration', () => {
  let onRequestRateLimit;
  let onResponseRateLimit;
  beforeAll(async () => {
    const mod = await import(
      path.resolve(
        __dirname,
        '../node_modules/better-auth/dist/api/rate-limiter/index.mjs'
      )
    );
    onRequestRateLimit = mod.onRequestRateLimit;
    onResponseRateLimit = mod.onResponseRateLimit;
  });
  /**
   * Helper: send `count` requests and return responses.
   * A return of undefined means the request was allowed (no rate limit hit).
   * A Response with status 429 means rate-limited.
   */
  async function sendRequests(endpoint, count, ip) {
    const ctx = makeContext();
    const results = [];
    for (let i = 0; i < count; i++) {
      const req = makeRequest(endpoint, ip);
      const result = await onRequestRateLimit(req, ctx);
      results.push(result);
      if (result === undefined) {
        await onResponseRateLimit(req, ctx);
      }
    }
    return results;
  }
  describe('Better Auth default special rules (/sign-in/*, /sign-up/*, etc.)', () => {
    it('should allow up to 3 requests per 10 seconds on /sign-in/email', async () => {
      const results = await sendRequests('/sign-in/email', 3, '10.0.0.1');
      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(0);
    });
    it('should block the 4th request on /sign-in/email', async () => {
      const results = await sendRequests('/sign-in/email', 4, '10.0.0.2');
      const allowed = results.filter((r) => r === undefined);
      const blocked = results.filter((r) => r?.status === 429);
      expect(allowed).toHaveLength(3);
      expect(blocked).toHaveLength(1);
    });
    it('should apply the same limit to /sign-up/email', async () => {
      const results = await sendRequests('/sign-up/email', 4, '10.0.0.3');
      const allowed = results.filter((r) => r === undefined);
      const blocked = results.filter((r) => r?.status === 429);
      expect(allowed).toHaveLength(3);
      expect(blocked).toHaveLength(1);
    });
  });
  describe('/two-factor/* (no special rule, uses global limit)', () => {
    it('should allow many requests since it falls under the global 100/60s limit', async () => {
      const results = await sendRequests(
        '/two-factor/verify-totp',
        10,
        '10.0.1.1'
      );
      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(0);
    });
  });
  describe('general auth endpoints (global limit)', () => {
    it('should allow up to 100 requests per minute on uncustomized paths', async () => {
      const results = await sendRequests('/get-session', 100, '10.0.3.1');
      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(0);
    });
    it('should block the 101st request on uncustomized paths', async () => {
      const results = await sendRequests('/get-session', 101, '10.0.3.2');
      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(1);
    });
  });
  describe('rate limits are per-IP', () => {
    it('should track limits independently for different IPs', async () => {
      // Use up the limit for one IP
      const results1 = await sendRequests('/sign-in/email', 3, '10.1.0.1');
      expect(results1.filter((r) => r?.status === 429)).toHaveLength(0);
      // A different IP should still be allowed
      const results2 = await sendRequests('/sign-in/email', 1, '10.1.0.2');
      expect(results2[0]).toBeUndefined();
    });
  });
});
/**
 * Tests for the inline rate limiter on /mfa-factors (account enumeration
 * protection). This endpoint bypasses betterAuthHandler and is served by
 * Express, so it has its own middleware-level rate limiter.
 */
describe('/mfa-factors inline rate limiter', () => {
  // Re-require to get a fresh module with a clean hits Map per describe block.
  // Jest's module cache is reset by vi.isolateModules.
  let router;
  beforeAll(async () => {
    vi.resetModules();
    const module = await import('../routes/auth/authCoreRoutes.js');
    router = module.default;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  // Extract the rate limit middleware from the router stack
  function getRateLimitMiddleware() {
    const mfaLayer = router.stack.find(
      (layer) => layer.route?.path === '/mfa-factors'
    );
    // The rate limiter is the first middleware in the route's stack
    return mfaLayer.route.stack[0].handle;
  }
  function makeMockReq(ip) {
    return { ip };
  }
  function makeMockRes() {
    const res = {
      statusCode: null,
      headers: {},
      body: null,
      set(key, value) {
        res.headers[key] = value;
        return res;
      },
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(data) {
        res.body = data;
        return res;
      },
    };
    return res;
  }
  async function sendMfaRequests(middleware, count, ip) {
    const results = [];
    for (let i = 0; i < count; i++) {
      const req = makeMockReq(ip);
      const res = makeMockRes();
      let allowed = false;
      const next = () => {
        allowed = true;
      };
      middleware(req, res, next);
      results.push(allowed ? null : res.statusCode);
    }
    return results;
  }
  it('should allow up to 5 requests per 30 seconds', async () => {
    const middleware = getRateLimitMiddleware();
    const results = await sendMfaRequests(middleware, 5, '10.2.0.1');
    const blocked = results.filter((r) => r === 429);
    expect(blocked).toHaveLength(0);
  });
  it('should block the 6th request', async () => {
    const middleware = getRateLimitMiddleware();
    const results = await sendMfaRequests(middleware, 6, '10.2.0.2');
    const allowed = results.filter((r) => r === null);
    const blocked = results.filter((r) => r === 429);
    expect(allowed).toHaveLength(5);
    expect(blocked).toHaveLength(1);
  });
  it('should include X-Retry-After header when blocked', async () => {
    const middleware = getRateLimitMiddleware();
    // Send 5 allowed, then one blocked
    for (let i = 0; i < 5; i++) {
      const next = () => {};
      middleware(makeMockReq('10.2.0.3'), makeMockRes(), next);
    }
    const res = makeMockRes();
    middleware(makeMockReq('10.2.0.3'), res, () => {});
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['X-Retry-After'])).toBeGreaterThan(0);
  });
  it('should allow requests again after the 30 second window expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2100-01-01T00:00:00Z'));
    const middleware = getRateLimitMiddleware();
    const blockedResults = await sendMfaRequests(middleware, 6, '10.2.0.4');
    expect(blockedResults.filter((r) => r === 429)).toHaveLength(1);
    vi.advanceTimersByTime(30 * 1000 + 1);
    const resultsAfterWindow = await sendMfaRequests(middleware, 1, '10.2.0.4');
    expect(resultsAfterWindow[0]).toBeNull();
  });
  it('should track limits independently for different IPs', async () => {
    const middleware = getRateLimitMiddleware();
    // Exhaust limit for one IP
    const results1 = await sendMfaRequests(middleware, 5, '10.2.1.1');
    expect(results1.filter((r) => r === 429)).toHaveLength(0);
    // Different IP should still be allowed
    const results2 = await sendMfaRequests(middleware, 1, '10.2.1.2');
    expect(results2[0]).toBeNull();
  });
});
