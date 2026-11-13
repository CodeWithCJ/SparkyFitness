// Hand-written in the ts-to-zod generated style (precedent:
// UserWaterContainers.zod.ts). Keep on regen. Issue #1560.
import { z } from 'zod';

export const WORKOUT_FEEDBACK_DIFFICULTIES = [
  'too_easy',
  'just_right',
  'too_hard',
] as const;

export const workoutFeedbackDifficultySchema = z.enum(
  WORKOUT_FEEDBACK_DIFFICULTIES
);

export type WorkoutFeedbackDifficulty = z.infer<
  typeof workoutFeedbackDifficultySchema
>;

/** Matches the `workout_feedback_pain_note_length` check constraint. */
export const WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH = 500;

export const workoutFeedbackIdSchema = z.string();

export const workoutFeedbackSchema = z.object({
  id: workoutFeedbackIdSchema,
  user_id: z.string(),
  exercise_preset_entry_id: z.string().nullable(),
  exercise_entry_id: z.string().nullable(),
  difficulty: workoutFeedbackDifficultySchema.nullable(),
  pain: z.boolean(),
  pain_note: z.string().max(WORKOUT_FEEDBACK_PAIN_NOTE_MAX_LENGTH).nullable(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type WorkoutFeedback = z.infer<typeof workoutFeedbackSchema>;
