import { z } from 'zod';
import { runDayStringSchema } from './RunProgram.api.zod.ts';

export const runGoalsResponseSchema = z.object({
  /** Kilometres to run in a week, or null for no target. */
  weekly_distance_km: z.number().positive().max(1000).nullable(),
  race_name: z.string().max(100).nullable(),
  /** The race day (YYYY-MM-DD), or null for no race. */
  race_date: runDayStringSchema.nullable(),
  /** Race distance in kilometres, for display. */
  race_distance_km: z.number().positive().max(1000).nullable(),
  updated_at: z.string(),
});
export type RunGoals = z.infer<typeof runGoalsResponseSchema>;

/** Where the person stands against their goals today. */
export const runGoalProgressSchema = z.object({
  /** First day (YYYY-MM-DD) of the current week, per the account's first day of the week. */
  week_start: runDayStringSchema,
  /** Last day of the current week. */
  week_end: runDayStringSchema,
  /** Kilometres run so far this week. */
  week_distance_km: z.number().min(0),
  /** Runs so far this week. */
  run_count: z.number().int().min(0),
  /** Whole percent of the weekly target reached (may exceed 100), or null with no target. */
  weekly_percent: z.number().int().min(0).nullable(),
  /** Days left in the week including today. */
  days_left_in_week: z.number().int().min(1).max(7),
  /** Kilometres per remaining day to reach the target, or null with no target or once reached. */
  daily_needed_km: z.number().min(0).nullable(),
  /** Days until the race: 0 on race day, negative once it has passed, null with no race. */
  race_days_left: z.number().int().nullable(),
});
export type RunGoalProgress = z.infer<typeof runGoalProgressSchema>;

/** `goals` is null until the person has set one. */
export const getRunGoalsResponseSchema = z.object({
  goals: runGoalsResponseSchema.nullable(),
  progress: runGoalProgressSchema,
});
export type GetRunGoalsResponse = z.infer<typeof getRunGoalsResponseSchema>;

/** Only fields present are changed; null clears one. */
export const upsertRunGoalsBodySchema = z
  .object({
    weekly_distance_km: z.number().positive().max(1000).nullable().optional(),
    race_name: z.string().trim().min(1).max(100).nullable().optional(),
    race_date: runDayStringSchema.nullable().optional(),
    race_distance_km: z.number().positive().max(1000).nullable().optional(),
  })
  .refine(
    (body) =>
      body.race_date !== null || (!body.race_name && !body.race_distance_km),
    {
      message: 'A race name or distance needs a race day.',
      path: ['race_date'],
    }
  );
export type UpsertRunGoalsBody = z.infer<typeof upsertRunGoalsBodySchema>;
