import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { addLog } from '../services/LogService';

/**
 * Camera / photo-library capture for food and meal photos, downscaled before
 * upload.
 *
 * The server stores what it is given — there is no thumbnail generation and no
 * `sharp` — and enforces a 10 MB per-file limit. A modern phone camera photo
 * can approach or exceed that, and a full-resolution shot is wasted on a 40pt
 * list thumbnail, so every picked image is resized and re-encoded first. This
 * mirrors what `FoodScanScreen.prepareLabelPhoto` does for label scans.
 */

// Long-edge cap. Comfortably above what any current display needs for a
// full-screen lightbox, while cutting a 12MP camera shot by roughly an order
// of magnitude.
const MAX_DIMENSION = 1600;
const COMPRESS_QUALITY = 0.85;

export type PickedImage = { uri: string };

/**
 * Distinguishes the two "nothing happened" outcomes: a cancel is the user
 * changing their mind and needs no message, while a denial is a dead end the
 * caller must explain (the picker will never open until Settings changes).
 */
export type CameraPickResult =
  | { status: 'ok'; image: PickedImage }
  | { status: 'cancelled' }
  | { status: 'denied' };

async function downscale(asset: {
  uri: string;
  width?: number;
  height?: number;
}): Promise<PickedImage> {
  const { uri, width, height } = asset;
  const longEdge = Math.max(width ?? 0, height ?? 0);

  const actions: ImageManipulator.Action[] =
    longEdge > MAX_DIMENSION && width && height
      ? [
          {
            resize:
              width >= height
                ? { width: MAX_DIMENSION }
                : { height: MAX_DIMENSION },
          },
        ]
      : [];

  // Re-encode even when no resize is needed: it normalizes HEIC (the iOS
  // default) to JPEG, which is on the server's mime allowlist. HEIC is not.
  const processed = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: COMPRESS_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return { uri: processed.uri };
}

/** Takes a photo with the system camera. */
export async function pickImageFromCamera(): Promise<CameraPickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { status: 'denied' };
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    quality: 1,
  });
  if (result.canceled) return { status: 'cancelled' };

  const asset = result.assets?.[0];
  if (!asset?.uri) return { status: 'cancelled' };

  try {
    return { status: 'ok', image: await downscale(asset) };
  } catch (error) {
    // A failed re-encode should not lose the user's photo; the server still
    // accepts the original when it is within limits.
    addLog(
      `[Food Image] Downscale failed, using original: ${String(error)}`,
      'WARNING',
    );
    return { status: 'ok', image: { uri: asset.uri } };
  }
}

/**
 * Picks up to `limit` images from the photo library.
 */
export async function pickImagesFromLibrary(
  limit: number,
): Promise<PickedImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: Math.max(1, limit),
  });
  if (result.canceled) return [];

  const picked: PickedImage[] = [];
  for (const asset of result.assets ?? []) {
    if (!asset?.uri) continue;
    try {
      picked.push(await downscale(asset));
    } catch (error) {
      addLog(
        `[Food Image] Downscale failed, using original: ${String(error)}`,
        'WARNING',
      );
      picked.push({ uri: asset.uri });
    }
  }
  return picked;
}
