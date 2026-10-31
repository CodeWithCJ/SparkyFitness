import { getClient } from '../db/poolManager.js';
import {
  ACTION_TAGS_MAX,
  tagActionSchema,
  type ActionTagResponse,
  type CreateActionTagBody,
  type TagAction,
  type UpdateActionTagBody,
} from '@workspace/shared';

const ACTION_TAG_COLUMNS = `id, tag_code, label, action, ask_before_running,
  last_run_at, created_at, updated_at`;

export class ActionTagLimitError extends Error {
  constructor() {
    super(`You can keep at most ${ACTION_TAGS_MAX} tags`);
    this.name = 'ActionTagLimitError';
  }
}

function toIso(value: unknown): string {
  return new Date(value as string | Date).toISOString();
}

/**
 * Null when the stored action is not one this server knows (for example after
 * a downgrade), so a row it cannot run is never handed to a runner.
 */
function mapRow(row: Record<string, unknown>): ActionTagResponse | null {
  const action = tagActionSchema.safeParse(row.action);
  if (!action.success) return null;
  return {
    id: String(row.id),
    tag_code: String(row.tag_code),
    label: String(row.label),
    action: action.data,
    ask_before_running: Boolean(row.ask_before_running),
    last_run_at: row.last_run_at ? toIso(row.last_run_at) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

export async function listActionTags(
  userId: string,
  authenticatedUserId?: string
): Promise<ActionTagResponse[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${ACTION_TAG_COLUMNS} FROM action_tags
       WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    const tags: ActionTagResponse[] = [];
    for (const row of result.rows as Record<string, unknown>[]) {
      const tag = mapRow(row);
      if (tag) tags.push(tag);
    }
    return tags;
  } finally {
    client.release();
  }
}

export async function getActionTagByCode(
  userId: string,
  tagCode: string,
  authenticatedUserId?: string
): Promise<ActionTagResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT ${ACTION_TAG_COLUMNS} FROM action_tags
       WHERE user_id = $1 AND tag_code = $2`,
      [userId, tagCode]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

/** Throws ActionTagLimitError at the cap and a unique violation (23505) for a reused code. */
export async function createActionTag(
  userId: string,
  data: CreateActionTagBody,
  authenticatedUserId?: string
): Promise<ActionTagResponse> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query('BEGIN');
    // Serialise creates per person so two at once cannot pass the cap check.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `action_tags:${userId}`,
    ]);
    const count = await client.query(
      'SELECT COUNT(*)::int AS total FROM action_tags WHERE user_id = $1',
      [userId]
    );
    if (Number(count.rows[0].total) >= ACTION_TAGS_MAX) {
      throw new ActionTagLimitError();
    }
    const inserted = await client.query(
      `INSERT INTO action_tags (
         user_id, tag_code, label, action, ask_before_running, created_by_user_id
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING ${ACTION_TAG_COLUMNS}`,
      [
        userId,
        data.tag_code,
        data.label,
        JSON.stringify(data.action),
        data.ask_before_running ?? false,
        authenticatedUserId ?? userId,
      ]
    );
    await client.query('COMMIT');
    return mapRow(inserted.rows[0]) as ActionTagResponse;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateActionTag(
  userId: string,
  id: string,
  data: UpdateActionTagBody,
  authenticatedUserId?: string
): Promise<ActionTagResponse | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE action_tags SET
         label = COALESCE($3, label),
         action = COALESCE($4::jsonb, action),
         ask_before_running = COALESCE($5, ask_before_running),
         updated_by_user_id = $6,
         updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING ${ACTION_TAG_COLUMNS}`,
      [
        id,
        userId,
        data.label ?? null,
        data.action ? JSON.stringify(data.action) : null,
        data.ask_before_running ?? null,
        authenticatedUserId ?? userId,
      ]
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  } finally {
    client.release();
  }
}

export async function deleteActionTag(
  userId: string,
  id: string,
  authenticatedUserId?: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'DELETE FROM action_tags WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export type RunClaim = { previousRunAt: Date | null };

/**
 * Claims the run in one statement: succeeds only when the tag has not run in
 * the last `debounceSeconds`. The row lock makes this hold across devices and
 * server instances. Null means a double read.
 */
export async function claimActionTagRun(
  userId: string,
  id: string,
  debounceSeconds: number,
  authenticatedUserId?: string
): Promise<RunClaim | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `UPDATE action_tags t SET last_run_at = NOW()
       FROM (
         SELECT id, last_run_at AS previous
         FROM action_tags WHERE id = $1 AND user_id = $2 FOR UPDATE
       ) o
       WHERE t.id = o.id
         AND (o.previous IS NULL
              OR o.previous < NOW() - make_interval(secs => $3))
       RETURNING o.previous AS previous_run_at`,
      [id, userId, debounceSeconds]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      previousRunAt: row.previous_run_at ? new Date(row.previous_run_at) : null,
    };
  } finally {
    client.release();
  }
}

/** Puts back the timestamp a failed run claimed, so the next tap is not dropped. */
export async function releaseActionTagRun(
  userId: string,
  id: string,
  claim: RunClaim,
  authenticatedUserId?: string
): Promise<void> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    await client.query(
      'UPDATE action_tags SET last_run_at = $3 WHERE id = $1 AND user_id = $2',
      [id, userId, claim.previousRunAt]
    );
  } finally {
    client.release();
  }
}

export type { TagAction };
