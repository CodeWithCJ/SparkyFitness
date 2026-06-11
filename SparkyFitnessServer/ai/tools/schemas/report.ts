import { z } from 'zod';
import { optionalDateSchema } from './common.js';

const getWeeklyReportSchema = z
  .object({
    action: z.literal('get_weekly_report'),
    end_date: optionalDateSchema.describe(
      'The end date for the weekly report (YYYY-MM-DD)'
    ),
  })
  .strict();

export const manageReportSchema = z.discriminatedUnion('action', [
  getWeeklyReportSchema,
]);

export type ManageReportInput = z.infer<typeof manageReportSchema>;

// Flat shape published to the LLM as `inputSchema`. Strict validation still
// runs in the handler via `manageReportSchema.safeParse`.
export const manageReportInput = z.object({
  action: z.enum(['get_weekly_report']).describe('Action to perform.'),
  end_date: optionalDateSchema.describe(
    'get_weekly_report: end date for the weekly report (YYYY-MM-DD)'
  ),
});

export const dailyReportSchema = z.object({
  date: optionalDateSchema.optional(),
  start_date: optionalDateSchema.optional(),
  end_date: optionalDateSchema.optional(),
});
