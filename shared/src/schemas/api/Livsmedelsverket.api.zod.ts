import { z } from 'zod';

export const livsmedelsverketBulkImportRequestSchema = z.object({
  language: z.enum(['sv', 'en']).optional().default('sv'),
  syncPastEntries: z.boolean().optional().default(false),
  maxFoods: z.number().int().positive().optional(),
});

export type LivsmedelsverketBulkImportRequest = z.infer<
  typeof livsmedelsverketBulkImportRequestSchema
>;

export const livsmedelsverketBulkImportStatusSchema = z.object({
  userId: z.string(),
  isRunning: z.boolean(),
  status: z.enum(['idle', 'running', 'completed', 'failed']),
  progress: z.number(),
  total: z.number(),
  processed: z.number(),
  imported: z.number(),
  updated: z.number(),
  error: z.string().optional(),
  lastRunAt: z.string().optional(),
});

export type LivsmedelsverketBulkImportStatus = z.infer<
  typeof livsmedelsverketBulkImportStatusSchema
>;

export const livsmedelsverketDeleteLibraryResponseSchema = z.object({
  message: z.string(),
  deletedCount: z.number(),
});

export type LivsmedelsverketDeleteLibraryResponse = z.infer<
  typeof livsmedelsverketDeleteLibraryResponseSchema
>;
