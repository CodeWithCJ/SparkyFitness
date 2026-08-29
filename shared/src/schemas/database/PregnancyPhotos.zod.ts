import { z } from "zod";

export const pregnancyPhotosIdSchema = z.string().or(z.number());

export const pregnancyPhotosSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  pregnancy_id: z.string(),
  week: z.number(),
  entry_date: z.date(),
  file_path: z.string(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyPhotosInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  pregnancy_id: z.string().optional(),
  week: z.number().optional(),
  entry_date: z.date().optional(),
  file_path: z.string().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const pregnancyPhotosMutatorSchema =
  pregnancyPhotosInitializerSchema.partial();

export type PregnancyPhotos = z.infer<typeof pregnancyPhotosSchema>;
export type PregnancyPhotosInitializer = z.infer<
  typeof pregnancyPhotosInitializerSchema
>;
export type PregnancyPhotosMutator = z.infer<
  typeof pregnancyPhotosMutatorSchema
>;
