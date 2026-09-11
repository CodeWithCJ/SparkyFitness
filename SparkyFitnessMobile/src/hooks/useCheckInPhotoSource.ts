import {
  useAuthedImageSource,
  type AuthedImageSource,
} from './useAuthedImageSource';

export type CheckInPhotoSource = AuthedImageSource;

const CHECK_IN_PHOTO_PATH = '/api/measurements/check-in-photos/file/';

/**
 * Builds `<SafeImage>` sources for progress photos.
 *
 * `/check-in-photos/file/:id` sits behind `authenticate` plus the `checkin`
 * permission, so the bytes need the auth and proxy headers that
 * {@link useAuthedImageSource} attaches.
 */
export function useCheckInPhotoSource() {
  return useAuthedImageSource(CHECK_IN_PHOTO_PATH);
}
