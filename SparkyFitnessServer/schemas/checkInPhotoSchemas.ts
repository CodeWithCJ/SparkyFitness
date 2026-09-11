import { z } from 'zod/v4';
import {
  checkInPhotoGalleryResponseSchema,
  checkInPhotoResponseSchema,
  checkInPhotoWithWeightSchema,
  photoTypeSchema,
} from '@workspace/shared';

// The photo contract is shared with mobile: re-export it rather than
// redeclaring the shapes here, so the two cannot drift apart.
export const PhotoTypeSchema = photoTypeSchema;

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

export const CheckInPhotoResponseSchema = checkInPhotoResponseSchema;

/**
 * One photo in the progress gallery, paired with the weight recorded on the
 * same day. `file_path` is deliberately omitted: clients fetch the image bytes
 * through the authenticated /file/{id} route, so the on-disk layout stays a
 * server detail. `weight` is null when no check-in measurement exists for that
 * day, or when one exists without a weight.
 */
export const CheckInPhotoWithWeightSchema = checkInPhotoWithWeightSchema;

/** The gallery endpoint's full response: every photo, newest day first. */
export const CheckInPhotoGalleryResponseSchema =
  checkInPhotoGalleryResponseSchema;

export type CheckInPhotoResponse = z.infer<typeof CheckInPhotoResponseSchema>;
export type PhotoType = z.infer<typeof PhotoTypeSchema>;
export type CheckInPhotoWithWeight = z.infer<
  typeof CheckInPhotoWithWeightSchema
>;
