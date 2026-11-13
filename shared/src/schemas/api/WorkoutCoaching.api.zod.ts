import { z } from 'zod';
import {
  WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH,
  workoutFeedbackDifficultySchema,
} from '../database/WorkoutFeedback.zod.ts';

/**
 * `/v2/workout-coaching` — session feedback and the adaptive-suggestions
 * setting (issue #1560).
 */

// --- Settings ---

export const workoutCoachingSettingsSchema = z
  .object({
    /**
     * When true, suggestions adapt to session feedback. When false,
     * progression behaves exactly as it did before feedback existed.
     */
    adaptive_suggestions: z.boolean(),
  })
  .strict();
export type WorkoutCoachingSettings = z.infer<
  typeof workoutCoachingSettingsSchema
>;

// --- Feedback ---

/**
 * One piece of feedback. A note only makes sense with the pain flag, and
 * feedback with neither a difficulty nor pain is "no feedback" (the server
 * deletes rather than stores it).
 */
export const workoutFeedbackInputSchema = z
  .object({
    difficulty: workoutFeedbackDifficultySchema.nullable(),
    pain: z.boolean(),
    pain_note: z
      .string()
      .trim()
      .max(WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH)
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .strict()
  .refine((value) => value.pain || value.pain_note == null, {
    message: 'pain_note requires pain',
    path: ['pain_note'],
  });
export type WorkoutFeedbackInput = z.input<typeof workoutFeedbackInputSchema>;

export const workoutExerciseFeedbackInputSchema = z
  .object({
    exercise_entry_id: z.string().uuid(),
    difficulty: workoutFeedbackDifficultySchema.nullable(),
    pain: z.boolean(),
    pain_note: z
      .string()
      .trim()
      .max(WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH)
      .nullable()
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .strict()
  .refine((value) => value.pain || value.pain_note == null, {
    message: 'pain_note requires pain',
    path: ['pain_note'],
  });

/**
 * `PUT /v2/workout-coaching/sessions/:presetEntryId/feedback` — replaces
 * the session's feedback as a whole: `session: null` clears the session
 * rating, and exercises left out of `exercises` have theirs cleared.
 */
export const updateWorkoutSessionFeedbackRequestSchema = z
  .object({
    session: workoutFeedbackInputSchema.nullable(),
    exercises: z.array(workoutExerciseFeedbackInputSchema).max(100).default([]),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.exercises.map((e) => e.exercise_entry_id)).size ===
      value.exercises.length,
    { message: 'exercise_entry_id must be unique', path: ['exercises'] }
  );
export type UpdateWorkoutSessionFeedbackRequest = z.input<
  typeof updateWorkoutSessionFeedbackRequestSchema
>;

export const workoutFeedbackResponseSchema = z
  .object({
    difficulty: workoutFeedbackDifficultySchema.nullable(),
    pain: z.boolean(),
    pain_note: z.string().nullable(),
    updated_at: z.string(),
  })
  .strict();
export type WorkoutFeedbackResponse = z.infer<
  typeof workoutFeedbackResponseSchema
>;

export const workoutExerciseFeedbackResponseSchema = z
  .object({
    exercise_entry_id: z.string(),
    difficulty: workoutFeedbackDifficultySchema.nullable(),
    pain: z.boolean(),
    pain_note: z.string().nullable(),
    updated_at: z.string(),
  })
  .strict();
export type WorkoutExerciseFeedbackResponse = z.infer<
  typeof workoutExerciseFeedbackResponseSchema
>;

export const workoutSessionFeedbackResponseSchema = z
  .object({
    exercise_preset_entry_id: z.string(),
    session: workoutFeedbackResponseSchema.nullable(),
    exercises: z.array(workoutExerciseFeedbackResponseSchema),
  })
  .strict();
export type WorkoutSessionFeedbackResponse = z.infer<
  typeof workoutSessionFeedbackResponseSchema
>;

// --- Adaptive signals ---

/**
 * `GET /v2/workout-coaching/signals?exerciseIds=` query. `excludePresetEntryId`
 * leaves out the workout in progress (the live screen autosaves it), so it
 * doesn't count as "the last session".
 */
export const workoutCoachingSignalsQuerySchema = z
  .object({
    exerciseIds: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )
      .pipe(z.array(z.string().uuid()).min(1).max(100)),
    excludePresetEntryId: z.string().uuid().optional(),
    // RN's fetch appends `_=<timestamp>` for `cache: 'no-store'`.
    _: z.string().optional(),
  })
  .strict();

/**
 * What happened recently for one exercise, from the user's own log. The
 * rules that turn this into an adjustment live in
 * `utils/adaptiveCoaching.ts`.
 */
export const exerciseCoachingSignalSchema = z
  .object({
    exercise_id: z.string(),
    last_performed_date: z.string(),
    days_since_last_performed: z.number().int().nullable(),
    /** Exercise-level answer, else the session's. */
    last_difficulty: workoutFeedbackDifficultySchema.nullable(),
    /**
     * `exercise` — pain was felt in this exercise. `session` — pain was
     * reported for the session without naming exercises.
     */
    last_pain: z.enum(['exercise', 'session']).nullable(),
    too_easy_streak: z.number().int().min(0),
    too_hard_streak: z.number().int().min(0),
    pain_streak: z.number().int().min(0),
    /** Working-set averages from the last session, when logged. */
    avg_rpe: z.number().nullable(),
    avg_rir: z.number().nullable(),
    /** Distinct days it was done in the variation window. */
    sessions_in_variation_window: z.number().int().min(0),
  })
  .strict();
export type ExerciseCoachingSignal = z.infer<
  typeof exerciseCoachingSignalSchema
>;

export const workoutCoachingSignalsResponseSchema = z
  .object({
    /** False when the user turned adaptive suggestions off; signals is empty. */
    adaptive_suggestions: z.boolean(),
    signals: z.array(exerciseCoachingSignalSchema),
  })
  .strict();
export type WorkoutCoachingSignalsResponse = z.infer<
  typeof workoutCoachingSignalsResponseSchema
>;
