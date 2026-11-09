import type { PoolClient } from 'pg';
import type { CalorieLinkResolution } from '@workspace/shared';
import { getClient } from '../../db/poolManager.js';
import exerciseEntryRepository, {
  acquireExerciseEntrySyncLockWithClient,
} from '../../models/exerciseEntry.js';
import activityDetailsRepository from '../../models/activityDetailsRepository.js';
import {
  clearCalorieLinkOfEntryWithClient,
  lockCalorieLinkParticipantsWithClient,
  reapplyCalorieLinkWithClient,
} from '../../services/exerciseCalorieLinkService.js';
import type { HevyExercise, HevyWorkout } from './hevyTypes.js';
import {
  matchHevyWorkoutEntries,
  type StoredHevyExerciseIdentity,
} from './hevyWorkoutIdentity.js';

export interface HevyWorkoutEntry {
  data: {
    exercise_id: string;
    entry_date: string;
    entry_time: string;
    record_timezone: string;
    duration_minutes: number;
    distance: number | null;
    superset_group: number | null;
    source_id: string;
    notes: string;
    sort_order: number;
    sets: {
      set_number: number;
      set_type: string;
      weight: number | null;
      reps: number | null;
      duration: number | null;
      rpe: number | null;
    }[];
  };
  detail: { workout: Omit<HevyWorkout, 'exercises'>; exercise: HevyExercise };
}

export interface HevyWorkoutImport {
  session: {
    source_id: string;
    workout_preset_id: number;
    name: string;
    description: string;
    entry_date: string;
    notes: string;
  };
  entries: HevyWorkoutEntry[];
}

interface ExistingEntry extends StoredHevyExerciseIdentity {
  duration_minutes: number;
  manual_fields: string[];
  calorie_link_id: string | null;
  calorie_link_resolution: CalorieLinkResolution | null;
  calories_applied: number | null;
}

/** Adopt pre-identity sessions without changing the session or exercise IDs. */
async function findSession(
  client: PoolClient,
  userId: string,
  sourceId: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT p.id FROM exercise_preset_entries p
     WHERE p.user_id = $1 AND p.source = 'Hevy'
       AND (p.source_id = $2 OR (p.source_id IS NULL AND EXISTS (
         SELECT 1 FROM exercise_entries e
         WHERE e.user_id = $1 AND e.source = 'Hevy'
           AND e.exercise_preset_entry_id = p.id
           AND left(e.source_id, length($2) + 1) = $2 || '_'
       )))
     ORDER BY (p.source_id = $2) DESC NULLS LAST, p.created_at, p.id
     LIMIT 1 FOR UPDATE`,
    [userId, sourceId]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Serialize preparation and persistence with other Hevy imports, then commit
 * the session, entries, sets and raw details together. Preparation may fill the
 * reusable library; no diary row is changed until the whole workout is ready.
 */
export async function syncHevyWorkout(
  userId: string,
  actingUserId: string,
  sourceId: string,
  prepare: (client: PoolClient) => Promise<HevyWorkoutImport>
): Promise<void> {
  const client: PoolClient = await getClient(userId, actingUserId);
  try {
    await client.query('BEGIN');
    await acquireExerciseEntrySyncLockWithClient(client, userId, 'Hevy');
    if (!sourceId) throw new Error('Hevy workout has no provider identity.');
    let sessionId = await findSession(client, userId, sourceId);
    const previous = await client.query<{
      id: string;
      exercise_preset_entry_id: string | null;
    }>(
      `SELECT id, exercise_preset_entry_id FROM exercise_entries
       WHERE user_id = $1 AND source = 'Hevy'
         AND (exercise_preset_entry_id = $2
           OR left(source_id, length($3) + 1) = $3 || '_')`,
      [userId, sessionId, sourceId]
    );
    // Library deletion locks the session and calorie participants before its
    // library rows. Preparation must follow that order when it fills metadata.
    await lockCalorieLinkParticipantsWithClient(
      client,
      userId,
      previous.rows.map((row) => row.id)
    );
    const { session, entries } = await prepare(client);
    const sourceIds = entries.map((entry) => entry.data.source_id);
    if (
      session.source_id !== sourceId ||
      new Set(sourceIds).size !== entries.length
    ) {
      throw new Error(
        'Hevy workout has a missing or duplicate provider identity.'
      );
    }
    if (sessionId) {
      await client.query(
        `UPDATE exercise_preset_entries
         SET source_id = $3, workout_preset_id = $4, name = $5,
             description = $6, entry_date = $7, updated_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [
          sessionId,
          userId,
          session.source_id,
          session.workout_preset_id,
          session.name,
          session.description,
          session.entry_date,
        ]
      );
    } else {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO exercise_preset_entries
         (user_id, workout_preset_id, name, description, entry_date,
          created_by_user_id, notes, source, source_id, workout_format)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'Hevy', $8,
                 COALESCE((SELECT workout_format FROM workout_presets WHERE id = $2), 'standard'))
         RETURNING id`,
        [
          userId,
          session.workout_preset_id,
          session.name,
          session.description,
          session.entry_date,
          actingUserId,
          session.notes,
          session.source_id,
        ]
      );
      sessionId = inserted.rows[0]!.id;
    }

    // Re-read after the allocation lock: a concurrent link may have committed.
    const linked = await client.query<ExistingEntry>(
      `SELECT e.id, e.exercise_id, e.source_id, e.calorie_link_id,
              e.calorie_link_resolution, e.calories_applied::float8 AS calories_applied,
              e.duration_minutes::float8 AS duration_minutes, e.manual_fields,
              d.detail_data -> 'exercise' AS provider_exercise,
              COALESCE(d.detail_data #>> '{exercise,title}', e.exercise_name) AS exercise_title,
              COALESCE(NULLIF(d.detail_data #>> '{exercise,exercise_template_id}', ''),
                d.detail_data #>> '{identity,exercise_template_id}',
                CASE WHEN x.source = 'Hevy' THEN x.source_id END) AS template_id
       FROM exercise_entries e LEFT JOIN exercises x ON x.id = e.exercise_id
       LEFT JOIN LATERAL (
         SELECT detail_data FROM exercise_entry_activity_details
         WHERE exercise_entry_id = e.id AND provider_name = 'Hevy'
           AND detail_type = 'full_activity_data'
         ORDER BY created_at DESC, id LIMIT 1
       ) d ON TRUE
       WHERE e.user_id = $1 AND e.id = ANY($2::uuid[])
       ORDER BY e.sort_order ASC NULLS LAST, e.created_at, e.id
       FOR UPDATE OF e`,
      [userId, previous.rows.map((row) => row.id)]
    );
    const link = linked.rows.find((row) => row.calorie_link_id);
    const customTotal = linked.rows.reduce(
      (sum, row) => sum + (row.calories_applied ?? 0),
      0
    );
    if (entries.length === 0 && link) {
      await clearCalorieLinkOfEntryWithClient(client, userId, link.id);
    }

    const retained: string[] = [];
    const matches = matchHevyWorkoutEntries(
      entries.map((item) => ({
        exercise_id: item.data.exercise_id,
        source_id: item.data.source_id,
        exercise: item.detail.exercise,
      })),
      linked.rows
    );
    const isUntimed = (item: HevyWorkoutEntry) =>
      !item.detail.exercise.sets?.some(
        (set) => (set.duration_seconds ?? 0) > 0
      );
    const untimedDuration = entries.reduce(
      (sum, item) => sum + (isUntimed(item) ? item.data.duration_minutes : 0),
      0
    );
    let durationOwner = matches.findIndex(
      (row, index) =>
        row?.manual_fields?.includes('duration_minutes') &&
        row.duration_minutes > 0 &&
        isUntimed(entries[index]!)
    );
    if (durationOwner < 0) {
      durationOwner = matches.findIndex(
        (row, index) =>
          (row?.duration_minutes ?? 0) > 0 && isUntimed(entries[index]!)
      );
    }
    if (durationOwner < 0) {
      durationOwner = matches.findIndex(
        (row, index) =>
          row?.manual_fields?.includes('duration_minutes') &&
          isUntimed(entries[index]!)
      );
    }
    if (durationOwner < 0) {
      durationOwner = entries.findIndex(
        (item) => isUntimed(item) && item.data.duration_minutes > 0
      );
    }
    const reservedIds = new Set(
      linked.rows.flatMap((row) => (row.source_id ? [row.source_id] : []))
    );
    for (const [index, item] of entries.entries()) {
      const match = matches[index];
      let sourceId = match?.source_id || item.data.source_id;
      if (!match?.source_id) {
        let replacement = 0;
        while (reservedIds.has(sourceId)) {
          sourceId = `${item.data.source_id}:replacement:${++replacement}`;
        }
        reservedIds.add(sourceId);
      }
      if (match && !match.source_id) {
        await client.query(
          'UPDATE exercise_entries SET source_id = $3 WHERE id = $1 AND user_id = $2',
          [match.id, userId, sourceId]
        );
      }
      // Re-syncs must still repair the muscle snapshots populated by Hevy's
      // template import, including when the library exercise itself is unchanged.
      const preserveSnapshot = match?.exercise_id === null;
      const snapshot = preserveSnapshot
        ? { rows: [] }
        : await client.query<Record<string, unknown>>(
            `SELECT name AS exercise_name, calories_per_hour, category, force, level,
                mechanic, equipment, primary_muscles, secondary_muscles,
                instructions, images, modality
         FROM exercises WHERE id = $1`,
            [item.data.exercise_id]
          );
      const { entry } =
        await exerciseEntryRepository._createExerciseEntryWithClient(
          client,
          userId,
          {
            ...snapshot.rows[0],
            ...item.data,
            exercise_id: preserveSnapshot ? null : item.data.exercise_id,
            source_id: sourceId,
            // A correction stays with its exercise; reordering must not also
            // allocate the full workout duration to the new first exercise.
            duration_minutes: isUntimed(item)
              ? index === durationOwner
                ? untimedDuration
                : 0
              : item.data.duration_minutes,
          },
          actingUserId,
          'Hevy',
          sessionId
        );
      const id: string = entry.id;
      retained.push(id);
      await client.query(
        `UPDATE exercise_entries SET exercise_preset_entry_id = $3,
           calorie_link_id = $4::uuid, calorie_link_resolution = $5
         WHERE id = $1 AND user_id = $2`,
        [
          id,
          userId,
          sessionId,
          link?.calorie_link_id ?? null,
          link?.calorie_link_resolution ?? null,
        ]
      );
      await activityDetailsRepository._deleteActivityDetailsByEntryIdAndProviderWithClient(
        client,
        userId,
        id,
        'Hevy',
        'full_activity_data'
      );
      await activityDetailsRepository._createActivityDetailWithClient(client, {
        exercise_entry_id: id,
        provider_name: 'Hevy',
        detail_type: 'full_activity_data',
        detail_data: {
          ...item.detail,
          // Keep proven identity separately from the unchanged provider payload
          // when an older replay omits its template ID.
          identity: {
            exercise_template_id:
              item.detail.exercise.exercise_template_id ||
              match?.template_id ||
              null,
          },
        },
        created_by_user_id: actingUserId,
        updated_by_user_id: actingUserId,
      });
    }
    await client.query(
      `DELETE FROM exercise_entries WHERE user_id = $1 AND source = 'Hevy'
       AND id = ANY($2::uuid[]) AND id <> ALL($3::uuid[])`,
      [userId, previous.rows.map((row) => row.id), retained]
    );
    if (retained.length > 0 && link?.calorie_link_id) {
      await reapplyCalorieLinkWithClient(
        client,
        userId,
        link.calorie_link_id,
        customTotal
      );
    }
    const supersededSessions = [
      ...new Set(
        previous.rows.flatMap((row) =>
          row.exercise_preset_entry_id &&
          row.exercise_preset_entry_id !== sessionId
            ? [row.exercise_preset_entry_id]
            : []
        )
      ),
    ];
    if (supersededSessions.length > 0) {
      // The participant locks also hold these parent rows. Only remove known
      // legacy shells; notes, feedback and other children remain diary data.
      await client.query(
        `DELETE FROM exercise_preset_entries p
         WHERE p.user_id = $1 AND p.id = ANY($2::uuid[])
           AND p.source = 'Hevy' AND p.source_id IS NULL
           AND p.workout_format = 'standard'
           AND (NULLIF(p.notes, '') IS NULL
             OR p.notes = 'Hevy Workout Session: ' || p.name)
           AND NULLIF(p.location, '') IS NULL
           AND (NULLIF(p.description, '') IS NULL
             OR p.description = $3
             OR p.description = 'Logged session of ' || p.name)
           AND NOT EXISTS (SELECT 1 FROM exercise_entries e
             WHERE e.exercise_preset_entry_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM exercise_entry_activity_details d
             WHERE d.exercise_preset_entry_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM workout_feedback f
             WHERE f.exercise_preset_entry_id = p.id)`,
        [userId, supersededSessions, session.description]
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
