import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';

// Simulated identities: a family-sharing delegate acting on behalf of a
// victim after a POST /api/identity/switch-context. authMiddleware would set
// req.authenticatedUserId = delegate and req.userId = victim.
const DELEGATE_ID = 'delegate-11111111-1111-1111-1111-111111111111';
const VICTIM_ID = 'victim-22222222-2222-2222-2222-222222222222';

const { mockCreateApiKey, mockDeleteApiKey, mockListApiKeys } = vi.hoisted(
  () => ({
    mockCreateApiKey: vi.fn(),
    mockDeleteApiKey: vi.fn(),
    mockListApiKeys: vi.fn(),
  })
);

vi.mock('../auth.js', () => ({
  auth: {
    api: {
      createApiKey: mockCreateApiKey,
      deleteApiKey: mockDeleteApiKey,
      listApiKeys: mockListApiKeys,
    },
  },
}));

// Stand in for the real authenticate middleware: populate a switched context
// so req.authenticatedUserId (delegate) and req.userId (victim) differ, exactly
// as authMiddleware does when the sparky_active_user_id cookie is honored.
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    req: any,
    res: express.Response,
    next: express.NextFunction
  ) => {
    req.authenticatedUserId = DELEGATE_ID;
    req.userId = VICTIM_ID; // switched context (RLS target)
    next();
  },
}));

import apiKeyRoutes from '../routes/auth/apiKeyRoutes.js';

const app = express();
app.use(express.json());
app.use('/api/identity', apiKeyRoutes);

describe('apiKeyRoutes: credentials target the authenticated actor, not the switched context', () => {
  beforeEach(() => {
    mockCreateApiKey.mockReset();
    mockDeleteApiKey.mockReset();
    mockListApiKeys.mockReset();
  });

  it('generate-api-key mints the key for the delegate, never the switched-to victim', async () => {
    mockCreateApiKey.mockResolvedValue({
      id: 'key-1',
      key: 'secret',
      name: 'my key',
      createdAt: new Date(0).toISOString(),
    });

    const res = await request(app)
      .post('/api/identity/user/generate-api-key')
      .send({ name: 'my key' });

    expect(res.status).toBe(201);
    expect(mockCreateApiKey).toHaveBeenCalledTimes(1);
    const arg = mockCreateApiKey.mock.calls[0][0];
    // The vulnerability: a medications (or any) delegate switching context and
    // calling this endpoint would otherwise mint a full-access key owned by the
    // victim, enabling account takeover beyond the delegated scope.
    expect(arg.userId).toBe(DELEGATE_ID);
    expect(arg.userId).not.toBe(VICTIM_ID);
  });

  it('delete api-key targets the delegate, not the switched-to victim', async () => {
    mockDeleteApiKey.mockResolvedValue(undefined);

    const res = await request(app).delete('/api/identity/user/api-key/key-1');

    expect(res.status).toBe(200);
    expect(mockDeleteApiKey).toHaveBeenCalledTimes(1);
    expect(mockDeleteApiKey.mock.calls[0][0].userId).toBe(DELEGATE_ID);
    expect(mockDeleteApiKey.mock.calls[0][0].userId).not.toBe(VICTIM_ID);
  });

  it('list api-keys returns the delegate keys, not the switched-to victim keys', async () => {
    mockListApiKeys.mockResolvedValue([]);

    const res = await request(app).get('/api/identity/user-api-keys');

    expect(res.status).toBe(200);
    expect(mockListApiKeys).toHaveBeenCalledTimes(1);
    expect(mockListApiKeys.mock.calls[0][0].userId).toBe(DELEGATE_ID);
    expect(mockListApiKeys.mock.calls[0][0].userId).not.toBe(VICTIM_ID);
  });
});
