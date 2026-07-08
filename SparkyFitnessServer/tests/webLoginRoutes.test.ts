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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let router: any;

beforeAll(async () => {
  const mod = await import('../routes/auth/authCoreRoutes.js');
  router = mod.default;
});

beforeEach(() => {
  getSessionMock.mockReset();
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
