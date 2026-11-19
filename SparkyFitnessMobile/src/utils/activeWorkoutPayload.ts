import type {
  CreatePresetSessionRequest,
  PresetSessionResponse,
  UpdatePresetSessionRequest,
} from '@workspace/shared';
import type { ActiveWorkoutState } from '../stores/activeWorkoutStore';
import { buildSessionExercisesPayload } from './workoutSession';

/** The parts of the live workout a save is built from. */
export type ActiveWorkoutSnapshot = Pick<
  ActiveWorkoutState,
  | 'session'
  | 'completedSetIds'
  | 'prSetIds'
  | 'startedAt'
  | 'resumedDurationMinutes'
  | 'workoutFormat'
  | 'intervalRoundsCompleted'
  | 'intervalRepsCompleted'
  | 'timeCapSeconds'
  | 'intervalStatus'
  | 'intervalScalingNotes'
  | 'pendingCreate'
> & { session: PresetSessionResponse };

/**
 * The body that saves the live workout as it stands: every exercise and set,
 * with what was logged. One builder for the autosave and for a workout handed
 * to the upload queue, so the two can never describe a workout differently.
 */
export function buildActiveWorkoutUpdateBody(
  state: ActiveWorkoutSnapshot,
  now: number = Date.now()
): UpdatePresetSessionRequest {
  const trimmedName = state.session.name.trim();
  const activityDetails =
    state.workoutFormat !== 'standard'
      ? [
          {
            detail_type: 'wod_score' as const,
            detail_data: {
              // Shared-schema key (read by web and the AI), plus the legacy
              // `format` key older mobile builds read.
              workout_format: state.workoutFormat,
              format: state.workoutFormat,
              rounds_completed: state.intervalRoundsCompleted,
              reps_completed: state.intervalRepsCompleted,
              time_cap_seconds: state.timeCapSeconds ?? undefined,
              elapsed_seconds: state.startedAt
                ? Math.floor((now - state.startedAt) / 1000)
                : undefined,
              status: state.intervalStatus,
              scaling_notes: state.intervalScalingNotes || undefined,
            },
          },
        ]
      : undefined;

  return {
    // Persist the (possibly renamed) session name; skip an empty string so
    // the server's min(1) name validation isn't tripped.
    ...(trimmedName.length > 0 ? { name: trimmedName } : {}),
    location: state.session.location ?? null,
    exercises: buildSessionExercisesPayload(
      state.session,
      state.completedSetIds,
      state.prSetIds,
      state.startedAt,
      state.resumedDurationMinutes
    ),
    activity_details: activityDetails,
  };
}

/**
 * The body that creates, on the server, a workout that so far exists only on
 * this phone. It carries the phone-minted session id, so sending it twice
 * cannot make two workouts. Null when the session is not waiting for a create.
 */
export function buildActiveWorkoutCreateBody(
  state: ActiveWorkoutSnapshot,
  now: number = Date.now()
): CreatePresetSessionRequest | null {
  const pending = state.pendingCreate;
  if (pending == null) return null;
  const body = buildActiveWorkoutUpdateBody(state, now);
  return {
    id: state.session.id,
    name: body.name ?? state.session.name,
    entry_date: pending.entryDate,
    source: 'sparky',
    location: body.location,
    exercises: body.exercises,
    activity_details: body.activity_details,
    ...(pending.workoutPresetId != null
      ? { workout_preset_id: pending.workoutPresetId }
      : {}),
    ...(pending.workoutPlanAssignmentId != null
      ? { workoutPlanAssignmentId: pending.workoutPlanAssignmentId }
      : {}),
  };
}
