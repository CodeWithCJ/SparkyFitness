import { z } from 'zod';

export const progressionModeSchema = z.enum([
  'rep_goal',
  'fixed',
  'step_load',
  'manual',
  // Reps climb through a range (rep_range_min..rep_goal per set), then load
  // goes up and reps drop back to the bottom.
  'double',
  // Like double, but a full set of top-of-range reps adds a set first (up to
  // TRIPLE_PROGRESSION_EXTRA_SETS more), and only then load.
  'triple',
]);
export type ProgressionMode = z.infer<typeof progressionModeSchema>;

export const progressionIncrementTypeSchema = z.enum(['weight', 'reps']);
export type ProgressionIncrementType = z.infer<
  typeof progressionIncrementTypeSchema
>;

export const exerciseProgressionConfigSchema = z.object({
  progressionMode: progressionModeSchema.default('rep_goal').optional(),
  targetSets: z.number().int().positive().default(3),
  repGoal: z.number().int().positive().nullable().optional(),
  incrementType: progressionIncrementTypeSchema.default('weight'),
  incrementValue: z.number().positive().default(5),
  equipmentBrand: z.string().nullable().optional(),
  // Bottom of the per-set rep range for double/triple (repGoal is the top).
  repRangeMin: z.number().int().positive().nullable().optional(),
});

export type ExerciseProgressionConfig = z.infer<
  typeof exerciseProgressionConfigSchema
>;

export interface CompletedSetHistory {
  setNumber: number;
  reps: number;
  weight: number;
  completed?: boolean;
}

export interface LastExercisePerformance {
  date?: string | Date;
  baseWeight: number;
  sets: CompletedSetHistory[];
}

export interface ProgressionEvaluationResult {
  goalAchieved: boolean;
  status:
    | 'PROGRESSION_WEIGHT_INCREASE'
    | 'PROGRESSION_REPS_INCREASE'
    | 'MAINTAIN_TARGET'
    | 'FIRST_SESSION'
    | 'MANUAL'
    | 'PROGRESSION_SET_INCREASE'
    | 'DELOAD';
  suggestedWeight: number;
  suggestedRepGoal: number;
  totalRepsAchieved: number;
  repDifference: number;
  /** English fallback; apps translate {@link reason} when it is present. */
  message: string;
  /** Signed change from last session's load on a deload (display unit). */
  suggestedWeightChange?: number;
  /** Working sets to aim for next time (triple progression only). */
  suggestedSets?: number;
  /** Why the target is what it is, as an id plus values for apps to translate. */
  reason?: ProgressionReason;
}

export type ProgressionReasonCode =
  'range_top_reached' | 'range_climbing' | 'range_add_set' | 'stall_deload';

export interface ProgressionReason {
  code: ProgressionReasonCode;
  /** Sets that reached the top of the range last time. */
  setsAtTop?: number;
  /** Working sets done last time. */
  sets?: number;
  repMin?: number;
  repMax?: number;
  /** Sessions in a row the goal was missed at the same load. */
  stalledSessions?: number;
  /** Deload size, percent. */
  deloadPercent?: number;
}
