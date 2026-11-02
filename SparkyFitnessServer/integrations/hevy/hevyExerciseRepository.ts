import { getClient } from '../../db/poolManager.js';
import type { QueryResult } from 'pg';

export interface HevyLibraryExercise {
  id: string;
  user_id: string | null;
  source: string | null;
  source_id?: string | null;
}

/** Reuse private library history without claiming a different Hevy identity. */
async function findOwnedByName(
  userId: string,
  name: string,
  includeLinkedHevy = false
): Promise<HevyLibraryExercise | null> {
  const client = await getClient(userId);
  try {
    const result: QueryResult<HevyLibraryExercise> = await client.query(
      `SELECT id, user_id, source, source_id FROM exercises
       WHERE user_id = $1 AND name = $2
         ${includeLinkedHevy ? '' : "AND source IS DISTINCT FROM 'Hevy'"}
       ORDER BY created_at, id LIMIT 1`,
      [userId, name]
    );
    return result.rows[0] ?? null;
  } finally {
    client.release();
  }
}

/** Empty primary muscles must be retried after a best-effort metadata failure. */
async function findTemplateIdsWithMuscles(
  userId: string,
  templateIds: readonly string[]
): Promise<string[]> {
  if (templateIds.length === 0) return [];
  const client = await getClient(userId);
  try {
    const result: QueryResult<{ source_id: string }> = await client.query(
      `SELECT DISTINCT source_id FROM exercises
       WHERE user_id = $1 AND source = 'Hevy' AND source_id = ANY($2::text[])
         AND regexp_replace(COALESCE(primary_muscles, ''), '\\s', '', 'g') NOT IN ('', '[]', 'null')`,
      [userId, templateIds]
    );
    return result.rows.map((row) => row.source_id);
  } finally {
    client.release();
  }
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
         AND (source_id IS NULL OR source_id = '' OR source_id = $3)
         AND (source_id IS NULL OR source_id = ''
           OR (regexp_replace(COALESCE(primary_muscles, ''), '\\s', '', 'g') IN ('', '[]', 'null') AND $1::text <> '[]')
           OR (regexp_replace(COALESCE(secondary_muscles, ''), '\\s', '', 'g') IN ('', '[]', 'null') AND $2::text <> '[]'))`,
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

export default {
  findByTemplateId,
  findLegacyByName,
  findOwnedByName,
  findTemplateIdsWithMuscles,
  fillMissingMuscles,
};
