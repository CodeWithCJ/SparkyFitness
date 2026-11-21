import { z } from 'zod';

// Idempotency key for writes the mobile app may replay from its offline queue
// (docs/src/developer/offline-logging.md). The server stores it on the row it
// creates, so a replay of a request that already committed is answered with
// the existing result instead of logging twice.
export const clientRequestIdSchema = z.string().uuid();
export type ClientRequestId = z.infer<typeof clientRequestIdSchema>;
