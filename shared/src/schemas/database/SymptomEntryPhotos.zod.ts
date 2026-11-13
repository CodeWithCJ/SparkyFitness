import { z } from 'zod';

export const symptomEntryPhotosIdSchema = z.string().or(z.number());

export const symptomEntryPhotosSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  symptom_entry_id: z.string(),
  file_path: z.string(),
  caption: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomEntryPhotosInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  symptom_entry_id: z.string().optional(),
  file_path: z.string().optional(),
  caption: z.string().nullable().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const symptomEntryPhotosMutatorSchema =
  symptomEntryPhotosInitializerSchema.partial();

export type SymptomEntryPhotos = z.infer<typeof symptomEntryPhotosSchema>;
export type SymptomEntryPhotosInitializer = z.infer<
  typeof symptomEntryPhotosInitializerSchema
>;
export type SymptomEntryPhotosMutator = z.infer<
  typeof symptomEntryPhotosMutatorSchema
>;
