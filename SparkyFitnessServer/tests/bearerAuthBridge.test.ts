import { vi, describe, expect, it } from 'vitest';

vi.mock('../auth.js', () => ({
  auth: {
    api: { getSession: vi.fn() },
    options: {
      advanced: { cookiePrefix: 'sparky', useSecureCookies: false },
      secret: 'test-secret',
    },
  },
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

vi.mock('better-call', () => ({
  serializeSignedCookie: vi
    .fn()
    .mockImplementation(
      async (name: string, value: string) =>
        `${name}=${value}.signature; Path=/; HttpOnly`
    ),
}));

import { bridgeBearerAuthHeader } from '../utils/bearerAuthBridge.js';

const COOKIE_NAME = 'sparky.session_token';
// Session tokens are the branch that becomes a cookie: under 64 chars, or
// containing a dot, so they are not mistaken for an API key.
const SESSION_A = 'session-token-account-a.abc';
const SESSION_B = 'session-token-account-b.xyz';

function makeReq(headers: Record<string, string | string[] | undefined>): {
  headers: Record<string, string | string[] | undefined>;
} {
  return { headers };
}

/** The cookie names present, in order, as a parser would encounter them. */
function cookieNames(header: string): string[] {
  return header.split(';').map((part) => part.trim().split('=')[0]);
}

function cookieValue(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq > 0 && trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return undefined;
}

describe('bridgeBearerAuthHeader', () => {
  it('injects the session cookie when the client sent none', async () => {
    const req = makeReq({ authorization: `Bearer ${SESSION_A}` });

    await bridgeBearerAuthHeader(req);

    expect(cookieValue(req.headers.cookie as string, COOKIE_NAME)).toBe(
      `${SESSION_A}.signature`
    );
    expect(req.headers.authorization).toBeUndefined();
  });

  it('replaces a session cookie belonging to another account', async () => {
    // Two accounts on one host share a cookie jar, so the client can send a
    // session cookie for B while asking, via Bearer, to be A.
    const req = makeReq({
      authorization: `Bearer ${SESSION_A}`,
      cookie: `${COOKIE_NAME}=${SESSION_B}.signature`,
    });

    await bridgeBearerAuthHeader(req);

    const header = req.headers.cookie as string;
    // Cookie parsing is first-wins, so a surviving duplicate would shadow ours
    // however it is ordered: the stale name must be gone, not merely later.
    expect(cookieNames(header).filter((n) => n === COOKIE_NAME)).toHaveLength(
      1
    );
    expect(cookieValue(header, COOKIE_NAME)).toBe(`${SESSION_A}.signature`);
    expect(header).not.toContain(SESSION_B);
  });

  it('keeps unrelated cookies', async () => {
    const req = makeReq({
      authorization: `Bearer ${SESSION_A}`,
      cookie: `theme=dark; ${COOKIE_NAME}=${SESSION_B}.signature; locale=es`,
    });

    await bridgeBearerAuthHeader(req);

    const header = req.headers.cookie as string;
    expect(cookieValue(header, 'theme')).toBe('dark');
    expect(cookieValue(header, 'locale')).toBe('es');
    expect(cookieValue(header, COOKIE_NAME)).toBe(`${SESSION_A}.signature`);
  });

  it('leaves a valueless cookie part intact', async () => {
    // `slice(0, indexOf('='))` on a part with no `=` would mangle the name it
    // compares, so such a part is matched whole instead.
    const req = makeReq({
      authorization: `Bearer ${SESSION_A}`,
      cookie: `flag; ${COOKIE_NAME}=${SESSION_B}.signature`,
    });

    await bridgeBearerAuthHeader(req);

    const header = req.headers.cookie as string;
    expect(header).toContain('flag');
    expect(header).not.toContain(SESSION_B);
  });

  it('maps an API key to x-api-key without touching cookies', async () => {
    const apiKey = 'k'.repeat(64);
    const req = makeReq({
      authorization: `Bearer ${apiKey}`,
      cookie: `${COOKIE_NAME}=${SESSION_B}.signature`,
    });

    const result = await bridgeBearerAuthHeader(req);

    expect(result.apiKeyToken).toBe(apiKey);
    expect(req.headers['x-api-key']).toBe(apiKey);
    expect(req.headers.cookie).toBe(`${COOKIE_NAME}=${SESSION_B}.signature`);
  });

  it('does nothing without a Bearer header', async () => {
    const req = makeReq({ cookie: `${COOKIE_NAME}=${SESSION_B}.signature` });

    const result = await bridgeBearerAuthHeader(req);

    expect(result.apiKeyToken).toBeNull();
    expect(req.headers.cookie).toBe(`${COOKIE_NAME}=${SESSION_B}.signature`);
  });
});
