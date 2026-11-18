import {
  deriveWorkoutSessionStatus,
  type PresetSessionExerciseRequest,
  type PresetSessionResponse,
} from '@workspace/shared';
import type { Exercise } from '../types/exercise';
import { newUuid } from '../utils/ids';

type SessionExercise = PresetSessionResponse['exercises'][number];
type SessionSnapshot = NonNullable<SessionExercise['exercise_snapshot']>;

/** The library exercise as the session's per-entry snapshot. */
function snapshotOf(exercise: Exercise): SessionSnapshot {
  return {
    id: exercise.id,
    name: exercise.name,
    category: exercise.category ?? null,
    modality: exercise.modality ?? null,
    images: exercise.images ?? null,
    primary_muscles: exercise.primary_muscles ?? null,
    secondary_muscles: exercise.secondary_muscles ?? null,
    equipment: exercise.equipment ?? null,
    instructions: exercise.instructions ?? null,
    force: exercise.force ?? null,
    level: exercise.level ?? null,
    mechanic: exercise.mechanic ?? null,
    source: exercise.source ?? null,
    calories_per_hour: exercise.calories_per_hour ?? null,
    description: exercise.description ?? null,
    health_activity_type: exercise.health_activity_type ?? null,
  };
}

export interface LocalSessionInput {
  /** The id the session will keep on the server too. */
  id?: string;
  name: string;
  entryDate: string;
  workoutPresetId: number | null;
  workoutPlanAssignmentId: number | null;
  /** When the workout was finished, for one rebuilt from a queued upload. */
  finishedAt?: string | null;
  exercises: readonly PresetSessionExerciseRequest[];
  /** The library, by exercise id, as saved on this phone. */
  exercisesById: ReadonlyMap<string, Exercise>;
}

/**
 * The session the server would have answered a create with, built on the
 * phone for a workout started with no connection. Entries get client uuids
 * (the server keeps those); sets get the temporary negative ids the live
 * workout already uses for a set the server has not seen, so the first save
 * sends them without ids and adopts the ones the server assigns.
 *
 * Null when an exercise is not in the saved library: the session would have
 * no name or kind to show for it.
 */
export function buildLocalSession(
  input: LocalSessionInput
): PresetSessionResponse | null {
  let nextSetId = -1;
  const exercises: SessionExercise[] = [];
  for (const request of input.exercises) {
    const exercise =
      request.exercise_id != null
        ? input.exercisesById.get(request.exercise_id)
        : undefined;
    if (!exercise) return null;
    exercises.push({
      id: request.id ?? newUuid(),
      exercise_id: exercise.id,
      duration_minutes: request.duration_minutes ?? 0,
      calories_burned: 0,
      entry_date: input.entryDate,
      notes: request.notes ?? null,
      distance: null,
      avg_heart_rate: null,
      source: 'sparky',
      superset_group: request.superset_group ?? null,
      workout_plan_assignment_id: input.workoutPlanAssignmentId,
      exercise_snapshot: snapshotOf(exercise),
      activity_details: [],
      sets: (request.sets ?? []).map((set, setIndex) => ({
        id: nextSetId--,
        set_number: set.set_number ?? setIndex + 1,
        set_type: set.set_type ?? null,
        reps: set.reps ?? null,
        weight: set.weight ?? null,
        duration: set.duration ?? null,
        rest_time: set.rest_time ?? null,
        notes: set.notes ?? null,
        rpe: set.rpe ?? null,
        rir: set.rir ?? null,
        distance: set.distance ?? null,
        completed_at: set.completed_at ?? null,
        is_pr: set.is_pr ?? false,
      })),
    });
  }
  return {
    type: 'preset',
    id: input.id ?? newUuid(),
    entry_date: input.entryDate,
    workout_preset_id: input.workoutPresetId,
    workout_plan_assignment_id: input.workoutPlanAssignmentId,
    name: input.name,
    description: null,
    notes: null,
    location: null,
    source: 'sparky',
    status: deriveWorkoutSessionStatus({
      source: 'sparky',
      finishedAt: input.finishedAt ?? null,
      hasPlanAssignment: input.workoutPlanAssignmentId != null,
      sets: exercises.flatMap((exercise) => exercise.sets),
    }),
    finished_at: input.finishedAt ?? null,
    total_duration_minutes: 0,
    activity_details: [],
    exercises,
  };
}
