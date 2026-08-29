import { z } from "zod";

export const checkInPhotosIdSchema = z.string().or(z.number());

export const checkInPhotosSchema = z.object({
  id: z.string().optional(),
  user_id: z.string(),
  check_in_measurement_id: z.string().nullable().optional(),
  entry_date: z.date(),
  photo_type: z.string(),
  file_path: z.string(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const checkInPhotosInitializerSchema = z.object({
  id: z.string().optional(),
  user_id: z.string().optional(),
  check_in_measurement_id: z.string().nullable().optional(),
  entry_date: z.date().optional(),
  photo_type: z.string().optional(),
  file_path: z.string().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export const checkInPhotosMutatorSchema =
  checkInPhotosInitializerSchema.partial();

export type CheckInPhotos = z.infer<typeof checkInPhotosSchema>;
export type CheckInPhotosInitializer = z.infer<
  typeof checkInPhotosInitializerSchema
>;
export type CheckInPhotosMutator = z.infer<typeof checkInPhotosMutatorSchema>;
