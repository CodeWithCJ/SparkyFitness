import type {
  CheckInPhotoResponse,
  CheckInPhotoWithWeight,
  PhotoType,
} from '@workspace/shared';

// The photo contract is owned by @workspace/shared and shared with the server.
// Re-exported here so screens and hooks keep importing from one place.
export { PHOTO_TYPES } from '@workspace/shared';
export type { CheckInPhotoWithWeight, PhotoType };

/** A photo row as returned by GET /measurements/check-in-photos/:date. */
export type CheckInPhoto = CheckInPhotoResponse;

/**
 * One calendar day of the progress gallery: the photos taken that day, keyed by
 * angle, plus the day's weight. Built client-side from the flat gallery
 * response so the timeline, the comparison picker and the time-lapse player all
 * work off whole days rather than loose photos.
 */
export interface ProgressPhotoDay {
  entry_date: string;
  weight: number | null;
  photos: Partial<Record<PhotoType, CheckInPhotoWithWeight>>;
}
