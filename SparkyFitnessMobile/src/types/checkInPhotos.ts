import type {
  CheckInPhotoResponse,
  CheckInPhotoWithWeight,
  PhotoType,
  ProgressPhotoDay,
} from '@workspace/shared';

// The photo contract and the per-day gallery shape are owned by
// @workspace/shared, shared with the server and the web. Re-exported here so
// screens and hooks keep importing from one place.
export { PHOTO_TYPES } from '@workspace/shared';
export type { CheckInPhotoWithWeight, PhotoType, ProgressPhotoDay };

/** A photo row as returned by GET /measurements/check-in-photos/:date. */
export type CheckInPhoto = CheckInPhotoResponse;
