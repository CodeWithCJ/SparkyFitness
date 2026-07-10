import { z } from 'zod/v4';

export const HuaweiHealthCallbackBodySchema = z
  .object({
    code: z.string().trim().min(1).max(4096),
    state: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
