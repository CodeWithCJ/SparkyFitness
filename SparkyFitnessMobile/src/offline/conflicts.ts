import type {
  CreatePresetSessionRequest,
  PresetSessionExerciseRequest,
} from '@workspace/shared';
import { newUuid } from '../utils/ids';
import { getOfflineDb } from './db';
import { notifyOutboxChanged } from './events';
import { WORKOUT_FEEDBACK_PUT, type QueuedFeedbackPayload } from './followUps';
import { getOutboxRow, updateOutboxRow } from './outbox';
import { drainOutbox } from './syncEngine';
import {
  WORKOUT_SESSION_CREATE,
  WORKOUT_SESSION_UPDATE,
  type WorkoutSessionUpdatePayload,
} from './workoutHandOver';

/** What a waiting workout that met a change elsewhere can become. */
export type ConflictChoice = 'keepPhone' | 'keepServer' | 'saveSeparately';

/** The workout and its sets as new records, so nothing points at the old ones. */
function asNewExercises(
  exercises: readonly PresetSessionExerciseRequest[]
): PresetSessionExerciseRequest[] {
  return exercises.map(
    ({ id: _entryId, workout_plan_assignment_id: _plan, ...exercise }) => ({
      ...exercise,
      sets: (exercise.sets ?? []).map(({ id: _setId, ...set }) => set),
    })
  );
}

/**
 * Applies the person's choice for a workout that was changed or deleted
 * somewhere else while it waited on this phone, then uploads at once.
 *
 * - keepPhone: this phone's copy replaces the server's (sent without the
 *   revision guard). Only for a workout the server still has.
 * - keepServer: nothing is sent; the phone's copy stays a few days as the
 *   usual safety copy.
 * - saveSeparately: the phone's copy is uploaded as a new workout beside the
 *   server's, named "(phone)" and detached from any plan day.
 */
export async function resolveWorkoutConflict(
  rowId: string,
  choice: ConflictChoice,
  options: { phoneSuffix: string }
): Promise<void> {
  const db = await getOfflineDb();
  const row = await getOutboxRow(db, rowId);
  if (row == null || row.status !== 'conflict') return;

  if (choice === 'keepServer') {
    await updateOutboxRow(db, rowId, {
      status: 'synced',
      syncedAt: Date.now(),
      lastError: null,
    });
    notifyOutboxChanged();
    return;
  }

  if (choice === 'keepPhone' && row.kind === WORKOUT_SESSION_UPDATE) {
    await updateOutboxRow(db, rowId, {
      status: 'pending',
      attempts: 0,
      baseRevision: null,
      lastError: null,
    });
  } else {
    // Save separately, and the only way to keep a workout that was deleted
    // elsewhere: upload it as a new one.
    const update = row.payload as WorkoutSessionUpdatePayload;
    const body = update.body;
    const name = `${body.name ?? ''} ${options.phoneSuffix}`.trim();
    const create: CreatePresetSessionRequest = {
      id: newUuid(),
      name,
      entry_date: row.entryDate ?? new Date().toISOString().slice(0, 10),
      source: 'sparky',
      location: body.location,
      exercises: asNewExercises(body.exercises ?? []),
      activity_details: body.activity_details,
      ...(body.finished_at !== undefined
        ? { finished_at: body.finished_at }
        : {}),
    };
    await updateOutboxRow(db, rowId, {
      kind: WORKOUT_SESSION_CREATE,
      payload: create,
      status: 'pending',
      attempts: 0,
      baseRevision: null,
      lastError: null,
    });
    await db.run(`UPDATE outbox SET entity_id = ? WHERE id = ?`, [
      create.id!,
      rowId,
    ]);
    // Feedback given on the phone's copy belongs to the new workout.
    const dependants = await db.all<{ id: string; payload: string }>(
      `SELECT id, payload FROM outbox WHERE depends_on = ? AND kind = ?`,
      [rowId, WORKOUT_FEEDBACK_PUT]
    );
    for (const dependant of dependants) {
      const payload = JSON.parse(dependant.payload) as QueuedFeedbackPayload;
      await updateOutboxRow(db, dependant.id, {
        payload: { ...payload, sessionId: create.id! },
      });
      await db.run(`UPDATE outbox SET entity_id = ? WHERE id = ?`, [
        `feedback:${create.id!}`,
        dependant.id,
      ]);
    }
  }
  notifyOutboxChanged();
  await drainOutbox('manual');
}
