import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Longest edge sent for analysis. A label-filling crop reads correctly well
 * below this; capping bounds upload size without costing accuracy.
 */
export const LABEL_MAX_DIMENSION = 1600;

export interface PickedLabelAsset {
  uri: string;
  base64?: string | null;
  width?: number;
  height?: number;
}

export interface PreparedLabelPhoto {
  base64: string;
  uri: string;
}

/**
 * Downscales a picked photo to `maxDimension` (default `LABEL_MAX_DIMENSION`)
 * and returns it as JPEG base64, or null when the image cannot be encoded.
 */
export async function prepareLabelPhoto(
  asset: PickedLabelAsset,
  maxDimension: number = LABEL_MAX_DIMENSION,
  crop?: ImageManipulator.ActionCrop['crop']
): Promise<PreparedLabelPhoto | null> {
  const width = crop?.width ?? asset.width;
  const height = crop?.height ?? asset.height;
  const actions: ImageManipulator.Action[] = crop ? [{ crop }] : [];
  const longEdge = Math.max(width ?? 0, height ?? 0);
  if (longEdge > maxDimension && width && height) {
    const scaleTo =
      width >= height ? { width: maxDimension } : { height: maxDimension };
    actions.push({ resize: scaleTo });
  }
  if (actions.length === 0 && asset.base64)
    return { base64: asset.base64, uri: asset.uri };
  const reencoded = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return reencoded.base64
    ? { base64: reencoded.base64, uri: reencoded.uri }
    : null;
}
