import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): supertest ships no types in this workspace.
import request from 'supertest';
import express from 'express';
import { OAuthStateError } from '../utils/oauthState.js';

const OTHER_USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const { identity, polarIntegration } = vi.hoisted(() => ({
  identity: { userId: '', authenticatedUserId: '', originalUserId: '' },
  polarIntegration: {
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
vi.mock('../integrations/polar/polarService.js', () => ({
  default: polarIntegration,
}));
vi.mock('../services/polarService.js', () => ({ default: {} }));

const { default: polarRoutes } = await import('../routes/polarRoutes.js');

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/integrations/polar', polarRoutes);
  return instance;
}

const validState = () => `${'a'.repeat(64)}.${Date.now()}`;

beforeEach(() => {
  vi.clearAllMocks();
  identity.userId = OTHER_USER_ID;
  identity.authenticatedUserId = OTHER_USER_ID;
  identity.originalUserId = OTHER_USER_ID;
  process.env.SPARKY_FITNESS_FRONTEND_URL = 'https://app.test';
});

describe('Polar callback state binding', () => {
  it('never passes a request-supplied user id to the exchange', async () => {
    polarIntegration.exchangeCodeForTokens.mockRejectedValue(
      new OAuthStateError('malformed', 'malformed')
    );

    const response = await request(app())
      .post('/api/integrations/polar/callback')
      .send({ code: 'code', state: OWNER_ID });

    expect(response.status).toBe(400);
    const call = polarIntegration.exchangeCodeForTokens.mock.calls[0];
    expect(call?.[0]).toBe(OWNER_ID); // passed as opaque state, not as an id
    expect(call?.slice(1)).not.toContain(OWNER_ID);
  });

  it('ignores a providerId supplied in the request body', async () => {
    polarIntegration.exchangeCodeForTokens.mockResolvedValue({
      success: true,
      ownerUserId: OTHER_USER_ID,
    });

    await request(app())
      .post('/api/integrations/polar/callback')
      .send({ code: 'code', state: validState(), providerId: 'other-row' });

    const call = polarIntegration.exchangeCodeForTokens.mock.calls[0];
    expect(call).toHaveLength(3);
    expect(call).not.toContain('other-row');
  });

  it('returns 403 when the claimed owner is not the actor', async () => {
    polarIntegration.exchangeCodeForTokens.mockResolvedValue({
      success: true,
      ownerUserId: OWNER_ID,
    });

    const response = await request(app())
      .post('/api/integrations/polar/callback')
      .send({ code: 'code', state: validState() });

    expect(response.status).toBe(403);
  });

  it('returns an opaque 400 for every state failure', async () => {
    const bodies: string[] = [];
    for (const reason of ['unknown', 'expired', 'malformed'] as const) {
      polarIntegration.exchangeCodeForTokens.mockRejectedValue(
        new OAuthStateError(reason, `detail for ${reason}`)
      );
      const response = await request(app())
        .post('/api/integrations/polar/callback')
        .send({ code: 'code', state: validState() });
      expect(response.status).toBe(400);
      bodies.push(JSON.stringify(response.body));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain('detail for');
  });

  it('links the account on the happy path', async () => {
    polarIntegration.exchangeCodeForTokens.mockResolvedValue({
      success: true,
      ownerUserId: OTHER_USER_ID,
    });

    const response = await request(app())
      .post('/api/integrations/polar/callback')
      .send({ code: 'code', state: validState() });

    expect(response.status).toBe(200);
  });
});

describe('Polar authorize is self-only', () => {
  it('refuses a delegate acting in a switched context', async () => {
    identity.userId = OWNER_ID;
    identity.authenticatedUserId = OTHER_USER_ID;
    identity.originalUserId = OTHER_USER_ID;

    const response = await request(app()).get(
      '/api/integrations/polar/authorize'
    );

    expect(response.status).toBe(403);
    expect(polarIntegration.getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('rejects a non-scalar providerId rather than passing it through', async () => {
    polarIntegration.getAuthorizationUrl.mockResolvedValue('https://polar/x');

    await request(app()).get(
      '/api/integrations/polar/authorize?providerId=a&providerId=b'
    );

    expect(polarIntegration.getAuthorizationUrl).toHaveBeenCalledWith(
      OTHER_USER_ID,
      expect.any(String),
      null
    );
  });
});
