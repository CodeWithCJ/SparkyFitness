import { z } from 'zod';
import { optionalDateSchema, withDayNote } from './common.js';

export const DASHBOARD_ACTIONS = ['daily_summary'] as const;

export const dashboardSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('daily_summary'),
      date: optionalDateSchema.describe(
        withDayNote(
          'The calendar day (YYYY-MM-DD) to summarize. Defaults to today.'
        )
      ),
    })
    .strict(),
]);

export type DashboardInput = z.infer<typeof dashboardSchema>;

export const dashboardInput = z.object({
  action: z.enum(DASHBOARD_ACTIONS).optional(),
  date: z
    .string()
    .optional()
    .describe(withDayNote('Date (YYYY-MM-DD). Defaults to today')),
});
