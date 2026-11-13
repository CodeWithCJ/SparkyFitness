import { APIError } from 'better-auth/api';
import { vi, beforeEach, describe, expect, it } from 'vitest';

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
    updateUserLastLogin: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn().mockResolvedValue(false),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('better-call', async (importOriginal) => ({
  ...(await importOriginal<typeof import('better-call')>()),
  serializeSignedCookie: vi.fn().mockResolvedValue('cookie-value'),
}));

import { authenticate } from '../middleware/authMiddleware.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(): any {
  return {
    headers: { authorization: 'Bearer session-token.signature' },
    cookies: {},
    path: '/api/x',
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRes(): any {
  const res: Record<string, unknown> = { headers: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.set = (k: string, v: any) => {
    (res.headers as Record<string, unknown>)[k] = v;
    return res;
  };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

async function run() {
  const res = makeRes();
  const next = vi.fn();
  await authenticate(makeReq(), res, next);
  return { res, next };
}

const unavailable = {
  statusCode: 503,
  headers: { 'Retry-After': '5' },
  body: { error: 'Authentication is temporarily unavailable.' },
};
const unauthenticated = {
  statusCode: 401,
  headers: {},
  body: { error: 'Authentication required.' },
};

describe('authenticate when the identity cannot be checked', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it('answers 503 with Retry-After when Better Auth fails its session lookup', async () => {
    // What Better Auth 1.7 throws when its adapter's query fails: the cause is
    // logged by Better Auth and not attached.
    mockGetSession.mockRejectedValue(
      APIError.from('INTERNAL_SERVER_ERROR', {
        code: 'FAILED_TO_GET_SESSION',
        message: 'Failed to get session',
      })
    );
    const { res, next } = await run();
    expect(res).toMatchObject(unavailable);
    expect(next).not.toHaveBeenCalled();
  });

  it('answers 503 on a connection error from the database', async () => {
    mockGetSession.mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), {
        code: 'ECONNREFUSED',
      })
    );
    const { res } = await run();
    expect(res).toMatchObject(unavailable);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|10\.0\.0\.5/);
  });

  it('answers 503 when the connection is terminated mid-lookup', async () => {
    mockGetSession.mockRejectedValue(
      Object.assign(
        new Error('terminating connection due to administrator command'),
        { code: '57P01' }
      )
    );
    expect((await run()).res).toMatchObject(unavailable);
  });

  it('still answers 401 for a missing session', async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await run()).res).toMatchObject(unauthenticated);
  });

  it('still answers 401 when Better Auth rejects the session', async () => {
    mockGetSession.mockRejectedValue(
      APIError.from('UNAUTHORIZED', {
        code: 'FAILED_TO_GET_SESSION',
        message: 'Failed to get session',
      })
    );
    expect((await run()).res).toMatchObject(unauthenticated);
  });

  it('answers 500, not 503, on a database error that retrying cannot fix', async () => {
    mockGetSession.mockRejectedValue(
      Object.assign(new Error('relation "session" does not exist'), {
        code: '42P01',
        severity: 'ERROR',
      })
    );
    const { res } = await run();
    expect(res).toMatchObject({
      statusCode: 500,
      headers: {},
      body: { error: 'Internal Server Error' },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/relation/);
  });

  it('answers 500, not 401, for an unexpected error', async () => {
    mockGetSession.mockRejectedValue(new Error('cannot read properties'));
    const { res, next } = await run();
    expect(res).toMatchObject({
      statusCode: 500,
      body: { error: 'Internal Server Error' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it.each([400, 500])(
    'answers 500 for an error that only carries a %i status',
    async (statusCode) => {
      mockGetSession.mockRejectedValue(
        Object.assign(new Error('request failed'), { statusCode })
      );
      expect((await run()).res).toMatchObject({
        statusCode: 500,
        headers: {},
        body: { error: 'Internal Server Error' },
      });
    }
  );

  it('still answers 401 for any other rejection by Better Auth', async () => {
    mockGetSession.mockRejectedValue(
      APIError.from('FORBIDDEN', {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key',
      })
    );
    expect((await run()).res).toMatchObject(unauthenticated);
  });
});
