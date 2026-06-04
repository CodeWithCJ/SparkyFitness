import { vi, beforeEach, describe, expect, it } from 'vitest';

// Hoisted so vi.mock factories (also hoisted) can reference it.
const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock('../auth.js', () => ({
  auth: {
    api: { getSession: mockGetSession },
    options: {
      advanced: { cookiePrefix: 'sparky', useSecureCookies: false },
      secret: 'test-secret',
    },
  },
}));

vi.mock('../models/userRepository.js', () => ({
  default: {
    ensureUserInitialization: vi.fn().mockResolvedValue(undefined),
    getUserRole: vi.fn().mockResolvedValue('user'),
    updateUserLastLogin: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn().mockResolvedValue(false),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

vi.mock('better-call', () => ({
  serializeSignedCookie: vi.fn().mockResolvedValue('cookie-value'),
}));

import { authenticate } from '../middleware/authMiddleware.js';
import { clearApiKeySessionCache } from '../utils/apiKeySessionCache.js';

const VALID_TOKEN_A = 'a'.repeat(64);
const VALID_TOKEN_B = 'b'.repeat(64);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(token: string): any {
  return {
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
    path: '/api/x',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRes(): any {
  const res: Record<string, unknown> = {
    statusCode: null,
    headers: {},
    body: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.set = function (k: string, v: any) {
    (res.headers as Record<string, unknown>)[k] = v;
    return res;
  };
  res.status = function (c: number) {
    res.statusCode = c;
    return res;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json = function (d: any) {
    res.body = d;
    return res;
  };
  return res;
}

describe('authenticate middleware: API-key session cache (issue #1302)', () => {
  beforeEach(() => {
    clearApiKeySessionCache();
    mockGetSession.mockReset();
  });

  it('calls auth.api.getSession exactly once for repeated requests with the same API key within TTL', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'U' } });
    const next = vi.fn();

    await authenticate(makeReq(VALID_TOKEN_A), makeRes(), next);
    await authenticate(makeReq(VALID_TOKEN_A), makeRes(), next);
    await authenticate(makeReq(VALID_TOKEN_A), makeRes(), next);

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('calls getSession independently for different API keys', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'U' } });
    const next = vi.fn();

    await authenticate(makeReq(VALID_TOKEN_A), makeRes(), next);
    await authenticate(makeReq(VALID_TOKEN_B), makeRes(), next);

    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });

  it('does not cache null sessions (Better Auth returns null on no-session)', async () => {
    mockGetSession.mockResolvedValue(null);
    const next = vi.fn();
    const res1 = makeRes();
    const res2 = makeRes();

    await authenticate(makeReq(VALID_TOKEN_A), res1, next);
    await authenticate(makeReq(VALID_TOKEN_A), res2, next);

    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(res1.statusCode).toBe(401);
    expect(res2.statusCode).toBe(401);
  });

  it('respects pre-set x-api-key header (not just Bearer mapping)', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'U' } });
    const next = vi.fn();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req1: any = {
      headers: { 'x-api-key': VALID_TOKEN_A },
      cookies: {},
      path: '/api/x',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req2: any = {
      headers: { 'x-api-key': VALID_TOKEN_A },
      cookies: {},
      path: '/api/x',
    };

    await authenticate(req1, makeRes(), next);
    await authenticate(req2, makeRes(), next);

    expect(mockGetSession).toHaveBeenCalledTimes(1);
  });
});
