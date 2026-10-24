import { getClient } from '../../db/poolManager.js';
import type { QueryResult } from 'pg';

export interface HevyLibraryExercise {
  id: string;
  user_id: string | null;
  source: string | null;
  source_id?: string | null;
}

async function findByTemplateId(
  userId: string,
  templateId: string
): Promise<HevyLibraryExercise | null> {
  const client = await getClient(userId);
  try {
    const result: QueryResult<HevyLibraryExercise> = await client.query(
      `SELECT id, user_id, source, source_id FROM exercises
       WHERE user_id = $1 AND source = 'Hevy' AND source_id = $2
       ORDER BY created_at, id LIMIT 1`,
      [userId, templateId]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

async function fillMissingMuscles(
  userId: string,
  exerciseId: string,
  templateId: string,
  primary: readonly string[],
  secondary: readonly string[]
): Promise<void> {
  const client = await getClient(userId);
  try {
    // Fill empty legacy columns in the same write that claims the template id.
    // Testing emptiness in SQL preserves edits committed while a sync is fetching.
    await client.query(
      `UPDATE exercises SET
         primary_muscles = CASE WHEN
           regexp_replace(COALESCE(primary_muscles, ''), '\\s', '', 'g') IN ('', '[]', 'null')
           THEN $1 ELSE primary_muscles END,
         secondary_muscles = CASE WHEN
           regexp_replace(COALESCE(secondary_muscles, ''), '\\s', '', 'g') IN ('', '[]', 'null')
           THEN $2 ELSE secondary_muscles END,
         source_id = $3, updated_at = NOW()
       WHERE id = $4 AND user_id = $5 AND source = 'Hevy'
         AND (source_id IS NULL OR source_id = '' OR source_id = $3)`,
      [
        JSON.stringify(primary),
        JSON.stringify(secondary),
        templateId,
        exerciseId,
        userId,
      ]
    );
  } finally {
    client.release();
  }
}

async function findLegacyByName(
  userId: string,
  name: string
): Promise<HevyLibraryExercise | null> {
  const client = await getClient(userId);
  try {
    const result: QueryResult<HevyLibraryExercise> = await client.query(
      `SELECT id, user_id, source, source_id FROM exercises
       WHERE user_id = $1 AND name = $2 AND source = 'Hevy'
         AND (source_id IS NULL OR source_id = '')
       ORDER BY created_at, id LIMIT 1`,
      [userId, name]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

export default { findByTemplateId, findLegacyByName, fillMissingMuscles };
