/**
 * Close matches and update_food against a real database. The unit tests mock
 * the food search; here the real word-by-word name search, ownership and the
 * stored variant decide. Skips unless a test database is reachable.
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  dbContextStorage,
  endPool,
  getSystemClient,
} from '../db/poolManager.js';
import { buildChatbotTools } from '../ai/tools/index.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

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

const OWNER = '00000000-0000-4000-b2f0-000000000001';
const OTHER = '00000000-0000-4000-b2f0-000000000002';
const ALL_IDS = [OWNER, OTHER];

const CUT_OFF = 'closematch Kaffeemilch Tagesmenge (150 ml';
const FULL =
  'closematch Kaffeemilch Tagesmenge (150 ml fettarme Milch, 3 Kaffee)';

// The rename case gets its own food, so the two miss cases still see a
// cut-off name whatever order the tests run in.
const RENAME_CUT_OFF = 'closematch Hafermilch Barista (1';
const RENAME_FULL = 'closematch Hafermilch Barista (1 l Packung)';

let cutOffId: string;
let renameId: string;
let skyrId: string;
let publicId: string;

function manageFood(args: Record<string, unknown>) {
  const tools = buildChatbotTools(OWNER, 'UTC', 'full', true, ['food'], false, {
    actorUserId: OWNER,
  });
  return dbContextStorage.run({ authenticatedUserId: OWNER }, () =>
    tools.sparky_manage_food.execute!(args, toolOpts)
  ) as Promise<string>;
}

async function query(sql: string, params: unknown[]) {
  const sys = await getSystemClient();
  try {
    return (await sys.query(sql, params)).rows;
  } finally {
    sys.release();
  }
}

async function insertFood(
  userId: string,
  name: string,
  shared = false
): Promise<string> {
  const [food] = await query(
    `INSERT INTO public.foods (user_id, name, shared_with_public)
     VALUES ($1, $2, $3) RETURNING id`,
    [userId, name, shared]
  );
  await query(
    `INSERT INTO public.food_variants
       (food_id, serving_size, serving_unit, calories, is_default)
     VALUES ($1, 1, 'serving', 30, true)`,
    [food.id]
  );
  return food.id;
}

describe.runIf(RUN)('close matches and update_food on a real database', () => {
  beforeAll(async () => {
    await query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
      ALL_IDS,
    ]);
    for (const id of ALL_IDS) {
      await query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [id, `close-match-${id}@example.test`]
      );
    }
    cutOffId = await insertFood(OWNER, CUT_OFF);
    renameId = await insertFood(OWNER, RENAME_CUT_OFF);
    skyrId = await insertFood(OWNER, 'closematch Skyr Natur');
    publicId = await insertFood(OTHER, 'closematch Skyr Vanille', true);
  });

  afterAll(async () => {
    try {
      await query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
    } finally {
      await endPool();
    }
  });

  it('lists the cut-off food for an exact search of the full name', async () => {
    const result = await manageFood({
      action: 'search_food',
      food_name: FULL,
      search_type: 'exact',
    });

    expect(result).toContain(`No food is named exactly "${FULL}"`);
    expect(result.split('\n')[1]).toBe(
      `- ${JSON.stringify(CUT_OFF)}, food_id: ${cutOffId}`
    );
  });

  it('logs nothing for the full name and lists the cut-off food', async () => {
    const entriesBefore = await query(
      'SELECT id FROM public.food_entries WHERE user_id = $1',
      [OWNER]
    );
    const result = await manageFood({
      action: 'log_food',
      food_name: FULL,
      quantity: 1,
      meal_type: 'breakfast',
      entry_date: '2026-06-11',
    });

    expect(result).toContain('nothing was logged');
    expect(result).toContain(`food_id: ${cutOffId}`);
    const entries = await query(
      'SELECT id FROM public.food_entries WHERE user_id = $1',
      [OWNER]
    );
    expect(entries).toHaveLength(entriesBefore.length);
  });

  it('renames the cut-off food in place, after which the full name logs', async () => {
    const result = await manageFood({
      action: 'update_food',
      food_id: renameId,
      new_name: RENAME_FULL,
    });

    expect(result).toContain(`renamed "${RENAME_CUT_OFF}" to "${RENAME_FULL}"`);
    const [food] = await query('SELECT name FROM public.foods WHERE id = $1', [
      renameId,
    ]);
    expect(food.name).toBe(RENAME_FULL);

    const logged = await manageFood({
      action: 'log_food',
      food_name: RENAME_FULL,
      quantity: 1,
      meal_type: 'breakfast',
      entry_date: '2026-06-11',
    });
    expect(logged).toContain('✅ Logged');
    const entries = await query(
      'SELECT food_id FROM public.food_entries WHERE user_id = $1 AND food_id = $2',
      [OWNER, renameId]
    );
    expect(entries).toHaveLength(1);
  });

  it('refuses a name another of the user’s foods has', async () => {
    const [before] = await query(
      'SELECT name FROM public.foods WHERE id = $1',
      [cutOffId]
    );
    const result = await manageFood({
      action: 'update_food',
      food_id: cutOffId,
      new_name: 'CLOSEMATCH skyr natur',
    });

    expect(result).toContain(`food_id: ${skyrId}`);
    expect(result).toContain('Nothing was changed');
    const [food] = await query('SELECT name FROM public.foods WHERE id = $1', [
      cutOffId,
    ]);
    expect(food.name).toBe(before.name);
  });

  it('does not change a public food of another user', async () => {
    const result = await manageFood({
      action: 'update_food',
      food_id: publicId,
      new_name: 'closematch Skyr Vanille Light',
    });

    expect(result).toContain('You can only change your own foods');
    const [food] = await query('SELECT name FROM public.foods WHERE id = $1', [
      publicId,
    ]);
    expect(food.name).toBe('closematch Skyr Vanille');
  });

  it('stores an estimate as an AI estimate with its confidence', async () => {
    const result = await manageFood({
      action: 'create_food',
      food_name: 'closematch Wiener Schnitzel mit Kartoffeln',
      calories: 850,
      protein: 45,
      carbs: 60,
      fat: 45,
      serving_unit: 'serving',
      estimate_confidence: 'low',
    });

    expect(result).toContain('The food is an AI estimate (low confidence).');
    const [variant] = await query(
      `SELECT v.source, v.ai_confidence FROM public.food_variants v
         JOIN public.foods f ON f.id = v.food_id
        WHERE f.user_id = $1 AND f.name = $2`,
      [OWNER, 'closematch Wiener Schnitzel mit Kartoffeln']
    );
    expect(variant).toEqual({ source: 'ai_estimate', ai_confidence: 'low' });
  });
});
