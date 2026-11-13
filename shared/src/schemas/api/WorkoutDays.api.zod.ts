import { z } from 'zod';

// #2461: per-day workout counts for the Reports workout heatmap. Sparse — only
// days with at least one logged workout — so a 12-month window stays small
// regardless of how much the full exercise dashboard payload would weigh.
export const workoutDayCountSchema = z.object({
  date: z.string(),
  count: z.number().int(),
});
export type WorkoutDayCount = z.infer<typeof workoutDayCountSchema>;

export const workoutDaysResponseSchema = z.object({
  days: z.array(workoutDayCountSchema),
});
export type WorkoutDaysResponse = z.infer<typeof workoutDaysResponseSchema>;
