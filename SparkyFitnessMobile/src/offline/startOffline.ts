import type {
  PresetSessionExerciseRequest,
  PresetSessionResponse,
} from '@workspace/shared';
import { getActiveServerConfigId } from '../services/storage';
import type { Exercise } from '../types/exercise';
import { buildLocalSession } from './buildLocalSession';
import { getCacheRow } from './cacheStore';
import { CACHE_COLLECTIONS } from './collections';
import { getOfflineDb } from './db';
import { isOfflinePackReady } from './offlinePack';

export type OfflineStartResult =
  | { ok: true; session: PresetSessionResponse }
  /** Nothing has been prepared for offline use on this phone yet. */
  | { ok: false; reason: 'notReady' }
  /** An exercise of the workout is not in the saved library. */
  | { ok: false; reason: 'missingExercise' };

/**
 * Builds the session for a workout started with no connection, from what
 * this phone saved. Refused until a full refresh has completed for the
 * active server: the weight unit and last-time values come from it, and a
 * workout logged in the wrong unit would be stored wrong.
 */
export async function buildOfflineStartSession(input: {
  id: string;
  name: string;
  entryDate: string;
  workoutPresetId: number | null;
  workoutPlanAssignmentId: number | null;
  exercises: readonly PresetSessionExerciseRequest[];
}): Promise<OfflineStartResult> {
  const serverConfigId = await getActiveServerConfigId();
  if (!serverConfigId) return { ok: false, reason: 'notReady' };
  let db;
  try {
    db = await getOfflineDb();
  } catch {
    return { ok: false, reason: 'notReady' };
  }
  if (!(await isOfflinePackReady(db, serverConfigId))) {
    return { ok: false, reason: 'notReady' };
  }

  const exercisesById = new Map<string, Exercise>();
  for (const request of input.exercises) {
    const exerciseId = request.exercise_id;
    if (exerciseId == null || exercisesById.has(exerciseId)) continue;
    const row = await getCacheRow(
      db,
      serverConfigId,
      CACHE_COLLECTIONS.exercise,
      exerciseId
    );
    if (row) exercisesById.set(exerciseId, row.payload as Exercise);
  }

  const session = buildLocalSession({ ...input, exercisesById });
  return session
    ? { ok: true, session }
    : { ok: false, reason: 'missingExercise' };
}
