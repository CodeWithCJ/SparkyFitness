import { z } from 'zod';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { FoodAssistantConflict } from './foodAssistantRepository.js';
const snapshot = z.record(z.string(), z.json());
export const foodLibrarySnapshotSchema = z.object({
  food: snapshot,
  variants: z.array(snapshot),
});
export type FoodLibrarySnapshot = z.infer<typeof foodLibrarySnapshotSchema>;
/** Read-only inspection also works for accessible public foods. Mutations
 * pin the owner and lock the parent before its sorted variant rows. */
export async function readFoodLibrary(
  userId: string,
  foodId: string,
  externalClient?: PoolClient,
  lock = false
): Promise<FoodLibrarySnapshot | null> {
  const client: PoolClient =
    externalClient ?? (await getClient(userId, userId));
  try {
    const food = await client.query<{ snapshot: unknown }>(
      `SELECT to_jsonb(f) AS snapshot FROM foods f WHERE f.id=$1 ${lock ? 'AND f.user_id=$2 FOR UPDATE' : ''}`,
      lock ? [foodId, userId] : [foodId]
    );
    if (!food.rows.length) return null;
    const variants = await client.query<{ snapshot: unknown }>(
      `SELECT to_jsonb(v) AS snapshot FROM food_variants v WHERE v.food_id=$1 ORDER BY v.id ${lock ? 'FOR UPDATE' : ''}`,
      [foodId]
    );
    return {
      food: snapshot.parse(food.rows[0]?.snapshot),
      variants: variants.rows.map((row) => snapshot.parse(row.snapshot)),
    };
  } finally {
    if (!externalClient) client.release();
  }
}
export async function hasFoodDependants(
  client: PoolClient,
  foodId: string,
  variantId?: string
) {
  const rows = await client.query<{ used: boolean }>(
    'SELECT public.assistant_food_has_dependants($1,$2) AS used',
    [foodId, variantId ?? null]
  );
  if (typeof rows.rows[0]?.used !== 'boolean')
    throw new FoodAssistantConflict(
      'The food dependency check failed. Nothing was changed.'
    );
  return rows.rows[0].used;
}
export async function deleteUnusedFood(
  client: PoolClient,
  userId: string,
  foodId: string
) {
  if (await hasFoodDependants(client, foodId))
    throw new FoodAssistantConflict(
      'This food has newer or external dependants. Undo cannot remove it.'
    );
  const removed = await client.query(
    'DELETE FROM foods WHERE id=$1 AND user_id=$2 RETURNING id',
    [foodId, userId]
  );
  if (removed.rowCount !== 1)
    throw new FoodAssistantConflict('The food is no longer owned by you.');
}
export async function deleteUnusedVariant(
  client: PoolClient,
  userId: string,
  foodId: string,
  variantId: string
) {
  if (await hasFoodDependants(client, foodId, variantId))
    throw new FoodAssistantConflict(
      'This serving variant is now in use. Undo cannot remove it.'
    );
  const removed = await client.query(
    'DELETE FROM food_variants v USING foods f WHERE v.food_id=f.id AND f.user_id=$1 AND v.food_id=$2 AND v.id=$3 RETURNING v.id',
    [userId, foodId, variantId]
  );
  if (removed.rowCount !== 1)
    throw new FoodAssistantConflict(
      'The serving variant is no longer owned by you.'
    );
}
