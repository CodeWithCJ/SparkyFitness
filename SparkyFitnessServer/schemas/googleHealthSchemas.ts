import { z } from 'zod/v4';

export const CallbackBodySchema = z
  .object({
    code: z.string().min(1, 'code is required'),
  })
  .loose();

export type CallbackBody = z.infer<typeof CallbackBodySchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const SyncBodySchema = z
  .object({
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
  })
  .loose();

export type SyncBody = z.infer<typeof SyncBodySchema>;
