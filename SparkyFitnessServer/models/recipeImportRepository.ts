import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import mealRepository from './mealRepository.js';
import {
  recipeImportStoredSourceSchema,
  type RecipeImportStoredSource,
  type RecipeFoodMappings,
} from '@workspace/shared';
import { mealFingerprint } from '../services/recipeImportMealSnapshot.js';
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
  'mealId' | 'mealFingerprint' | 'lastSyncedAt'
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
    const savedMeal = await mealRepository.getMealById(
      created.id,
      userId,
      client
    );
    const provenance: RecipeImportStoredSource = {
      ...source,
      mealId: created.id,
      mealFingerprint: mealFingerprint(savedMeal),
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
    await client.query(
      'UPDATE recipe_imports SET source=$3::jsonb,updated_at=now() WHERE user_id=$1 AND meal_id=$2',
      [userId, source.mealId, JSON.stringify(source)]
    );
  } finally {
    client.release();
  }
}
export default { getMappings, getSource, save, markSynced };
