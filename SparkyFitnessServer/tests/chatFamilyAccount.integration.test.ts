/**
 * Chat in a family member's account against a real database. After a Profile
 * Switcher switch, chat builds its tools for the account being worked in and
 * runs them as the signed-in person, so the grant stored in `family_access`
 * decides what they may do. A mocked repository can't show that: the refusal
 * comes from row-level security. Skips unless a test database is reachable.
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  dbContextStorage,
  endPool,
  getSystemClient,
} from '../db/poolManager.js';
import { buildChatbotTools } from '../ai/tools/index.js';
import chatRepository from '../models/chatRepository.js';
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

const OWNER = '00000000-0000-4000-b100-0000000000ff';
const DIARY = '00000000-0000-4000-b100-000000000001';
const REPORTS = '00000000-0000-4000-b100-000000000002';
const ALL_IDS = [OWNER, DIARY, REPORTS];

let foodId: string;
let diaryServiceId: string;

// What chat does after a switch: the request runs as the signed-in person and
// the tools are built for the account being worked in.
function chatIn(accountUserId: string, actorUserId: string) {
  const tools = buildChatbotTools(
    accountUserId,
    'UTC',
    'full',
    true,
    ['food', 'exercise'],
    false,
    { actorUserId }
  );
  return (name: string, args: Record<string, unknown>) =>
    dbContextStorage.run({ authenticatedUserId: actorUserId }, () =>
      tools[name].execute!(args, toolOpts)
    );
}

// A request by a signed-in person, as authMiddleware runs it.
function signedInAs<T>(userId: string, work: () => Promise<T>) {
  return dbContextStorage.run({ authenticatedUserId: userId }, work);
}

function logFood(entryDate: string) {
  return {
    action: 'log_food',
    food_id: foodId,
    quantity: 100,
    unit: 'g',
    meal_type: 'breakfast',
    entry_date: entryDate,
  };
}

async function ownerEntries(entryDate: string) {
  const sys = await getSystemClient();
  try {
    const result = await sys.query(
      `SELECT user_id, created_by_user_id FROM food_entries
        WHERE user_id = $1 AND entry_date = $2`,
      [OWNER, entryDate]
    );
    return result.rows;
  } finally {
    sys.release();
  }
}

describe.runIf(RUN)("chat in a family member's account", () => {
  beforeAll(async () => {
    const sys = await getSystemClient();
    try {
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
        ALL_IDS,
      ]);
      for (const id of ALL_IDS) {
        await sys.query(
          'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
          [id, `chat-family-${id}@example.test`]
        );
      }
      for (const [id, permissions] of [
        [DIARY, { can_manage_diary: true }],
        [REPORTS, { can_view_reports: true }],
      ] as const) {
        await sys.query(
          `INSERT INTO public.family_access
             (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
           VALUES ($1, $2, $3, $4::jsonb, true, 'active')`,
          [
            OWNER,
            id,
            `chat-family-${id}@example.test`,
            JSON.stringify(permissions),
          ]
        );
      }
      // Shared with the public so every delegate can read it: what a refusal
      // below proves is about writing the diary, not finding the food.
      const food = await sys.query(
        `INSERT INTO public.foods (user_id, name, shared_with_public)
         VALUES ($1, 'chat-family-oats', true) RETURNING id`,
        [OWNER]
      );
      foodId = food.rows[0].id;
      await sys.query(
        `INSERT INTO public.food_variants
           (food_id, serving_size, serving_unit, calories, is_default)
         VALUES ($1, 100, 'g', 380, true)`,
        [foodId]
      );
      // One AI service each, so the test can tell whose is picked.
      for (const id of [OWNER, DIARY]) {
        const service = await sys.query(
          `INSERT INTO public.ai_service_settings
             (user_id, service_type, service_name, is_active, is_public)
           VALUES ($1, 'openai', $2, true, false) RETURNING id`,
          [id, `chat-family-ai-${id}`]
        );
        if (id === DIARY) diaryServiceId = service.rows[0].id;
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

  it('refuses a food log for a delegate who can only view reports', async () => {
    const result = await chatIn(OWNER, REPORTS)(
      'sparky_manage_food',
      logFood('2026-01-02')
    );

    expect(String(result)).toMatch(/^Error \[FORBIDDEN\]/);
    expect(await ownerEntries('2026-01-02')).toEqual([]);
  });

  it("logs into the owner's diary as a delegate with a diary grant", async () => {
    const result = await chatIn(OWNER, DIARY)(
      'sparky_manage_food',
      logFood('2026-01-03')
    );

    expect(String(result)).not.toMatch(/^Error \[/);
    expect(await ownerEntries('2026-01-03')).toEqual([
      { user_id: OWNER, created_by_user_id: DIARY },
    ]);
  });

  it('logs as the owner when they chat in their own account', async () => {
    const result = await chatIn(OWNER, OWNER)(
      'sparky_manage_food',
      logFood('2026-01-04')
    );

    expect(String(result)).not.toMatch(/^Error \[/);
    expect(await ownerEntries('2026-01-04')).toEqual([
      { user_id: OWNER, created_by_user_id: OWNER },
    ]);
  });

  it("keeps the delegate's chat in the owner's account apart from their own", async () => {
    const history = (accountUserId?: string) =>
      signedInAs(DIARY, () =>
        chatRepository.getChatHistoryByUserId(DIARY, accountUserId)
      ).then((rows) => rows.map((row: { content: string }) => row.content));
    await signedInAs(DIARY, async () => {
      await chatRepository.saveChatHistory({
        user_id: DIARY,
        content: 'in my own profile',
        messageType: 'user',
      });
      await chatRepository.saveChatHistory({
        user_id: DIARY,
        content: "in the owner's profile",
        messageType: 'user',
        metadata: { account_user_id: OWNER },
      });
    });

    expect(await history()).toEqual(['in my own profile']);
    expect(await history(OWNER)).toEqual(["in the owner's profile"]);

    await signedInAs(DIARY, () =>
      chatRepository.clearAllChatHistory(DIARY, OWNER)
    );
    expect(await history(OWNER)).toEqual([]);
    expect(await history()).toEqual(['in my own profile']);
  });

  it("uses the delegate's own AI service in the owner's account", async () => {
    const active = await signedInAs(DIARY, () =>
      chatRepository.getActiveAiServiceSetting(OWNER)
    );
    const listed = await signedInAs(DIARY, () =>
      chatRepository.getAiServiceSettingsByUserId(OWNER)
    );

    expect(active?.id).toBe(diaryServiceId);
    expect(listed.map((s: { id: string }) => s.id)).toEqual([diaryServiceId]);
  });

  it("keeps run programs out of a family member's account", async () => {
    const result = await chatIn(OWNER, DIARY)('sparky_manage_run_program', {
      action: 'get_run_program',
    });

    expect(String(result)).toContain("only works in the user's own account");
  });
});
