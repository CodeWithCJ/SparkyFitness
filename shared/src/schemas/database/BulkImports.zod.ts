import { z } from 'zod';

// system.bulk_imports: the latest bulk food import of each kind per user,
// written only through the owner pool.
export const bulkImportsSchema = z.object({
  user_id: z.string().uuid(),
  // 'canadian-nutrient-file' or 'livsmedelsverket'
  kind: z.string(),
  status: z.unknown(),
  updated_at: z.date(),
});

export type BulkImports = z.infer<typeof bulkImportsSchema>;
