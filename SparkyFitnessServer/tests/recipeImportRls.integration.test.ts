import pg from 'pg';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getClient, getSystemClient, endPool } from '../db/poolManager.js';

// Explicit app-role DB environment only. Never falls back to a local default DB.
async function databaseAvailable(): Promise<boolean> {
  if (
    !process.env.SPARKY_FITNESS_DB_HOST ||
    !process.env.SPARKY_FITNESS_DB_NAME ||
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    process.env.SKIP_RLS_MATRIX === '1'
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
const RUN = await databaseAvailable();
const owner = randomUUID(),
  other = randomUUID(),
  delegate = randomUUID();
const provider = randomUUID(),
  meal = randomUUID(),
  food = randomUUID(),
  variant = randomUUID(),
  provenance = randomUUID(),
  mapping = randomUUID();
const actors = [
  { name: 'owner', id: owner, allowed: true },
  { name: 'unrelated account', id: other, allowed: false },
  { name: 'fully authorized family delegate', id: delegate, allowed: false },
];
const tables = [
  { name: 'recipe_imports', id: provenance },
  { name: 'recipe_food_mappings', id: mapping },
] as const;

describe.runIf(RUN)('recipe import provenance and mappings real RLS', () => {
  beforeAll(async () => {
    const sys: PoolClient = await getSystemClient();
    try {
      await sys.query('BEGIN');
      for (const id of [owner, other, delegate])
        await sys.query(
          `
INSERT INTO public."user" (id,email,email_verified) VALUES ($1,$2,true)
`,
          [id, 'recipe-import-rls-' + id + '@example.test']
        );
      await sys.query(
        `
INSERT INTO family_access (owner_user_id,family_user_id,family_email,access_permissions,is_active,status) VALUES ($1,$2,$3,$4::jsonb,true,'active')
`,
        [
          owner,
          delegate,
          'recipe-import-rls-' + delegate + '@example.test',
          JSON.stringify({
            can_manage_diary: true,
            can_manage_checkin: true,
            can_manage_medications: true,
            can_manage_symptoms: true,
            can_view_reports: true,
            can_view_food_library: true,
            share_external_providers: true,
          }),
        ]
      );
      await sys.query(
        `
INSERT INTO external_data_providers (id,user_id,provider_name,provider_type,is_active,is_public) VALUES ($1,$2,$3,'mealie',true,false)
`,
        [provider, owner, 'recipe-import-rls']
      );
      await sys.query(
        `
INSERT INTO foods (id,user_id,name) VALUES ($1,$2,$3)
`,
        [food, owner, 'recipe-import-rls-food']
      );
      await sys.query(
        `
INSERT INTO food_variants (id,food_id,serving_size,serving_unit,calories,protein,carbs,fat) VALUES ($1,$2,100,'g',400,10,60,10)
`,
        [variant, food]
      );
      await sys.query(
        `
INSERT INTO meals (id,user_id,name) VALUES ($1,$2,$3)
`,
        [meal, owner, 'recipe-import-rls-meal']
      );
      await sys.query(
        `
INSERT INTO recipe_imports (id,user_id,meal_id,provider_id,source) VALUES ($1,$2,$3,$4,$5::jsonb)
`,
        [provenance, owner, meal, provider, JSON.stringify({})]
      );
      await sys.query(
        `
INSERT INTO recipe_food_mappings (id,user_id,provider_id,source_food_key,food_id,variant_id,quantity_per_source_unit,unit) VALUES ($1,$2,$3,$4,$5,$6,1,'g')
`,
        [mapping, owner, provider, 'fixture|g', food, variant]
      );
      await sys.query('COMMIT');
    } catch (error) {
      await sys.query('ROLLBACK');
      throw error;
    } finally {
      sys.release();
    }
  });
  afterAll(async () => {
    const sys: PoolClient = await getSystemClient();
    try {
      await sys.query('DELETE FROM public."user" WHERE id=ANY($1::uuid[])', [
        [owner, other, delegate],
      ]);
    } finally {
      sys.release();
      await endPool();
    }
  });
  for (const table of tables) {
    it.each(actors)(
      table.name + ' SELECT as $name',
      async ({ id, allowed }) => {
        const client: PoolClient = await getClient(owner, id);
        try {
          const result = await client.query(
            'SELECT id FROM ' + table.name + ' WHERE id=$1',
            [table.id]
          );
          expect(result.rows.length).toBe(allowed ? 1 : 0);
        } finally {
          client.release();
        }
      }
    );
    it.each(actors)(
      table.name + ' UPDATE as $name',
      async ({ id, allowed }) => {
        const client: PoolClient = await getClient(owner, id);
        try {
          await client.query('BEGIN');
          const result = await client.query(
            'UPDATE ' +
              table.name +
              ' SET updated_at=updated_at WHERE id=$1 RETURNING id',
            [table.id]
          );
          expect(result.rowCount).toBe(allowed ? 1 : 0);
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
    );
  }

  for (const table of tables) {
    it.each(actors.filter((actor) => !actor.allowed))(
      table.name + ' rejects owner-scoped INSERT as $name',
      async ({ id }) => {
        const client: PoolClient = await getClient(owner, id);
        try {
          await client.query('BEGIN');
          if (table.name === 'recipe_imports')
            await expect(
              client.query(
                `
INSERT INTO recipe_imports (user_id,meal_id,provider_id,source) VALUES ($1,$2,$3,$4::jsonb)
`,
                [owner, meal, provider, JSON.stringify({})]
              )
            ).rejects.toMatchObject({ code: '42501' });
          else
            await expect(
              client.query(
                `
INSERT INTO recipe_food_mappings (user_id,provider_id,source_food_key,food_id,variant_id,quantity_per_source_unit,unit) VALUES ($1,$2,$3,$4,$5,1,'g')
`,
                [owner, provider, randomUUID(), food, variant]
              )
            ).rejects.toMatchObject({ code: '42501' });
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      }
    );
  }
});
