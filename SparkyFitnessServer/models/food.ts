import type { PoolClient } from 'pg';
import { getClient, getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { normalizeBarcode } from '../utils/foodUtils.js';
import {
  buildSqlSearch,
  buildSqlExactMatchOrder,
} from '../utils/dbSearchHelper.js';
import {
  localizeImages,
  toImageArray,
  resolveImageInput,
} from '../utils/imageLocalizer.js';
import { sanitizeNotes } from '@workspace/shared';
import type {
  NutrientValue,
  NutrientFields,
  FoodVariantInput,
} from '../types/nutrition.js';

/** A value bound into a parameterised query. */
type SqlParam = string | number | boolean | null | undefined;

/** An update may change any subset of a food's fields. */
export type FoodUpdate = Partial<FoodInput>;

/** Booleans arrive from CSV/provider payloads as strings or 0/1 too. */
type BooleanLike = boolean | string | number | null | undefined;

/**
 * The food fields this repository reads when creating or updating a row.
 *
 * Values arrive from user input, CSV import, and provider adapters, so numeric
 * and boolean fields are accepted in their raw form and passed through the
 * `sanitize*` helpers below.
 */
export interface FoodInput extends NutrientFields {
  id?: string;
  name: string;
  user_id: string;
  brand?: string | null;
  barcode?: string | null;
  provider_external_id?: string | null;
  provider_type?: string | null;
  is_custom?: boolean | string | null;
  shared_with_public?: boolean | string | null;
  provider_verified?: boolean | string | null;
  is_quick_food?: boolean | string | null;
  images?: string[] | null;
  image_url?: string | null;
  image_source_url?: string | null;
  /** Owner-authored markdown reference note. */
  notes?: string | null;
  serving_size?: NutrientValue;
  serving_unit?: string | null;
  source?: string | null;
  ai_confidence?: string | null;
  allergens?: string[] | null;
  traces?: string[] | null;
}

const DEFAULT_VARIANT_JSON_SQL = `
  json_build_object(
    'id', fv.id,
    'serving_size', fv.serving_size,
    'serving_unit', fv.serving_unit,
    'calories', fv.calories,
    'protein', fv.protein,
    'carbs', fv.carbs,
    'fat', fv.fat,
    'saturated_fat', fv.saturated_fat,
    'polyunsaturated_fat', fv.polyunsaturated_fat,
    'monounsaturated_fat', fv.monounsaturated_fat,
    'trans_fat', fv.trans_fat,
    'cholesterol', fv.cholesterol,
    'sodium', fv.sodium,
    'potassium', fv.potassium,
    'dietary_fiber', fv.dietary_fiber,
    'sugars', fv.sugars,
    'vitamin_a', fv.vitamin_a,
    'vitamin_c', fv.vitamin_c,
    'calcium', fv.calcium,
    'iron', fv.iron,
    'is_default', fv.is_default,
    'glycemic_index', fv.glycemic_index,
    'custom_nutrients', fv.custom_nutrients,
    'user_id', f.user_id,
    'source', fv.source,
    'ai_confidence', fv.ai_confidence,
    'allergens', fv.allergens,
    'traces', fv.traces
  ) AS default_variant
`;

const PREFERRED_DEFAULT_VARIANT_JOIN_SQL = `
  LEFT JOIN LATERAL (
    SELECT candidate_fv.*
    FROM food_variants candidate_fv
    WHERE candidate_fv.food_id = f.id
      AND candidate_fv.is_default = TRUE
    ORDER BY
      candidate_fv.updated_at DESC,
      candidate_fv.id
    LIMIT 1
  ) fv ON TRUE
`;
function sanitizeGlycemicIndex(gi: string | null | undefined) {
  const allowedGICategories = [
    'None',
    'Very Low',
    'Low',
    'Medium',
    'High',
    'Very High',
  ];
  if (
    gi === '0' ||
    gi === '0.0' ||
    gi === null ||
    gi === undefined ||
    gi === '' ||
    !allowedGICategories.includes(gi)
  ) {
    return null;
  }
  return gi;
}
function sanitizeNumeric(value: NutrientValue) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === 'NULL'
  ) {
    return null;
  }
  // Strip quotes if they exist (common in CSV issues)
  let sanitizedValue = value;
  if (typeof value === 'string') {
    sanitizedValue = value.replace(/^["']|["']$/g, '');
  }
  const num = parseFloat(String(sanitizedValue));
  return isNaN(num) ? null : num;
}
function sanitizeBoolean(value: BooleanLike) {
  if (
    value === true ||
    value === 'TRUE' ||
    value === 't' ||
    value === '1' ||
    value === 1
  ) {
    return true;
  }
  if (
    value === false ||
    value === 'FALSE' ||
    value === 'f' ||
    value === '0' ||
    value === 0
  ) {
    return false;
  }
  return null;
}
async function searchFoods(
  name: string | null | undefined,
  userId: string | null | undefined,
  exactMatch: boolean,
  broadMatch: boolean,
  checkCustom: boolean,
  limit = 10
) {
  const client = await getClient(userId); // User-specific operation
  try {
    let query = `
      SELECT
        f.id, f.name, f.brand, f.barcode, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type, f.provider_verified, f.images, f.notes,
        ${DEFAULT_VARIANT_JSON_SQL}
      FROM foods f
      ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
      WHERE f.is_quick_food = FALSE`;
    const queryParams: SqlParam[] = [];
    let paramIndex = 1;
    let orderByClause = '';
    if (exactMatch) {
      query += ` AND CONCAT(f.brand, ' ', f.name) ILIKE $${paramIndex++}`;
      queryParams.push(name);
    } else if (broadMatch) {
      const {
        whereClauses,
        queryParams: searchParams,
        nextParamIndex,
      } = buildSqlSearch("CONCAT(f.brand, ' ', f.name)", name, 1);
      if (whereClauses.length > 0) {
        query += ` AND ${whereClauses.join(' AND ')}`;
        queryParams.push(...searchParams);
        paramIndex = nextParamIndex;

        const exactMatchParamIndex = paramIndex;
        queryParams.push(`%${name}%`);
        paramIndex++;
        orderByClause = ` ORDER BY ${buildSqlExactMatchOrder("CONCAT(f.brand, ' ', f.name)", exactMatchParamIndex)}, f.name ASC`;
      }
    } else if (checkCustom) {
      query += ` AND f.name = $${paramIndex++}`;
      queryParams.push(name);
    } else {
      throw new Error('Invalid search parameters.');
    }
    if (orderByClause) {
      query += orderByClause;
    }
    query += ` LIMIT $${paramIndex++}`;
    queryParams.push(limit);
    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}
/**
 * Inserts a food and its default variant on a caller-supplied client, WITHOUT
 * opening a transaction and WITHOUT localizing images.
 *
 * Split out of `createFood` so a caller that is already inside a transaction
 * can create a food and then reference it in the same transaction. Going
 * through `createFood` there would not work: it acquires its own client, so the
 * new food would be invisible to the outer transaction's queries, and its
 * COMMIT would defeat the outer rollback.
 *
 * The caller owns BEGIN/COMMIT/ROLLBACK and the client's lifetime.
 *
 * Deliberately does no image localization — that is network I/O and belongs
 * after COMMIT (see `createFood`). Callers that create foods with remote image
 * URLs must use `createFood`, not this.
 */
async function createFoodWithClient(client: PoolClient, foodData: FoodInput) {
  // 1. Create the food entry
  const foodResult = await client.query(
    `INSERT INTO foods (
        name, is_custom, user_id, brand, barcode, provider_external_id, shared_with_public, provider_type, provider_verified, is_quick_food, images, notes, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, now(), now()) RETURNING id, name, brand, is_custom, user_id, shared_with_public, is_quick_food, provider_external_id, provider_type, provider_verified, images, notes`,
    [
      foodData.name,
      sanitizeBoolean(foodData.is_custom) ?? true,
      foodData.user_id,
      foodData.brand,
      foodData.barcode ? normalizeBarcode(foodData.barcode) : foodData.barcode,
      foodData.provider_external_id,
      sanitizeBoolean(foodData.shared_with_public) ?? false,
      foodData.provider_type,
      sanitizeBoolean(foodData.provider_verified) ?? false,
      sanitizeBoolean(foodData.is_quick_food) ?? false,
      JSON.stringify(resolveImageInput(foodData)),
      sanitizeNotes(foodData.notes) ?? null,
    ]
  );
  const newFood = foodResult.rows[0];
  // 2. Create the primary food variant and mark it as default
  const variantResult = await client.query(
    `INSERT INTO food_variants (
        food_id, serving_size, serving_unit, calories, protein, carbs, fat,
        saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
        cholesterol, sodium, potassium, dietary_fiber, sugars,
        vitamin_a, vitamin_c, calcium, iron, is_default, glycemic_index, custom_nutrients,
        source, ai_confidence, allergens, traces, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, TRUE, $21, $22, $23, $24, $25, $26, now(), now()) RETURNING id`,
    [
      newFood.id,
      sanitizeNumeric(foodData.serving_size),
      foodData.serving_unit,
      sanitizeNumeric(foodData.calories),
      sanitizeNumeric(foodData.protein),
      sanitizeNumeric(foodData.carbs),
      sanitizeNumeric(foodData.fat),
      sanitizeNumeric(foodData.saturated_fat),
      sanitizeNumeric(foodData.polyunsaturated_fat),
      sanitizeNumeric(foodData.monounsaturated_fat),
      sanitizeNumeric(foodData.trans_fat),
      sanitizeNumeric(foodData.cholesterol),
      sanitizeNumeric(foodData.sodium),
      sanitizeNumeric(foodData.potassium),
      sanitizeNumeric(foodData.dietary_fiber),
      sanitizeNumeric(foodData.sugars),
      sanitizeNumeric(foodData.vitamin_a),
      sanitizeNumeric(foodData.vitamin_c),
      sanitizeNumeric(foodData.calcium),
      sanitizeNumeric(foodData.iron),
      sanitizeGlycemicIndex(foodData.glycemic_index),
      foodData.custom_nutrients ?? {},
      foodData.source ?? 'manual',
      foodData.ai_confidence ?? null,
      foodData.allergens ?? null,
      foodData.traces ?? null,
    ]
  );
  const newVariantId = variantResult.rows[0].id;

  // Return the new food with its default variant details
  return {
    ...newFood,
    default_variant: buildDefaultVariantEcho(newVariantId, newFood, foodData),
  };
}

function buildDefaultVariantEcho(
  newVariantId: string,
  newFood: { user_id: string },
  foodData: FoodInput
) {
  return {
    id: newVariantId,
    serving_size: foodData.serving_size,
    serving_unit: foodData.serving_unit,
    calories: foodData.calories,
    protein: foodData.protein,
    carbs: foodData.carbs,
    fat: foodData.fat,
    saturated_fat: foodData.saturated_fat,
    polyunsaturated_fat: foodData.polyunsaturated_fat,
    monounsaturated_fat: foodData.monounsaturated_fat,
    trans_fat: foodData.trans_fat,
    cholesterol: foodData.cholesterol,
    sodium: foodData.sodium,
    potassium: foodData.potassium,
    dietary_fiber: foodData.dietary_fiber,
    sugars: foodData.sugars,
    vitamin_a: foodData.vitamin_a,
    vitamin_c: foodData.vitamin_c,
    calcium: foodData.calcium,
    iron: foodData.iron,
    is_default: true,
    user_id: newFood.user_id,
    source: foodData.source ?? 'manual',
    ai_confidence: foodData.ai_confidence ?? null,
    custom_nutrients: foodData.custom_nutrients ?? {},
    allergens: foodData.allergens ?? null,
    traces: foodData.traces ?? null,
  };
}

async function createFood(foodData: FoodInput) {
  const client = await getClient(foodData.user_id); // User-specific operation
  try {
    await client.query('BEGIN'); // Start transaction
    const created = await createFoodWithClient(client, foodData);
    const newFood = created;
    await client.query('COMMIT'); // Commit transaction

    // Localize provider-hosted images after COMMIT so network latency never
    // holds the transaction open. Every food-creation path funnels through
    // here, so provider imports get local copies without each caller opting in.
    try {
      const localizedImages = await localizeImages(
        newFood.images,
        newFood.id,
        'foods'
      );
      if (localizedImages) {
        // Guarded like updateFood: the food is already committed, so an edit
        // can land while these downloads run. Don't clobber a newer value.
        const localizeWrite = await client.query(
          'UPDATE foods SET images = $1::jsonb WHERE id = $2 AND images = $3::jsonb',
          [
            JSON.stringify(localizedImages),
            newFood.id,
            JSON.stringify(toImageArray(newFood.images)),
          ]
        );
        if (localizeWrite.rowCount === 0) {
          log(
            'debug',
            `[food.createFood] Images for ${newFood.id} changed during localization; keeping the newer value`
          );
        } else {
          newFood.images = localizedImages;
        }
      }
    } catch (imageError) {
      // The food itself is already committed; keep it and leave the remote URLs.
      const message =
        imageError instanceof Error ? imageError.message : String(imageError);
      log(
        'warn',
        `[food] Image localization failed for ${newFood.id}: ${message}`
      );
    }

    // `created` already carries the default_variant echo; localization above
    // mutates `newFood.images` in place, which is the same object.
    return created;
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    throw error;
  } finally {
    client.release();
  }
}
export interface FoodMatchCandidateRow {
  query_key: string;
  food_id: string;
  food_name: string;
  brand: string | null;
  user_id: string | null;
  variant_id: string;
  serving_size: number | string;
  serving_unit: string;
  calories: number | string | null;
  protein: number | string | null;
  carbs: number | string | null;
  fat: number | string | null;
  dietary_fiber: number | string | null;
  sugars: number | string | null;
  saturated_fat: number | string | null;
  polyunsaturated_fat: number | string | null;
  monounsaturated_fat: number | string | null;
  trans_fat: number | string | null;
  cholesterol: number | string | null;
  sodium: number | string | null;
  potassium: number | string | null;
  calcium: number | string | null;
  iron: number | string | null;
  vitamin_a: number | string | null;
  vitamin_c: number | string | null;
  last_used: string | null;
}

/**
 * Retrieves food-match candidates for MANY ingredient names in one query.
 *
 * Two deliberate choices:
 *
 * 1. **ILIKE, not trigram.** `pg_trgm` is not installed and adding an extension
 *    is a migration plus an ops burden on self-hosters. SQL does cheap
 *    candidate *retrieval*; the ranking happens in TypeScript
 *    (`scoreFoodMatch` in `@workspace/shared`), so it is unit-testable with no
 *    database and can be tuned without touching a query.
 * 2. **One round trip.** `unnest` + `LATERAL` fans every term out inside
 *    Postgres. Calling `searchFoods` per ingredient would acquire and release a
 *    client each time — six ingredients, six connections from a pool of ten.
 *
 * `is_quick_food = FALSE` mirrors every other food-discovery query: a quick add
 * is a deliberate "log this once, do not keep it", so it must not be offered as
 * a match. Photo-estimate ingredients are NOT quick foods — they are normal
 * foods precisely so a later photo can match and reuse them.
 */
async function findFoodMatchCandidates(
  userId: string,
  queries: { key: string; term: string }[],
  opts: { includePublic?: boolean; limitPerTerm?: number } = {}
): Promise<Map<string, FoodMatchCandidateRow[]>> {
  const grouped = new Map<string, FoodMatchCandidateRow[]>();
  const usable = queries.filter((q) => q.term && q.term.trim().length > 0);
  if (usable.length === 0) return grouped;

  const client = await getClient(userId);
  try {
    const result = await client.query(
      `WITH q AS (
         SELECT * FROM unnest($2::text[], $3::text[]) AS t(key, term)
       )
       SELECT q.key AS query_key, c.*
       FROM q
       CROSS JOIN LATERAL (
         SELECT f.id AS food_id, f.name AS food_name, f.brand, f.user_id,
                fv.id AS variant_id, fv.serving_size, fv.serving_unit,
                fv.calories, fv.protein, fv.carbs, fv.fat,
                fv.dietary_fiber, fv.sugars,
                -- Selected so applying a match carries the food's real
                -- micronutrients. Omitting them would scale to 0 and blank
                -- values the matched food actually records.
                fv.saturated_fat, fv.polyunsaturated_fat,
                fv.monounsaturated_fat, fv.trans_fat, fv.cholesterol,
                fv.sodium, fv.potassium, fv.calcium, fv.iron,
                fv.vitamin_a, fv.vitamin_c,
                (SELECT MAX(fe.entry_date) FROM food_entries fe
                  WHERE fe.food_id = f.id AND fe.user_id = $1) AS last_used
         FROM foods f
         JOIN food_variants fv ON fv.food_id = f.id AND fv.is_default = TRUE
         WHERE f.is_quick_food = FALSE
           AND (f.user_id = $1 OR ($4 AND f.shared_with_public = TRUE))
           AND (LOWER(f.name) = LOWER(q.term) OR f.name ILIKE '%' || q.term || '%')
         ORDER BY (LOWER(f.name) = LOWER(q.term)) DESC,
                  (f.user_id = $1) DESC,
                  last_used DESC NULLS LAST
         LIMIT $5
       ) c`,
      [
        userId,
        usable.map((q) => q.key),
        usable.map((q) => q.term),
        opts.includePublic ?? false,
        opts.limitPerTerm ?? 5,
      ]
    );
    for (const row of result.rows as FoodMatchCandidateRow[]) {
      const list = grouped.get(row.query_key);
      if (list) list.push(row);
      else grouped.set(row.query_key, [row]);
    }
    return grouped;
  } finally {
    client.release();
  }
}
async function findFoodByBarcode(barcode: string, userId: string) {
  barcode = normalizeBarcode(barcode);
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT
        f.id, f.name, f.brand, f.barcode, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type, f.provider_verified, f.images, f.notes,
        ${DEFAULT_VARIANT_JSON_SQL}
      FROM foods f
      ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
      WHERE f.barcode = $1 AND f.user_id = $2 AND f.is_quick_food = FALSE
      LIMIT 1`,
      [barcode, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}
async function getFoodById(foodId: string, userId: string) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      `SELECT
        f.id, f.name, f.brand, f.barcode, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type, f.provider_verified, f.images, f.notes,
        ${DEFAULT_VARIANT_JSON_SQL}
      FROM foods f
      ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
      WHERE f.id = $1`,
      [foodId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
async function getFoodOwnerId(foodId: string, userId: string) {
  const client = await getClient(userId); // User-specific operation (RLS will handle access)
  try {
    const foodResult = await client.query(
      'SELECT user_id FROM foods WHERE id = $1',
      [foodId]
    );
    const ownerId = foodResult.rows[0]?.user_id;
    log('info', `getFoodOwnerId: Food ID ${foodId} owner: ${ownerId}`);
    return ownerId;
  } finally {
    client.release();
  }
}
async function updateFood(id: string, userId: string, foodData: FoodUpdate) {
  const client = await getClient(userId); // User-specific operation
  try {
    // Distinguish "barcode key omitted" (leave unchanged) from "barcode set
    // to null" (clear). COALESCE collapses the two and can't express clears.
    const barcodeKeyPresent = Object.prototype.hasOwnProperty.call(
      foodData,
      'barcode'
    );
    const barcodeValue = barcodeKeyPresent
      ? foodData.barcode
        ? normalizeBarcode(foodData.barcode)
        : null
      : null;
    // Same distinction as barcode: a user clearing their note sends
    // `notes: null`, which COALESCE would silently ignore.
    const notesKeyPresent = Object.prototype.hasOwnProperty.call(
      foodData,
      'notes'
    );
    const notesValue = notesKeyPresent
      ? (sanitizeNotes(foodData.notes) ?? null)
      : null;
    const result = await client.query(
      `UPDATE foods SET
        name = COALESCE($1, name),
        is_custom = COALESCE($2, is_custom),
        brand = COALESCE($3, brand),
        barcode = CASE WHEN $4::boolean THEN $5 ELSE barcode END,
        provider_external_id = COALESCE($6, provider_external_id),
        shared_with_public = COALESCE($7, shared_with_public),
        provider_type = COALESCE($8, provider_type),
        provider_verified = COALESCE($9, provider_verified),
        is_quick_food = COALESCE($10, is_quick_food),
        images = COALESCE($11::jsonb, images),
        notes = CASE WHEN $12::boolean THEN $13 ELSE notes END,
        updated_at = now()
      WHERE id = $14
      RETURNING *`,
      [
        foodData.name,
        foodData.is_custom,
        foodData.brand,
        barcodeKeyPresent,
        barcodeValue,
        foodData.provider_external_id,
        foodData.shared_with_public,
        foodData.provider_type,
        foodData.provider_verified,
        foodData.is_quick_food,
        // undefined => key omitted => leave images untouched
        foodData.images === undefined
          ? null
          : JSON.stringify(toImageArray(foodData.images)),
        notesKeyPresent,
        notesValue,
        id,
      ]
    );
    const updated = result.rows[0];

    // Mirror createFood: a caller that sets a provider-hosted URL here (e.g.
    // backfilling the photo onto an already-imported food) gets a local copy
    // too, rather than leaving the row permanently hotlinked.
    if (updated && foodData.images !== undefined) {
      try {
        const localizedImages = await localizeImages(
          updated.images,
          updated.id,
          'foods'
        );
        if (localizedImages) {
          // Downloads happen outside the transaction, so another request can
          // have replaced `images` in the meantime. Only write the localized
          // result back if the row still holds exactly what we localized;
          // otherwise the newer value wins and this stale write is skipped.
          const localizeWrite = await client.query(
            'UPDATE foods SET images = $1::jsonb WHERE id = $2 AND images = $3::jsonb',
            [
              JSON.stringify(localizedImages),
              updated.id,
              JSON.stringify(toImageArray(updated.images)),
            ]
          );
          if (localizeWrite.rowCount === 0) {
            log(
              'debug',
              `[food.updateFood] Images for ${updated.id} changed during localization; keeping the newer value`
            );
          } else {
            updated.images = localizedImages;
          }
        }
      } catch (imageError) {
        // Non-fatal, as in createFood: keep the row and its remote URLs.
        log(
          'warn',
          `[food.updateFood] Image localization failed for ${updated.id}; keeping remote URLs:`,
          imageError
        );
      }
    }
    return updated;
  } finally {
    client.release();
  }
}
async function deleteFood(id: string, userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'DELETE FROM foods WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
async function getFoodsWithPagination(
  searchTerm: string | null | undefined,
  foodFilter: string | null | undefined,
  authenticatedUserId: string | null | undefined,
  limit: number,
  offset: number,
  sortBy: string | null | undefined
) {
  const client = await getClient(authenticatedUserId); // User-specific operation
  try {
    const whereClauses = ['f.is_quick_food = FALSE'];
    const {
      whereClauses: searchClauses,
      queryParams: searchParams,
      nextParamIndex,
    } = buildSqlSearch("CONCAT(f.brand, ' ', f.name)", searchTerm, 1);
    whereClauses.push(...searchClauses);
    const queryParams: SqlParam[] = [...searchParams];
    let paramIndex = nextParamIndex;

    // Handle ownership/source filtering
    if (foodFilter === 'mine') {
      whereClauses.push(`f.user_id = $${paramIndex}`);
      queryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'family') {
      whereClauses.push(
        `f.user_id IS NOT NULL AND f.user_id != $${paramIndex} AND f.shared_with_public = FALSE`
      );
      queryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'public') {
      whereClauses.push('f.shared_with_public = TRUE');
    } else if (foodFilter === 'system') {
      whereClauses.push('f.user_id IS NULL');
    }

    let query = `
      SELECT
        f.id, f.name, f.brand, f.barcode, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type, f.provider_verified, f.images, f.notes,
        ${DEFAULT_VARIANT_JSON_SQL}
      FROM foods f
      ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
      WHERE ${whereClauses.join(' AND ')}
    `;
    let orderByClause = 'f.name ASC, f.id ASC';
    if (sortBy) {
      const [sortField, sortOrder] = sortBy.split(':');
      const nutritionSortFields = ['calories', 'protein', 'carbs', 'fat'];
      const allowedSortFields = ['name', ...nutritionSortFields];
      const allowedSortOrders = ['asc', 'desc'];
      if (
        allowedSortFields.includes(sortField) &&
        allowedSortOrders.includes(sortOrder)
      ) {
        if (nutritionSortFields.includes(sortField)) {
          orderByClause = `fv.${sortField} ${sortOrder.toUpperCase()} NULLS LAST, f.name ASC, f.id ASC`;
        } else {
          orderByClause = `f.${sortField} ${sortOrder.toUpperCase()}, f.id ASC`;
        }
      } else {
        log(
          'warn',
          `Invalid sortBy parameter received: ${sortBy}. Using default sort.`
        );
      }
    }
    const selectQueryParams = [...queryParams];
    let selectParamIndex = paramIndex;
    if (searchTerm) {
      const exactMatchParamIndex = selectParamIndex;
      selectQueryParams.push(`%${searchTerm}%`);
      selectParamIndex++;
      orderByClause = `${buildSqlExactMatchOrder("CONCAT(f.brand, ' ', f.name)", exactMatchParamIndex)}, ${orderByClause}`;
    }
    query += ` ORDER BY ${orderByClause}`;
    query += ` LIMIT $${selectParamIndex} OFFSET $${selectParamIndex + 1}`;
    selectQueryParams.push(limit, offset);
    const foodsResult = await client.query(query, selectQueryParams);
    return foodsResult.rows;
  } finally {
    client.release();
  }
}

async function countFoods(
  searchTerm: string | null | undefined,
  foodFilter: string | null | undefined,
  authenticatedUserId: string | null | undefined
) {
  const client = await getClient(authenticatedUserId); // User-specific operation
  try {
    const whereClauses = ['is_quick_food = FALSE'];
    const { whereClauses: searchClauses, queryParams: searchParams } =
      buildSqlSearch("CONCAT(brand, ' ', name)", searchTerm, 1);
    whereClauses.push(...searchClauses);
    const countQueryParams: SqlParam[] = [...searchParams];
    let paramIndex = countQueryParams.length + 1;

    // Handle ownership/source filtering
    if (foodFilter === 'mine') {
      whereClauses.push(`user_id = $${paramIndex}`);
      countQueryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'family') {
      whereClauses.push(
        `user_id IS NOT NULL AND user_id != $${paramIndex} AND shared_with_public = FALSE`
      );
      countQueryParams.push(authenticatedUserId);
      paramIndex++;
    } else if (foodFilter === 'public') {
      whereClauses.push('shared_with_public = TRUE');
    } else if (foodFilter === 'system') {
      whereClauses.push('user_id IS NULL');
    }

    const countQuery = `
      SELECT COUNT(*)
      FROM foods
      WHERE ${whereClauses.join(' AND ')}
    `;
    const countResult = await client.query(countQuery, countQueryParams);
    return parseInt(countResult.rows[0].count, 10);
  } finally {
    client.release();
  }
}
async function getFoodDeletionImpact(
  foodId: string,
  authenticatedUserId: string
) {
  const client = await getClient(authenticatedUserId);
  const systemClient = await getSystemClient();

  try {
    const [publicFoodResult, foodOwnerResult] = await Promise.all([
      systemClient.query('SELECT shared_with_public FROM foods WHERE id = $1', [
        foodId,
      ]),
      systemClient.query('SELECT user_id FROM foods WHERE id = $1', [foodId]),
    ]);

    const isPubliclyShared =
      publicFoodResult.rows[0]?.shared_with_public || false;
    const foodOwnerId = foodOwnerResult.rows[0]?.user_id;

    // Fetch actual food entry rows for the current user (RLS-scoped)
    const currentUserEntriesResult = await client.query(
      `SELECT id, entry_date, meal_type_id 
       FROM food_entries
       WHERE food_id = $1 AND user_id = $2
       ORDER BY entry_date DESC
       LIMIT 50`,
      [foodId, authenticatedUserId]
    );

    // Fetch actual food entry rows for other users (bypass RLS)
    const otherUserEntriesResult = await systemClient.query(
      `SELECT id, entry_date, meal_type_id
       FROM food_entries
       WHERE food_id = $1 AND user_id != $2
       ORDER BY entry_date DESC
       LIMIT 50`,
      [foodId, authenticatedUserId]
    );

    const currentUserFoodEntries = currentUserEntriesResult.rows.map(
      (row: { id: string; entry_date: string; meal_type_id: string }) => ({
        id: row.id,
        entry_date: row.entry_date,
        meal_type_id: row.meal_type_id,
        isCurrentUser: true,
      })
    );

    // Other users' diary rows are counted for the impact warning but never
    // returned — their entry ids/dates belong to those users, not the caller.
    const otherUserFoodEntriesCount = otherUserEntriesResult.rows.length;

    // Structural reference counts (meals, plans, templates)
    const [
      currentUserMealFoodsResult,
      currentUserMealPlansResult,
      currentUserTemplatesResult,
      otherUserMealFoodsResult,
      otherUserMealPlansResult,
      otherUserTemplatesResult,
    ] = await Promise.all([
      client.query(
        'SELECT COUNT(*) FROM meal_foods mf JOIN meals m ON mf.meal_id = m.id WHERE mf.food_id = $1 AND m.user_id = $2',
        [foodId, authenticatedUserId]
      ),
      client.query(
        'SELECT COUNT(*) FROM meal_plans mp WHERE mp.food_id = $1 AND mp.user_id = $2',
        [foodId, authenticatedUserId]
      ),
      client.query(
        'SELECT COUNT(*) FROM meal_plan_template_assignments mpta JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id WHERE mpta.food_id = $1 AND mpt.user_id = $2',
        [foodId, authenticatedUserId]
      ),
      systemClient.query(
        'SELECT COUNT(*) FROM meal_foods mf JOIN meals m ON mf.meal_id = m.id WHERE mf.food_id = $1 AND m.user_id != $2',
        [foodId, authenticatedUserId]
      ),
      systemClient.query(
        'SELECT COUNT(*) FROM meal_plans mp WHERE mp.food_id = $1 AND mp.user_id != $2',
        [foodId, authenticatedUserId]
      ),
      systemClient.query(
        'SELECT COUNT(*) FROM meal_plan_template_assignments mpta JOIN meal_plan_templates mpt ON mpta.template_id = mpt.id WHERE mpta.food_id = $1 AND mpt.user_id != $2',
        [foodId, authenticatedUserId]
      ),
    ]);

    const mealFoodsCount =
      parseInt(currentUserMealFoodsResult.rows[0].count, 10) +
      parseInt(otherUserMealFoodsResult.rows[0].count, 10);
    const mealPlansCount =
      parseInt(currentUserMealPlansResult.rows[0].count, 10) +
      parseInt(otherUserMealPlansResult.rows[0].count, 10);
    const mealPlanTemplateAssignmentsCount =
      parseInt(currentUserTemplatesResult.rows[0].count, 10) +
      parseInt(otherUserTemplatesResult.rows[0].count, 10);

    const foodEntriesCount =
      currentUserFoodEntries.length + otherUserFoodEntriesCount;
    const currentUserReferences =
      currentUserFoodEntries.length +
      parseInt(currentUserMealFoodsResult.rows[0].count, 10) +
      parseInt(currentUserMealPlansResult.rows[0].count, 10) +
      parseInt(currentUserTemplatesResult.rows[0].count, 10);
    const otherUserReferences =
      otherUserFoodEntriesCount +
      parseInt(otherUserMealFoodsResult.rows[0].count, 10) +
      parseInt(otherUserMealPlansResult.rows[0].count, 10) +
      parseInt(otherUserTemplatesResult.rows[0].count, 10);

    let familySharedUsers: string[] = [];
    if (foodOwnerId === authenticatedUserId) {
      const familyAccessResult = await client.query(
        `SELECT fa.family_user_id
         FROM family_access fa
         WHERE fa.owner_user_id = $1
           AND fa.is_active = TRUE
           AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())
           AND (fa.access_permissions->>'diary')::boolean = TRUE`,
        [authenticatedUserId]
      );
      familySharedUsers = familyAccessResult.rows.map(
        (row: { family_user_id: string }) => row.family_user_id
      );
    }

    return {
      foodEntries: currentUserFoodEntries,
      foodEntriesCount,
      mealFoodsCount,
      mealPlansCount,
      mealPlanTemplateAssignmentsCount,
      totalReferences: currentUserReferences + otherUserReferences,
      currentUserReferences,
      otherUserReferences,
      isPubliclyShared,
      familySharedUsers,
    };
  } finally {
    client.release();
    systemClient.release();
  }
}
async function deleteFoodAndDependencies(foodId: string, userId: string) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // 1. Delete food entries referencing this food for the current user
    await client.query(
      'DELETE FROM food_entries WHERE food_id = $1 AND user_id = $2',
      [foodId, userId]
    );
    log('info', `Deleted food entries for food ${foodId} by user ${userId}`);
    // 2. Delete meal_foods referencing this food for meals owned by the current user
    await client.query(
      `
      DELETE FROM meal_foods mf
      USING meals m
      WHERE mf.meal_id = m.id
        AND mf.food_id = $1
        AND m.user_id = $2
    `,
      [foodId, userId]
    );
    log(
      'info',
      `Deleted meal foods for food ${foodId} in meals by user ${userId}`
    );
    // 3. Delete meal_plans referencing this food for the current user
    await client.query(
      'DELETE FROM meal_plans WHERE food_id = $1 AND user_id = $2',
      [foodId, userId]
    );
    log('info', `Deleted meal plans for food ${foodId} by user ${userId}`);
    // 4. Delete meal_plan_template_assignments referencing this food for templates owned by the current user
    await client.query(
      `
      DELETE FROM meal_plan_template_assignments mpta
      USING meal_plan_templates mpt
      WHERE mpta.template_id = mpt.id
        AND mpta.food_id = $1
        AND mpt.user_id = $2
    `,
      [foodId, userId]
    );
    log(
      'info',
      `Deleted meal plan template assignments for food ${foodId} in templates by user ${userId}`
    );
    // 5. Delete food variants associated with this food
    await client.query('DELETE FROM food_variants WHERE food_id = $1', [
      foodId,
    ]);
    log('info', `Deleted food variants for food ${foodId}`);
    // 6. Finally, delete the food itself
    const result = await client.query(
      'DELETE FROM foods WHERE id = $1 AND user_id = $2 RETURNING id',
      [foodId, userId]
    );
    log('info', `Deleted food ${foodId} by user ${userId}`);
    await client.query('COMMIT');
    return result.rowCount > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error deleting food and dependencies for food ${foodId} by user ${userId}:`,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// CSV/bulk import values arrive loosely typed (numbers may still be strings),
// so nutrient fields accept the raw shapes the sanitize* helpers normalize.
type NumericInput = number | string | null | undefined;
type BooleanInput = boolean | string | null | undefined;

interface BulkImportFoodData {
  name: string;
  brand?: string | null;
  is_custom?: BooleanInput;
  user_id?: string;
  shared_with_public?: BooleanInput;
  is_quick_food?: BooleanInput;
  barcode?: string | null;
  provider_external_id?: string | null;
  provider_type?: string | null;
  provider_verified?: BooleanInput;
  images?: string[] | null;
  serving_size?: NumericInput;
  serving_unit?: string | null;
  is_default?: BooleanInput;
  calories?: NumericInput;
  protein?: NumericInput;
  carbs?: NumericInput;
  fat?: NumericInput;
  saturated_fat?: NumericInput;
  polyunsaturated_fat?: NumericInput;
  monounsaturated_fat?: NumericInput;
  trans_fat?: NumericInput;
  cholesterol?: NumericInput;
  sodium?: NumericInput;
  potassium?: NumericInput;
  dietary_fiber?: NumericInput;
  sugars?: NumericInput;
  vitamin_a?: NumericInput;
  vitamin_c?: NumericInput;
  calcium?: NumericInput;
  iron?: NumericInput;
  glycemic_index?: string | null;
  custom_nutrients?: Record<string, unknown> | null;
  source?: string | null;
  ai_confidence?: number | null;
  allergens?: string[] | null;
  traces?: string[] | null;
}

interface GroupedImportFood {
  name: string;
  brand?: string | null;
  is_custom: boolean;
  user_id: string;
  shared_with_public: BooleanInput;
  is_quick_food: BooleanInput;
  barcode?: string | null;
  provider_external_id?: string | null;
  provider_type?: string | null;
  provider_verified?: BooleanInput;
  images?: string[] | null;
  variants: BulkImportFoodData[];
}

interface DuplicateFoodRow {
  id: string;
  name: string;
  brand: string | null;
}

async function createFoodsInBulk(
  userId: string,
  foodDataArray: BulkImportFoodData[],
  overwrite = false
) {
  class DuplicateFoodError extends Error {
    duplicates: DuplicateFoodRow[];
    constructor(message: string, duplicates: DuplicateFoodRow[]) {
      super(message);
      this.name = 'DuplicateFoodError';
      this.duplicates = duplicates;
    }
  }
  // 1. --- Grouping incoming Variants by Food (name + brand)
  // brand is nullable; normalize null/undefined/'' to '' so blank-brand foods
  // group together and match the COALESCE(brand, '') lookup below.
  const brandKey = (brand: string | null | undefined) => brand || '';
  const groupedFoods = foodDataArray.reduce(
    (acc: Record<string, GroupedImportFood>, variant: BulkImportFoodData) => {
      const key = `${variant.name}|${brandKey(variant.brand)}`;
      if (!acc[key]) {
        acc[key] = {
          name: variant.name,
          brand: variant.brand || null,
          is_custom: true,
          user_id: userId,
          shared_with_public: variant.shared_with_public || false,
          is_quick_food: variant.is_quick_food || false,
          barcode: variant.barcode || null,
          provider_external_id: variant.provider_external_id || null,
          provider_type: variant.provider_type || null,
          provider_verified: variant.provider_verified,
          images: resolveImageInput(variant),
          variants: [],
        };
      }
      if (sanitizeBoolean(variant.provider_verified) === true) {
        acc[key].provider_verified = true;
      }
      acc[key].variants.push(variant);
      return acc;
    },
    {}
  );
  const foodsToCreate = Object.values(groupedFoods);
  if (foodsToCreate.length === 0) {
    return {
      message: 'No food data provided to import.',
      createdFoods: 0,
      updatedFoods: 0,
      createdVariants: 0,
    };
  }
  // 2. Pre-flight Duplicate Check before starting the db transaction
  const potentialDuplicates = foodsToCreate.map((food) => [
    userId,
    food.name,
    brandKey(food.brand),
  ]);
  const flatValues = potentialDuplicates.flat();
  let placeholderIndex = 1;
  const placeholderString = potentialDuplicates
    .map(
      () =>
        `($${placeholderIndex++}::uuid, $${placeholderIndex++}, $${placeholderIndex++})`
    )
    .join(', ');
  const duplicateCheckQuery = `
    SELECT id, name, brand FROM foods
    WHERE (user_id, name, COALESCE(brand, '')) IN (VALUES ${placeholderString})
  `;
  const clientForDuplicateCheck = await getClient(userId);
  let existingFoods: DuplicateFoodRow[];
  try {
    const { rows } = await clientForDuplicateCheck.query(
      // User-specific check for duplicates
      duplicateCheckQuery,
      flatValues
    );
    existingFoods = rows as DuplicateFoodRow[];
  } finally {
    clientForDuplicateCheck.release();
  }
  // Map existing (name|brand) -> food id so we can overwrite in place when requested.
  const existingFoodIdByKey = new Map<string, string>(
    existingFoods.map((f) => [`${f.name}|${brandKey(f.brand)}`, f.id])
  );
  if (!overwrite && existingFoods.length > 0) {
    // Duplicates found and the user did not opt into overwriting: abort.
    throw new DuplicateFoodError(
      'The import was terminated because duplicate entries were found in your food list.',
      existingFoods
    );
  }
  // 3. Database Transaction starts here for Bulk Insert
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query('BEGIN');
    let totalFoodsCreated = 0;
    let totalFoodsUpdated = 0;
    let totalVariantsCreated = 0;
    // Downloads are deferred until after COMMIT so network latency never holds
    // the bulk transaction open.
    const pendingImageLocalization: { foodId: string; images: unknown }[] = [];
    for (const food of foodsToCreate) {
      const existingFoodId = existingFoodIdByKey.get(
        `${food.name}|${brandKey(food.brand)}`
      );
      let foodId: string;
      if (existingFoodId) {
        // Overwrite path: update the existing food record in place.
        await client.query(
          `UPDATE foods SET
             is_custom = $2,
             shared_with_public = $3,
             is_quick_food = $4,
             provider_verified = CASE WHEN $5 THEN TRUE ELSE provider_verified END,
             updated_at = now()
           WHERE id = $1`,
          [
            existingFoodId,
            sanitizeBoolean(food.is_custom) ?? true,
            sanitizeBoolean(food.shared_with_public) ?? false,
            sanitizeBoolean(food.is_quick_food) ?? false,
            sanitizeBoolean(food.provider_verified) ?? false,
          ]
        );
        foodId = existingFoodId;
        totalFoodsUpdated++;
      } else {
        const foodResult = await client.query(
          `INSERT INTO foods (name, brand, is_custom, user_id, shared_with_public, is_quick_food,barcode,provider_external_id,provider_type,provider_verified, images, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, now(), now())
           RETURNING id`,
          [
            food.name,
            food.brand,
            sanitizeBoolean(food.is_custom) ?? true,
            food.user_id,
            sanitizeBoolean(food.shared_with_public) ?? false,
            sanitizeBoolean(food.is_quick_food) ?? false,
            (food.barcode && normalizeBarcode(food.barcode)) || null,
            food.provider_external_id || null,
            food.provider_type || null,
            sanitizeBoolean(food.provider_verified) ?? false,
            JSON.stringify(resolveImageInput(food)),
          ]
        );
        foodId = foodResult.rows[0].id;
        pendingImageLocalization.push({ foodId, images: food.images });
        totalFoodsCreated++;
      }
      for (const variant of food.variants) {
        const variantIsDefault = sanitizeBoolean(variant.is_default) ?? true;
        // When overwriting, reuse a variant with the same serving so existing
        // diary entries (which reference the variant id) keep their nutrition.
        const existingVariant = existingFoodId
          ? (
              await client.query(
                `SELECT id FROM food_variants
                 WHERE food_id = $1 AND serving_size = $2 AND serving_unit = $3
                 LIMIT 1`,
                [
                  foodId,
                  sanitizeNumeric(variant.serving_size),
                  variant.serving_unit,
                ]
              )
            ).rows[0]
          : null;
        if (variantIsDefault) {
          // Keep a single default variant per food.
          await client.query(
            'UPDATE food_variants SET is_default = FALSE WHERE food_id = $1',
            [foodId]
          );
        }
        if (existingVariant) {
          await client.query(
            // COALESCE, not bare assignment: a nutrient the CSV never carried
            // arrives here as undefined (the importer omits unmapped columns
            // rather than asserting zero for them), and sanitizeNumeric turns
            // that into a null parameter. Assigning it directly would wipe the
            // stored value on an overwrite import, replacing a real number with
            // NULL for every column the file happened not to include. A mapped
            // but blank cell parses to 0 on the way in, which is not null and
            // so still overwrites -- clearing a value on purpose keeps working.
            `UPDATE food_variants SET
                is_default = $2,
                calories = COALESCE($3, calories),
                protein = COALESCE($4, protein),
                carbs = COALESCE($5, carbs),
                fat = COALESCE($6, fat),
                saturated_fat = COALESCE($7, saturated_fat),
                polyunsaturated_fat = COALESCE($8, polyunsaturated_fat),
                monounsaturated_fat = COALESCE($9, monounsaturated_fat),
                trans_fat = COALESCE($10, trans_fat),
                cholesterol = COALESCE($11, cholesterol),
                sodium = COALESCE($12, sodium),
                potassium = COALESCE($13, potassium),
                dietary_fiber = COALESCE($14, dietary_fiber),
                sugars = COALESCE($15, sugars),
                vitamin_a = COALESCE($16, vitamin_a),
                vitamin_c = COALESCE($17, vitamin_c),
                calcium = COALESCE($18, calcium),
                iron = COALESCE($19, iron),
                glycemic_index = COALESCE($20, glycemic_index),
                custom_nutrients = COALESCE($21, custom_nutrients),
                updated_at = now()
              WHERE id = $1`,
            [
              existingVariant.id,
              variantIsDefault,
              sanitizeNumeric(variant.calories),
              sanitizeNumeric(variant.protein),
              sanitizeNumeric(variant.carbs),
              sanitizeNumeric(variant.fat),
              sanitizeNumeric(variant.saturated_fat),
              sanitizeNumeric(variant.polyunsaturated_fat),
              sanitizeNumeric(variant.monounsaturated_fat),
              sanitizeNumeric(variant.trans_fat),
              sanitizeNumeric(variant.cholesterol),
              sanitizeNumeric(variant.sodium),
              sanitizeNumeric(variant.potassium),
              sanitizeNumeric(variant.dietary_fiber),
              sanitizeNumeric(variant.sugars),
              sanitizeNumeric(variant.vitamin_a),
              sanitizeNumeric(variant.vitamin_c),
              sanitizeNumeric(variant.calcium),
              sanitizeNumeric(variant.iron),
              sanitizeGlycemicIndex(variant.glycemic_index),
              // null (not {}) so the COALESCE above keeps the stored map when
              // the import carried no custom nutrients at all.
              variant.custom_nutrients ?? null,
            ]
          );
        } else {
          await client.query(
            `INSERT INTO food_variants (
              food_id, serving_size, serving_unit, is_default, calories, protein, carbs, fat,
              saturated_fat, polyunsaturated_fat, monounsaturated_fat, trans_fat,
              cholesterol, sodium, potassium, dietary_fiber, sugars,
              vitamin_a, vitamin_c, calcium, iron, glycemic_index, custom_nutrients,
              source, ai_confidence, allergens, traces, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, now(), now()
            )`,
            [
              foodId,
              sanitizeNumeric(variant.serving_size),
              variant.serving_unit,
              variantIsDefault,
              sanitizeNumeric(variant.calories),
              sanitizeNumeric(variant.protein),
              sanitizeNumeric(variant.carbs),
              sanitizeNumeric(variant.fat),
              sanitizeNumeric(variant.saturated_fat),
              sanitizeNumeric(variant.polyunsaturated_fat),
              sanitizeNumeric(variant.monounsaturated_fat),
              sanitizeNumeric(variant.trans_fat),
              sanitizeNumeric(variant.cholesterol),
              sanitizeNumeric(variant.sodium),
              sanitizeNumeric(variant.potassium),
              sanitizeNumeric(variant.dietary_fiber),
              sanitizeNumeric(variant.sugars),
              sanitizeNumeric(variant.vitamin_a),
              sanitizeNumeric(variant.vitamin_c),
              sanitizeNumeric(variant.calcium),
              sanitizeNumeric(variant.iron),
              sanitizeGlycemicIndex(variant.glycemic_index),
              variant.custom_nutrients ?? {},
              variant.source ?? 'manual',
              variant.ai_confidence ?? null,
              variant.allergens ?? null,
              variant.traces ?? null,
            ]
          );
        }
        totalVariantsCreated++;
      }
    }
    await client.query('COMMIT');

    // Pull provider-hosted images local, in small batches so a large import
    // doesn't open hundreds of simultaneous outbound connections.
    const IMAGE_BATCH_SIZE = 4;
    for (
      let i = 0;
      i < pendingImageLocalization.length;
      i += IMAGE_BATCH_SIZE
    ) {
      const batch = pendingImageLocalization.slice(i, i + IMAGE_BATCH_SIZE);
      await Promise.all(
        batch.map(async ({ foodId, images }) => {
          try {
            const localized = await localizeImages(images, foodId, 'foods');
            if (localized) {
              await client.query(
                'UPDATE foods SET images = $1::jsonb WHERE id = $2',
                [JSON.stringify(localized), foodId]
              );
            }
          } catch (imageError) {
            const message =
              imageError instanceof Error
                ? imageError.message
                : String(imageError);
            log(
              'warn',
              `[food] Bulk image localization failed for ${foodId}: ${message}`
            );
          }
        })
      );
    }

    return {
      message: 'Food data imported successfully.',
      createdFoods: totalFoodsCreated,
      updatedFoods: totalFoodsUpdated,
      createdVariants: totalVariantsCreated,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error during bulk food import:', error);
    throw error;
  } finally {
    client.release();
  }
}
async function getFoodsNeedingReview(userId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (fe.food_id)
          fe.food_id,
          f.name AS food_name,
          fv.serving_size,
          fv.serving_unit,
          fv.calories,
          f.updated_at AS food_updated_at,
          fe.created_at AS entry_created_at,
          f.user_id AS food_owner_id
       FROM food_entries fe
       JOIN foods f ON fe.food_id = f.id
       JOIN food_variants fv ON fe.variant_id = fv.id
       WHERE fe.user_id = $1
         AND f.updated_at > fe.created_at -- Food has been updated since the entry was created
         AND NOT EXISTS (
             SELECT 1 FROM user_ignored_updates uiu
             WHERE uiu.user_id = $1
               AND uiu.variant_id = fe.variant_id
               AND uiu.ignored_at_timestamp = f.updated_at
         )
       ORDER BY fe.food_id, fe.created_at DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
async function clearUserIgnoredUpdate(userId: string, variantId: string) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `DELETE FROM user_ignored_updates
       WHERE user_id = $1 AND variant_id = $2`,
      [userId, variantId]
    );
  } finally {
    client.release();
  }
}
// Name-only match for the diary CSV importer's food resolution. Restricted to
// the caller-selected scopes (own always included; family/public opt-in) on
// top of RLS visibility, so an unticked scope is never matched even if RLS
// would otherwise allow reading it. Precedence own > family > public, with
// most-recently-logged (then newest-created) breaking ties within a tier —
// picks the food a "Chicken Breast" import most likely meant among several
// same-named foods now that brand is not part of the match key.
async function findVisibleFoodByName(
  userId: string,
  foodName: string,
  scope: { family?: boolean; public?: boolean } = {}
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT f.id, f.name, f.brand, f.user_id, f.shared_with_public,
              fv.id AS default_variant_id, fv.serving_size, fv.serving_unit,
              ${DEFAULT_VARIANT_JSON_SQL}
       FROM foods f
       ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
       WHERE LOWER(f.name) = LOWER($2)
         AND f.is_quick_food = FALSE
         AND (
           f.user_id = $1
           OR ($3 AND f.user_id IS NOT NULL AND f.user_id != $1 AND f.shared_with_public = FALSE)
           OR ($4 AND f.shared_with_public = TRUE)
         )
       ORDER BY
         CASE
           WHEN f.user_id = $1 THEN 0
           WHEN f.shared_with_public = FALSE THEN 1
           ELSE 2
         END ASC,
         (SELECT MAX(fe.entry_date) FROM food_entries fe WHERE fe.food_id = f.id) DESC NULLS LAST,
         f.created_at DESC
       LIMIT 1`,
      [userId, foodName, !!scope.family, !!scope.public]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function findFoodByProviderExternalId(
  userId: string,
  providerExternalId: string,
  providerType: string
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT f.id, f.name, f.brand, f.barcode, f.is_custom, f.user_id, f.shared_with_public, f.provider_external_id, f.provider_type, f.provider_verified, f.images, f.notes,
              fv.id AS default_variant_id, fv.serving_size, fv.serving_unit,
              ${DEFAULT_VARIANT_JSON_SQL}
       FROM foods f
       ${PREFERRED_DEFAULT_VARIANT_JOIN_SQL}
       WHERE f.provider_external_id = $1
         AND f.provider_type = $2
         AND f.user_id = $3
       LIMIT 1`,
      [providerExternalId, providerType, userId]
    );
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

async function updateFoodVariantNutrition(
  variantId: string,
  userId: string,
  nutritionData: FoodVariantInput
) {
  const client = await getClient(userId);
  try {
    // custom_nutrients is optional and COALESCE-guarded so existing callers
    // (e.g. health-data ingest) that omit it keep the stored value untouched.
    await client.query(
      `UPDATE food_variants SET
        serving_size = $2,
        serving_unit = $3,
        calories = $4,
        protein = $5,
        carbs = $6,
        fat = $7,
        saturated_fat = $8,
        polyunsaturated_fat = $9,
        monounsaturated_fat = $10,
        trans_fat = $11,
        cholesterol = $12,
        sodium = $13,
        potassium = $14,
        dietary_fiber = $15,
        sugars = $16,
        vitamin_a = $17,
        vitamin_c = $18,
        calcium = $19,
        iron = $20,
        custom_nutrients = COALESCE($21::jsonb, custom_nutrients),
        updated_at = now()
      WHERE id = $1`,
      [
        variantId,
        sanitizeNumeric(nutritionData.serving_size),
        nutritionData.serving_unit,
        sanitizeNumeric(nutritionData.calories),
        sanitizeNumeric(nutritionData.protein),
        sanitizeNumeric(nutritionData.carbs),
        sanitizeNumeric(nutritionData.fat),
        sanitizeNumeric(nutritionData.saturated_fat),
        sanitizeNumeric(nutritionData.polyunsaturated_fat),
        sanitizeNumeric(nutritionData.monounsaturated_fat),
        sanitizeNumeric(nutritionData.trans_fat),
        sanitizeNumeric(nutritionData.cholesterol),
        sanitizeNumeric(nutritionData.sodium),
        sanitizeNumeric(nutritionData.potassium),
        sanitizeNumeric(nutritionData.dietary_fiber),
        sanitizeNumeric(nutritionData.sugars),
        sanitizeNumeric(nutritionData.vitamin_a),
        sanitizeNumeric(nutritionData.vitamin_c),
        sanitizeNumeric(nutritionData.calcium),
        sanitizeNumeric(nutritionData.iron),
        nutritionData.custom_nutrients
          ? JSON.stringify(nutritionData.custom_nutrients)
          : null,
      ]
    );
  } finally {
    client.release();
  }
}

export { sanitizeGlycemicIndex };
export { sanitizeNumeric };
export { sanitizeBoolean };
export { searchFoods };
export { createFood };
export { findFoodByBarcode };
export { findVisibleFoodByName };
export { findFoodByProviderExternalId };
export { updateFoodVariantNutrition };
export { getFoodById };
export { getFoodOwnerId };
export { updateFood };
export { deleteFood };
export { getFoodsWithPagination };
export { countFoods };
export { getFoodDeletionImpact };
export { createFoodsInBulk };
export { createFoodWithClient };
export { findFoodMatchCandidates };
export type { BulkImportFoodData };
export { getFoodsNeedingReview };
export { clearUserIgnoredUpdate };
export { deleteFoodAndDependencies };
export default {
  createFoodWithClient,
  findFoodMatchCandidates,
  sanitizeGlycemicIndex,
  sanitizeNumeric,
  sanitizeBoolean,
  searchFoods,
  createFood,
  findFoodByBarcode,
  findVisibleFoodByName,
  findFoodByProviderExternalId,
  updateFoodVariantNutrition,
  getFoodById,
  getFoodOwnerId,
  updateFood,
  deleteFood,
  getFoodsWithPagination,
  countFoods,
  getFoodDeletionImpact,
  createFoodsInBulk,
  getFoodsNeedingReview,
  clearUserIgnoredUpdate,
  deleteFoodAndDependencies,
};
