import type {
  CreatePresetSessionRequest,
  UpdatePresetSessionRequest,
} from '@workspace/shared';
import { addLog } from '../services/LogService';
import { getActiveServerConfigId } from '../services/storage';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import {
  buildActiveWorkoutCreateBody,
  buildActiveWorkoutUpdateBody,
} from '../utils/activeWorkoutPayload';
import { normalizeDate } from '../utils/dateUtils';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import {
  deleteUnconfirmedForEntity,
  enqueueOutbox,
  listUnconfirmedOutbox,
} from './outbox';
import { signedInUserId } from './syncEngine';

export const WORKOUT_SESSION_CREATE = 'workout_session.create';
export const WORKOUT_SESSION_UPDATE = 'workout_session.update';
export const WORKOUT_SESSION_DELETE = 'workout_session.delete';

/** The payload shape of the three kinds above, as this build writes it. */
export const WORKOUT_SESSION_PAYLOAD_VERSION = 1;

/**
 * What a person should see of the uploads waiting: one entry per workout. A
 * workout resumed and finished again while its first upload still waits has
 * a create and an update row for the same session; the update is a detail of
 * the create, so only the create is listed.
 */
export function uploadsToShow<T extends { kind: string; entityId: string }>(
  rows: readonly T[]
): T[] {
  const creating = new Set(
    rows
      .filter((row) => row.kind === WORKOUT_SESSION_CREATE)
      .map((row) => row.entityId)
  );
  return rows.filter(
    (row) =>
      !(row.kind === WORKOUT_SESSION_UPDATE && creating.has(row.entityId))
  );
}

/** Payload of a `workout_session.update` row. */
export interface WorkoutSessionUpdatePayload {
  body: UpdatePresetSessionRequest;
}

/**
 * Moves the live workout, as it stands, into the upload queue. Called when
 * the workout is being finished or put aside while the server cannot be
 * reached, so the live store can be cleared without losing anything.
 *
 * A workout the server has never seen is queued as a create (with its
 * phone-minted id); one the server already has is queued as an update that
 * presents the revision this phone last saw, so a change made elsewhere is
 * noticed when it uploads.
 *
 * Resolves the queue row's id, or null when nothing could be written. The
 * caller must keep the live workout unless a row id came back.
 */
export async function queueActiveWorkoutForUpload(options: {
  /** ISO time the workout was finished; null when it is only put aside. */
  finishedAt: string | null;
}): Promise<string | null> {
  const state = useActiveWorkoutStore.getState();
  if (state.session == null || state.sessionId == null) return null;
  const snapshot = { ...state, session: state.session };
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return null;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const finished =
      options.finishedAt != null ? { finished_at: options.finishedAt } : {};

    const createBody = buildActiveWorkoutCreateBody(snapshot);
    const item =
      createBody != null
        ? {
            kind: WORKOUT_SESSION_CREATE,
            entryDate: createBody.entry_date,
            payload: {
              ...createBody,
              ...finished,
            } satisfies CreatePresetSessionRequest,
            baseRevision: null,
          }
        : {
            kind: WORKOUT_SESSION_UPDATE,
            entryDate: state.session.entry_date
              ? normalizeDate(state.session.entry_date)
              : null,
            payload: {
              body: { ...buildActiveWorkoutUpdateBody(snapshot), ...finished },
            } satisfies WorkoutSessionUpdatePayload,
            baseRevision:
              state.offlineBaseRevision ?? state.session.revision ?? null,
          };

    const rowId = await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      entityId: state.sessionId,
      payloadVersion: WORKOUT_SESSION_PAYLOAD_VERSION,
      ...item,
    });
    notifyOutboxChanged();
    return rowId;
  } catch (error) {
    addLog(`[Offline] Could not queue the workout: ${error}`, 'ERROR');
    return null;
  }
}

/**
 * Queues a workout logged after the fact (the Add workout form) while the
 * server cannot be reached. It gets its id here, so a repeated upload never
 * makes a second workout. True once the row is written.
 */
export async function queueWorkoutCreate(
  body: CreatePresetSessionRequest
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const id = body.id ?? newUuid();
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: WORKOUT_SESSION_CREATE,
      entityId: id,
      entryDate: body.entry_date ? normalizeDate(body.entry_date) : null,
      payload: { ...body, id } satisfies CreatePresetSessionRequest,
      payloadVersion: WORKOUT_SESSION_PAYLOAD_VERSION,
      baseRevision: null,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the workout: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * Queues an edit of a workout the server holds (or will hold, when its own
 * upload is still waiting) made while the server cannot be reached. It
 * presents the revision this phone saw, so a change made elsewhere meanwhile
 * is noticed. A second edit before the upload is merged into the first.
 * True once the row is written.
 */
export async function queueWorkoutUpdate(
  sessionId: string,
  body: UpdatePresetSessionRequest,
  baseRevision: number | null,
  entryDate: string | null
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    const earlier = (await listUnconfirmedOutbox(db, serverConfigId)).find(
      (row) => row.kind === WORKOUT_SESSION_UPDATE && row.entityId === sessionId
    );
    const earlierBody =
      (earlier?.payload as WorkoutSessionUpdatePayload | undefined)?.body ?? {};
    await enqueueOutbox(db, {
      id: newUuid(),
      serverConfigId,
      userId,
      kind: WORKOUT_SESSION_UPDATE,
      entityId: sessionId,
      entryDate: entryDate ? normalizeDate(entryDate) : null,
      payload: {
        body: { ...earlierBody, ...body },
      } satisfies WorkoutSessionUpdatePayload,
      payloadVersion: WORKOUT_SESSION_PAYLOAD_VERSION,
      baseRevision,
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the change: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * Queues the removal of a session the server may hold, for a workout
 * discarded while the server cannot be reached. Anything still queued about
 * that session is dropped first: a discarded workout must not upload.
 */
export async function queueWorkoutSessionDelete(
  sessionId: string,
  entryDate: string | null = null
): Promise<boolean> {
  try {
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return false;
    const db = await getOfflineDb();
    const userId = await signedInUserId(db, serverConfigId);
    await db.transaction(async (tx) => {
      await deleteUnconfirmedForEntity(tx, serverConfigId, sessionId);
      await enqueueOutbox(tx, {
        id: newUuid(),
        serverConfigId,
        userId,
        kind: WORKOUT_SESSION_DELETE,
        entityId: sessionId,
        entryDate: entryDate ? normalizeDate(entryDate) : null,
        payload: { id: sessionId },
        payloadVersion: WORKOUT_SESSION_PAYLOAD_VERSION,
      });
    });
    notifyOutboxChanged();
    return true;
  } catch (error) {
    addLog(`[Offline] Could not queue the discard: ${error}`, 'ERROR');
    return false;
  }
}
