import { useEffect } from 'react';
import WatchConnectivity, {
  type WatchWorkoutEditPayload,
} from '../../modules/watch-connectivity';
import { fetchExerciseById } from '../services/api/exerciseApi';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { addLog } from '../services/LogService';

// Recent edits already applied. A message the watch sent live and then queued
// as well must not add a second set or drop a second exercise.
const SEEN_LIMIT = 100;
const seenClientIds: string[] = [];
// Add Exercise loads the exercise first. Its id is held here while that runs,
// and only recorded as applied once the exercise is added, so a delivery that
// follows a failed lookup can still add it.
const inFlightClientIds = new Set<string>();

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
    case 'setSetType':
      if (payload.setId && payload.setType) {
        live.updateSetField(payload.setId, { set_type: payload.setType });
      }
      return;
    case 'deleteExercise':
      if (payload.exerciseEntryId) live.removeExercise(payload.exerciseEntryId);
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
