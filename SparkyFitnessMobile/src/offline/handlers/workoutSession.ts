import type { CreatePresetSessionRequest } from '@workspace/shared';
import { invalidateExerciseCache } from '../../hooks/invalidateExerciseCache';
import { queryClient } from '../../hooks/queryClient';
import {
  createWorkout,
  deleteWorkout,
  getWorkout,
  updateWorkout,
} from '../../services/api/exerciseApi';
import { ApiError } from '../../services/api/errors';
import { serverSessionMatchesSent } from '../sessionsEqual';
import { sendResultFromError } from '../syncEngine';
import type { OutboxHandler, OutboxRow, SendResult } from '../types';
import {
  WORKOUT_SESSION_CREATE,
  WORKOUT_SESSION_DELETE,
  WORKOUT_SESSION_PAYLOAD_VERSION,
  WORKOUT_SESSION_UPDATE,
  type WorkoutSessionUpdatePayload,
} from '../workoutHandOver';
import { registerOutboxHandler } from './registry';

const statusOf = (error: unknown): number | null =>
  error instanceof ApiError ? error.statusCode : null;

const refreshDiary = (row: OutboxRow) => {
  if (row.entryDate) invalidateExerciseCache(queryClient, row.entryDate);
};

/** The parts of a create request an update accepts too. */
function updateBodyFromCreate(payload: CreatePresetSessionRequest) {
  return {
    ...(payload.name ? { name: payload.name } : {}),
    location: payload.location,
    exercises: payload.exercises,
    activity_details: payload.activity_details,
    ...(payload.finished_at !== undefined
      ? { finished_at: payload.finished_at }
      : {}),
  };
}

async function sendCreate(row: OutboxRow): Promise<SendResult> {
  const payload = row.payload as CreatePresetSessionRequest;
  let created;
  try {
    created = await createWorkout(payload);
  } catch (error) {
    if (statusOf(error) === 404 && payload.workout_preset_id != null) {
      // The saved workout it was started from was deleted meanwhile. The
      // workout itself is still valid: create it without the link.
      const { workout_preset_id: _removed, ...unlinked } = payload;
      try {
        created = await createWorkout(unlinked);
      } catch (retryError) {
        return sendResultFromError(retryError);
      }
    } else {
      return sendResultFromError(error);
    }
  }
  // The server answers a create it has already seen with the copy it stored
  // then. A create sent earlier, by the live save or by a previous upload
  // attempt, may have reached it with the answer lost, so that stored copy
  // can be older than this payload. Only when it differs is an update sent.
  const storedFinished = (created.finished_at ?? null) !== null;
  const sentFinished = (payload.finished_at ?? null) !== null;
  if (
    payload.exercises != null &&
    serverSessionMatchesSent(created, payload.exercises) &&
    storedFinished === sentFinished
  ) {
    return { outcome: 'synced' };
  }
  try {
    await updateWorkout(payload.id!, {
      ...updateBodyFromCreate(payload),
      ...(created.revision != null ? { revision: created.revision } : {}),
    });
    return { outcome: 'synced' };
  } catch (error) {
    return sendResultFromError(error);
  }
}

async function sendUpdate(row: OutboxRow): Promise<SendResult> {
  const { body } = row.payload as WorkoutSessionUpdatePayload;
  const send = (revision: number | null | undefined) =>
    updateWorkout(row.entityId, {
      ...body,
      ...(revision != null ? { revision } : {}),
    });
  try {
    await send(row.baseRevision);
    return { outcome: 'synced' };
  } catch (error) {
    const status = statusOf(error);
    if (status === 404) {
      return { outcome: 'conflict', error: 'deleted' };
    }
    if (status !== 409) return sendResultFromError(error);
  }
  // Refused as changed elsewhere. If the server copy holds exactly the sets
  // this phone logged, the change was this phone's own earlier save whose
  // answer was lost: send again with the current revision, nobody to ask.
  try {
    const serverCopy = await getWorkout(row.entityId);
    if (
      body.exercises == null ||
      !serverSessionMatchesSent(serverCopy, body.exercises)
    ) {
      return { outcome: 'conflict', error: 'changed' };
    }
    await send(serverCopy.revision);
    return { outcome: 'synced' };
  } catch (error) {
    if (statusOf(error) === 404) {
      return { outcome: 'conflict', error: 'deleted' };
    }
    if (statusOf(error) === 409) {
      return { outcome: 'conflict', error: 'changed' };
    }
    return sendResultFromError(error);
  }
}

async function sendDelete(row: OutboxRow): Promise<SendResult> {
  try {
    await deleteWorkout(row.entityId);
    return { outcome: 'synced' };
  } catch (error) {
    // Already gone is what was asked for.
    if (statusOf(error) === 404) return { outcome: 'synced' };
    return sendResultFromError(error);
  }
}

const base = {
  payloadVersion: WORKOUT_SESSION_PAYLOAD_VERSION,
  // Version 1 is the first shape; nothing older exists to convert.
  upgrade: (payload: unknown) => payload,
  onSynced: refreshDiary,
};

const handlers: OutboxHandler[] = [
  { ...base, kind: WORKOUT_SESSION_CREATE, send: sendCreate },
  { ...base, kind: WORKOUT_SESSION_UPDATE, send: sendUpdate },
  { ...base, kind: WORKOUT_SESSION_DELETE, send: sendDelete },
];

/** Makes queued workout sessions sendable. Called once at app start. */
export function registerWorkoutSessionHandlers(): void {
  handlers.forEach(registerOutboxHandler);
}
