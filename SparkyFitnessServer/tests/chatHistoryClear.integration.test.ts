/** Exercise Clear versus late history saves through real, independent database clients. */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import chatRepository from '../models/chatRepository.js';
import { endPool, getClient, getSystemClient } from '../db/poolManager.js';

async function testDatabaseReachable() {
  if (
    process.env.SKIP_RLS_MATRIX === '1' ||
    !/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? '') ||
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    !process.env.SPARKY_FITNESS_DB_HOST
  )
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
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}
const RUN = await testDatabaseReachable();

describe.runIf(RUN)('chat history Clear and detached completions', () => {
  const owner = randomUUID();
  const other = randomUUID();
  beforeAll(async () => {
    const client = await getSystemClient();
    try {
      for (const id of [owner, other])
        await client.query(
          'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
          [id, `chat-clear-${id}@example.test`]
        );
    } finally {
      client.release();
    }
  });
  afterAll(async () => {
    const client = await getSystemClient();
    try {
      await client.query(
        'DELETE FROM public."user" WHERE id = ANY($1::uuid[])',
        [[owner, other]]
      );
    } finally {
      client.release();
      await endPool();
    }
  });

  const start = async (userId = owner) => {
    const id = randomUUID();
    await chatRepository.saveChatHistory(
      { user_id: userId, messageType: 'user', content: 'Request' },
      { historyId: id }
    );
    return id;
  };
  const finish = (id: string, userId = owner) =>
    chatRepository.saveChatHistory(
      { user_id: userId, messageType: 'assistant', content: 'Late reply' },
      { parentUserEntryId: id }
    );

  it('keeps history empty when an unfinished turn completes after Clear', async () => {
    const id = await start();
    await chatRepository.clearAllChatHistory(owner);
    expect(await finish(id)).toBe(false);
    expect(await chatRepository.getChatHistoryByUserId(owner)).toEqual([]);
  });

  it('allows a new turn after Clear without reviving the older turn', async () => {
    const old = await start();
    await chatRepository.clearAllChatHistory(owner);
    const current = await start();
    expect(await finish(old)).toBe(false);
    expect(await finish(current)).toBe(true);
    expect(await chatRepository.getChatHistoryByUserId(owner)).toHaveLength(2);
  });

  it('does not clear another owner or authorize a completion against their parent row', async () => {
    const id = await start(other);
    await chatRepository.clearAllChatHistory(owner);
    expect(await finish(id, owner)).toBe(false);
    expect(await finish(id, other)).toBe(true);
    expect(await chatRepository.getChatHistoryByUserId(other)).toHaveLength(2);
  });

  it.each(['clear-first', 'save-first'] as const)(
    'serializes independent clients correctly (%s)',
    async (order) => {
      await chatRepository.clearAllChatHistory(owner.toUpperCase());
      const id = await start();
      const blocker = await getClient(owner);
      const observer = await getSystemClient();
      let first: Promise<boolean> | undefined;
      let second: Promise<boolean> | undefined;
      try {
        await blocker.query('BEGIN');
        await blocker.query(
          "SELECT pg_advisory_xact_lock(hashtextextended('sparky_chat_history:' || $1::uuid::text, 0))",
          [owner]
        );
        const waiting = async (count: number) =>
          vi.waitFor(async () => {
            const result = await observer.query(
              `WITH lock_key AS (
                 SELECT hashtextextended('sparky_chat_history:' || $1::uuid::text, 0) AS value
               )
               SELECT count(*)::int AS n FROM pg_locks, lock_key
               WHERE locktype = 'advisory' AND NOT granted
                 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
                 AND classid = ((value >> 32) & 4294967295)::oid
                 AND objid = (value & 4294967295)::oid AND objsubid = 1`,
              [owner]
            );
            expect(result.rows[0].n).toBe(count);
          });
        first =
          order === 'clear-first'
            ? chatRepository.clearAllChatHistory(owner.toUpperCase())
            : finish(id);
        await waiting(1);
        second =
          order === 'clear-first'
            ? finish(id)
            : chatRepository.clearAllChatHistory(owner.toUpperCase());
        await waiting(2);
        await blocker.query('COMMIT');
        const results = await Promise.all([first, second]);
        expect(results).toEqual(
          order === 'clear-first' ? [true, false] : [true, true]
        );
        expect(await chatRepository.getChatHistoryByUserId(owner)).toEqual([]);
      } finally {
        await blocker.query('ROLLBACK');
        await Promise.allSettled(
          [first, second].filter((job) => job !== undefined)
        );
        blocker.release();
        observer.release();
      }
    }
  );
});
