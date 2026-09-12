import { vi, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(endpoint: any, ip = '127.0.0.1') {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onRequestRateLimit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onResponseRateLimit: any;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function sendRequests(endpoint: any, count: any, ip: any) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let router: any;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (layer: any) => layer.route?.path === '/mfa-factors'
    );
    // The rate limiter is the first middleware in the route's stack
    return mfaLayer.route.stack[0].handle;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeMockReq(ip: any) {
    return { ip };
  }
  function makeMockRes() {
    const res = {
      statusCode: null,
      headers: {},
      body: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(key: any, value: any) {
        // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
        res.headers[key] = value;
        return res;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status(code: any) {
        res.statusCode = code;
        return res;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json(data: any) {
        res.body = data;
        return res;
      },
    };
    return res;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function sendMfaRequests(middleware: any, count: any, ip: any) {
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
    // @ts-expect-error TS(7053): Element implicitly has an 'any' type because expre... Remove this comment to see the full error message
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

/**
 * SparkyFitness' own `customRules` (auth.ts). These override Better Auth's
 * 3-per-10s default on the credential-checking endpoints.
 *
 * The default is a tight burst but resets every 10s, so it permits 18 failed
 * logins a minute indefinitely. Intrusion-detection tooling watching POST 401s
 * (e.g. CrowdSec's generic 401 rule: a leaky bucket of capacity 5 draining one
 * per 10s) treats that sustained rate as a brute force and bans the client IP
 * at the edge — taking a legitimate user who fumbled their password with it.
 * Capping the sustained rate instead keeps failures permanently under that
 * threshold.
 */
describe('SparkyFitness sign-in customRules', () => {
  const SIGN_IN_WINDOW = 60;
  const SIGN_IN_MAX = 4;
  const CUSTOM_RULES = {
    '/sign-in/email': { window: SIGN_IN_WINDOW, max: SIGN_IN_MAX },
    '/two-factor/*': { window: SIGN_IN_WINDOW, max: SIGN_IN_MAX },
    '/email-otp/verify-email': { window: SIGN_IN_WINDOW, max: SIGN_IN_MAX },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onRequestRateLimit: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onResponseRateLimit: any;

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

  function makeCustomContext() {
    const config = {
      ...RATE_LIMIT_CONFIG,
      customRules: CUSTOM_RULES,
    };
    return {
      baseURL: BASE_URL,
      rateLimit: { ...config },
      options: {
        rateLimit: { ...config },
        plugins: [],
        advanced: { trustProxy: true },
        trustedOrigins: ['https://example.com'],
      },
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function send(endpoint: any, count: any, ip: any) {
    const ctx = makeCustomContext();
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

  it('allows SIGN_IN_MAX attempts on /sign-in/email', async () => {
    const results = await send('/sign-in/email', SIGN_IN_MAX, '10.3.0.1');
    expect(results.filter((r) => r?.status === 429)).toHaveLength(0);
  });

  it('blocks the attempt after SIGN_IN_MAX, so failures cannot reach the IDS threshold', async () => {
    const results = await send('/sign-in/email', SIGN_IN_MAX + 1, '10.3.0.2');
    expect(results.filter((r) => r === undefined)).toHaveLength(SIGN_IN_MAX);
    expect(results.filter((r) => r?.status === 429)).toHaveLength(1);
  });

  it('caps sustained rate below Better Auth default: 10 rapid attempts yield at most SIGN_IN_MAX 401s', async () => {
    const results = await send('/sign-in/email', 10, '10.3.0.3');
    // Without customRules the default (3 per 10s) would let far more through
    // over the same span; here everything past the cap is a 429, which the
    // 401-based IDS rules do not count.
    expect(results.filter((r) => r === undefined)).toHaveLength(SIGN_IN_MAX);
  });

  it('applies the same cap to two-factor verification via the wildcard rule', async () => {
    const results = await send(
      '/two-factor/verify-totp',
      SIGN_IN_MAX + 1,
      '10.3.0.4'
    );
    expect(results.filter((r) => r?.status === 429)).toHaveLength(1);
  });

  it('gives each path its own budget, so one MFA login does not exhaust sign-in', async () => {
    const ip = '10.3.0.5';
    const signIn = await send('/sign-in/email', SIGN_IN_MAX, ip);
    const sendOtp = await send('/two-factor/send-otp', SIGN_IN_MAX, ip);
    const verifyOtp = await send('/two-factor/verify-otp', SIGN_IN_MAX, ip);
    for (const r of [signIn, sendOtp, verifyOtp]) {
      expect(r.filter((x) => x?.status === 429)).toHaveLength(0);
    }
  });

  it('tracks budgets per client IP', async () => {
    await send('/sign-in/email', SIGN_IN_MAX + 1, '10.3.1.1');
    const other = await send('/sign-in/email', 1, '10.3.1.2');
    expect(other[0]).toBeUndefined();
  });

  it('leaves unlisted auth endpoints on the permissive default', async () => {
    // /api/auth/settings and friends must not inherit the sign-in cap.
    const results = await send('/get-session', SIGN_IN_MAX + 2, '10.3.2.1');
    expect(results.filter((r) => r?.status === 429)).toHaveLength(0);
  });
});
