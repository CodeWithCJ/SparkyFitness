import type { WorkoutFeedbackDifficulty } from '../schemas/database/WorkoutFeedback.zod.ts';
import type {
  UpdateWorkoutSessionFeedbackRequest,
  WorkoutSessionFeedbackResponse,
} from '../schemas/api/WorkoutCoaching.api.zod.ts';

/**
 * The end-of-workout feedback form, shared by web and mobile so both send
 * the same request for the same answers (issue #1560).
 *
 * The form asks three things: how the session felt overall, whether
 * anything hurt (and optionally which exercises and a note), and — for
 * people who want to — how each exercise felt. Pain is recorded on the
 * session (with the note) and additionally on each exercise named, so
 * adaptive suggestions can back off exactly those exercises.
 */
export interface WorkoutFeedbackDraft {
  difficulty: WorkoutFeedbackDifficulty | null;
  pain: boolean;
  painNote: string;
  /** Exercise entries the pain was felt in; empty = not specified. */
  painExerciseEntryIds: string[];
  /** Per-exercise difficulty, keyed by exercise entry id. */
  exerciseDifficulty: Record<string, WorkoutFeedbackDifficulty | null>;
}

export const EMPTY_WORKOUT_FEEDBACK_DRAFT: WorkoutFeedbackDraft = {
  difficulty: null,
  pain: false,
  painNote: '',
  painExerciseEntryIds: [],
  exerciseDifficulty: {},
};

export function workoutFeedbackDraftFromResponse(
  response: WorkoutSessionFeedbackResponse | null | undefined
): WorkoutFeedbackDraft {
  if (!response) return EMPTY_WORKOUT_FEEDBACK_DRAFT;
  const exerciseDifficulty: Record<string, WorkoutFeedbackDifficulty | null> =
    {};
  const painExerciseEntryIds: string[] = [];
  for (const exercise of response.exercises) {
    if (exercise.difficulty) {
      exerciseDifficulty[exercise.exercise_entry_id] = exercise.difficulty;
    }
    if (exercise.pain) painExerciseEntryIds.push(exercise.exercise_entry_id);
  }
  return {
    difficulty: response.session?.difficulty ?? null,
    pain: (response.session?.pain ?? false) || painExerciseEntryIds.length > 0,
    painNote: response.session?.pain_note ?? '',
    painExerciseEntryIds,
    exerciseDifficulty,
  };
}

export function workoutFeedbackRequestFromDraft(
  draft: WorkoutFeedbackDraft
): UpdateWorkoutSessionFeedbackRequest {
  const note = draft.painNote.trim();
  const sessionHasSignal = draft.difficulty != null || draft.pain;
  const painIds = draft.pain ? new Set(draft.painExerciseEntryIds) : new Set();
  const entryIds = new Set<string>([
    ...Object.keys(draft.exerciseDifficulty),
    ...(painIds as Set<string>),
  ]);
  const exercises = [...entryIds]
    .map((exerciseEntryId) => ({
      exercise_entry_id: exerciseEntryId,
      difficulty: draft.exerciseDifficulty[exerciseEntryId] ?? null,
      pain: painIds.has(exerciseEntryId),
      pain_note: null,
    }))
    .filter((exercise) => exercise.difficulty != null || exercise.pain);
  return {
    session: sessionHasSignal
      ? {
          difficulty: draft.difficulty,
          pain: draft.pain,
          pain_note: draft.pain && note ? note : null,
        }
      : null,
    exercises,
  };
}

/** True when the draft carries any answer at all. */
export function hasWorkoutFeedback(draft: WorkoutFeedbackDraft): boolean {
  return (
    draft.difficulty != null ||
    draft.pain ||
    Object.values(draft.exerciseDifficulty).some((value) => value != null)
  );
}
