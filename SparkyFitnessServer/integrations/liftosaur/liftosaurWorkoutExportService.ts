import crypto from 'node:crypto';
import axios from 'axios';
import { getClient } from '../../db/poolManager.js';
import { log } from '../../config/logging.js';
import { localDateTimeToUtc, instantToDay } from '@workspace/shared';
import { serializeLiftohistory } from './liftohistorySerializer.js';
import {
  LiftohistoryExportWorkout,
  LiftohistoryExportExercise,
  LiftohistoryExportSet,
} from './liftosaurTypes.js';

/** Default secure base URL for Liftosaur API */
export const DEFAULT_LIFTOSAUR_API_BASE_URL = 'https://www.liftosaur.com';

/**
 * Validates and resolves the Liftosaur API base URL.
 *
 * Security Guarantee:
 * Strictly enforces HTTPS protocol for any configured override
 * (SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL) to guarantee that user API keys
 * and sensitive workout/health data are never transmitted over unencrypted HTTP.
 *
 * Localhost exception:
 * 'http://localhost' and 'http://127.0.0.1' are permitted solely in non-production
 * environments (test/development) to support local test mock servers.
 *
 * @throws Error if the configured URL is invalid or uses an insecure non-HTTPS scheme.
 */
export function getValidatedLiftosaurBaseUrl(): string {
  const configured = process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL;
  if (!configured || configured.trim() === '') {
    return DEFAULT_LIFTOSAUR_API_BASE_URL;
  }

  const trimmed = configured.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    throw new Error(
      `Invalid SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL: '${trimmed}'. Must be a valid URL.`,
      { cause: err }
    );
  }

  const isLocalhost =
    parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  const isTestOrDev =
    process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

  if (parsed.protocol !== 'https:') {
    if (!isLocalhost || !isTestOrDev) {
      throw new Error(
        `Insecure Liftosaur API base URL rejected: '${trimmed}'. HTTPS is strictly required to protect API credentials.`
      );
    }
  }

  return trimmed.replace(/\/+$/, '');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ExerciseEntryRow {
  id: string;
  user_id: string;
  exercise_name: string;
  entry_date: string | Date;
  entry_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  source: string | null;
  exercise_preset_entry_id: string | null;
  preset_name: string | null;
}

interface ExerciseSetRow {
  set_number: number;
  set_type: string | null;
  reps: number | null;
  weight: number | null;
  rpe: number | null;
  duration: number | null;
  notes: string | null;
}

/**
 * Posts a serialized workout document to the Liftosaur REST API v1.
 *
 * Security and Reliability:
 * 1. Validates the endpoint protocol via getValidatedLiftosaurBaseUrl() before sending.
 * 2. Attaches an Idempotency-Key header carrying the unique export claim ID so network
 *    timeouts or gateway retries cannot duplicate workouts in Liftosaur.
 * 3. Enforces a 10-second timeout to avoid unbounded connection hangs.
 *
 * @param apiKey The user's decrypted Liftosaur API key.
 * @param workoutText Serialized Liftohistory workout document.
 * @param claimId Unique claim identifier used as the provider idempotency key.
 * @returns true if accepted by Liftosaur; false if rejected or failed.
 */
async function postWorkoutToLiftosaur(
  apiKey: string,
  workoutText: string,
  claimId: string
): Promise<boolean> {
  try {
    const baseUrl = getValidatedLiftosaurBaseUrl();
    await axios.post(
      `${baseUrl}/api/v1/history`,
      { text: workoutText },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': claimId,
        },
        timeout: 10000,
      }
    );
    return true;
  } catch (err) {
    log(
      'error',
      `[liftosaurWorkoutExport] Failed to post workout to Liftosaur: ${errorMessage(err)}`
    );
    return false;
  }
}

/**
 * Export non-Liftosaur workouts from SparkyFitness to Liftosaur.
 */
export async function exportWorkoutsToLiftosaur(
  userId: string,
  apiKey: string,
  tz: string,
  startDate?: string | null,
  endDate?: string | null
): Promise<number> {
  const client = await getClient(userId);
  let exportedCount = 0;

  try {
    // 1. Fetch eligible exercise entries excluding Liftosaur-originated rows and already exported rows.
    // Also ignores in-progress export claims unless they have exceeded the 15-minute lease timeout.
    const query = `
      SELECT ee.id, ee.user_id, ee.exercise_name, ee.entry_date, ee.entry_time,
             ee.duration_minutes, ee.notes, ee.source, ee.exercise_preset_entry_id,
             epe.name as preset_name
      FROM exercise_entries ee
      LEFT JOIN exercise_preset_entries epe ON epe.id = ee.exercise_preset_entry_id
      WHERE ee.user_id = $1
        AND (ee.source IS NULL OR LOWER(ee.source) != 'liftosaur')
        AND (
          ee.notes IS NULL OR (
            ee.notes NOT LIKE '%[liftosaur_exported%'
            AND (ee.notes NOT LIKE '%[liftosaur_exporting%' OR ee.updated_at < NOW() - INTERVAL '15 minutes')
          )
        )
        AND ($2::date IS NULL OR ee.entry_date >= $2)
        AND ($3::date IS NULL OR ee.entry_date <= $3)
      ORDER BY ee.entry_date ASC, ee.entry_time ASC NULLS LAST, ee.sort_order ASC, ee.created_at ASC
    `;
    const res = (await client.query(query, [
      userId,
      startDate || null,
      endDate || null,
    ])) as { rows: ExerciseEntryRow[] };

    if (res.rows.length === 0) {
      return 0;
    }

    // 2. Group entries into distinct workout sessions
    const sessionMap = new Map<string, ExerciseEntryRow[]>();
    for (const row of res.rows) {
      const dayStr =
        row.entry_date instanceof Date
          ? instantToDay(row.entry_date, tz)
          : String(row.entry_date).slice(0, 10);
      const timeStr = row.entry_time ? row.entry_time.slice(0, 5) : '00:00';
      const sessionKey = row.exercise_preset_entry_id
        ? `preset_${row.exercise_preset_entry_id}`
        : `adhoc_${dayStr}_${timeStr}`;

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, []);
      }
      sessionMap.get(sessionKey)!.push(row);
    }

    // 3. For each session, fetch sets, obtain a durable claim, and construct export workout
    for (const [, entries] of sessionMap.entries()) {
      if (entries.length === 0) continue;

      const firstEntry = entries[0]!;
      const dayStr =
        firstEntry.entry_date instanceof Date
          ? instantToDay(firstEntry.entry_date, tz)
          : String(firstEntry.entry_date).slice(0, 10);
      const timeStr = firstEntry.entry_time
        ? firstEntry.entry_time.length === 5
          ? `${firstEntry.entry_time}:00`
          : firstEntry.entry_time
        : '12:00:00';

      const sessionUtcInstant = localDateTimeToUtc(`${dayStr}T${timeStr}`, tz);

      let totalDurationMinutes = 0;
      const exportExercises: LiftohistoryExportExercise[] = [];

      for (const entry of entries) {
        if (entry.duration_minutes) {
          totalDurationMinutes += entry.duration_minutes;
        }

        const setsRes = (await client.query(
          `SELECT set_number, set_type, reps, weight, rpe, duration, notes
           FROM exercise_entry_sets
           WHERE exercise_entry_id = $1
           ORDER BY set_number ASC`,
          [entry.id]
        )) as { rows: ExerciseSetRow[] };

        const exportSets: LiftohistoryExportSet[] = [];
        for (const set of setsRes.rows) {
          if (set.reps && set.reps > 0) {
            exportSets.push({
              reps: Number(set.reps),
              weight: set.weight !== null ? Number(set.weight) : null,
              weightUnit: 'kg',
              rpe: set.rpe !== null ? Number(set.rpe) : null,
              durationSeconds:
                set.duration !== null ? Number(set.duration) : null,
              setType: set.set_type ? set.set_type.toLowerCase() : null,
              notes: set.notes,
            });
          }
        }

        // Only include exercises that have working/warmup sets defined
        if (exportSets.length > 0) {
          exportExercises.push({
            name: entry.exercise_name || 'Exercise',
            notes: entry.notes || null,
            sets: exportSets,
          });
        }
      }

      if (exportExercises.length > 0) {
        const programName = firstEntry.preset_name || 'SparkyFitness Workout';
        // Clean any existing internal metadata tags from user-facing notes before exporting
        const sessionNotes = firstEntry.notes
          ? firstEntry.notes
              .replace(/\[liftosaur_exported(?::[^\]]+)?\]/g, '')
              .replace(/\[liftosaur_exporting(?::[^\]]+)?\]/g, '')
              .trim()
          : undefined;

        const exportWorkout: LiftohistoryExportWorkout = {
          date: sessionUtcInstant.toISOString(),
          programName,
          dayName: firstEntry.preset_name ? firstEntry.preset_name : 'Workout',
          durationSeconds:
            totalDurationMinutes > 0 ? totalDurationMinutes * 60 : undefined,
          notes: sessionNotes || undefined,
          exercises: exportExercises,
        };

        const entryIds = entries.map((e) => e.id);
        const claimId = crypto.randomUUID();

        // 3a. Atomically acquire a durable, uniquely keyed export claim in the database.
        // This acts as a distributed lock preventing concurrent cron workers or manual
        // sync triggers from simultaneously exporting the same workout session.
        const claimRes = (await client.query(
          `UPDATE exercise_entries
           SET notes = CASE
             WHEN notes IS NULL OR notes = '' THEN '[liftosaur_exporting:' || $1 || ']'
             WHEN notes LIKE '%[liftosaur_exporting%' THEN regexp_replace(notes, '\\[liftosaur_exporting:[^\\]]+\\]', '[liftosaur_exporting:' || $1 || ']')
             ELSE notes || ' [liftosaur_exporting:' || $1 || ']'
           END,
           updated_at = NOW()
           WHERE id = ANY($2::uuid[])
             AND (
               notes IS NULL OR (
                 notes NOT LIKE '%[liftosaur_exported%'
                 AND (notes NOT LIKE '%[liftosaur_exporting%' OR updated_at < NOW() - INTERVAL '15 minutes')
               )
             )
           RETURNING id`,
          [claimId, entryIds]
        )) as { rows: { id: string }[] };

        // If another process claimed any entry in this session, skip to prevent double posting.
        if (claimRes.rows.length !== entryIds.length) {
          log(
            'debug',
            '[liftosaurWorkoutExport] Session entries partially or fully claimed by another worker. Skipping.'
          );
          // Roll back partial claim if only a subset was updated
          if (claimRes.rows.length > 0) {
            const partialIds = claimRes.rows.map((r) => r.id);
            await client.query(
              `UPDATE exercise_entries
               SET notes = NULLIF(TRIM(regexp_replace(notes, '\\[liftosaur_exporting:[^\\]]+\\]', '')), ''),
                   updated_at = NOW()
               WHERE id = ANY($1::uuid[])`,
              [partialIds]
            );
          }
          continue;
        }

        // 3b. Dispatch the workout to Liftosaur API using the claimId as idempotency key
        const serializedText = serializeLiftohistory(exportWorkout);
        const posted = await postWorkoutToLiftosaur(
          apiKey,
          serializedText,
          claimId
        );

        if (posted) {
          exportedCount += 1;
          // 3c. Finalize durable claim to permanent exported status
          await client.query(
            `UPDATE exercise_entries
             SET notes = regexp_replace(notes, '\\[liftosaur_exporting:[^\\]]+\\]', '[liftosaur_exported:' || $1 || ']'),
                 updated_at = NOW()
             WHERE id = ANY($2::uuid[])`,
            [claimId, entryIds]
          );
        } else {
          // 3d. Release the claim on network/server failure so subsequent syncs can retry
          await client.query(
            `UPDATE exercise_entries
             SET notes = NULLIF(TRIM(regexp_replace(notes, '\\[liftosaur_exporting:[^\\]]+\\]', '')), ''),
                 updated_at = NOW()
             WHERE id = ANY($1::uuid[])`,
            [entryIds]
          );
        }
      }
    }
  } catch (err) {
    log(
      'error',
      `[liftosaurWorkoutExport] Error exporting workouts: ${errorMessage(err)}`
    );
  } finally {
    client.release();
  }

  return exportedCount;
}

export default {
  exportWorkoutsToLiftosaur,
};
