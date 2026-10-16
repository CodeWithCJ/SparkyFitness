import { z } from 'zod';

// One row per entry. `points` rows are `[active seconds, cumulative metres]`.
export const exerciseEntryDistanceSeriesSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  exercise_entry_id: z.string(),
  entry_date: z.string(),
  points: z.array(z.tuple([z.number(), z.number()])),
  created_at: z.coerce.date().nullable(),
  updated_at: z.coerce.date().nullable(),
});

export type ExerciseEntryDistanceSeries = z.infer<
  typeof exerciseEntryDistanceSeriesSchema
>;
