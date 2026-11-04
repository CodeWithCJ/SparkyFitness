/**
 * Family delegation against a real database: `x-on-behalf-of-user-id`,
 * account switching and the `sparky_active_user_id` cookie must honour the
 * grants as they are stored in `family_access.access_permissions`
 * (`can_manage_diary`, ...). A mocked
 * repository would only echo back the names passed in, so this seeds real
 * grants and runs the real checks. Skips unless a test database is reachable.
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getSystemClient, endPool } from '../db/poolManager.js';
import { authenticate } from '../middleware/authMiddleware.js';
import onBehalfOfMiddleware from '../middleware/onBehalfOfMiddleware.js';
import { switchUserContext } from '../services/authService.js';

// Only the session lookup is faked; the cookie is then checked against the
// stored grants.
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock('../auth.js', () => ({
  auth: { api: { getSession: mockGetSession } },
}));

async function dbReachable(): Promise<boolean> {
  if (
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    !process.env.SPARKY_FITNESS_DB_HOST
  ) {
    return false;
  }
  // It seeds and deletes users, so only ever against a test database.
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();

const OWNER = '00000000-0000-4000-b000-0000000000ff';
const DELEGATES = {
  diary: ['00000000-0000-4000-b000-000000000001', { can_manage_diary: true }],
  checkin: [
    '00000000-0000-4000-b000-000000000002',
    { can_manage_checkin: true },
  ],
  reports: ['00000000-0000-4000-b000-000000000003', { can_view_reports: true }],
  medications: [
    '00000000-0000-4000-b000-000000000004',
    { can_manage_medications: true },
  ],
  symptoms: [
    '00000000-0000-4000-b000-000000000005',
    { can_manage_symptoms: true },
  ],
  foodLibraryOnly: [
    '00000000-0000-4000-b000-000000000006',
    { can_view_food_library: true },
  ],
} as const;
const STRANGER = '00000000-0000-4000-b000-000000000007';
const ALL_IDS = [
  OWNER,
  STRANGER,
  ...Object.values(DELEGATES).map(([id]) => id),
];

async function actOnBehalf(actorId: string, targetId: string) {
  const req = {
    headers: { 'x-on-behalf-of-user-id': targetId },
    authenticatedUserId: actorId,
    userId: actorId,
  } as Record<string, unknown>;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  await onBehalfOfMiddleware(req, res, next);
  return { req, res, next };
}

async function authenticateWithActiveUser(actorId: string, activeId: string) {
  mockGetSession.mockResolvedValueOnce({
    // A recent login keeps the middleware from writing a new one.
    user: { id: actorId, name: 'Delegate', lastLoginAt: new Date() },
  });
  const req = {
    headers: {},
    cookies: { sparky_active_user_id: activeId },
    method: 'GET',
    originalUrl: '/api/x',
    path: '/api/x',
  } as Record<string, unknown>;
  const next = vi.fn();
  await authenticate(req as never, {} as never, next);
  return { req, next };
}

describe.runIf(RUN)('family delegation with stored grants', () => {
  beforeAll(async () => {
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
      for (const id of ALL_IDS) {
        await sys.query(
          'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
          [id, `on-behalf-of-${id}@example.test`]
        );
      }
      for (const [name, [id, permissions]] of Object.entries(DELEGATES)) {
        await sys.query(
          `INSERT INTO public.family_access
             (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
           VALUES ($1, $2, $3, $4::jsonb, true, 'active')`,
          [
            OWNER,
            id,
            `on-behalf-of-${name}@example.test`,
            JSON.stringify(permissions),
          ]
        );
      }
    } finally {
      sys.release();
    }
  });

  afterAll(async () => {
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
    } finally {
      sys.release();
    }
    await endPool();
  });

  it.each(['diary', 'checkin', 'reports', 'medications', 'symptoms'] as const)(
    'lets a delegate with a %s grant act for the owner',
    async (grant) => {
      const actor = DELEGATES[grant][0];
      const { req, res, next } = await actOnBehalf(actor, OWNER);
      expect(res.status).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledOnce();
      expect(req.userId).toBe(OWNER);
      expect(req.originalUserId).toBe(actor);
    }
  );

  it.each([
    ['a food-library-only grant', DELEGATES.foodLibraryOnly[0]],
    ['no grant', STRANGER],
  ])('refuses a user with %s', async (_label, actor) => {
    const { req, res, next } = await actOnBehalf(actor, OWNER);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(req.userId).toBe(actor);
  });

  it('lets a symptoms-only delegate switch to the owner', async () => {
    await expect(
      switchUserContext(DELEGATES.symptoms[0], OWNER)
    ).resolves.toEqual({ success: true, activeUserId: OWNER });
  });

  it('refuses a switch without a grant', async () => {
    await expect(switchUserContext(STRANGER, OWNER)).rejects.toThrow(
      /Forbidden/
    );
  });

  it('keeps a symptoms-only delegate in the owner account on later requests', async () => {
    const { req, next } = await authenticateWithActiveUser(
      DELEGATES.symptoms[0],
      OWNER
    );
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(OWNER);
    expect(req.authenticatedUserId).toBe(DELEGATES.symptoms[0]);
  });

  it('ignores the active-account cookie without a grant', async () => {
    const { req, next } = await authenticateWithActiveUser(STRANGER, OWNER);
    expect(next).toHaveBeenCalledOnce();
    expect(req.userId).toBe(STRANGER);
  });
});
