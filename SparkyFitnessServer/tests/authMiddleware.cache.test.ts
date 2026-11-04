import { vi, beforeEach, describe, expect, it } from 'vitest';

// Hoisted so vi.mock factories (also hoisted) can reference it.
const {
  mockGetSession,
  mockRequireMcpAuth,
  mockIsMcpOAuthEnabled,
  mockFindAuthIdentityById,
  mockIsOAuthAuthorizationActive,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireMcpAuth: vi.fn(),
  mockIsMcpOAuthEnabled: vi.fn(),
  mockFindAuthIdentityById: vi.fn(),
  mockIsOAuthAuthorizationActive: vi.fn(),
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
    findAuthIdentityById: mockFindAuthIdentityById,
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

vi.mock('@better-auth/mcp', () => ({
  requireMcpAuth: mockRequireMcpAuth,
}));

vi.mock('../models/globalSettingsRepository.js', () => ({
  isMcpOAuthEnabled: mockIsMcpOAuthEnabled,
}));

vi.mock('../models/oauthClientRepository.js', () => ({
  isOAuthAuthorizationActive: mockIsOAuthAuthorizationActive,
}));

vi.mock('better-call', () => ({
  serializeSignedCookie: vi.fn().mockResolvedValue('cookie-value'),
}));

import { authenticate, authenticateMcp } from '../middleware/authMiddleware.js';
import { clearApiKeySessionCache } from '../utils/apiKeySessionCache.js';

const VALID_TOKEN_A = 'a'.repeat(64);
const VALID_TOKEN_B = 'b'.repeat(64);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(token: string): any {
  return {
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
    method: 'GET',
    originalUrl: '/api/x',
    path: '/api/x',
    protocol: 'https',
    get: (name: string) => (name === 'host' ? 'sparky.example' : undefined),
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
    vi.stubEnv('BETTER_AUTH_URL', 'https://sparky.example');
    vi.stubEnv('SPARKY_FITNESS_SERVER_PORT', '3010');
    clearApiKeySessionCache();
    mockGetSession.mockReset();
    mockRequireMcpAuth.mockReset();
    mockIsMcpOAuthEnabled.mockReset().mockResolvedValue(false);
    mockFindAuthIdentityById.mockReset();
    mockIsOAuthAuthorizationActive.mockReset().mockResolvedValue(true);
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

  it('validates an OAuth access token before the legacy Bearer bridge', async () => {
    mockIsMcpOAuthEnabled.mockResolvedValue(true);
    mockFindAuthIdentityById.mockResolvedValue({
      id: 'oauth-user',
      name: 'OAuth User',
    });
    let verifiedRequestUrl: string | undefined;
    mockRequireMcpAuth.mockImplementation(
      (
        _auth: unknown,
        handler: (
          request: globalThis.Request,
          claims: { sub: string; client_id: string; iat: number }
        ) => globalThis.Response | Promise<globalThis.Response>
      ) =>
        async (request: globalThis.Request) => {
          verifiedRequestUrl = request.url;
          await handler(request, {
            sub: 'oauth-user',
            client_id: 'oauth-client',
            iat: 1_700_000_000,
          });
          return new globalThis.Response(null, { status: 204 });
        }
    );
    const req = makeReq('oauth.jwt.token');
    req.method = 'POST';
    req.path = '/mcp';
    req.originalUrl = '/mcp';
    req.protocol = 'http';
    req.get = (name: string) =>
      name === 'host' ? '127.0.0.1:3010' : undefined;
    const next = vi.fn();

    await authenticateMcp(req, makeRes(), next);

    expect(mockRequireMcpAuth).toHaveBeenCalledOnce();
    expect(mockRequireMcpAuth.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        jwksUrl: expect.stringMatching(
          /^http:\/\/127\.0\.0\.1:\d+\/api\/auth\/jwks$/
        ),
      })
    );
    expect(verifiedRequestUrl).toBe('https://sparky.example/mcp');
    expect(mockIsOAuthAuthorizationActive).toHaveBeenCalledWith(
      'oauth-user',
      'oauth-client',
      1_700_000_000
    );
    expect(mockFindAuthIdentityById).toHaveBeenCalledWith('oauth-user');
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(req.authenticatedUserId).toBe('oauth-user');
    expect(next).toHaveBeenCalledOnce();
  });

  it('preserves API-key authentication when MCP OAuth is enabled', async () => {
    mockIsMcpOAuthEnabled.mockResolvedValue(true);
    mockGetSession.mockResolvedValue({ user: { id: 'u1', name: 'U' } });
    const next = vi.fn();

    const req = makeReq(VALID_TOKEN_A);
    req.method = 'POST';
    req.path = '/mcp';
    req.originalUrl = '/mcp';
    await authenticateMcp(req, makeRes(), next);

    expect(mockRequireMcpAuth).not.toHaveBeenCalled();
    expect(mockGetSession).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns the OAuth challenge only after legacy authentication also fails', async () => {
    mockIsMcpOAuthEnabled.mockResolvedValue(true);
    mockGetSession.mockResolvedValue(null);
    mockRequireMcpAuth.mockImplementation(
      () => async () =>
        new globalThis.Response(null, {
          status: 401,
          headers: {
            'WWW-Authenticate':
              'Bearer error="invalid_token", resource_metadata="https://sparky.example/.well-known/oauth-protected-resource/mcp"',
          },
        })
    );
    const req = makeReq('invalid.oauth.token');
    req.method = 'POST';
    req.path = '/mcp';
    req.originalUrl = '/mcp';
    const res = makeRes();

    await authenticateMcp(req, res, vi.fn());

    expect(res.statusCode).toBe(401);
    expect(
      (res.headers as Record<string, string>)['WWW-Authenticate']
    ).toContain('invalid_token');
  });
});
