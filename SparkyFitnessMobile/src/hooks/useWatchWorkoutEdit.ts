import { useEffect } from 'react';
import WatchConnectivity, {
  type WatchWorkoutEditPayload,
} from '../../modules/watch-connectivity';
import { fetchExerciseById } from '../services/api/exerciseApi';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { addLog } from '../services/LogService';
import type { ActiveSetPatch } from '../stores/activeWorkoutStore';

// Recent edits already applied. A message the watch sent live and then queued
// as well must not add a second set or drop a second exercise.
const SEEN_LIMIT = 100;
// The plan's ISO stamp and the epoch value an edit carries are the same
// millisecond, so only rounding separates them. Kept as tight as the watch's
// own arm check (10 ms) so an edit from an arm started a moment earlier is not
// taken for this one.
const WATCH_ARM_TOLERANCE_MS = 10;
const seenClientIds: string[] = [];
// Add Exercise loads the exercise first. Its id is held here while that runs,
// and only recorded as applied once the exercise is added, so a delivery that
// follows a failed lookup can still add it.
const inFlightClientIds = new Set<string>();

// When the newest typed value for each set field was made on the watch, so a
// queued copy of an older edit that lands after a newer live one is dropped.
const valuesEditedAt = new Map<string, number>();

/** The set fields a `setValues` edit carries that are not stale. */
function freshValuePatch(payload: WatchWorkoutEditPayload): ActiveSetPatch {
  const patch: ActiveSetPatch = {};
  const fields: [string, keyof ActiveSetPatch, number | undefined][] = [
    ['weight', 'weight', payload.weightKg],
    ['reps', 'reps', payload.reps],
    ['distance', 'distance', payload.distanceKm],
  ];
  for (const [name, key, value] of fields) {
    if (value == null || !Number.isFinite(value)) continue;
    const memo = `${payload.setId}:${name}`;
    const at = payload.at;
    if (at != null && (valuesEditedAt.get(memo) ?? 0) > at) continue;
    if (at != null) valuesEditedAt.set(memo, at);
    Object.assign(patch, { [key]: value });
  }
  return patch;
}

function recordApplied(clientId: string): void {
  if (clientId === '') return;
  seenClientIds.push(clientId);
  if (seenClientIds.length > SEEN_LIMIT) seenClientIds.shift();
}

function alreadyApplied(clientId: string): boolean {
  if (clientId === '') return false;
  return seenClientIds.includes(clientId) || inFlightClientIds.has(clientId);
}

/**
 * Applies one edit the wearer made on the watch to the live workout. Edits for
 * a workout that is no longer the live one are ignored. The plan sync sends
 * the changed workout back to the watch.
 */
export async function applyWatchWorkoutEdit(
  payload: WatchWorkoutEditPayload
): Promise<void> {
  const live = useActiveWorkoutStore.getState();
  if (live.sessionId == null || live.sessionId !== payload.sessionId) return;
  if (alreadyApplied(payload.clientId)) return;
  // Everything but Add Exercise is applied at once, so it counts as applied now.
  if (payload.action !== 'addExercise') recordApplied(payload.clientId);

  switch (payload.action) {
    case 'addSet':
      if (payload.exerciseEntryId) {
        live.addSetToExercise(payload.exerciseEntryId);
      }
      return;
    case 'deleteSet':
      if (payload.setId) live.deleteSet(payload.setId);
      return;
    case 'setValues': {
      // The wearer typed a weight, reps or carry distance on the watch. Put it
      // on the phone's set now so both show it before the set is logged. A set
      // already logged keeps what it was logged with.
      if (!payload.setId || live.completedSetIds[payload.setId] != null) return;
      // An edit queued from an earlier arm of the same saved workout must not
      // change a set in the arm that replaced it. An older watch sends no
      // stamp, and that still matches.
      if (
        payload.armedAt != null &&
        live.watchArmedAt != null &&
        Math.abs(payload.armedAt - live.watchArmedAt) > WATCH_ARM_TOLERANCE_MS
      ) {
        return;
      }
      const patch = freshValuePatch(payload);
      if (Object.keys(patch).length > 0)
        live.updateSetField(payload.setId, patch);
      return;
    }
    case 'setSetType':
      if (payload.setId && payload.setType) {
        live.updateSetField(payload.setId, { set_type: payload.setType });
      }
      return;
    case 'deleteExercise':
      if (payload.exerciseEntryId) live.removeExercise(payload.exerciseEntryId);
      return;
    case 'doExerciseNow':
      if (payload.exerciseEntryId) {
        live.doExerciseNow(payload.exerciseEntryId, payload.anchorEntryId);
      }
      return;
    case 'addExercise': {
      if (!payload.exerciseId) return;
      if (payload.clientId !== '') inFlightClientIds.add(payload.clientId);
      try {
        const exercise = await fetchExerciseById(payload.exerciseId);
        // The workout may have ended while the exercise loaded.
        if (useActiveWorkoutStore.getState().sessionId !== payload.sessionId) {
          return;
        }
        useActiveWorkoutStore.getState().addExercise(exercise);
        recordApplied(payload.clientId);
      } catch (error) {
        addLog(
          `Watch add-exercise failed: ${(error as Error).message}`,
          'WARNING'
        );
      } finally {
        inFlightClientIds.delete(payload.clientId);
      }
      return;
    }
  }
}

/**
 * Lets the watch add and remove sets and exercises, and change a set's type,
 * in the workout it is running. iOS-only; a no-op everywhere else.
 */
export function useWatchWorkoutEdit(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !WatchConnectivity?.isSupported()) return;
    const sub = WatchConnectivity.addListener('onWorkoutEdit', (payload) => {
      void applyWatchWorkoutEdit(payload);
    });
    return () => sub.remove();
  }, [enabled]);
}
