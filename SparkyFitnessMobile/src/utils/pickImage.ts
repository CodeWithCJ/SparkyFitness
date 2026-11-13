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

export const CHAT_MAX_IMAGE_DIMENSION = 1024;
const CHAT_COMPRESS_QUALITY = 0.8;
export const MAX_CHAT_ATTACHMENTS = 5;

export type PickedImage = { uri: string };

export type PickedChatImage = {
  uri: string;
  dataUrl: string;
  name: string;
  mimeType: 'image/jpeg';
};

/**
 * Distinguishes the two "nothing happened" outcomes: a cancel is the user
 * changing their mind and needs no message, while a denial is a dead end the
 * caller must explain (the picker will never open until Settings changes).
 */
export type CameraPickResult<T = PickedImage> =
  { status: 'ok'; image: T } | { status: 'cancelled' } | { status: 'denied' };

export type ChatCameraPickResult = CameraPickResult<PickedChatImage>;

type ImageAsset = {
  uri: string;
  width?: number;
  height?: number;
  fileName?: string | null;
};

function resizeActions(
  { width, height }: ImageAsset,
  maxDimension: number
): ImageManipulator.Action[] {
  if (
    !width ||
    !height ||
    width <= 0 ||
    height <= 0 ||
    Math.max(width, height) <= maxDimension
  )
    return [];

  return [
    {
      resize:
        width >= height ? { width: maxDimension } : { height: maxDimension },
    },
  ];
}

/**
 * Downscales an image so its longest edge is at most `MAX_DIMENSION` and
 * re-encodes it as JPEG. No-ops if the dimensions are already within bounds
 * or unknown, avoiding forced width-only distortion on tall images.
 */
async function downscale(asset: ImageAsset): Promise<PickedImage> {
  const { uri } = asset;
  const actions = resizeActions(asset, MAX_DIMENSION);

  // Re-encode even when no resize is needed: it normalizes HEIC (the iOS
  // default) to JPEG, which is on the server's mime allowlist. HEIC is not.
  const processed = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: COMPRESS_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return { uri: processed.uri };
}

export { downscale as downscaleFoodPhoto };

async function capturePhoto(): Promise<
  CameraPickResult<ImagePicker.ImagePickerAsset>
> {
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
  return { status: 'ok', image: asset };
}

export async function pickImageFromCamera(): Promise<CameraPickResult> {
  const result = await capturePhoto();
  if (result.status !== 'ok') return result;
  const asset = result.image;

  try {
    return { status: 'ok', image: await downscale(asset) };
  } catch (error) {
    // A failed re-encode should not lose the user's photo; the server still
    // accepts the original when it is within limits.
    addLog(
      `[Food Image] Downscale failed, using original: ${String(error)}`,
      'WARNING'
    );
    return { status: 'ok', image: { uri: asset.uri } };
  }
}

/**
 * Picks up to `limit` images from the photo library.
 */
export async function pickImagesFromLibrary(
  limit: number
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
        'WARNING'
      );
      picked.push({ uri: asset.uri });
    }
  }
  return picked;
}

function normalizeChatPhotoName(
  fileName: string | null | undefined,
  index: number
): string {
  const trimmed = fileName?.trim();
  if (!trimmed) return `photo-${index + 1}.jpg`;
  const withoutExt = trimmed.replace(/\.[^./\\]+$/, '');
  return `${withoutExt || `photo-${index + 1}`}.jpg`;
}

export async function prepareChatImage(
  asset: ImageAsset,
  index = 0
): Promise<PickedChatImage> {
  const { uri } = asset;
  const actions = resizeActions(asset, CHAT_MAX_IMAGE_DIMENSION);

  const processed = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: CHAT_COMPRESS_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  const base64 = processed.base64;
  if (!base64) throw new Error('Failed to encode photo for chat');

  return {
    uri: processed.uri,
    dataUrl: `data:image/jpeg;base64,${base64}`,
    name: normalizeChatPhotoName(asset.fileName, index),
    mimeType: 'image/jpeg',
  };
}

export async function pickChatImageFromCamera(): Promise<ChatCameraPickResult> {
  const result = await capturePhoto();
  if (result.status !== 'ok') return result;
  return { status: 'ok', image: await prepareChatImage(result.image) };
}

export async function pickChatImagesFromLibrary(
  limit = MAX_CHAT_ATTACHMENTS
): Promise<PickedChatImage[]> {
  const cappedLimit = Math.max(1, Math.min(limit, MAX_CHAT_ATTACHMENTS));
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
    allowsMultipleSelection: cappedLimit > 1,
    selectionLimit: cappedLimit,
  });
  if (result.canceled) return [];

  const assets = (result.assets ?? [])
    .filter((asset) => Boolean(asset?.uri))
    .slice(0, cappedLimit);
  if (assets.length === 0) return [];

  const picked: PickedChatImage[] = [];
  for (let i = 0; i < assets.length; i += 1) {
    picked.push(await prepareChatImage(assets[i], i));
  }
  return picked;
}
