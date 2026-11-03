import { z } from 'zod';

export const labReportsIdSchema = z.string();

export const labReportsSchema = z.object({
  id: labReportsIdSchema,
  user_id: z.string(),
  lab_name: z.string().nullable(),
  collected_on: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const labReportsInitializerSchema = z.object({
  id: labReportsIdSchema.optional(),
  user_id: z.string(),
  lab_name: z.string().optional().nullable(),
  collected_on: z.string().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const labReportsMutatorSchema = labReportsInitializerSchema.partial();

export type LabReports = z.infer<typeof labReportsSchema>;
export type LabReportsInitializer = z.infer<typeof labReportsInitializerSchema>;
export type LabReportsMutator = z.infer<typeof labReportsMutatorSchema>;
