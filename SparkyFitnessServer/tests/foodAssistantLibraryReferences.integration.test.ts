/** Real PostgreSQL regression checks. Use only an isolated, normally booted
 * test database. Only synthetic @example.test users are seeded and removed.
 * Like the RLS matrix, skip when the app-role database is unavailable. */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { endPool, getClient, getSystemClient } from '../db/poolManager.js';
import {
  deleteUnusedFood,
  deleteUnusedVariant,
  readFoodLibrary,
} from '../models/foodAssistantLibraryRepository.js';

async function reachable() {
  if (
    process.env.SKIP_RLS_MATRIX === '1' ||
    !process.env.SPARKY_FITNESS_DB_HOST ||
    !process.env.SPARKY_FITNESS_APP_DB_USER
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
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}
const run = await reachable();
describe.runIf(run)(
  'food library references across RLS and concurrent undo',
  () => {
    const owner = randomUUID(),
      other = randomUUID(),
      food = randomUUID(),
      variant = randomUUID();
    let system: pg.PoolClient;
    beforeAll(async () => {
      system = await getSystemClient();
      for (const id of [owner, other])
        await system.query(
          'INSERT INTO public."user" (id,email,email_verified) VALUES ($1,$2,true)',
          [id, `food-library-reference-${id}@example.test`]
        );
    });
    beforeEach(async () => {
      await system.query(
        'INSERT INTO foods (id,user_id,name,shared_with_public) VALUES ($1,$2,$3,true)',
        [food, owner, 'Reference fixture']
      );
      await system.query(
        'INSERT INTO food_variants (id,food_id,serving_size,serving_unit) VALUES ($1,$2,1,$3)',
        [variant, food, 'slice']
      );
    });
    afterEach(async () => {
      await system.query(
        'DELETE FROM food_entries WHERE user_id=ANY($1::uuid[])',
        [[owner, other]]
      );
      await system.query(
        'DELETE FROM openfoodfacts_sync_queue WHERE food_id=$1',
        [food]
      );
      await system.query('DELETE FROM foods WHERE id=$1', [food]);
    });
    afterAll(async () => {
      try {
        await system.query(
          'DELETE FROM public."user" WHERE id=ANY($1::uuid[])',
          [[owner, other]]
        );
      } finally {
        system.release();
        await endPool();
      }
    });
    const insertEntry = (client: pg.PoolClient, foodId: string | null = food) =>
      client.query<{ id: string }>(
        'INSERT INTO food_entries (user_id,food_id,variant_id,quantity,unit,food_name,calories,meal_type_id) VALUES ($1,$2,$3,2,$4,$5,80,(SELECT id FROM meal_types WHERE user_id IS NULL AND name=$6)) RETURNING id',
        [other, foodId, variant, 'slice', 'Recorded bread', 'breakfast']
      );
    it('refuses both variant and food undo for a hidden independent variant link', async () => {
      const reader: pg.PoolClient = await getClient(other, other),
        writer: pg.PoolClient = await getClient(owner, owner);
      try {
        await insertEntry(reader, null);
        expect(
          (
            await writer.query('SELECT id FROM food_entries WHERE user_id=$1', [
              other,
            ])
          ).rows
        ).toEqual([]);
        await writer.query('BEGIN');
        await readFoodLibrary(owner, food, writer, true);
        await expect(
          deleteUnusedVariant(writer, owner, food, variant)
        ).rejects.toThrow(/in use/);
        await expect(deleteUnusedFood(writer, owner, food)).rejects.toThrow(
          /dependants/
        );
      } finally {
        await writer.query('ROLLBACK');
        writer.release();
        reader.release();
      }
    });
    it('refuses food undo rather than cascading queued contribution state', async () => {
      await system.query(
        'INSERT INTO openfoodfacts_sync_queue (food_id,user_id) VALUES ($1,$2)',
        [food, owner]
      );
      const writer: pg.PoolClient = await getClient(owner, owner);
      try {
        await writer.query('BEGIN');
        await readFoodLibrary(owner, food, writer, true);
        await expect(deleteUnusedFood(writer, owner, food)).rejects.toThrow(
          /dependants/
        );
        expect(
          (
            await writer.query(
              'SELECT food_id FROM openfoodfacts_sync_queue WHERE food_id=$1',
              [food]
            )
          ).rowCount
        ).toBe(1);
      } finally {
        await writer.query('ROLLBACK');
        writer.release();
      }
    });
    it('rejects a late concurrent diary insert after the locked variant is removed', async () => {
      const writer: pg.PoolClient = await getClient(owner, owner),
        reader: pg.PoolClient = await getClient(other, other);
      let pending: Promise<{ code: unknown }> | undefined;
      try {
        await writer.query('BEGIN');
        await readFoodLibrary(owner, food, writer, true);
        await deleteUnusedVariant(writer, owner, food, variant);
        const pid = (
          await reader.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]!.pid;
        pending = insertEntry(reader).then(
          () => ({ code: null }),
          (error: unknown) => ({
            code: error instanceof pg.DatabaseError ? error.code : error,
          })
        );
        let blocked = false;
        const deadline = Date.now() + 3000;
        while (!blocked && Date.now() < deadline) {
          blocked = (
            await system.query<{ blocked: boolean }>(
              'SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked',
              [pid]
            )
          ).rows[0]!.blocked;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(blocked).toBe(true);
        await writer.query('COMMIT');
        expect((await pending).code).toBe('23503');
        expect(
          (
            await system.query(
              'SELECT id FROM food_entries WHERE variant_id=$1',
              [variant]
            )
          ).rowCount
        ).toBe(0);
      } finally {
        await writer.query('ROLLBACK');
        await pending;
        writer.release();
        reader.release();
      }
    });
    it('preserves historical nutrition when an ordinary library deletion clears its links', async () => {
      const reader: pg.PoolClient = await getClient(other, other);
      try {
        const id = (await insertEntry(reader)).rows[0]!.id;
        await system.query('DELETE FROM foods WHERE id=$1', [food]);
        expect(
          (
            await reader.query(
              'SELECT food_id,variant_id,food_name,calories,quantity,unit FROM food_entries WHERE id=$1',
              [id]
            )
          ).rows[0]
        ).toEqual({
          food_id: null,
          variant_id: null,
          food_name: 'Recorded bread',
          calories: '80',
          quantity: '2',
          unit: 'slice',
        });
      } finally {
        reader.release();
      }
    });
  }
);
