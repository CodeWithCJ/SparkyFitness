/**
 * Who may download a progress photo through `/check-in-photos/file/:id`,
 * against a real database. The photo is looked up by id alone, so the service
 * must check the owner itself instead of relying on RLS: a deployment whose app
 * role bypasses RLS (for example one run as the database owner) would otherwise
 * serve any photo to any signed-in user who knows its id. Each case runs twice,
 * once as the RLS-enforced app role and once on a connection that bypasses RLS.
 * Skips unless a test database is reachable.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// The uploads root is read when the service is imported (below), so point it
// at a temp folder first.
const uploadsDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'checkin-photo-access-')
);
process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = uploadsDir;

// Lets a test hand out an RLS-bypassing (owner) connection in place of the
// app-role one, the way a misconfigured deployment would.
const { bypassRls } = vi.hoisted(() => ({ bypassRls: { on: false } }));
vi.mock('../db/poolManager.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/poolManager.js')>();
  return {
    ...actual,
    getClient: (userId: string, authenticatedUserId?: string | null) =>
      bypassRls.on
        ? actual.getSystemClient()
        : actual.getClient(userId, authenticatedUserId ?? null),
  };
});

const { getSystemClient, endPool } = await import('../db/poolManager.js');
const { getPhotoFileById } = await import('../services/checkInPhotoService.js');

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

const OWNER = '00000000-0000-4000-c000-0000000000ff';
const CHECKIN_DELEGATE = '00000000-0000-4000-c000-000000000001';
const DIARY_DELEGATE = '00000000-0000-4000-c000-000000000002';
const STRANGER = '00000000-0000-4000-c000-000000000003';
const ALL_IDS = [OWNER, CHECKIN_DELEGATE, DIARY_DELEGATE, STRANGER];
const PHOTO_ID = '00000000-0000-4000-c000-0000000000aa';
const RELATIVE_PATH = `uploads/check-in/${OWNER}/2026-11-01/front.png`;
const ABSOLUTE_PATH = path.join(
  uploadsDir,
  'check-in',
  OWNER,
  '2026-11-01',
  'front.png'
);

describe.runIf(RUN)('check-in photo file access', () => {
  beforeAll(async () => {
    fs.mkdirSync(path.dirname(ABSOLUTE_PATH), { recursive: true });
    fs.writeFileSync(ABSOLUTE_PATH, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
      for (const id of ALL_IDS) {
        await sys.query(
          'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
          [id, `checkin-photo-${id}@example.test`]
        );
      }
      const grants: [string, Record<string, boolean>][] = [
        [CHECKIN_DELEGATE, { can_manage_checkin: true }],
        [DIARY_DELEGATE, { can_manage_diary: true }],
      ];
      for (const [id, perms] of grants) {
        await sys.query(
          `INSERT INTO public.family_access
             (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
           VALUES ($1, $2, $3, $4::jsonb, true, 'active')`,
          [OWNER, id, `checkin-photo-${id}@example.test`, JSON.stringify(perms)]
        );
      }
      await sys.query(
        `INSERT INTO public.check_in_photos (id, user_id, entry_date, photo_type, file_path)
         VALUES ($1, $2, '2026-11-01', 'front', $3)`,
        [PHOTO_ID, OWNER, RELATIVE_PATH]
      );
    } finally {
      sys.release();
    }
  });

  afterAll(async () => {
    bypassRls.on = false;
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
    } finally {
      sys.release();
    }
    await endPool();
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  describe.each([
    ['RLS enforced', false],
    ['RLS bypassed', true],
  ])('%s', (_label, bypass) => {
    beforeAll(() => {
      bypassRls.on = bypass;
    });

    it('serves the photo to its owner', async () => {
      await expect(getPhotoFileById(OWNER, PHOTO_ID, OWNER)).resolves.toBe(
        ABSOLUTE_PATH
      );
    });

    it('refuses a signed-in user with no grant', async () => {
      await expect(
        getPhotoFileById(STRANGER, PHOTO_ID, STRANGER)
      ).resolves.toBeNull();
    });

    it('refuses a family member whose grant has no check-in access', async () => {
      await expect(
        getPhotoFileById(DIARY_DELEGATE, PHOTO_ID, DIARY_DELEGATE)
      ).resolves.toBeNull();
    });

    it('serves the photo to a family member with check-in access', async () => {
      await expect(
        getPhotoFileById(CHECKIN_DELEGATE, PHOTO_ID, CHECKIN_DELEGATE)
      ).resolves.toBe(ABSOLUTE_PATH);
    });

    it('serves the photo to that family member while switched to the owner', async () => {
      await expect(
        getPhotoFileById(OWNER, PHOTO_ID, CHECKIN_DELEGATE)
      ).resolves.toBe(ABSOLUTE_PATH);
    });
  });
});
