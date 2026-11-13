import type { WorkoutFeedbackDifficulty } from '@workspace/shared';
import { getClient } from '../db/poolManager.js';

/**
 * Persistence for workout feedback and the adaptive-suggestions setting
 * (issue #1560). RLS on `workout_feedback` follows the diary: the owner and
 * diary/report delegates read it, the owner and can_manage_diary delegates
 * write it.
 */

export interface FeedbackValues {
  difficulty: WorkoutFeedbackDifficulty | null;
  pain: boolean;
  painNote: string | null;
}

export interface StoredFeedbackRow {
  exercise_preset_entry_id: string | null;
  exercise_entry_id: string | null;
  difficulty: WorkoutFeedbackDifficulty | null;
  pain: boolean;
  pain_note: string | null;
  updated_at: Date;
}

export interface SessionOwnership {
  userId: string;
  exerciseEntryIds: string[];
}

/** Feedback with neither a difficulty nor pain carries no signal. */
export function isEmptyFeedback(values: FeedbackValues): boolean {
  return (
    (values.difficulty === null || values.difficulty === undefined) &&
    !values.pain
  );
}

/**
 * The session's owner and its exercise entry ids, or null when the session
 * does not exist or is not visible to the caller.
 */
export async function getSessionOwnership(
  userId: string,
  authenticatedUserId: string,
  presetEntryId: string
): Promise<SessionOwnership | null> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const session = await client.query(
      'SELECT user_id FROM exercise_preset_entries WHERE id = $1',
      [presetEntryId]
    );
    const row = session.rows[0] as { user_id: string } | undefined;
    if (!row) return null;
    const entries = await client.query(
      'SELECT id FROM exercise_entries WHERE exercise_preset_entry_id = $1',
      [presetEntryId]
    );
    return {
      userId: row.user_id,
      exerciseEntryIds: (entries.rows as { id: string }[]).map((e) => e.id),
    };
  } finally {
    client.release();
  }
}

export async function getSessionFeedbackRows(
  userId: string,
  authenticatedUserId: string,
  presetEntryId: string
): Promise<StoredFeedbackRow[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT wf.exercise_preset_entry_id, wf.exercise_entry_id, wf.difficulty,
              wf.pain, wf.pain_note, wf.updated_at
         FROM workout_feedback wf
         LEFT JOIN exercise_entries ee ON ee.id = wf.exercise_entry_id
        WHERE wf.exercise_preset_entry_id = $1
           OR ee.exercise_preset_entry_id = $1
        ORDER BY wf.exercise_entry_id NULLS FIRST, wf.created_at`,
      [presetEntryId]
    );
    return result.rows as StoredFeedbackRow[];
  } finally {
    client.release();
  }
}

/**
 * Replaces all feedback for one session in a single transaction: the
 * session row, and one row per exercise entry in `exercises`. Exercise
 * entries of the session not listed (or listed with empty feedback) lose
 * any feedback they had. Callers validate that every listed entry belongs
 * to the session.
 */
export async function replaceSessionFeedback(
  ownerUserId: string,
  authenticatedUserId: string,
  presetEntryId: string,
  session: FeedbackValues | null,
  exercises: Map<string, FeedbackValues>,
  sessionExerciseEntryIds: string[]
): Promise<void> {
  const client = await getClient(ownerUserId, authenticatedUserId);
  try {
    await client.query('BEGIN');

    if (session === null || session === undefined || isEmptyFeedback(session)) {
      await client.query(
        'DELETE FROM workout_feedback WHERE exercise_preset_entry_id = $1',
        [presetEntryId]
      );
    } else {
      await client.query(
        `INSERT INTO workout_feedback (
           user_id, exercise_preset_entry_id, difficulty, pain, pain_note,
           created_by_user_id, updated_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (exercise_preset_entry_id)
           WHERE exercise_preset_entry_id IS NOT NULL
         DO UPDATE SET
           difficulty = EXCLUDED.difficulty,
           pain = EXCLUDED.pain,
           pain_note = EXCLUDED.pain_note,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = now()`,
        [
          ownerUserId,
          presetEntryId,
          session.difficulty,
          session.pain,
          session.painNote,
          authenticatedUserId,
        ]
      );
    }

    const keep = [...exercises.entries()].filter(
      ([, values]) => !isEmptyFeedback(values)
    );
    const keepIds = new Set(keep.map(([id]) => id));
    const clearIds = sessionExerciseEntryIds.filter((id) => !keepIds.has(id));
    if (clearIds.length > 0) {
      await client.query(
        'DELETE FROM workout_feedback WHERE exercise_entry_id = ANY($1::uuid[])',
        [clearIds]
      );
    }
    for (const [exerciseEntryId, values] of keep) {
      await client.query(
        `INSERT INTO workout_feedback (
           user_id, exercise_entry_id, difficulty, pain, pain_note,
           created_by_user_id, updated_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (exercise_entry_id)
           WHERE exercise_entry_id IS NOT NULL
         DO UPDATE SET
           difficulty = EXCLUDED.difficulty,
           pain = EXCLUDED.pain,
           pain_note = EXCLUDED.pain_note,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = now()`,
        [
          ownerUserId,
          exerciseEntryId,
          values.difficulty,
          values.pain,
          values.painNote,
          authenticatedUserId,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAdaptiveSuggestionsSetting(
  userId: string,
  authenticatedUserId: string
): Promise<boolean> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'SELECT adaptive_workout_suggestions FROM user_preferences WHERE user_id = $1',
      [userId]
    );
    const row = result.rows[0] as
      { adaptive_workout_suggestions: boolean } | undefined;
    // No preferences row yet means the column default: on.
    return row?.adaptive_workout_suggestions ?? true;
  } finally {
    client.release();
  }
}

export async function setAdaptiveSuggestionsSetting(
  userId: string,
  enabled: boolean
): Promise<boolean> {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `INSERT INTO user_preferences (
         user_id, adaptive_workout_suggestions, created_at, updated_at
       ) VALUES ($1, $2, now(), now())
       ON CONFLICT (user_id) DO UPDATE SET
         adaptive_workout_suggestions = EXCLUDED.adaptive_workout_suggestions,
         updated_at = now()
       RETURNING adaptive_workout_suggestions`,
      [userId, enabled]
    );
    return (result.rows[0] as { adaptive_workout_suggestions: boolean })
      .adaptive_workout_suggestions;
  } finally {
    client.release();
  }
}

export interface RecentPerformanceRow {
  exercise_id: string;
  exercise_entry_id: string;
  entry_date: string;
  exercise_difficulty: WorkoutFeedbackDifficulty | null;
  exercise_pain: boolean | null;
  session_difficulty: WorkoutFeedbackDifficulty | null;
  session_pain: boolean | null;
  /** The session named specific exercises for its pain. */
  session_pain_targeted: boolean;
  avg_rpe: number | null;
  avg_rir: number | null;
}

/**
 * The most recent performances (newest first, at most `perExercise` each)
 * of each exercise between `sinceDay` and `untilDay`, with the feedback that
 * applies to them. The upper bound keeps pre-created future plan entries
 * out; `excludePresetEntryId` keeps the workout in progress out.
 * `evidenceAfter` keeps only performances logged, or whose feedback was
 * recorded, after that instant, so feedback already acted on is not reused.
 */
export async function getRecentPerformancesWithFeedback(
  userId: string,
  authenticatedUserId: string,
  exerciseIds: string[],
  sinceDay: string,
  untilDay: string,
  perExercise: number,
  excludePresetEntryId: string | null,
  evidenceAfter: Date | null = null
): Promise<RecentPerformanceRow[]> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `WITH recent AS (
         SELECT ee.id, ee.exercise_id, ee.entry_date, ee.exercise_preset_entry_id,
                ee.created_at,
                row_number() OVER (
                  PARTITION BY ee.exercise_id
                  ORDER BY ee.entry_date DESC, ee.created_at DESC, ee.id DESC
                ) AS rn
           FROM exercise_entries ee
          WHERE ee.user_id = $1
            AND ee.exercise_id = ANY($2::uuid[])
            AND ee.entry_date >= $3::date
            AND ee.entry_date <= $4::date
            AND ($6::uuid IS NULL OR ee.exercise_preset_entry_id IS DISTINCT FROM $6::uuid)
       )
       SELECT r.exercise_id,
              r.id AS exercise_entry_id,
              r.entry_date,
              xf.difficulty AS exercise_difficulty,
              xf.pain AS exercise_pain,
              sf.difficulty AS session_difficulty,
              sf.pain AS session_pain,
              EXISTS (
                SELECT 1
                  FROM workout_feedback f2
                  JOIN exercise_entries e2 ON e2.id = f2.exercise_entry_id
                 WHERE r.exercise_preset_entry_id IS NOT NULL
                   AND e2.exercise_preset_entry_id = r.exercise_preset_entry_id
                   AND f2.pain
              ) AS session_pain_targeted,
              (SELECT avg(s.rpe)::float8
                 FROM exercise_entry_sets s
                WHERE s.exercise_entry_id = r.id
                  AND s.rpe IS NOT NULL
                  AND coalesce(s.set_type, '') NOT ILIKE '%warm%') AS avg_rpe,
              (SELECT avg(s.rir)::float8
                 FROM exercise_entry_sets s
                WHERE s.exercise_entry_id = r.id
                  AND s.rir IS NOT NULL
                  AND coalesce(s.set_type, '') NOT ILIKE '%warm%') AS avg_rir
         FROM recent r
         LEFT JOIN workout_feedback xf ON xf.exercise_entry_id = r.id
         LEFT JOIN workout_feedback sf
                ON sf.exercise_preset_entry_id = r.exercise_preset_entry_id
        WHERE r.rn <= $5
          AND ($7::timestamptz IS NULL
               OR r.created_at > $7::timestamptz
               OR xf.updated_at > $7::timestamptz
               OR sf.updated_at > $7::timestamptz)
        ORDER BY r.exercise_id, r.rn`,
      [
        userId,
        exerciseIds,
        sinceDay,
        untilDay,
        perExercise,
        excludePresetEntryId,
        evidenceAfter,
      ]
    );
    return result.rows as RecentPerformanceRow[];
  } finally {
    client.release();
  }
}

/** Distinct days each exercise was logged between the two days (inclusive). */
export async function getExerciseSessionCounts(
  userId: string,
  authenticatedUserId: string,
  exerciseIds: string[],
  sinceDay: string,
  untilDay: string,
  excludePresetEntryId: string | null
): Promise<Map<string, number>> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      `SELECT exercise_id, COUNT(DISTINCT entry_date)::int AS sessions
         FROM exercise_entries
        WHERE user_id = $1
          AND exercise_id = ANY($2::uuid[])
          AND entry_date >= $3::date
          AND entry_date <= $4::date
          AND ($5::uuid IS NULL OR exercise_preset_entry_id IS DISTINCT FROM $5::uuid)
        GROUP BY exercise_id`,
      [userId, exerciseIds, sinceDay, untilDay, excludePresetEntryId]
    );
    return new Map(
      (result.rows as { exercise_id: string; sessions: number }[]).map(
        (row) => [row.exercise_id, row.sessions]
      )
    );
  } finally {
    client.release();
  }
}

/** The session (preset entry) an exercise entry belongs to, if any. */
export async function getExerciseEntrySessionId(
  userId: string,
  authenticatedUserId: string,
  exerciseEntryId: string
): Promise<{ found: boolean; presetEntryId: string | null }> {
  const client = await getClient(userId, authenticatedUserId);
  try {
    const result = await client.query(
      'SELECT exercise_preset_entry_id FROM exercise_entries WHERE id = $1',
      [exerciseEntryId]
    );
    const row = result.rows[0] as
      { exercise_preset_entry_id: string | null } | undefined;
    return row
      ? { found: true, presetEntryId: row.exercise_preset_entry_id }
      : { found: false, presetEntryId: null };
  } finally {
    client.release();
  }
}
