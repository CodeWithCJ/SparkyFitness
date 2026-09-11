import {
  useAuthedImageSource,
  type AuthedImageSource,
} from './useAuthedImageSource';

export type PregnancyPhotoSource = AuthedImageSource;

const PREGNANCY_PHOTO_PATH = '/api/v2/pregnancy/photos/file/';

/**
 * Builds `<SafeImage>` sources for bump photos.
 *
 * Bump photos are owner-only reproductive-health data: they are excluded from
 * the public `/uploads` static mount and served only by an authenticated,
 * owner-checked route, so the bytes need the headers that
 * {@link useAuthedImageSource} attaches.
 */
export function usePregnancyPhotoSource() {
  return useAuthedImageSource(PREGNANCY_PHOTO_PATH);
}
