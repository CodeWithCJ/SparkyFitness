const path = require("path");

/**
 * Integration test for Better Auth rate limiting.
 *
 * Verifies that Better Auth's built-in rate limits work as expected with our
 * config. Better Auth applies special rules to sensitive endpoints like
 * /sign-in/* (3 per 10s) by default, while other endpoints use our global
 * limit (100 per 60s).
 *
 * The test calls Better Auth's onRequestRateLimit directly with a context
 * that mirrors the config from auth.js, avoiding the need to spin up a
 * database or full server.
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
  storage: "memory",
  customRules: {
    "/mfa-factors": { window: 30, max: 5 },
  },
};

const BASE_URL = "https://example.com/api/auth";

function makeRequest(endpoint, ip = "127.0.0.1") {
  return {
    url: `${BASE_URL}${endpoint}`,
    method: "POST",
    headers: new Headers({ "x-forwarded-for": ip }),
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
      trustedOrigins: ["https://example.com"],
    },
  };
}

describe("Auth rate limit integration", () => {
  let onRequestRateLimit;

  beforeAll(async () => {
    const mod = await import(
      path.resolve(
        __dirname,
        "../node_modules/better-auth/dist/api/rate-limiter/index.mjs",
      )
    );
    onRequestRateLimit = mod.onRequestRateLimit;
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
      const result = await onRequestRateLimit(makeRequest(endpoint, ip), ctx);
      results.push(result);
    }
    return results;
  }

  describe("Better Auth default special rules (/sign-in/*, /sign-up/*, etc.)", () => {
    it("should allow up to 3 requests per 10 seconds on /sign-in/email", async () => {
      const results = await sendRequests("/sign-in/email", 3, "10.0.0.1");

      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(0);
    });

    it("should block the 4th request on /sign-in/email", async () => {
      const results = await sendRequests("/sign-in/email", 4, "10.0.0.2");

      const allowed = results.filter((r) => r === undefined);
      const blocked = results.filter((r) => r?.status === 429);
      expect(allowed).toHaveLength(3);
      expect(blocked).toHaveLength(1);
    });

    it("should apply the same limit to /sign-up/email", async () => {
      const results = await sendRequests("/sign-up/email", 4, "10.0.0.3");

      const allowed = results.filter((r) => r === undefined);
      const blocked = results.filter((r) => r?.status === 429);
      expect(allowed).toHaveLength(3);
      expect(blocked).toHaveLength(1);
    });
  });

  describe("/two-factor/* (no special rule, uses global limit)", () => {
    it("should allow many requests since it falls under the global 100/60s limit", async () => {
      const results = await sendRequests("/two-factor/verify-totp", 10, "10.0.1.1");

      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(0);
    });
  });

  describe("/mfa-factors (account enumeration protection)", () => {
    it("should allow up to 5 requests per 30 seconds", async () => {
      const results = await sendRequests("/mfa-factors", 5, "10.0.2.1");

      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(0);
    });

    it("should block the 6th request", async () => {
      const results = await sendRequests("/mfa-factors", 6, "10.0.2.2");

      const allowed = results.filter((r) => r === undefined);
      const blocked = results.filter((r) => r?.status === 429);
      expect(allowed).toHaveLength(5);
      expect(blocked).toHaveLength(1);
    });
  });

  describe("general auth endpoints (global limit)", () => {
    it("should allow up to 100 requests per minute on uncustomized paths", async () => {
      const results = await sendRequests("/get-session", 100, "10.0.3.1");

      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(0);
    });

    it("should block the 101st request on uncustomized paths", async () => {
      const results = await sendRequests("/get-session", 101, "10.0.3.2");

      const blocked = results.filter((r) => r?.status === 429);
      expect(blocked).toHaveLength(1);
    });
  });

  describe("rate limits are per-IP", () => {
    it("should track limits independently for different IPs", async () => {
      // Use up the limit for one IP
      const results1 = await sendRequests("/sign-in/email", 3, "10.1.0.1");
      expect(results1.filter((r) => r?.status === 429)).toHaveLength(0);

      // A different IP should still be allowed
      const results2 = await sendRequests("/sign-in/email", 1, "10.1.0.2");
      expect(results2[0]).toBeUndefined();
    });
  });
});
