import { z } from 'zod';
import { optionalDateSchema, withDayNote } from './common.js';

export const BLOOD_ALCOHOL_ACTIONS = ['estimate'] as const;

export const bloodAlcoholSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('estimate'),
      date: optionalDateSchema.describe(
        withDayNote(
          'The calendar day (YYYY-MM-DD) to evaluate. Defaults to today.'
        )
      ),
    })
    .strict(),
]);

export type BloodAlcoholInput = z.infer<typeof bloodAlcoholSchema>;

// Flat shape published to the LLM as `inputSchema`.
export const bloodAlcoholInput = z.object({
  action: z.enum(BLOOD_ALCOHOL_ACTIONS).optional(),
  date: z
    .string()
    .optional()
    .describe(withDayNote('Date (YYYY-MM-DD). Defaults to today')),
});
