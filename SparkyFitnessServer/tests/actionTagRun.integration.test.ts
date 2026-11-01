/**
 * The double-read guard lives in the database. This runs the real claim and
 * release statements: a second claim inside the window is refused, a failed
 * run puts its own claim back, and a slow failure never undoes a newer claim.
 *
 * Skipped when no database is reachable, like the other integration tests.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Repo = typeof import('../models/actionTagRepository.js');
type Pools = typeof import('../db/poolManager.js');

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  const probe = ownerClient();
  try {
    await probe.connect();
    // The table comes from the migration; an older database has none.
    const found = await probe.query("SELECT to_regclass('public.action_tags')");
    return found.rows[0].to_regclass !== null;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

describe('action tag run claim', () => {
  let dbAvailable = false;
  let db: pg.Client;
  let repo: Repo;
  let pools: Pools;
  const userId = randomUUID();
  const tagId = randomUUID();

  const lastRun = async () =>
    (
      await db.query('SELECT last_run_at FROM action_tags WHERE id = $1', [
        tagId,
      ])
    ).rows[0].last_run_at as Date | null;

  beforeAll(async () => {
    dbAvailable = await isDbReachable();
    if (!dbAvailable) return;
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `action-tag-${userId}@example.com`]
    );
    await db.query(
      `INSERT INTO action_tags (id, user_id, tag_code, label, action)
       VALUES ($1, $2, $3, 'Test', '{"type":"water","container_id":1,"drinks":1}')`,
      [tagId, userId, randomUUID().replace(/-/g, '')]
    );
    vi.resetModules();
    pools = await import('../db/poolManager.js');
    repo = await import('../models/actionTagRepository.js');
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await pools?.endPool();
  });

  it('refuses a second claim inside the window', async () => {
    if (!dbAvailable) return;
    const first = await repo.claimActionTagRun(userId, tagId, 10);
    expect(first).not.toBeNull();
    expect(await repo.claimActionTagRun(userId, tagId, 10)).toBeNull();
  });

  it('puts a failed run back so the next tap is not dropped', async () => {
    if (!dbAvailable) return;
    await db.query('UPDATE action_tags SET last_run_at = NULL WHERE id = $1', [
      tagId,
    ]);
    const claim = await repo.claimActionTagRun(userId, tagId, 10);
    expect(claim).not.toBeNull();
    if (!claim) return;
    // The claim's own timestamp is what was stored, to the millisecond.
    expect((await lastRun())?.getTime()).toBe(claim.claimedAt.getTime());

    await repo.releaseActionTagRun(userId, tagId, claim);

    expect(await lastRun()).toBeNull();
    expect(await repo.claimActionTagRun(userId, tagId, 10)).not.toBeNull();
  });

  it('does not undo a newer claim when a slow run fails late', async () => {
    if (!dbAvailable) return;
    // An old claim whose run is still going, then a newer scan claims the tag.
    const oldClaim = {
      previousRunAt: null,
      claimedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    await db.query('UPDATE action_tags SET last_run_at = now() WHERE id = $1', [
      tagId,
    ]);
    const newer = await lastRun();

    await repo.releaseActionTagRun(userId, tagId, oldClaim);

    expect((await lastRun())?.getTime()).toBe(newer?.getTime());
  });
});
