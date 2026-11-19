import type {
  UpdateWorkoutSessionFeedbackRequest,
  WorkoutPresetExerciseRequest,
} from '@workspace/shared';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { enqueueOutbox, listUnconfirmedOutbox } from './outbox';
import { signedInUserId } from './syncEngine';
import type { OfflineDb } from './types';

export const WORKOUT_FEEDBACK_PUT = 'workout_feedback.put';
export const WORKOUT_PRESET_UPDATE = 'workout_preset.update';
export const FOLLOW_UP_PAYLOAD_VERSION = 1;

/** Payload of a `workout_feedback.put` row. */
export interface QueuedFeedbackPayload {
  sessionId: string;
  request: UpdateWorkoutSessionFeedbackRequest;
}

/** Payload of a `workout_preset.update` row. */
export interface QueuedPresetUpdatePayload {
  presetId: number;
  presetName: string;
  exercises: WorkoutPresetExerciseRequest[];
  /**
   * The saved workout's `updated_at` when the person said yes. If it differs
   * at upload time the saved workout was changed elsewhere, and the update
   * is skipped rather than overwriting that change (D12).
   */
  expectedUpdatedAt: string | null;
}

/** The waiting upload of a session, which a follow-up must wait for. */
async function sessionRowId(
  db: OfflineDb,
  serverConfigId: string,
  sessionId: string
): Promise<string | null> {
  const rows = await listUnconfirmedOutbox(db, serverConfigId);
  return (
    rows.find(
      (row) =>
        row.entityId === sessionId && row.kind.startsWith('workout_session.')
    )?.id ?? null
  );
}

async function queueFollowUp(item: {
  kind: string;
  entityId: string;
  sessionId: string | null;
  payload: unknown;
}): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId: await signedInUserId(db, serverConfigId),
      kind: item.kind,
      entityId: item.entityId,
      dependsOn:
        item.sessionId != null
          ? await sessionRowId(db, serverConfigId, item.sessionId)
          : null,
      payload: item.payload,
      payloadVersion: FOLLOW_UP_PAYLOAD_VERSION,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue ${item.kind}: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * Keeps feedback on a workout given while the server cannot be reached. It
 * is sent after the workout itself; a later answer replaces an earlier one
 * still waiting.
 */
export function queueWorkoutFeedback(
  sessionId: string,
  request: UpdateWorkoutSessionFeedbackRequest
): Promise<boolean> {
  return queueFollowUp({
    kind: WORKOUT_FEEDBACK_PUT,
    entityId: `feedback:${sessionId}`,
    sessionId,
    payload: { sessionId, request } satisfies QueuedFeedbackPayload,
  });
}

/** Keeps a "yes, update the saved workout" given while offline. */
export function queuePresetUpdate(
  payload: QueuedPresetUpdatePayload
): Promise<boolean> {
  return queueFollowUp({
    kind: WORKOUT_PRESET_UPDATE,
    entityId: `preset:${payload.presetId}`,
    sessionId: null,
    payload,
  });
}

/** Feedback for a session still waiting to upload, if any was given. */
export async function readQueuedFeedback(
  sessionId: string
): Promise<UpdateWorkoutSessionFeedbackRequest | null> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return null;
    const rows = await listUnconfirmedOutbox(
      await getOfflineDb(),
      serverConfigId
    );
    const row = rows.find(
      (candidate) =>
        candidate.kind === WORKOUT_FEEDBACK_PUT &&
        candidate.entityId === `feedback:${sessionId}`
    );
    return row ? (row.payload as QueuedFeedbackPayload).request : null;
  } catch {
    return null;
  }
}
