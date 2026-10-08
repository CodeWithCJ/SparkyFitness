import { z } from 'zod';
import type { PoolClient } from 'pg';
import type { FoodAssistantDiaryScope } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';
import { FoodAssistantConflict } from './foodAssistantRepository.js';

const snapshotSchema = z.record(z.string(), z.json());
export type DiarySnapshot = z.infer<typeof snapshotSchema>;
export interface DiarySelection {
  entries: DiarySnapshot[];
  meals: DiarySnapshot[];
  water: DiarySnapshot[];
}
type DiaryTable = 'food_entries' | 'food_entry_meals' | 'water_intake_entries';
const uuid = z.string().uuid();
function rowId(row: DiarySnapshot) {
  return uuid.parse(row.id);
}
export function snapshotId(row: DiarySnapshot) {
  return rowId(row);
}
const sqlSnapshot = (alias: string) =>
  `to_jsonb(${alias}) || jsonb_build_object('entry_date', to_char(${alias}.entry_date, 'YYYY-MM-DD'))`;

/** The parent lock precedes component locks, including entry-only requests.
 * All writes use the task transaction's owner-scoped client. */
export async function readSelection(
  userId: string,
  scope: FoodAssistantDiaryScope,
  externalClient?: PoolClient,
  lock = false
): Promise<DiarySelection> {
  const client: PoolClient =
    externalClient ?? (await getClient(userId, userId));
  const values =
    scope.type === 'entries'
      ? [userId, scope.ids]
      : scope.type === 'logged_meal'
        ? [userId, scope.id]
        : [userId, scope.date, scope.meal_type_id];
  const entryWhere =
    scope.type === 'entries'
      ? 'fe.id = ANY($2::uuid[])'
      : scope.type === 'logged_meal'
        ? 'fe.food_entry_meal_id = $2'
        : 'fe.entry_date = $2 AND fe.meal_type_id = $3';
  const mealWhere =
    scope.type === 'entries'
      ? 'fm.id IN (SELECT fe.food_entry_meal_id FROM food_entries fe WHERE fe.user_id = $1 AND fe.id = ANY($2::uuid[]))'
      : scope.type === 'logged_meal'
        ? 'fm.id = $2'
        : 'fm.entry_date = $2 AND fm.meal_type_id = $3';
  try {
    const meals = await client.query<{ snapshot: unknown }>(
      `SELECT ${sqlSnapshot('fm')} AS snapshot FROM food_entry_meals fm WHERE fm.user_id = $1 AND ${mealWhere} ORDER BY fm.id ${lock ? 'FOR UPDATE' : ''}`,
      values
    );
    const entries = await client.query<{ snapshot: unknown }>(
      `SELECT ${sqlSnapshot('fe')} AS snapshot FROM food_entries fe WHERE fe.user_id = $1 AND ${entryWhere} ORDER BY fe.id ${lock ? 'FOR UPDATE' : ''}`,
      values
    );
    const parsedEntries = entries.rows.map((row) =>
      snapshotSchema.parse(row.snapshot)
    );
    if (scope.type === 'entries' && parsedEntries.length !== scope.ids.length)
      throw new FoodAssistantConflict(
        'Some selected diary entries are missing or belong to another person.'
      );
    if (scope.type === 'logged_meal' && !meals.rows.length)
      throw new FoodAssistantConflict(
        'Logged meal not found or not owned by you.'
      );
    const water = await client.query<{ snapshot: unknown }>(
      `SELECT ${sqlSnapshot('wi')} AS snapshot FROM water_intake_entries wi WHERE wi.user_id = $1 AND wi.food_entry_id = ANY($2::uuid[]) ORDER BY wi.id ${lock ? 'FOR UPDATE' : ''}`,
      [userId, parsedEntries.map(rowId)]
    );
    return {
      entries: parsedEntries,
      meals: meals.rows.map((row) => snapshotSchema.parse(row.snapshot)),
      water: water.rows.map((row) => snapshotSchema.parse(row.snapshot)),
    };
  } finally {
    if (!externalClient) client.release();
  }
}

/** Exact columns come from the installed table, never caller identifiers.
 * This also preserves snapshot metadata added by later migrations. */
async function writableColumns(
  client: PoolClient,
  table: DiaryTable,
  keys?: string[]
) {
  const result = await client.query<{ name: string }>(
    'SELECT attname AS name FROM pg_attribute WHERE attrelid = $1::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = $2 AND ($3::text[] IS NULL OR attname = ANY($3::text[])) ORDER BY attnum',
    [`public.${table}`, '', keys ?? null]
  );
  if (!result.rows.length)
    throw new FoodAssistantConflict('Diary table is unavailable.');
  return result.rows.map((row) => `"${row.name.replaceAll('"', '""')}"`);
}
export async function insertSnapshot(
  client: PoolClient,
  table: DiaryTable,
  userId: string,
  snapshot: DiarySnapshot
) {
  if (snapshot.user_id !== userId)
    throw new FoodAssistantConflict('Invalid diary owner.');
  rowId(snapshot);
  // Omitted fields on a new entry retain their database defaults. Restores
  // carry all fields and therefore preserve the complete original snapshot.
  const columns = await writableColumns(client, table, Object.keys(snapshot));
  const result = await client.query(
    `INSERT INTO public.${table} (${columns.join(',')}) SELECT ${columns.join(',')} FROM jsonb_populate_record(NULL::public.${table}, $1::jsonb) RETURNING id`,
    [JSON.stringify(snapshot)]
  );
  if (result.rowCount !== 1)
    throw new FoodAssistantConflict('Diary insertion failed.');
}
export async function updateSnapshot(
  client: PoolClient,
  table: DiaryTable,
  userId: string,
  snapshot: DiarySnapshot
) {
  if (snapshot.user_id !== userId)
    throw new FoodAssistantConflict('Invalid diary owner.');
  const columns = (await writableColumns(client, table)).filter(
    (column) =>
      !['"id"', '"user_id"', '"created_at"', '"created_by_user_id"'].includes(
        column
      )
  );
  const result = await client.query(
    `UPDATE public.${table} SET (${columns.join(',')}) = (SELECT ${columns.join(',')} FROM jsonb_populate_record(NULL::public.${table}, $1::jsonb)) WHERE id = $2 AND user_id = $3 RETURNING id`,
    [JSON.stringify(snapshot), rowId(snapshot), userId]
  );
  if (result.rowCount !== 1)
    throw new FoodAssistantConflict('Diary update failed.');
}
export async function deleteSnapshots(
  client: PoolClient,
  table: DiaryTable,
  userId: string,
  ids: string[]
) {
  if (!ids.length) return;
  const result = await client.query(
    `DELETE FROM public.${table} WHERE user_id = $1 AND id = ANY($2::uuid[]) RETURNING id`,
    [userId, ids]
  );
  if (result.rowCount !== ids.length)
    throw new FoodAssistantConflict('Diary selection changed during deletion.');
}
export async function readSnapshots(
  client: PoolClient,
  table: DiaryTable,
  userId: string,
  ids: string[],
  lock = false
) {
  if (!ids.length) return [];
  const result = await client.query<{ snapshot: unknown }>(
    `SELECT ${sqlSnapshot('r')} AS snapshot FROM public.${table} r WHERE r.user_id = $1 AND r.id = ANY($2::uuid[]) ORDER BY r.id ${lock ? 'FOR UPDATE' : ''}`,
    [userId, ids]
  );
  return result.rows.map((row) => snapshotSchema.parse(row.snapshot));
}
export async function readLinkedWater(
  client: PoolClient,
  userId: string,
  entryIds: string[],
  lock = false
) {
  if (!entryIds.length) return [];
  const result = await client.query<{ snapshot: unknown }>(
    `SELECT ${sqlSnapshot('wi')} AS snapshot FROM water_intake_entries wi WHERE wi.user_id = $1 AND wi.food_entry_id = ANY($2::uuid[]) ORDER BY wi.id ${lock ? 'FOR UPDATE' : ''}`,
    [userId, entryIds]
  );
  return result.rows.map((row) => snapshotSchema.parse(row.snapshot));
}
export async function hasOtherMealEntries(
  client: PoolClient,
  userId: string,
  mealId: string,
  entryIds: string[]
) {
  const result = await client.query<{ used: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM food_entries WHERE user_id = $1 AND food_entry_meal_id = $2 AND NOT (id = ANY($3::uuid[]))) AS used',
    [userId, mealId, entryIds]
  );
  return result.rows[0]?.used !== false;
}
