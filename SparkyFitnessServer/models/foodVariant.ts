import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'pg-f... Remove this comment to see the full error message
import format from 'pg-format';
import { sanitizeGlycemicIndex } from './food.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createFoodVariant(variantData: any, userId: any) {
  const client = await getClient(userId); // User-specific operation
  try {
    // user_id classifies stock (== food.user_id) vs personal variants.
    // Caller must set variantData.user_id; foodCoreService stamps it from the
    // authenticated user before invoking this.
    const result = await client.query(
      `INSERT INTO food_variants (
        food_id, user_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, glycemic_index, custom_nutrients,
        source, ai_confidence, ai_reasoning, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, now(), now()) RETURNING id`,
      [
        variantData.food_id,
        variantData.user_id,
        variantData.serving_size,
        variantData.serving_unit,
        variantData.calories,
        variantData.protein,
        variantData.carbs,
        variantData.fat,
        variantData.saturated_fat,
        variantData.polyunsaturated_fat,
        variantData.monounsaturated_fat,
        variantData.trans_fat,
        variantData.cholesterol,
        variantData.sodium,
        variantData.potassium,
        variantData.dietary_fiber,
        variantData.sugars,
        variantData.vitamin_a,
        variantData.vitamin_c,
        variantData.calcium,
        variantData.iron,
        variantData.is_default || false,
        sanitizeGlycemicIndex(variantData.glycemic_index),
        variantData.custom_nutrients ?? {},
        variantData.source ?? 'manual',
        variantData.ai_confidence ?? null,
        variantData.ai_reasoning ?? null,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFoodVariantById(id: any, userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      'SELECT *, glycemic_index, custom_nutrients FROM food_variants WHERE id = $1',
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFoodVariantOwnerId(variantId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    // Variant ownership now lives on food_variants.user_id directly (stock+personal model).
    // Previously this returned the FOOD owner via JOIN; that's wrong for personal variants
    // where variant.user_id != food.user_id.
    const result = await client.query(
      'SELECT user_id FROM food_variants WHERE id = $1',
      [variantId]
    );
    const ownerId = result.rows[0]?.user_id;
    log(
      'info',
      `getFoodVariantOwnerId: Variant ID ${variantId} owner: ${ownerId}`
    );
    return ownerId;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getFoodVariantsByFoodId(foodId: any, userId: any) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    // Stock + personal filter: return the food owner's stock variants plus
    // this user's own personal variants. Other users' personal variants are
    // excluded — RLS also gates them as defense in depth.
    const result = await client.query(
      'SELECT * FROM food_variants WHERE food_id = $1',
      [foodId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateFoodVariant(id: any, variantData: any, userId: any) {
  // For update operations, we need the user_id of the food owner to ensure RLS is applied correctly.
  const client = await getClient(userId); // User-specific operation
  try {
    const hasAiConfidence = variantData.ai_confidence !== undefined;
    const hasAiReasoning = variantData.ai_reasoning !== undefined;
    const result = await client.query(
      `UPDATE food_variants SET
        food_id = COALESCE($1, food_id),
        serving_size = COALESCE($2, serving_size),
        serving_unit = COALESCE($3, serving_unit),
        calories = COALESCE($4, calories),
        protein = COALESCE($5, protein),
        carbs = COALESCE($6, carbs),
        fat = COALESCE($7, fat),
        saturated_fat = COALESCE($8, saturated_fat),
        polyunsaturated_fat = COALESCE($9, polyunsaturated_fat),
        monounsaturated_fat = COALESCE($10, monounsaturated_fat),
        trans_fat = COALESCE($11, trans_fat),
        cholesterol = COALESCE($12, cholesterol),
        sodium = COALESCE($13, sodium),
        potassium = COALESCE($14, potassium),
        dietary_fiber = COALESCE($15, dietary_fiber),
        sugars = COALESCE($16, sugars),
        vitamin_a = COALESCE($17, vitamin_a),
        vitamin_c = COALESCE($18, vitamin_c),
        calcium = COALESCE($19, calcium),
        iron = COALESCE($20, iron),
        is_default = COALESCE($21, is_default),
        glycemic_index = COALESCE($22, glycemic_index),
        custom_nutrients = COALESCE($23, custom_nutrients),
        source = COALESCE($24, source),
        ai_confidence = CASE WHEN $25 THEN $26 ELSE ai_confidence END,
        ai_reasoning = CASE WHEN $27 THEN $28 ELSE ai_reasoning END,
        updated_at = now()
      WHERE id = $29
      RETURNING *`,
      [
        variantData.food_id,
        variantData.serving_size,
        variantData.serving_unit,
        variantData.calories,
        variantData.protein,
        variantData.carbs,
        variantData.fat,
        variantData.saturated_fat,
        variantData.polyunsaturated_fat,
        variantData.monounsaturated_fat,
        variantData.trans_fat,
        variantData.cholesterol,
        variantData.sodium,
        variantData.potassium,
        variantData.dietary_fiber,
        variantData.sugars,
        variantData.vitamin_a,
        variantData.vitamin_c,
        variantData.calcium,
        variantData.iron,
        variantData.is_default,
        sanitizeGlycemicIndex(variantData.glycemic_index),
        variantData.custom_nutrients === undefined
          ? undefined
          : (variantData.custom_nutrients ?? {}),
        variantData.source,
        hasAiConfidence,
        variantData.ai_confidence ?? null,
        hasAiReasoning,
        variantData.ai_reasoning ?? null,
        id,
      ]
    );
    // If this variant is being set as default, ensure all other variants for this food_id are not default
    if (variantData.is_default) {
      await client.query(
        'UPDATE food_variants SET is_default = FALSE WHERE food_id = $1 AND id != $2',
        [variantData.food_id, id]
      );
    }
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteFoodVariant(id: any, userId: any) {
  // For delete operations, we need the user_id of the food owner to ensure RLS is applied correctly.
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM food_variants WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bulkCreateFoodVariants(variantsData: any, userId: any) {
  // For bulk create, we need the user_id of the food owner. Assuming all variants belong to the same food.
  const client = await getClient(userId); // User-specific operation
  try {
    const query = `
      INSERT INTO food_variants (
        food_id, user_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, glycemic_index, custom_nutrients,
        source, ai_confidence, ai_reasoning, created_at, updated_at
      ) VALUES %L RETURNING id`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = variantsData.map((variant: any) => [
      variant.food_id,
      variant.user_id,
      variant.serving_size,
      variant.serving_unit,
      variant.calories,
      variant.protein,
      variant.carbs,
      variant.fat,
      variant.saturated_fat,
      variant.polyunsaturated_fat,
      variant.monounsaturated_fat,
      variant.trans_fat,
      variant.cholesterol,
      variant.sodium,
      variant.potassium,
      variant.dietary_fiber,
      variant.sugars,
      variant.vitamin_a,
      variant.vitamin_c,
      variant.calcium,
      variant.iron,
      variant.is_default || false,
      sanitizeGlycemicIndex(variant.glycemic_index),
      variant.custom_nutrients ?? {},
      variant.source ?? 'manual',
      variant.ai_confidence ?? null,
      variant.ai_reasoning ?? null,
      'now()',
      'now()',
    ]);
    const formattedQuery = format(query, values);
    const result = await client.query(formattedQuery);
    return result.rows;
  } finally {
    client.release();
  }
}
export { createFoodVariant };
export { getFoodVariantById };
export { getFoodVariantOwnerId };
export { getFoodVariantsByFoodId };
export { updateFoodVariant };
export { deleteFoodVariant };
export { bulkCreateFoodVariants };
export default {
  createFoodVariant,
  getFoodVariantById,
  getFoodVariantOwnerId,
  getFoodVariantsByFoodId,
  updateFoodVariant,
  deleteFoodVariant,
  bulkCreateFoodVariants,
};
