import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeRateLimitWindowRepository } from './helpers/rateLimitWindowFake.js';

vi.mock('../models/rateLimitWindowRepository.js', async () => ({
  default: (await import('./helpers/rateLimitWindowFake.js'))
    .fakeRateLimitWindowRepository,
}));

const { makeIpRateLimit } = await import('../middleware/ipRateLimit.js');
const { default: rateLimitWindowRepository } =
  await import('../models/rateLimitWindowRepository.js');

interface MockRes {
  statusCode: number | null;
  headers: Record<string, string>;
  body: unknown;
  set(key: string, value: string): MockRes;
  status(code: number): MockRes;
  json(data: unknown): MockRes;
}

function makeRes(): MockRes {
  const res: MockRes = {
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

function makeReq(ip: string, routePath = '/limited'): Request {
  return {
    ip,
    method: 'POST',
    baseUrl: '/api/auth',
    route: { path: routePath },
    headers: {},
  } as unknown as Request;
}

type Middleware = ReturnType<typeof makeIpRateLimit>;

async function send(middleware: Middleware, req: Request) {
  const res = makeRes();
  const next = vi.fn();
  await middleware(req, res as unknown as Response, next as NextFunction);
  return { res, next };
}

beforeEach(() => fakeRateLimitWindowRepository.reset());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('makeIpRateLimit', () => {
  it('allows max requests in a window, then answers 429 as before', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2100-01-01T00:00:00Z'));
    const limiter = makeIpRateLimit('test', 3, 60_000);
    for (let i = 0; i < 3; i++) {
      const { next, res } = await send(limiter, makeReq('10.9.0.1'));
      expect(next).toHaveBeenCalledWith();
      expect(res.statusCode).toBeNull();
    }
    vi.advanceTimersByTime(20_500);
    const { next, res } = await send(limiter, makeReq('10.9.0.1'));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      message: 'Too many requests. Please try again later.',
    });
    // Seconds until the window that began at the first hit ends, rounded up.
    expect(res.headers['X-Retry-After']).toBe('40');
  });

  it('starts a new window once the old one has passed', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2100-01-01T00:00:00Z'));
    const limiter = makeIpRateLimit('test', 2, 30_000);
    await send(limiter, makeReq('10.9.0.2'));
    await send(limiter, makeReq('10.9.0.2'));
    expect((await send(limiter, makeReq('10.9.0.2'))).res.statusCode).toBe(429);
    vi.advanceTimersByTime(29_999);
    expect((await send(limiter, makeReq('10.9.0.2'))).res.statusCode).toBe(429);
    vi.advanceTimersByTime(1);
    for (let i = 0; i < 2; i++) {
      const { next } = await send(limiter, makeReq('10.9.0.2'));
      expect(next).toHaveBeenCalledWith();
    }
    expect((await send(limiter, makeReq('10.9.0.2'))).res.statusCode).toBe(429);
  });

  it('counts each address separately under the limiter name', async () => {
    const limiter = makeIpRateLimit('first', 1, 60_000);
    await send(limiter, makeReq('10.9.0.3', '/a'));
    expect((await send(limiter, makeReq('10.9.0.4', '/a'))).next).toBeCalled();
    expect(fakeRateLimitWindowRepository.keys()).toEqual([
      'first|10.9.0.3',
      'first|10.9.0.4',
    ]);
  });

  it('keeps limiters apart by name, wherever they are attached', async () => {
    const first = makeIpRateLimit('first', 1, 60_000);
    const second = makeIpRateLimit('second', 1, 60_000);
    await send(first, makeReq('10.9.0.3', '/a'));
    expect((await send(second, makeReq('10.9.0.3', '/a'))).next).toBeCalled();
    // Without a matched route (router.use) the key is unchanged.
    const unrouted = { ...makeReq('10.9.0.3'), route: undefined } as Request;
    expect((await send(first, unrouted)).res.statusCode).toBe(429);
  });

  it('passes a database error on instead of letting the request through', async () => {
    const failure = new Error('database away');
    vi.spyOn(rateLimitWindowRepository, 'hit').mockRejectedValueOnce(failure);
    const { next, res } = await send(
      makeIpRateLimit('test', 5, 1000),
      makeReq('10.9.0.5')
    );
    expect(next).toHaveBeenCalledWith(failure);
    expect(res.statusCode).toBeNull();
  });
});

describe('auth routes keep their limits', () => {
  it.each([
    ['/mfa-factors', 5, '30'],
    ['/demo-login', 10, '60'],
    ['/web-login/register-ticket', 10, '60'],
    ['/web-login/redeem-ticket', 20, '60'],
  ] as const)('%s allows %d per window', async (path, max, retryAfter) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2100-01-01T00:00:00Z'));
    const { default: router } =
      await import('../routes/auth/authCoreRoutes.js');
    const layer = router.stack.find((l) => l.route?.path === path);
    // The limiter runs first, before the handler touches anything.
    const limiter = layer?.route?.stack[0]?.handle as Middleware;
    expect(limiter).toBeTypeOf('function');
    const req = makeReq('203.0.113.7', path);
    for (let i = 0; i < max; i++) {
      expect((await send(limiter, req)).next).toHaveBeenCalledWith();
    }
    const { res } = await send(limiter, req);
    expect(res.statusCode).toBe(429);
    expect(res.headers['X-Retry-After']).toBe(retryAfter);
  });
});
