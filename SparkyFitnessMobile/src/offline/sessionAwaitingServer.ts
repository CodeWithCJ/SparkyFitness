import { getActiveServerConfigId } from '../services/storage';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import { getOfflineDb } from './db';
import { listUnconfirmedOutbox } from './outbox';
import { WORKOUT_SESSION_CREATE } from './workoutHandOver';

/**
 * True while a workout session exists only on this phone: the live workout
 * has not been created on the server yet, or a finished one is still queued
 * to be created. Anything attached to its entries (watch heart rate) must
 * wait, or the server answers 404 and the data is dropped.
 */
export async function isSessionAwaitingServer(
  sessionId: string
): Promise<boolean> {
  const live = useActiveWorkoutStore.getState();
  if (live.sessionId === sessionId && live.pendingCreate != null) return true;
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const rows = await listUnconfirmedOutbox(
      await getOfflineDb(),
      serverConfigId
    );
    return rows.some(
      (row) => row.kind === WORKOUT_SESSION_CREATE && row.entityId === sessionId
    );
  } catch {
    // The offline file cannot be read: nothing is known to be waiting.
    return false;
  }
}
