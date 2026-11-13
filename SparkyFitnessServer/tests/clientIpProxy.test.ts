import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClientIp, clientIpMiddleware } from '../utils/clientIp.js';
import { auth } from '../auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RateLimitContext {
  baseURL: string;
  rateLimit: {
    enabled: boolean;
    window: number;
    max: number;
    storage: string;
  };
  options: {
    rateLimit: {
      enabled: boolean;
      window: number;
      max: number;
      storage: string;
    };
    plugins: unknown[];
    advanced: {
      trustedProxyHeaders?: boolean;
      ipAddress?: {
        ipAddressHeaders?: string[];
        trustedProxies?: string[];
      };
    };
    trustedOrigins: string[];
  };
  logger?: {
    warn: (msg: string) => void;
  };
}

describe('Client IP resolution & Better Auth proxy handling', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('getClientIp helper', () => {
    it('returns req.ip when no custom header is configured', () => {
      delete process.env.SPARKY_FITNESS_REAL_IP_HEADER;
      const req = {
        headers: {},
        ip: '203.0.113.50',
      } as unknown as Request;

      expect(getClientIp(req)).toBe('203.0.113.50');
    });

    it('prefers SPARKY_FITNESS_REAL_IP_HEADER when configured', () => {
      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'CF-Connecting-IP';
      const req = {
        headers: {
          'cf-connecting-ip': '198.51.100.99',
          'x-forwarded-for': '10.0.0.1',
        },
        ip: '10.0.0.1',
      } as unknown as Request;

      expect(getClientIp(req)).toBe('198.51.100.99');
    });

    it('extracts the first IP if the custom real IP header contains a list', () => {
      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'X-Custom-Client';
      const req = {
        headers: {
          'x-custom-client': '198.51.100.10, 10.0.0.2',
        },
        ip: '10.0.0.2',
      } as unknown as Request;

      expect(getClientIp(req)).toBe('198.51.100.10');
    });

    it('falls back to req.ip when configured header is empty', () => {
      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'CF-Connecting-IP';
      const req = {
        headers: {},
        ip: '203.0.113.77',
      } as unknown as Request;

      expect(getClientIp(req)).toBe('203.0.113.77');
    });

    it('handles IPv6 addresses from req.ip and custom headers', () => {
      delete process.env.SPARKY_FITNESS_REAL_IP_HEADER;
      const reqDirect = {
        headers: {},
        ip: '2001:db8::1',
      } as unknown as Request;
      expect(getClientIp(reqDirect)).toBe('2001:db8::1');

      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'CF-Connecting-IP';
      const reqHeader = {
        headers: {
          'cf-connecting-ip': '2001:db8:85a3::8a2e:370:7334',
        },
        ip: '10.0.0.1',
      } as unknown as Request;
      expect(getClientIp(reqHeader)).toBe('2001:db8:85a3::8a2e:370:7334');
    });

    it('strips enclosing brackets and ports from custom headers', () => {
      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'X-Custom-Client';
      const reqBracketedIpv6 = {
        headers: {
          'x-custom-client': '[2001:db8::1]:8443',
        },
        ip: '10.0.0.1',
      } as unknown as Request;
      expect(getClientIp(reqBracketedIpv6)).toBe('2001:db8::1');

      const reqPortIpv4 = {
        headers: {
          'x-custom-client': '203.0.113.195:8080',
        },
        ip: '10.0.0.1',
      } as unknown as Request;
      expect(getClientIp(reqPortIpv4)).toBe('203.0.113.195');
    });

    it('falls back to req.ip if custom header contains invalid/malformed non-IP data', () => {
      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'X-Custom-Client';
      const reqGarbage = {
        headers: {
          'x-custom-client': 'invalid-not-an-ip!@#$',
        },
        ip: '203.0.113.88',
      } as unknown as Request;
      expect(getClientIp(reqGarbage)).toBe('203.0.113.88');
    });

    it('delegates to Express req.ip when SPARKY_FITNESS_REAL_IP_HEADER is X-Forwarded-For to prevent naive spoofing', () => {
      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'X-Forwarded-For';
      const req = {
        headers: {
          'x-forwarded-for': '1.1.1.1, 203.0.113.50',
        },
        // Express resolved req.ip based on trust-proxy rules:
        ip: '203.0.113.50',
      } as unknown as Request;
      expect(getClientIp(req)).toBe('203.0.113.50');
    });

    it('delegates to Express req.ip when SPARKY_FITNESS_REAL_IP_HEADER is X-Client-IP to prevent spoofing unverified header', () => {
      process.env.SPARKY_FITNESS_REAL_IP_HEADER = 'X-Client-IP';
      const req = {
        headers: {
          'x-client-ip': '1.1.1.1',
        },
        ip: '203.0.113.50',
      } as unknown as Request;
      expect(getClientIp(req)).toBe('203.0.113.50');
    });
  });

  describe('x-client-ip injection middleware behavior', () => {
    it('populates x-client-ip from getClientIp', () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.195, 172.18.0.3',
        },
        ip: '203.0.113.195',
      } as unknown as Request;

      const next = vi.fn();
      clientIpMiddleware(req, {} as Response, next);

      expect(req.headers['x-client-ip']).toBe('203.0.113.195');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('overwrites any client-forged x-client-ip header', () => {
      const req = {
        headers: {
          'x-client-ip': '1.1.1.1', // Attacker attempt to spoof IP
          'x-forwarded-for': '203.0.113.55, 172.18.0.2',
        },
        ip: '203.0.113.55',
      } as unknown as Request;

      const next = vi.fn();
      clientIpMiddleware(req, {} as Response, next);

      expect(req.headers['x-client-ip']).toBe('203.0.113.55');
    });

    it('removes x-client-ip if client IP cannot be determined', () => {
      const req = {
        headers: {
          'x-client-ip': '1.1.1.1',
        },
        ip: undefined,
      } as unknown as Request;

      const next = vi.fn();
      clientIpMiddleware(req, {} as Response, next);

      expect(req.headers['x-client-ip']).toBeUndefined();
    });
  });

  describe('Better Auth rate limiting with x-client-ip and multi-hop proxies', () => {
    let onRequestRateLimit: (
      req: { url: string; method: string; headers: Headers },
      ctx: RateLimitContext
    ) => Promise<Response | undefined>;

    beforeEach(async () => {
      const mod = await import(
        path.resolve(
          __dirname,
          '../node_modules/better-auth/dist/api/rate-limiter/index.mjs'
        )
      );
      onRequestRateLimit = mod.onRequestRateLimit;
    });

    const createRateLimitContext = (
      advancedOverrides: RateLimitContext['options']['advanced'] = {}
    ): RateLimitContext => ({
      baseURL: 'https://example.com/api/auth',
      rateLimit: {
        enabled: true,
        window: 60,
        max: 5,
        storage: 'memory',
      },
      options: {
        rateLimit: {
          enabled: true,
          window: 60,
          max: 5,
          storage: 'memory',
        },
        plugins: [],
        advanced: {
          trustedProxyHeaders: true,
          ipAddress: {
            ipAddressHeaders: ['x-client-ip', 'x-forwarded-for'],
          },
          ...advancedOverrides,
        },
        trustedOrigins: ['https://example.com'],
      },
      logger: {
        warn: vi.fn(),
      },
    });

    it('correctly uses x-client-ip even when x-forwarded-for has multiple untrusted hops', async () => {
      const ctx = createRateLimitContext();
      const warnSpy = vi.fn();
      ctx.logger = { warn: warnSpy };

      // Request arriving through two proxies (client, npm_ip) with x-client-ip injected
      const req1 = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-client-ip': '198.51.100.1',
          'x-forwarded-for': '198.51.100.1, 172.18.0.5',
        }),
      };

      const result1 = await onRequestRateLimit(req1, ctx);
      expect(result1).toBeUndefined(); // Allowed
      expect(warnSpy).not.toHaveBeenCalled();

      // Another client behind the same reverse proxy gets their own rate limit bucket
      const req2 = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-client-ip': '198.51.100.2',
          'x-forwarded-for': '198.51.100.2, 172.18.0.5',
        }),
      };

      const result2 = await onRequestRateLimit(req2, ctx);
      expect(result2).toBeUndefined(); // Allowed independently
    });

    it('isolates rate limits per client IP when x-client-ip is provided', async () => {
      const ctx = createRateLimitContext();

      // Better Auth's default special rule for /sign-in/* allows 3 requests per 10 seconds.
      // Client A exhausts their limit (3 requests)
      for (let i = 0; i < 3; i++) {
        const reqA = {
          url: 'https://example.com/api/auth/sign-in/email',
          method: 'POST',
          headers: new Headers({
            'x-client-ip': '198.51.100.10',
            'x-forwarded-for': '198.51.100.10, 172.18.0.5',
          }),
        };
        const resA = await onRequestRateLimit(reqA, ctx);
        expect(resA).toBeUndefined(); // Allowed
      }

      // 4th request from Client A is blocked
      const reqA4 = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-client-ip': '198.51.100.10',
          'x-forwarded-for': '198.51.100.10, 172.18.0.5',
        }),
      };
      const resA4 = await onRequestRateLimit(reqA4, ctx);
      expect(resA4?.status).toBe(429);

      // Client B from a different IP is NOT blocked because x-client-ip isolates them
      const reqB = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-client-ip': '198.51.100.20',
          'x-forwarded-for': '198.51.100.20, 172.18.0.5',
        }),
      };
      const resB = await onRequestRateLimit(reqB, ctx);
      expect(resB).toBeUndefined(); // Allowed!
    });

    it('isolates rate limits for IPv6 clients and IPv4-mapped IPv6 clients', async () => {
      const ctx = createRateLimitContext();

      // IPv6 Client 1 exhausts 3 requests
      for (let i = 0; i < 3; i++) {
        const reqV6 = {
          url: 'https://example.com/api/auth/sign-in/email',
          method: 'POST',
          headers: new Headers({
            'x-client-ip': '2001:db8:1::cafe',
            'x-forwarded-for': '2001:db8:1::cafe, 172.18.0.5',
          }),
        };
        const res = await onRequestRateLimit(reqV6, ctx);
        expect(res).toBeUndefined();
      }

      // 4th request from IPv6 Client 1 in same /64 subnet is blocked (429)
      const reqV6Blocked = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-client-ip': '2001:db8:1::beef', // Same /64 prefix
          'x-forwarded-for': '2001:db8:1::beef, 172.18.0.5',
        }),
      };
      const resV6Blocked = await onRequestRateLimit(reqV6Blocked, ctx);
      expect(resV6Blocked?.status).toBe(429);

      // Different IPv6 subnet is allowed
      const reqV6Other = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-client-ip': '2001:db8:2::1', // Different /64 prefix
          'x-forwarded-for': '2001:db8:2::1, 172.18.0.5',
        }),
      };
      const resV6Other = await onRequestRateLimit(reqV6Other, ctx);
      expect(resV6Other).toBeUndefined(); // Allowed!

      // IPv4-mapped IPv6 address is unwrapped and allowed
      const reqMapped = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-client-ip': '::ffff:198.51.100.77',
          'x-forwarded-for': '::ffff:198.51.100.77, 172.18.0.5',
        }),
      };
      const resMapped = await onRequestRateLimit(reqMapped, ctx);
      expect(resMapped).toBeUndefined(); // Allowed!
    });

    it('pools multi-hop clients into a shared fallback bucket when x-client-ip is missing', async () => {
      const ctx = createRateLimitContext({
        ipAddress: {
          ipAddressHeaders: ['x-forwarded-for'],
        },
      });

      // Client A exhausts the fallback limit (3 requests on /sign-in/email)
      for (let i = 0; i < 3; i++) {
        const reqA = {
          url: 'https://example.com/api/auth/sign-in/email',
          method: 'POST',
          headers: new Headers({
            'x-forwarded-for': '198.51.100.50, 172.18.0.5',
          }),
        };
        await onRequestRateLimit(reqA, ctx);
      }

      // Client B with a different IP is now blocked because multi-hop X-Forwarded-For
      // was rejected by Better Auth and fell back to the shared fallback bucket!
      const reqB = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-forwarded-for': '198.51.100.60, 172.18.0.5',
        }),
      };
      const resB = await onRequestRateLimit(reqB, ctx);
      expect(resB?.status).toBe(429); // Shared bucket exhaustion!
    });

    it('resolves multi-hop x-forwarded-for when trustedProxies is configured', async () => {
      const ctx = createRateLimitContext({
        ipAddress: {
          ipAddressHeaders: ['x-forwarded-for'],
          trustedProxies: ['172.18.0.0/16'],
        },
      });

      const req = {
        url: 'https://example.com/api/auth/sign-in/email',
        method: 'POST',
        headers: new Headers({
          'x-forwarded-for': '198.51.100.75, 172.18.0.5',
        }),
      };

      const result = await onRequestRateLimit(req, ctx);
      expect(result).toBeUndefined();
    });

    it('configures advanced.ipAddress in auth.ts with x-client-ip and x-forwarded-for', () => {
      const ipAddressConfig = auth.options.advanced?.ipAddress;

      expect(ipAddressConfig).toBeDefined();
      expect(ipAddressConfig?.ipAddressHeaders).toContain('x-client-ip');
      expect(ipAddressConfig?.ipAddressHeaders).toContain('x-forwarded-for');
    });
  });
});
