import { z } from 'zod';

export const SYNCED_DATA_ACTIONS = [
  'list_synced_sources',
  'delete_synced_source',
] as const;

const sourceSchema = z
  .string()
  .trim()
  .min(1, 'A non-empty source is required')
  .max(100, 'Source must be 100 characters or fewer');

export const manageSyncedDataSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list_synced_sources') }).strict(),
  z
    .object({
      action: z.literal('delete_synced_source'),
      source: sourceSchema.describe(
        'The provider source tag to bulk-delete (e.g. garmin, healthkit, health_connect)'
      ),
    })
    .strict(),
]);

export type ManageSyncedDataInput = z.infer<typeof manageSyncedDataSchema>;

export const manageSyncedDataInput = z.object({
  action: z.enum(SYNCED_DATA_ACTIONS).optional(),
  source: z.string().optional(),
});
