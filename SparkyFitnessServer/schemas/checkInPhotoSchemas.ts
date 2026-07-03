import { z } from 'zod/v4';

export const PhotoTypeSchema = z.enum(['front', 'back', 'side']);

export const CheckInPhotoDateParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
});

export const CheckInPhotoUploadParamSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  type: PhotoTypeSchema,
});

export const CheckInPhotoIdParamSchema = z.object({
  id: z.string().uuid('id must be a valid UUID'),
});

export const CheckInPhotoResponseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  check_in_measurement_id: z.string().uuid().nullable(),
  entry_date: z.string(),
  photo_type: PhotoTypeSchema,
  file_path: z.string(),
  created_at: z.string(),
});

export type CheckInPhotoResponse = z.infer<typeof CheckInPhotoResponseSchema>;
export type PhotoType = z.infer<typeof PhotoTypeSchema>;
