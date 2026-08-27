import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
/**
 * Creates a new custom meal type for a specific user.
 * @param {Object} data - { name: string, sort_order: number }
 * @param {string} userId - The UUID of the authenticated user
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createMealType(data: any, userId: any) {
  log(
    'info',
    `createMealType in mealType.js: data: ${JSON.stringify(data)}, userId: ${userId}`
  );
  const client = await getClient(userId);
  try {
    const sortOrder = data.sort_order !== undefined ? data.sort_order : 100;
    const result = await client.query(
      `INSERT INTO meal_types (name, user_id, sort_order, is_visible, default_time)
       VALUES ($1, $2, $3, TRUE, $4)
       RETURNING *`,
      [data.name, userId, sortOrder, data.default_time ?? null]
    );
    return result.rows[0];
  } catch (error) {
    log('error', 'Error creating meal type:', error);
    throw error;
  } finally {
    client.release();
  }
}
/**
 * Fetches all available meal types for a user.
 * This includes System Defaults (user_id is NULL) AND User Custom types.
 * Ordered by sort_order.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAllMealTypes(userId: any) {
  log('debug', `getAllMealTypes in mealType.js for userId: ${userId}`);
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT 
         mt.id,
         mt.name,
         mt.sort_order,
         mt.user_id,
         mt.created_at,
         COALESCE(umv.is_visible, mt.is_visible) AS is_visible,
         COALESCE(umv.show_in_quick_log, mt.show_in_quick_log, true) AS show_in_quick_log,
         COALESCE(umv.default_time, mt.default_time) AS default_time
       FROM meal_types mt
       LEFT JOIN user_meal_visibilities umv
         ON mt.id = umv.meal_type_id AND umv.user_id = $1
       WHERE mt.user_id = $1 OR mt.user_id IS NULL
       ORDER BY mt.sort_order ASC, mt.id ASC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
/**
 * Fetches a single meal type by ID.
 * Ensures the user has access to it (it's either theirs or a system default).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getMealTypeById(mealTypeId: any, userId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT 
         mt.*,
         COALESCE(umv.is_visible, mt.is_visible) AS is_visible,
         COALESCE(umv.show_in_quick_log, mt.show_in_quick_log, true) AS show_in_quick_log,
         COALESCE(umv.default_time, mt.default_time) AS default_time
       FROM meal_types mt
       LEFT JOIN user_meal_visibilities umv
         ON mt.id = umv.meal_type_id AND umv.user_id = $2
       WHERE mt.id = $1
         AND (mt.user_id = $2 OR mt.user_id IS NULL)`,
      [mealTypeId, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateMealType(mealTypeId: any, data: any, userId: any) {
  log(
    'info',
    `updateMealType in mealType.js: id: ${mealTypeId}, data: ${JSON.stringify(data)}`
  );
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    //console.log(data);
    //console.log(data.is_visible);
    if (
      data.is_visible !== undefined ||
      data.show_in_quick_log !== undefined ||
      data.default_time !== undefined
    ) {
      // default_time uses a provided-flag ($5) instead of COALESCE so an
      // explicit null clears the per-user override.
      await client.query(
        `INSERT INTO user_meal_visibilities (user_id, meal_type_id, is_visible, show_in_quick_log, default_time)
         VALUES ($1, $2, COALESCE($3, true), COALESCE($4, true), $6::time)
         ON CONFLICT (user_id, meal_type_id)
         DO UPDATE SET
           is_visible = COALESCE($3, user_meal_visibilities.is_visible),
           show_in_quick_log = COALESCE($4, user_meal_visibilities.show_in_quick_log),
           default_time = CASE WHEN $5::boolean THEN $6::time ELSE user_meal_visibilities.default_time END`,
        [
          userId,
          mealTypeId,
          data.is_visible,
          data.show_in_quick_log,
          data.default_time !== undefined,
          data.default_time ?? null,
        ]
      );
    }
    if (data.name !== undefined || data.sort_order !== undefined) {
      const updateResult = await client.query(
        `UPDATE meal_types 
         SET 
           name = COALESCE($1, name),
           sort_order = COALESCE($2, sort_order)
         WHERE id = $3 AND user_id = $4
         RETURNING *`,
        [data.name, data.sort_order, mealTypeId, userId]
      );
      if (updateResult.rows.length === 0) {
        const check = await client.query(
          'SELECT 1 FROM meal_types WHERE id = $1 AND user_id IS NULL',
          [mealTypeId]
        );
        if (check.rows.length > 0) {
          throw new Error(
            'Cannot rename or reorder system default meal types.'
          );
        }
        throw new Error('Meal type not found or access denied.');
      }
    }
    await client.query('COMMIT');
    return await getMealTypeById(mealTypeId, userId);
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'Error updating meal type:', error);
    throw error;
  } finally {
    client.release();
  }
}
export type MealTypeDeleteMode = 'strict' | 'reassign' | 'force';

export interface MealTypeDeletionImpact {
  foodEntries: number;
  foodEntryMeals: number;
  mealPlans: number;
  templateAssignments: number;
  totalReferences: number;
}

export interface DeleteMealTypeOptions {
  mode?: MealTypeDeleteMode;
  targetMealTypeId?: string | null;
}

export interface DeleteMealTypeResult {
  deleted: boolean;
  mode: MealTypeDeleteMode;
  reassignedTo?: string;
}

// Stable markers the route layer maps to HTTP status codes.
export const MEAL_TYPE_SYSTEM_MESSAGE =
  'Cannot delete system default meal types.';
export const MEAL_TYPE_IN_USE_MESSAGE =
  'Cannot delete this meal type because it is still in use.';
export const MEAL_TYPE_INVALID_TARGET_MESSAGE =
  'Invalid reassignment target meal type.';

/**
 * True for the two Postgres codes that a blocked meal_type delete can raise.
 *
 * The four referencing FKs are ON DELETE RESTRICT, which raises 23001
 * (restrict_violation) — checked immediately — not the 23503
 * (foreign_key_violation) that NO ACTION would raise. Handling only 23503
 * previously left the friendly message unreachable, so every blocked delete
 * surfaced as a generic 500.
 */
function isForeignKeyBlock(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '23001' || code === '23503';
}

// Counts on an existing client so callers inside a transaction can reuse it.
// meal_plan_template_assignments has no user_id column — its RLS policy derives
// ownership through the parent template, so it must be scoped by that join or
// it silently matches nothing.
async function countMealTypeReferences(
  client: {
    query: (
      sql: string,
      params: unknown[]
    ) => Promise<{ rows: Record<string, string>[] }>;
  },
  mealTypeId: string,
  userId: string
): Promise<MealTypeDeletionImpact> {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM food_entries
          WHERE meal_type_id = $1 AND user_id = $2) AS food_entries,
       (SELECT COUNT(*) FROM food_entry_meals
          WHERE meal_type_id = $1 AND user_id = $2) AS food_entry_meals,
       (SELECT COUNT(*) FROM meal_plans
          WHERE meal_type_id = $1 AND user_id = $2) AS meal_plans,
       (SELECT COUNT(*) FROM meal_plan_template_assignments a
          WHERE a.meal_type_id = $1
            AND a.template_id IN (
              SELECT id FROM meal_plan_templates WHERE user_id = $2
            )) AS template_assignments`,
    [mealTypeId, userId]
  );
  const row = result.rows[0];
  const foodEntries = Number(row.food_entries);
  const foodEntryMeals = Number(row.food_entry_meals);
  const mealPlans = Number(row.meal_plans);
  const templateAssignments = Number(row.template_assignments);
  return {
    foodEntries,
    foodEntryMeals,
    mealPlans,
    templateAssignments,
    totalReferences:
      foodEntries + foodEntryMeals + mealPlans + templateAssignments,
  };
}

/**
 * Reports what currently references a meal type, so the client can show exact
 * counts before asking the user to reassign or force delete.
 */
async function getMealTypeDeletionImpact(
  mealTypeId: string,
  userId: string
): Promise<MealTypeDeletionImpact> {
  const client = await getClient(userId);
  try {
    return await countMealTypeReferences(client, mealTypeId, userId);
  } finally {
    client.release();
  }
}

/**
 * Deletes a custom meal type.
 *
 * - `strict` (default): only succeeds when nothing references the type.
 * - `reassign`: moves every referencing row to `targetMealTypeId` first, so
 *   logged nutrition history is preserved and only the grouping label changes.
 * - `force`: permanently deletes the referencing rows.
 *
 * All modes run in a single transaction, and ownership is checked before any
 * mutation so a rejected delete never leaves rows already moved.
 */
async function deleteMealType(
  mealTypeId: string,
  userId: string,
  options: DeleteMealTypeOptions = {}
): Promise<DeleteMealTypeResult> {
  const mode: MealTypeDeleteMode = options.mode ?? 'strict';
  const targetMealTypeId = options.targetMealTypeId ?? null;
  log(
    'info',
    `deleteMealType in mealType.ts: id: ${mealTypeId}, mode: ${mode}`
  );
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');

    // Resolve ownership up front. Doing this before any UPDATE/DELETE is what
    // keeps a rejected system-type or foreign-type delete from mutating rows.
    const owner = await client.query(
      'SELECT user_id FROM meal_types WHERE id = $1',
      [mealTypeId]
    );
    if (owner.rows.length === 0) {
      await client.query('ROLLBACK');
      return { deleted: false, mode };
    }
    if (owner.rows[0].user_id === null) {
      throw new Error(MEAL_TYPE_SYSTEM_MESSAGE);
    }
    if (owner.rows[0].user_id !== userId) {
      await client.query('ROLLBACK');
      return { deleted: false, mode };
    }

    if (mode === 'reassign') {
      if (!targetMealTypeId || targetMealTypeId === mealTypeId) {
        throw new Error(MEAL_TYPE_INVALID_TARGET_MESSAGE);
      }
      // Same visibility rule as getAllMealTypes: own types plus system defaults.
      const target = await client.query(
        'SELECT id FROM meal_types WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)',
        [targetMealTypeId, userId]
      );
      if (target.rows.length === 0) {
        throw new Error(MEAL_TYPE_INVALID_TARGET_MESSAGE);
      }
      // food_entries and food_entry_meals move under the same predicate, which
      // keeps a container and its component entries consistent.
      await client.query(
        'UPDATE food_entries SET meal_type_id = $1 WHERE meal_type_id = $2 AND user_id = $3',
        [targetMealTypeId, mealTypeId, userId]
      );
      await client.query(
        `UPDATE food_entry_meals
         SET meal_type_id = $1,
             updated_by_user_id = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE meal_type_id = $2 AND user_id = $3`,
        [targetMealTypeId, mealTypeId, userId]
      );
      await client.query(
        `UPDATE meal_plans
         SET meal_type_id = $1, updated_at = now()
         WHERE meal_type_id = $2 AND user_id = $3`,
        [targetMealTypeId, mealTypeId, userId]
      );
      await client.query(
        `UPDATE meal_plan_template_assignments
         SET meal_type_id = $1
         WHERE meal_type_id = $2
           AND template_id IN (
             SELECT id FROM meal_plan_templates WHERE user_id = $3
           )`,
        [targetMealTypeId, mealTypeId, userId]
      );
    } else if (mode === 'force') {
      // food_entries.food_entry_meal_id references food_entry_meals ON DELETE
      // CASCADE, so deleting a container takes its children with it. Detach any
      // child that belongs to a different meal type first, otherwise the
      // cascade would destroy data the user never asked to delete.
      await client.query(
        `UPDATE food_entries
         SET food_entry_meal_id = NULL
         WHERE user_id = $2
           AND meal_type_id <> $1
           AND food_entry_meal_id IN (
             SELECT id FROM food_entry_meals
             WHERE meal_type_id = $1 AND user_id = $2
           )`,
        [mealTypeId, userId]
      );
      await client.query(
        'DELETE FROM food_entry_meals WHERE meal_type_id = $1 AND user_id = $2',
        [mealTypeId, userId]
      );
      await client.query(
        'DELETE FROM food_entries WHERE meal_type_id = $1 AND user_id = $2',
        [mealTypeId, userId]
      );
      await client.query(
        'DELETE FROM meal_plans WHERE meal_type_id = $1 AND user_id = $2',
        [mealTypeId, userId]
      );
      await client.query(
        `DELETE FROM meal_plan_template_assignments
         WHERE meal_type_id = $1
           AND template_id IN (
             SELECT id FROM meal_plan_templates WHERE user_id = $2
           )`,
        [mealTypeId, userId]
      );
    }

    const result = await client.query(
      `DELETE FROM meal_types
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [mealTypeId, userId]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return { deleted: false, mode };
    }
    await client.query('COMMIT');
    return {
      deleted: true,
      mode,
      ...(mode === 'reassign' && targetMealTypeId
        ? { reassignedTo: targetMealTypeId }
        : {}),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    if (isForeignKeyBlock(error)) {
      // Reachable even after clearing the user's own rows: FK checks bypass
      // RLS, so a delegate's entries against this type still block the delete.
      throw new Error(MEAL_TYPE_IN_USE_MESSAGE, { cause: error });
    }
    log('error', 'Error deleting meal type:', error);
    throw error;
  } finally {
    client.release();
  }
}
export { createMealType };
export { getAllMealTypes };
export { getMealTypeById };
export { updateMealType };
export { deleteMealType };
export { getMealTypeDeletionImpact };
export default {
  createMealType,
  getAllMealTypes,
  getMealTypeById,
  updateMealType,
  deleteMealType,
  getMealTypeDeletionImpact,
};
