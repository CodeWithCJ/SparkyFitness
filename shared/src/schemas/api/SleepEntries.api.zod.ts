import { z } from 'zod';
import { sleepEntriesSchema } from '../database/SleepEntries.zod.ts';

/** JSON form of the sleep table response; dates are serialized by the API. */
export const sleepEntriesResponseSchema = sleepEntriesSchema.extend({
  id: z.string(),
  user_id: z.string(),
  entry_date: z.string(),
  bedtime: z.string(),
  wake_time: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export type SleepEntriesResponse = z.infer<typeof sleepEntriesResponseSchema>;
