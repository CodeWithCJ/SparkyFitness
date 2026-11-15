import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import mealRepository from './mealRepository.js';
import {
  recipeImportStoredSourceSchema,
  type RecipeImportStoredSource,
  type RecipeFoodMappings,
  RECIPE_IMPORT_MAPPING_PAGE_SIZE,
} from '@workspace/shared';
import type { MealInput } from '../types/nutrition.js';
export type MappingWrite = Pick<
  RecipeFoodMappings,
  | 'source_food_key'
  | 'food_id'
  | 'variant_id'
  | 'quantity_per_source_unit'
  | 'unit'
>;
export type SourceWrite = Omit<
  RecipeImportStoredSource,
  'mealId' | 'lastSyncedAt'
>;
async function getMappings(
  userId: string,
  providerId: string
): Promise<RecipeFoodMappings[]> {
  const client: PoolClient = await getClient(userId, userId);
  try {
    const r = await client.query<RecipeFoodMappings>(
      'SELECT * FROM recipe_food_mappings WHERE user_id = $1 AND provider_id = $2',
      [userId, providerId]
    );
    return r.rows;
  } finally {
    client.release();
  }
}
type SavedMappingRow = RecipeFoodMappings & {
  food_name: string | null;
  ingredient_name: string | null;
  source_unit: string | null;
};
async function listMappings(
  userId: string,
  providerId: string,
  page: number
): Promise<{ rows: SavedMappingRow[]; total: number }> {
  const client: PoolClient = await getClient(userId, userId);
  try {
    const count = await client.query<{ count: string }>(
      'SELECT count(*) AS count FROM recipe_food_mappings WHERE user_id = $1 AND provider_id = $2',
      [userId, providerId]
    );
    const result = await client.query<SavedMappingRow>(
      `
      SELECT m.*, f.name AS food_name, context.ingredient_name, context.source_unit
      FROM recipe_food_mappings m
      LEFT JOIN foods f ON f.id = m.food_id
      LEFT JOIN LATERAL (
        SELECT ingredient->>'name' AS ingredient_name,
               COALESCE(ingredient->>'unit', ingredient->>'originalUnit') AS source_unit
        FROM recipe_imports ri
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(ri.source->'ingredients') = 'array'
               THEN ri.source->'ingredients' ELSE '[]'::jsonb END
        ) ingredient
        WHERE ri.user_id = m.user_id AND ri.provider_id = m.provider_id
          AND ingredient->>'sourceFoodKey' = m.source_food_key
        ORDER BY ri.updated_at DESC LIMIT 1
      ) context ON true
      WHERE m.user_id = $1 AND m.provider_id = $2
      ORDER BY m.updated_at DESC, m.id
      LIMIT $3 OFFSET $4`,
      [
        userId,
        providerId,
        RECIPE_IMPORT_MAPPING_PAGE_SIZE,
        (page - 1) * RECIPE_IMPORT_MAPPING_PAGE_SIZE,
      ]
    );
    return { rows: result.rows, total: Number(count.rows[0]?.count ?? 0) };
  } finally {
    client.release();
  }
}
async function deleteMapping(
  userId: string,
  providerId: string,
  mappingId: string
): Promise<boolean> {
  const client: PoolClient = await getClient(userId, userId);
  try {
    const result = await client.query(
      'DELETE FROM recipe_food_mappings WHERE user_id = $1 AND provider_id = $2 AND id = $3',
      [userId, providerId, mappingId]
    );
    return result.rowCount === 1;
  } finally {
    client.release();
  }
}
async function getSource(
  userId: string,
  mealId: string
): Promise<RecipeImportStoredSource | null> {
  const client: PoolClient = await getClient(userId, userId);
  try {
    const r = await client.query<{ source: unknown }>(
      'SELECT source FROM recipe_imports WHERE user_id = $1 AND meal_id = $2',
      [userId, mealId]
    );
    return r.rows[0]
      ? recipeImportStoredSourceSchema.parse(r.rows[0].source)
      : null;
  } finally {
    client.release();
  }
}
async function save(
  userId: string,
  meal: MealInput,
  source: SourceWrite,
  mappings: MappingWrite[]
): Promise<RecipeImportStoredSource> {
  const client: PoolClient = await getClient(userId, userId);
  try {
    await client.query('BEGIN');
    const created = await mealRepository.createMeal(
      { ...meal, user_id: userId },
      client
    );
    const provenance: RecipeImportStoredSource = {
      ...source,
      mealId: created.id,
      lastSyncedAt: null,
    };
    await client.query(
      'INSERT INTO recipe_imports (user_id,meal_id,provider_id,source) VALUES ($1,$2,$3,$4::jsonb)',
      [userId, created.id, source.providerId, JSON.stringify(provenance)]
    );
    for (const row of mappings)
      await client.query(
        'INSERT INTO recipe_food_mappings (user_id,provider_id,source_food_key,food_id,variant_id,quantity_per_source_unit,unit) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id,provider_id,source_food_key) DO UPDATE SET food_id=EXCLUDED.food_id,variant_id=EXCLUDED.variant_id,quantity_per_source_unit=EXCLUDED.quantity_per_source_unit,unit=EXCLUDED.unit,updated_at=now()',
        [
          userId,
          source.providerId,
          row.source_food_key,
          row.food_id,
          row.variant_id,
          row.quantity_per_source_unit,
          row.unit,
        ]
      );
    await client.query('COMMIT');
    return provenance;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function markSynced(
  userId: string,
  source: RecipeImportStoredSource
): Promise<void> {
  const client: PoolClient = await getClient(userId, userId);
  try {
    const result = await client.query(
      'UPDATE recipe_imports SET source=$3::jsonb,updated_at=now() WHERE user_id=$1 AND meal_id=$2',
      [userId, source.mealId, JSON.stringify(source)]
    );
    if (result.rowCount !== 1)
      throw new Error('The recipe import sync record could not be updated.');
  } finally {
    client.release();
  }
}
export default {
  getMappings,
  listMappings,
  deleteMapping,
  getSource,
  save,
  markSynced,
};
