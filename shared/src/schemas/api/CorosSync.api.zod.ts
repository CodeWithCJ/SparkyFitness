import { z } from 'zod';

export const corosSyncResultSchema = z.object({
  success: z.literal(true),
  source: z.enum(['live_api', 'local_raw_replay']),
  range: z.object({
    startDate: z.string(),
    endDate: z.string(),
  }),
  found: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skippedExisting: z.number().int().nonnegative(),
  deferred: z.number().int().nonnegative(),
  summaryOnly: z.number().int().nonnegative(),
  activitiesFailed: z.number().int().nonnegative(),
  failedRequiredFetches: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type CorosSyncResult = z.infer<typeof corosSyncResultSchema>;
