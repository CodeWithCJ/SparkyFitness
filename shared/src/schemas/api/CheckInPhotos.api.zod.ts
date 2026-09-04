import { z } from "zod";

/** The three angles the server accepts for a check-in progress photo. */
export const PHOTO_TYPES = ["front", "back", "side"] as const;

export const photoTypeSchema = z.enum(PHOTO_TYPES);

/**
 * One photo in the progress gallery, paired with the weight recorded on the
 * same day.
 *
 * `file_path` is deliberately absent: clients fetch the image bytes through the
 * authenticated /file/{id} route, so the on-disk layout stays a server detail.
 * `weight` is in kilograms, as stored, and is null when that day has no
 * check-in measurement or the measurement carries no weight.
 */
export const checkInPhotoWithWeightSchema = z.object({
  id: z.string().uuid(),
  entry_date: z.string(),
  photo_type: photoTypeSchema,
  weight: z.number().nullable(),
});

/** Response of GET /measurements/check-in-photos, newest day first. */
export const checkInPhotoGalleryResponseSchema = z.array(
  checkInPhotoWithWeightSchema,
);

/** A photo row as returned by GET /measurements/check-in-photos/:date. */
export const checkInPhotoResponseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  check_in_measurement_id: z.string().uuid().nullable(),
  entry_date: z.string(),
  photo_type: photoTypeSchema,
  file_path: z.string(),
  created_at: z.string(),
});

export type PhotoType = z.infer<typeof photoTypeSchema>;
export type CheckInPhotoWithWeight = z.infer<
  typeof checkInPhotoWithWeightSchema
>;
export type CheckInPhotoGalleryResponse = z.infer<
  typeof checkInPhotoGalleryResponseSchema
>;
export type CheckInPhotoResponse = z.infer<typeof checkInPhotoResponseSchema>;
