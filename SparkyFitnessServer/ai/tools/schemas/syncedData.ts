import { z } from 'zod';

// Read-only surface. The bulk delete-by-source operation is deliberately not
// exposed to the AI: it is irreversible, spans every synced table, and takes no
// date bound, so a partial request ("remove last week's garmin data") has no
// correct call. It remains available in the web UI.
export const SYNCED_DATA_ACTIONS = ['list_synced_sources'] as const;

export const syncedDataSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list_synced_sources') }).strict(),
]);

export type SyncedDataInput = z.infer<typeof syncedDataSchema>;

export const syncedDataInput = z.object({
  action: z.enum(SYNCED_DATA_ACTIONS).optional(),
});
