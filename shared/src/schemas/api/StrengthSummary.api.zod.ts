import { z } from 'zod';

/** One exercise's best set by Epley estimate, all time. */
export const strengthBestLiftSchema = z.object({
  exerciseId: z.string().nullable(),
  exerciseName: z.string(),
  estimatedOneRMKg: z.number(),
  weightKg: z.number(),
  reps: z.number(),
  achievedAt: z.string(),
});
export type StrengthBestLift = z.infer<typeof strengthBestLiftSchema>;

/** GET /exercise-stats/strength-summary */
export const strengthSummaryResponseSchema = z.object({
  /** Everything ever logged on standard (non interval/WOD) strength sets. */
  lifetime: z.object({
    volumeKg: z.number(),
    sets: z.number(),
    reps: z.number(),
    sessions: z.number(),
    firstDate: z.string().nullable(),
  }),
  /** Latest logged body weight, or null when none is logged. */
  bodyweightKg: z.number().nullable(),
  /** Best estimated 1RM per exercise, strongest first. */
  lifts: z.array(strengthBestLiftSchema),
});
export type StrengthSummaryResponse = z.infer<
  typeof strengthSummaryResponseSchema
>;
