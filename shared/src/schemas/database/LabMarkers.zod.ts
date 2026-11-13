import { z } from 'zod';

export const labMarkersIdSchema = z.string();

export const labMarkersSchema = z.object({
  id: labMarkersIdSchema,
  user_id: z.string(),
  name: z.string(),
  unit: z.string(),
  ref_range_low: z.number().nullable(),
  ref_range_high: z.number().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  created_by_user_id: z.string().nullable(),
  updated_by_user_id: z.string().nullable(),
});

export const labMarkersInitializerSchema = z.object({
  id: labMarkersIdSchema.optional(),
  user_id: z.string(),
  name: z.string(),
  unit: z.string().optional().default(''),
  ref_range_low: z.number().optional().nullable(),
  ref_range_high: z.number().optional().nullable(),
  created_at: z.coerce.date().optional(),
  updated_at: z.coerce.date().optional(),
  created_by_user_id: z.string().optional().nullable(),
  updated_by_user_id: z.string().optional().nullable(),
});

export const labMarkersMutatorSchema = labMarkersInitializerSchema.partial();

export type LabMarkers = z.infer<typeof labMarkersSchema>;
export type LabMarkersInitializer = z.infer<typeof labMarkersInitializerSchema>;
export type LabMarkersMutator = z.infer<typeof labMarkersMutatorSchema>;
