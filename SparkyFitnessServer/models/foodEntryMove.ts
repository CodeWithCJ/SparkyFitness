import type { MoveDiaryEntriesBody } from '@workspace/shared';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import { ValidationError } from '../utils/errors.js';

function selectionChanged() {
  return Object.assign(
    new Error('One or more selected entries changed. Refresh the diary.'),
    { statusCode: 409 }
  );
}

export async function moveDiaryEntries(
  userId: string,
  actorId: string,
  {
    foodEntryIds,
    loggedMealIds,
    sourceDate,
    targetDate,
    targetMealTypeId,
  }: MoveDiaryEntriesBody
): Promise<void> {
  const client: PoolClient = await getClient(userId, actorId);
  let discardClient = false;

  try {
    await client.query('BEGIN');

    const destination = await client.query(
      `SELECT id FROM meal_types
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [targetMealTypeId, userId]
    );
    if (!destination.rowCount) {
      throw new ValidationError('The destination meal type is unavailable.');
    }

    const moveValues = [
      targetDate,
      targetMealTypeId,
      actorId,
      userId,
      loggedMealIds,
      sourceDate,
    ];

    if (loggedMealIds.length) {
      // The parent and all components move together. Keep their IDs and
      // nutrition snapshots so moving is safe to retry after a timeout.
      const meals = await client.query(
        `UPDATE food_entry_meals
         SET entry_date = $1, meal_type_id = $2,
             updated_by_user_id = $3, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $4 AND id = ANY($5::uuid[])
           AND (entry_date = $6::date OR (entry_date = $1 AND meal_type_id = $2))`,
        moveValues
      );
      if (meals.rowCount !== loggedMealIds.length) throw selectionChanged();
    }

    const { rows } = await client.query<{ food_entry_meal_id: string | null }>(
      `UPDATE food_entries
       SET entry_date = $1, meal_type_id = $2, updated_by_user_id = $3
       WHERE user_id = $4
         AND (food_entry_meal_id = ANY($5::uuid[])
              OR (id = ANY($7::uuid[]) AND food_entry_meal_id IS NULL
                  AND (entry_date = $6::date OR (entry_date = $1 AND meal_type_id = $2))))
       RETURNING food_entry_meal_id`,
      [...moveValues, foodEntryIds]
    );

    const standaloneCount = rows.filter(
      (row) => row.food_entry_meal_id === null
    ).length;
    if (standaloneCount !== foodEntryIds.length) throw selectionChanged();

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discardClient = true;
    }
    throw error;
  } finally {
    client.release(discardClient);
  }
}
