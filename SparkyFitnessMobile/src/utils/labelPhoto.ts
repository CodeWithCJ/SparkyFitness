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
  maxDimension: number = LABEL_MAX_DIMENSION
): Promise<PreparedLabelPhoto | null> {
  const longEdge = Math.max(asset.width ?? 0, asset.height ?? 0);
  if (longEdge > maxDimension && asset.width && asset.height) {
    const scaleTo =
      asset.width >= asset.height
        ? { width: maxDimension }
        : { height: maxDimension };
    const processed = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: scaleTo }],
      {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    if (processed.base64)
      return { base64: processed.base64, uri: processed.uri };
  }
  if (asset.base64) return { base64: asset.base64, uri: asset.uri };
  const reencoded = await ImageManipulator.manipulateAsync(asset.uri, [], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return reencoded.base64
    ? { base64: reencoded.base64, uri: reencoded.uri }
    : null;
}
