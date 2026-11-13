import { z } from 'zod';

// system.rate_limit_windows: fixed-window counters shared by every server
// instance (per-address route limits), written only through the owner pool.
export const rateLimitWindowsSchema = z.object({
  // "<limiter>|<client address>"
  key: z.string(),
  window_start: z.date(),
  count: z.number().int(),
  // End of the current window; the sweep deletes rows past it.
  expires_at: z.date(),
});

export type RateLimitWindows = z.infer<typeof rateLimitWindowsSchema>;
