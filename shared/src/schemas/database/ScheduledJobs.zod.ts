import { z } from 'zod';

// system.scheduled_jobs: the latest tick of each scheduled job and the server
// instance that claimed it, written only through the owner pool.
export const scheduledJobsSchema = z.object({
  name: z.string(),
  last_slot: z.date(),
  // "<hostname>:<pid>"
  claimed_by: z.string(),
  claimed_at: z.date(),
});

export type ScheduledJobs = z.infer<typeof scheduledJobsSchema>;
