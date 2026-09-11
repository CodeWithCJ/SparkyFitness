import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): supertest ships no types in this workspace.
import request from 'supertest';
import express from 'express';
import { OAuthStateError } from '../utils/oauthState.js';

const OTHER_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// Identity is mutated per test; the router reads it through the mocked auth
// middleware, matching the switched-context shape authMiddleware produces.
const { identity, withingsIntegration } = vi.hoisted(() => ({
  identity: { userId: '', authenticatedUserId: '', originalUserId: '' },
  withingsIntegration: {
    getAuthorizationUrl: vi.fn(),
    exchangeCodeForTokens: vi.fn(),
  },
}));

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../middleware/authMiddleware.js', () => ({
  default: {
    authenticate: (
      req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => {
      req.userId = identity.userId;
      req.authenticatedUserId = identity.authenticatedUserId;
      req.originalUserId = identity.originalUserId;
      next();
    },
  },
}));
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default:
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}));
vi.mock('../integrations/withings/withingsService.js', () => ({
  default: withingsIntegration,
}));
vi.mock('../services/withingsService.js', () => ({ default: {} }));

const { default: withingsRoutes } = await import('../routes/withingsRoutes.js');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/withings', withingsRoutes);
  return instance;
}

function actingAsSelf(userId: string) {
  identity.userId = userId;
  identity.authenticatedUserId = userId;
  identity.originalUserId = userId;
}

function actingAsDelegate(owner: string, delegate: string) {
  identity.userId = owner;
  identity.authenticatedUserId = delegate;
  identity.originalUserId = delegate;
}

const validState = () => `${'a'.repeat(64)}.${Date.now()}`;

beforeEach(() => {
  vi.clearAllMocks();
  actingAsSelf(OTHER_USER_ID);
  process.env.SPARKY_FITNESS_FRONTEND_URL = 'https://app.test';
});

describe('Withings callback state binding', () => {
  it('does not treat a victim user id supplied as state as the target user', async () => {
    withingsIntegration.exchangeCodeForTokens.mockRejectedValue(
      new OAuthStateError('malformed', 'malformed')
    );

    const response = await request(app())
      .post('/api/withings/callback')
      .send({ code: 'synthetic-authorization-code', state: OWNER_ID });

    expect(response.status).toBe(400);
    // The victim id must never have been used as a user identifier.
    for (const call of withingsIntegration.exchangeCodeForTokens.mock.calls) {
      expect(call[0]).not.toBe(OTHER_USER_ID);
      expect(call.slice(1)).not.toContain(OWNER_ID);
    }
  });

  it('rejects a bare UUID at the state grammar before any exchange', async () => {
    const { parseOAuthState } = await import('../utils/oauthState.js');
    expect(parseOAuthState(OWNER_ID)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it.each([
    ['absent', undefined],
    ['empty', ''],
    ['an array', ['a', 'b']],
    ['numeric', 42],
  ])('returns 400 when state is %s', async (_label, state) => {
    withingsIntegration.exchangeCodeForTokens.mockRejectedValue(
      new OAuthStateError('missing', 'missing')
    );

    const response = await request(app())
      .post('/api/withings/callback')
      .send({ code: 'synthetic-authorization-code', state });

    expect(response.status).toBe(400);
  });

  it('returns an identical opaque body for every state failure', async () => {
    const bodies: string[] = [];
    for (const reason of ['unknown', 'expired', 'malformed'] as const) {
      withingsIntegration.exchangeCodeForTokens.mockRejectedValue(
        new OAuthStateError(reason, `detail for ${reason}`)
      );
      const response = await request(app())
        .post('/api/withings/callback')
        .send({ code: 'code', state: validState() });
      expect(response.status).toBe(400);
      bodies.push(JSON.stringify(response.body));
    }
    // One identical body for all three is the opacity guarantee: the caller
    // cannot tell a forged nonce from a real-but-expired one.
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain('detail for');
  });

  it('links the account when the claimed owner is the authenticated actor', async () => {
    actingAsSelf(OWNER_ID);
    withingsIntegration.exchangeCodeForTokens.mockResolvedValue({
      success: true,
      ownerUserId: OWNER_ID,
    });

    const response = await request(app())
      .post('/api/withings/callback')
      .send({ code: 'code', state: validState() });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Withings account linked successfully.');
  });

  it('returns 403 when the claimed owner is not the authenticated actor', async () => {
    actingAsSelf(OTHER_USER_ID);
    withingsIntegration.exchangeCodeForTokens.mockResolvedValue({
      success: true,
      ownerUserId: OWNER_ID,
    });

    const response = await request(app())
      .post('/api/withings/callback')
      .send({ code: 'code', state: validState() });

    expect(response.status).toBe(403);
  });

  it('still rejects a callback with no authorization code', async () => {
    const response = await request(app())
      .post('/api/withings/callback')
      .send({ state: validState() });

    expect(response.status).toBe(400);
    expect(withingsIntegration.exchangeCodeForTokens).not.toHaveBeenCalled();
  });
});

describe('Withings authorize is self-only', () => {
  it('refuses a delegate acting in a switched context', async () => {
    actingAsDelegate(OWNER_ID, OTHER_USER_ID);

    const response = await request(app()).get('/api/withings/authorize');

    expect(response.status).toBe(403);
    // The owner's client id is never decrypted, so it cannot leak.
    expect(withingsIntegration.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('allows a user to authorize their own account', async () => {
    actingAsSelf(OWNER_ID);
    withingsIntegration.getAuthorizationUrl.mockResolvedValue(
      'https://account.withings.com/oauth2_user/authorize2?state=x'
    );

    const response = await request(app()).get('/api/withings/authorize');

    expect(response.status).toBe(200);
    expect(response.body.authUrl).toContain('withings.com');
    expect(withingsIntegration.getAuthorizationUrl).toHaveBeenCalledWith(
      OWNER_ID
    );
  });
});
