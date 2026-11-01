/**
 * The COROS daily FIT download budget is counted on the provider rows. Two
 * server processes (two separate connection pools here) spending downloads for
 * the same COROS account at once, through one row or several, must share one
 * budget, never exceed it, and start again on the next UTC day.
 *
 * Skipped when no database is reachable, like the other integration tests.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type Repo = typeof import('../models/corosFitBudgetRepository.js');
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
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

/** A fresh module graph = its own pool, like another server process. */
async function loadInstance(): Promise<{ repo: Repo; pools: Pools }> {
  vi.resetModules();
  const pools = await import('../db/poolManager.js');
  const repo = await import('../models/corosFitBudgetRepository.js');
  return { repo, pools };
}

describe('COROS FIT download budget per COROS account', () => {
  let dbAvailable = false;
  let db: pg.Client;
  let first: { repo: Repo; pools: Pools };
  let second: { repo: Repo; pools: Pools };
  const userId = randomUUID();
  let providerId: string;
  let otherProviderId: string;

  const budgetRow = async (id: string) =>
    (
      await db.query(
        `SELECT fit_downloads_day::text AS day, fit_downloads_used AS used
         FROM external_data_providers WHERE id = $1`,
        [id]
      )
    ).rows[0] as { day: string | null; used: number };

  const utcToday = async (offsetDays = 0) =>
    (
      await db.query(
        "SELECT ((now() AT TIME ZONE 'UTC')::date + $1::int)::text AS day",
        [offsetDays]
      )
    ).rows[0].day as string;

  beforeAll(async () => {
    dbAvailable = await isDbReachable();
    if (!dbAvailable) return;
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `coros-budget-${userId}@example.com`]
    );
    const insert = async (name: string) =>
      (
        await db.query(
          `INSERT INTO external_data_providers (user_id, provider_name, provider_type)
           VALUES ($1, $2, 'coros_mcp') RETURNING id`,
          [userId, name]
        )
      ).rows[0].id as string;
    providerId = await insert('COROS A');
    otherProviderId = await insert('COROS B');
    first = await loadInstance();
    second = await loadInstance();
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await first?.pools.endPool();
    await second?.pools.endPool();
  });

  it('starts a new row at one download for today', async () => {
    if (!dbAvailable) return;
    expect(await budgetRow(providerId)).toEqual({ day: null, used: 0 });

    const reserved = await first.repo.reserveFitDownload(providerId, 45);

    expect(reserved).toEqual({ day: await utcToday(), used: 1 });
    expect(await budgetRow(providerId)).toEqual({
      day: await utcToday(),
      used: 1,
    });
  });

  it('lets two processes racing for one account spend exactly the daily limit between them', async () => {
    if (!dbAvailable) return;
    await db.query(
      'UPDATE external_data_providers SET fit_downloads_day = NULL, fit_downloads_used = 0 WHERE id = $1',
      [providerId]
    );

    const attempts = Array.from({ length: 70 }, (_, i) =>
      (i % 2 === 0 ? first : second).repo.reserveFitDownload(providerId, 45)
    );
    const results = await Promise.all(attempts);

    const granted = results.filter((r) => r !== null);
    expect(granted).toHaveLength(45);
    expect(granted.map((r) => r!.used).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 45 }, (_, i) => i + 1)
    );
    // Both processes got a share: they really drew from the same counter.
    const fromFirst = results.filter((r, i) => r !== null && i % 2 === 0);
    const fromSecond = results.filter((r, i) => r !== null && i % 2 === 1);
    expect(fromFirst.length).toBeGreaterThan(0);
    expect(fromSecond.length).toBeGreaterThan(0);
    expect((await budgetRow(providerId)).used).toBe(45);

    expect(await second.repo.reserveFitDownload(providerId, 45)).toBeNull();
    expect(await first.repo.reserveFitDownload(providerId, 45)).toBeNull();
    // Other accounts keep their own budget.
    expect(await second.repo.reserveFitDownload(otherProviderId, 45)).toEqual({
      day: await utcToday(),
      used: 1,
    });
  });

  it('starts over on the next UTC day', async () => {
    if (!dbAvailable) return;
    await db.query(
      `UPDATE external_data_providers
       SET fit_downloads_day = (now() AT TIME ZONE 'UTC')::date - 1, fit_downloads_used = 45
       WHERE id = $1`,
      [providerId]
    );

    expect(await first.repo.reserveFitDownload(providerId, 45)).toEqual({
      day: await utcToday(),
      used: 1,
    });
  });

  it('gives a download back only on the day it was taken', async () => {
    if (!dbAvailable) return;
    await db.query(
      `UPDATE external_data_providers
       SET fit_downloads_day = (now() AT TIME ZONE 'UTC')::date, fit_downloads_used = 45
       WHERE id = $1`,
      [providerId]
    );

    await second.repo.releaseFitDownload(providerId, await utcToday(-1));
    expect((await budgetRow(providerId)).used).toBe(45);

    await second.repo.releaseFitDownload(providerId, await utcToday());
    expect((await budgetRow(providerId)).used).toBe(44);
    expect(await first.repo.reserveFitDownload(providerId, 45)).toEqual({
      day: await utcToday(),
      used: 45,
    });
  });

  it('shares one budget between every row linked to the same COROS account', async () => {
    if (!dbAvailable) return;
    const linkedUserId = randomUUID();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [linkedUserId, `coros-budget-${linkedUserId}@example.com`]
    );
    try {
      const corosAccount = `coros-${randomUUID()}`;
      const linked = async (ownerId: string, name: string) =>
        (
          await db.query(
            `INSERT INTO external_data_providers
               (user_id, provider_name, provider_type, external_user_id)
             VALUES ($1, $2, 'coros_mcp', $3) RETURNING id`,
            [ownerId, name, corosAccount]
          )
        ).rows[0].id as string;
      // A second connection for one user, and another user's link to the
      // same COROS account.
      const ownRow = await linked(userId, 'COROS shared 1');
      const otherUsersRow = await linked(linkedUserId, 'COROS shared 2');

      const results = await Promise.all(
        Array.from({ length: 70 }, (_, i) =>
          (i % 2 === 0 ? first : second).repo.reserveFitDownload(
            i % 2 === 0 ? ownRow : otherUsersRow,
            45
          )
        )
      );

      const granted = results.filter((r) => r !== null);
      expect(granted).toHaveLength(45);
      expect(granted.map((r) => r!.used).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 45 }, (_, i) => i + 1)
      );
      const ownUsed = (await budgetRow(ownRow)).used;
      const otherUsed = (await budgetRow(otherUsersRow)).used;
      expect(ownUsed).toBeGreaterThan(0);
      expect(otherUsed).toBeGreaterThan(0);
      expect(ownUsed + otherUsed).toBe(45);
      expect(await first.repo.reserveFitDownload(ownRow, 45)).toBeNull();

      // A download given back returns to the row that took it, and the
      // account can spend it again through either row.
      await second.repo.releaseFitDownload(otherUsersRow, await utcToday());
      expect((await budgetRow(otherUsersRow)).used).toBe(otherUsed - 1);
      expect(await first.repo.reserveFitDownload(ownRow, 45)).toEqual({
        day: await utcToday(),
        used: 45,
      });
    } finally {
      await db.query('DELETE FROM public."user" WHERE id = $1', [linkedUserId]);
    }
  });
});
