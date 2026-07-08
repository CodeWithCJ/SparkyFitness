import { vi, describe, expect, it, beforeAll, beforeEach } from 'vitest';

/**
 * Tests for the browser-based passkey web-bridge routes in authCoreRoutes:
 *   GET /web-login/passkey                          - serves the login page
 *   GET /web-login/register-passkey                 - serves the register page
 *   GET /web-login/simplewebauthn-browser.umd.min.js - serves the self-hosted lib
 *   GET /web-login/callback                         - relays the session to the app
 *
 * auth.js is mocked so getSession can be controlled and no database or Better
 * Auth initialization is needed. Handlers are pulled off the Express router
 * stack and invoked with mock req/res (same approach as authRateLimit.test.ts).
 */
const getSessionMock = vi.fn();

vi.mock('../auth.js', () => {
  const auth = { api: { getSession: getSessionMock }, options: {} };
  return {
    default: { auth },
    auth,
    cleanupSessions: vi.fn(),
    syncTrustedProviders: vi.fn(),
  };
});

// bearerAuthBridge is a no-op in tests (it needs real Better Auth secrets).
vi.mock('../utils/bearerAuthBridge.js', () => ({
  bridgeBearerAuthHeader: vi.fn().mockResolvedValue({ apiKeyToken: null }),
}));

// The ticket service is mocked so route logic (auth, freshness, response shape)
// can be tested without a database.
const mintMock = vi.fn();
const redeemMock = vi.fn();
vi.mock('../services/passkeyTicketService.js', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mintRegistrationTicket: (...args: any[]) => mintMock(...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  redeemRegistrationTicket: (...args: any[]) => redeemMock(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let router: any;

beforeAll(async () => {
  const mod = await import('../routes/auth/authCoreRoutes.js');
  router = mod.default;
});

beforeEach(() => {
  getSessionMock.mockReset();
  mintMock.mockReset();
  redeemMock.mockReset();
});

function getHandler(routePath: string) {
  const layer = router.stack.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (l: any) => l.route?.path === routePath
  );
  if (!layer) throw new Error(`Route not found: ${routePath}`);
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function makeRes() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = {
    sendFileArg: null,
    typeArg: null,
    redirectArg: null,
    statusCode: null,
    sendBody: null,
    sendFile(p: string) {
      res.sendFileArg = p;
      return res;
    },
    type(t: string) {
      res.typeArg = t;
      return res;
    },
    redirect(u: string) {
      res.redirectArg = u;
      return res;
    },
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    send(b: unknown) {
      res.sendBody = b;
      return res;
    },
    jsonBody: null,
    json(b: unknown) {
      res.jsonBody = b;
      return res;
    },
    set() {
      return res;
    },
  };
  return res;
}

describe('web-login static pages', () => {
  it('GET /web-login/passkey serves the passkey login page', () => {
    const res = makeRes();
    getHandler('/web-login/passkey')({}, res);
    expect(res.sendFileArg).toMatch(/templates[\\/]passkey-login\.html$/);
  });

  it('GET /web-login/register-passkey serves the passkey register page', () => {
    const res = makeRes();
    getHandler('/web-login/register-passkey')({}, res);
    expect(res.sendFileArg).toMatch(/templates[\\/]passkey-register\.html$/);
  });

  it('serves the self-hosted @simplewebauthn bundle with a JS content type', () => {
    const res = makeRes();
    getHandler('/web-login/simplewebauthn-browser.umd.min.js')({}, res);
    expect(res.typeArg).toBe('application/javascript');
    expect(res.sendFileArg).toMatch(
      /templates[\\/]simplewebauthn-browser\.umd\.min\.js$/
    );
  });
});

describe('GET /web-login/callback', () => {
  it('returns 400 when there is no active session', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = makeRes();
    await getHandler('/web-login/callback')({ headers: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(getSessionMock).toHaveBeenCalledOnce();
  });

  it('relays the session token in the URL fragment (never the query string)', async () => {
    getSessionMock.mockResolvedValue({
      session: { token: 'sess-tok-123' },
      user: { email: 'a@b.com', role: 'admin' },
    });
    const res = makeRes();
    await getHandler('/web-login/callback')({ headers: {} }, res);

    expect(res.redirectArg).toBeTruthy();
    // Security: the raw token must ride in the fragment, not the query string,
    // so it can't leak into proxy / access logs.
    expect(res.redirectArg).toContain('sparkyfitnessmobile://oauth-callback#');
    expect(res.redirectArg).not.toContain('oauth-callback?');
    expect(res.redirectArg).toContain('token=sess-tok-123');
    expect(res.redirectArg).toContain('email=a%40b.com');
    expect(res.redirectArg).toContain('role=admin');
  });

  it('returns 500 when session lookup throws', async () => {
    getSessionMock.mockRejectedValue(new Error('boom'));
    const res = makeRes();
    await getHandler('/web-login/callback')({ headers: {} }, res);
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /web-login/register-ticket', () => {
  it('returns 401 when no Bearer token is present', async () => {
    const res = makeRes();
    await getHandler('/web-login/register-ticket')({ headers: {} }, res);
    expect(res.statusCode).toBe(401);
    expect(mintMock).not.toHaveBeenCalled();
  });

  it('mints a ticket for a fresh session and returns it', async () => {
    getSessionMock.mockResolvedValue({
      session: { updatedAt: new Date() }, // fresh
      user: { id: 'user-1' },
    });
    mintMock.mockResolvedValue('opaque-ticket-code');
    const res = makeRes();
    await getHandler('/web-login/register-ticket')(
      { headers: { authorization: 'Bearer tok-abc' } },
      res
    );
    expect(mintMock).toHaveBeenCalledWith('user-1', 'tok-abc');
    expect(res.jsonBody).toEqual({ ticket: 'opaque-ticket-code' });
  });

  it('returns 403 SESSION_NOT_FRESH for a stale session', async () => {
    getSessionMock.mockResolvedValue({
      session: { updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }, // 25h old
      user: { id: 'user-1' },
    });
    const res = makeRes();
    await getHandler('/web-login/register-ticket')(
      { headers: { authorization: 'Bearer tok-abc' } },
      res
    );
    expect(res.statusCode).toBe(403);
    expect((res.jsonBody as { code: string }).code).toBe('SESSION_NOT_FRESH');
    expect(mintMock).not.toHaveBeenCalled();
  });

  it('returns 401 when the session cannot be resolved', async () => {
    getSessionMock.mockResolvedValue(null);
    const res = makeRes();
    await getHandler('/web-login/register-ticket')(
      { headers: { authorization: 'Bearer tok-abc' } },
      res
    );
    expect(res.statusCode).toBe(401);
    expect(mintMock).not.toHaveBeenCalled();
  });
});

describe('POST /web-login/redeem-ticket', () => {
  it('returns the session token for a valid ticket', async () => {
    redeemMock.mockResolvedValue({ sessionToken: 'sess-tok-xyz' });
    const res = makeRes();
    await getHandler('/web-login/redeem-ticket')(
      { headers: {}, body: { ticket: 'good-ticket' } },
      res
    );
    expect(redeemMock).toHaveBeenCalledWith('good-ticket');
    expect(res.jsonBody).toEqual({ token: 'sess-tok-xyz' });
  });

  it('returns 400 INVALID_TICKET for an invalid/used/expired ticket', async () => {
    redeemMock.mockResolvedValue(null);
    const res = makeRes();
    await getHandler('/web-login/redeem-ticket')(
      { headers: {}, body: { ticket: 'bad-ticket' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.jsonBody as { code: string }).code).toBe('INVALID_TICKET');
  });

  it('returns 400 when no ticket is supplied', async () => {
    const res = makeRes();
    await getHandler('/web-login/redeem-ticket')(
      { headers: {}, body: {} },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(redeemMock).not.toHaveBeenCalled();
  });
});
