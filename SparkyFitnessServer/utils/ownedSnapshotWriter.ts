import type { PoolClient } from 'pg';
import { z } from 'zod';
import { FoodAssistantConflict } from '../models/foodAssistantRepository.js';
export type OwnedSnapshotTable =
  | 'foods'
  | 'food_variants'
  | 'food_entries'
  | 'food_entry_meals'
  | 'water_intake_entries';
const uuid = z.string().uuid();
const snapshotSchema = z.record(z.string(), z.json());
type Snapshot = z.infer<typeof snapshotSchema>;
/** Fixed tables and catalog-derived identifiers; provided keys preserve
 * database defaults on insertion, while a restore carries every saved field. */
async function columns(
  client: PoolClient,
  table: OwnedSnapshotTable,
  keys?: string[]
) {
  const result = await client.query<{ name: string }>(
    'SELECT attname AS name FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = $2 AND ($3::text[] IS NULL OR attname = ANY($3::text[])) ORDER BY attnum',
    [`public.${table}`, '', keys ?? null]
  );
  if (!result.rows.length)
    throw new FoodAssistantConflict('Snapshot table is unavailable.');
  return result.rows.map((row) => `"${row.name.replaceAll('"', '""')}"`);
}
function ownerPredicate(table: OwnedSnapshotTable) {
  return table === 'food_variants'
    ? 'EXISTS (SELECT 1 FROM public.foods f WHERE f.id=record.food_id AND f.user_id=$3)'
    : 'record.user_id=$3';
}
export async function insertOwnedSnapshot(
  client: PoolClient,
  table: OwnedSnapshotTable,
  userId: string,
  value: Snapshot
) {
  snapshotSchema.parse(value);
  uuid.parse(value.id);
  if (table === 'food_variants') uuid.parse(value.food_id);
  else if (value.user_id !== userId)
    throw new FoodAssistantConflict('Invalid snapshot owner.');
  const names = await columns(client, table, Object.keys(value));
  const result = await client.query(
    `INSERT INTO public.${table} (${names.join(',')}) SELECT ${names.map((name) => `record.${name}`).join(',')} FROM jsonb_populate_record(NULL::public.${table},$1::jsonb) record WHERE record.id=$2 AND ${ownerPredicate(table)} RETURNING id`,
    [JSON.stringify(value), value.id, userId]
  );
  if (result.rowCount !== 1)
    throw new FoodAssistantConflict(
      'Snapshot insertion failed or is no longer owned by you.'
    );
}
export async function updateOwnedSnapshot(
  client: PoolClient,
  table: OwnedSnapshotTable,
  userId: string,
  value: Snapshot,
  refreshTimestamp = false
) {
  snapshotSchema.parse(value);
  uuid.parse(value.id);
  if (table === 'food_variants') uuid.parse(value.food_id);
  else if (value.user_id !== userId)
    throw new FoodAssistantConflict('Invalid snapshot owner.');
  const names = (await columns(client, table)).filter(
    (name) =>
      ![
        '"id"',
        '"user_id"',
        '"created_at"',
        '"created_by_user_id"',
        ...(table === 'food_variants' ? ['"food_id"'] : []),
        ...(refreshTimestamp ? ['"updated_at"'] : []),
      ].includes(name)
  );
  // Food entry replacements deliberately change food_id. Variant ownership
  // cannot be transferred by a patch or an undo snapshot.
  const actualOwner =
    table === 'food_variants'
      ? 'EXISTS(SELECT 1 FROM public.foods f WHERE f.id=stored.food_id AND f.user_id=$3) AND stored.food_id=record.food_id'
      : 'stored.user_id=$3';
  const result = await client.query(
    `UPDATE public.${table} stored SET (${names.join(',')})=(${names.map((name) => `record.${name}`).join(',')})${refreshTimestamp ? ',updated_at=now()' : ''} FROM jsonb_populate_record(NULL::public.${table},$1::jsonb) record WHERE stored.id=$2 AND ${actualOwner} AND ${ownerPredicate(table)} RETURNING stored.id`,
    [JSON.stringify(value), value.id, userId]
  );
  if (result.rowCount !== 1)
    throw new FoodAssistantConflict(
      'Snapshot update failed or is no longer owned by you.'
    );
}
