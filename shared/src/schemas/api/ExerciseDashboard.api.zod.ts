import { z } from 'zod';

/**
 * Range aggregates from GET /api/reports/exercise-dashboard.
 *
 * The route also returns per-exercise PR, rep-range, and set-performance maps
 * plus the raw entries; the web types those itself. These are the fields both
 * the web dashboard and the mobile statistics screen read.
 */
export const exerciseDashboardSummarySchema = z.object({
  keyStats: z.object({
    totalWorkouts: z.number(),
    /** Sum of weight × reps, in kg. */
    totalVolume: z.number(),
    totalReps: z.number(),
  }),
  /** Weight × reps per primary muscle, in kg. */
  muscleGroupVolume: z.record(z.string(), z.number()),
  /** Working (non-warmup) sets per primary muscle. Drives the body figure. */
  muscleGroupSets: z.record(z.string(), z.number()),
  consistencyData: z.object({
    currentStreak: z.number(),
    longestStreak: z.number(),
    weeklyFrequency: z.number(),
    monthlyFrequency: z.number(),
  }),
  /** Last day (`YYYY-MM-DD`) each primary muscle was trained. */
  recoveryData: z.record(z.string(), z.string()),
  /** Distinct exercises per primary muscle. */
  exerciseVarietyData: z.record(z.string(), z.number()),
});

export type ExerciseDashboardSummary = z.infer<
  typeof exerciseDashboardSummarySchema
>;
