import type { MoveDiaryEntriesBody } from '@workspace/shared';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  lockWaterAggregates,
  recomputeWaterAggregate,
} from './measurementRepository.js';
import { ValidationError } from '../utils/errors.js';

function selectionChanged() {
  return Object.assign(
    new Error('One or more selected entries changed. Refresh the diary.'),
    { statusCode: 409 }
  );
}

async function moveLinkedWaterEntries(
  client: PoolClient,
  userId: string,
  actorId: string,
  foodEntryIds: string[],
  targetDate: string
): Promise<void> {
  const { rows: linked } = await client.query<{
    id: string;
    entryDate: string;
    source: string;
  }>(
    `SELECT id, entry_date::text AS "entryDate", source
     FROM water_intake_entries
     WHERE user_id = $1 AND food_entry_id = ANY($2::uuid[])
       AND entry_date <> $3::date`,
    [userId, foodEntryIds, targetDate]
  );
  if (linked.length === 0) return;

  const totals = new Map<string, { entryDate: string; source: string }>();
  for (const { entryDate, source } of linked) {
    totals.set(`${entryDate}/${source}`, { entryDate, source });
    totals.set(`${targetDate}/${source}`, { entryDate: targetDate, source });
  }
  await lockWaterAggregates(client, userId, [...totals.values()]);

  // Use the same date and source for each row as the totals we locked.
  const moved = await client.query(
    `UPDATE water_intake_entries AS entry
     SET entry_date = $1
     FROM unnest($3::uuid[], $4::date[], $5::text[])
       AS previous(id, entry_date, source)
     WHERE entry.user_id = $2 AND entry.id = previous.id
       AND entry.entry_date = previous.entry_date AND entry.source = previous.source`,
    [
      targetDate,
      userId,
      linked.map((entry) => entry.id),
      linked.map((entry) => entry.entryDate),
      linked.map((entry) => entry.source),
    ]
  );
  if (moved.rowCount !== linked.length) throw selectionChanged();

  for (const { entryDate, source } of totals.values()) {
    await recomputeWaterAggregate(client, userId, actorId, entryDate, source);
  }
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

    const { rows } = await client.query<{
      id: string;
      food_entry_meal_id: string | null;
    }>(
      `UPDATE food_entries
       SET entry_date = $1, meal_type_id = $2, updated_by_user_id = $3
       WHERE user_id = $4
         AND (food_entry_meal_id = ANY($5::uuid[])
              OR (id = ANY($7::uuid[]) AND food_entry_meal_id IS NULL
                  AND (entry_date = $6::date OR (entry_date = $1 AND meal_type_id = $2))))
       RETURNING id, food_entry_meal_id`,
      [...moveValues, foodEntryIds]
    );

    const standaloneCount = rows.filter(
      (row) => row.food_entry_meal_id === null
    ).length;
    if (standaloneCount !== foodEntryIds.length) throw selectionChanged();

    if (sourceDate !== targetDate && rows.length > 0) {
      await moveLinkedWaterEntries(
        client,
        userId,
        actorId,
        rows.map((row) => row.id),
        targetDate
      );
    }

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
