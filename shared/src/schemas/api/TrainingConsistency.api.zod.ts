import { z } from "zod";

/**
 * GET /api/reports/training-consistency: how regularly the user trains.
 * Everything is computed from logged exercise entries by
 * `buildTrainingConsistency`; weeks start on the account's first day of the
 * week.
 */
export const trainingConsistencySchema = z.object({
  /** The day the figures are relative to (`YYYY-MM-DD`, user's timezone). */
  today: z.string(),
  /**
   * The weekday the weeks start on (0 = Sunday ... 6 = Saturday), from the
   * account's first-day-of-week preference. A server that predates the
   * preference being honoured starts weeks on Monday and omits this.
   */
  firstDayOfWeek: z.number().int().min(0).max(6).default(1),
  /**
   * One row per week, oldest first, ending with the week that contains
   * `today`. The streak below only looks this far back.
   */
  weeks: z.array(
    z.object({
      /** First day of the week, `YYYY-MM-DD`. */
      weekStart: z.string(),
      /** Distinct days with at least one logged workout. */
      workoutDays: z.number(),
    }),
  ),
  /** Distinct days with a logged workout inside `weeks`, ascending. */
  trainingDays: z.array(z.string()),
  /** Weeks in a row with at least one workout. */
  weeklyStreak: z.object({
    /**
     * Counts back from this week if it already has a workout, else from last
     * week: a week still in progress does not break the streak.
     */
    current: z.number(),
    /** Longest run inside `weeks`. */
    longest: z.number(),
  }),
  /** Working (non-warmup) sets per primary muscle for the week. */
  muscleSets: z.object({
    thisWeek: z.record(z.string(), z.number()),
    lastWeek: z.record(z.string(), z.number()),
  }),
});

export type TrainingConsistency = z.infer<typeof trainingConsistencySchema>;
