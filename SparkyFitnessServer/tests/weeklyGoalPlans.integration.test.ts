/**
 * Saving a switched-on weekly goal plan keeps one plan per day and leaves
 * past days with the plan they had. Driven through the repository as the app
 * role, so grants and row-level security apply.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { endPool } from '../db/poolManager.js';
import weeklyGoalPlanRepository, {
  WeeklyGoalPlanOverlapError,
} from '../models/weeklyGoalPlanRepository.js';

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
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
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

const RUN = await isDbReachable();

async function waitForBlockedAdvisoryLock(db: pg.Client) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const waiting = await db.query(
      "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
    );
    if (waiting.rows.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The save never waited for the lock.');
}

const plan = (
  plan_name: string,
  start_date: string,
  end_date: string | null = null
) => ({ plan_name, start_date, end_date, is_active: true });

describe.runIf(RUN)('saving weekly goal plans', () => {
  let db: pg.Client;
  const userId = randomUUID();
  const save = (planId: string | null, data: ReturnType<typeof plan>) =>
    weeklyGoalPlanRepository.saveWeeklyGoalPlan(userId, planId, data);

  const plans = async () =>
    (
      await db.query(
        `SELECT plan_name, start_date::text AS start_date,
                end_date::text AS end_date, is_active
         FROM public.weekly_goal_plans
         WHERE user_id = $1
         ORDER BY start_date, plan_name`,
        [userId]
      )
    ).rows;

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `weekly-plans-${userId}@example.test`]
    );
  });

  beforeEach(async () => {
    await db.query('DELETE FROM public.weekly_goal_plans WHERE user_id = $1', [
      userId,
    ]);
  });

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('keeps the old plan for past days when a new plan starts', async () => {
    await save(null, plan('October', '2026-10-01'));
    await save(null, plan('November', '2026-11-01'));

    expect(await plans()).toEqual([
      {
        plan_name: 'October',
        start_date: '2026-10-01',
        end_date: '2026-10-31',
        is_active: true,
      },
      {
        plan_name: 'November',
        start_date: '2026-11-01',
        end_date: null,
        is_active: true,
      },
    ]);
    const inForce =
      await weeklyGoalPlanRepository.getActiveWeeklyGoalPlansInRange(
        userId,
        '2026-10-15',
        '2026-10-15'
      );
    expect(inForce.map((row) => row.plan_name)).toEqual(['October']);
  });

  it('switches off a plan in force that a new plan starts the same day as', async () => {
    await save(null, plan('First', '2026-10-01'));
    await save(null, plan('Second', '2026-10-01'));

    expect(
      (await plans()).map((row) => [row.plan_name, row.is_active])
    ).toEqual([
      ['First', false],
      ['Second', true],
    ]);
  });

  it('refuses a plan placed inside the dates of another and changes nothing', async () => {
    await save(null, plan('October', '2026-10-01', '2026-10-31'));
    await save(null, plan('November', '2026-11-01'));
    const before = await plans();

    await expect(
      save(null, plan('Mid-October', '2026-10-15', '2026-10-20'))
    ).rejects.toBeInstanceOf(WeeklyGoalPlanOverlapError);
    expect(await plans()).toEqual(before);
  });

  it('refuses an edit that pushes an end date over the next plan', async () => {
    const october = await save(null, plan('October', '2026-10-01'));
    await save(null, plan('November', '2026-11-01'));

    await expect(
      save(october!.id, plan('October', '2026-10-01', '2026-11-05'))
    ).rejects.toThrow('"November"');
  });

  it('lets a switched-off plan overlap anything', async () => {
    await save(null, plan('October', '2026-10-01'));
    await save(null, {
      ...plan('Draft', '2026-10-10', '2026-10-20'),
      is_active: false,
    });

    expect((await plans()).map((row) => row.plan_name)).toEqual([
      'October',
      'Draft',
    ]);
  });

  it('waits for a save already in progress before checking for overlaps', async () => {
    await save(null, plan('October', '2026-10-01'));
    const other = ownerClient();
    await other.connect();
    try {
      // Another save of this user's plans holds the lock and adds a plan.
      await other.query('BEGIN');
      await other.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `weekly_goal_plans:${userId}`,
      ]);
      const pending = save(null, plan('November', '2026-11-01'));
      const outcome = pending.then(
        () => 'saved',
        (error: unknown) => error
      );
      await waitForBlockedAdvisoryLock(other);
      await other.query(
        `UPDATE public.weekly_goal_plans SET end_date = '2026-11-04'
         WHERE user_id = $1`,
        [userId]
      );
      await other.query(
        `INSERT INTO public.weekly_goal_plans
           (user_id, plan_name, start_date, end_date, is_active)
         VALUES ($1, 'Mid-November', '2026-11-05', NULL, TRUE)`,
        [userId]
      );
      await other.query('COMMIT');

      expect(await outcome).toBeInstanceOf(WeeklyGoalPlanOverlapError);
    } finally {
      await other.query('ROLLBACK').catch(() => {});
      await other.end();
    }
  });

  it('finds no plan to update under another id', async () => {
    expect(await save(randomUUID(), plan('Nothing', '2026-10-01'))).toBe(
      undefined
    );
  });
});
