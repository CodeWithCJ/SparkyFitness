/**
 * Canvas-based image downscaling for anything that ships an image to an AI
 * provider.
 *
 * Lives here rather than in `@workspace/shared` because it needs `Image` and
 * `<canvas>`; mobile does its resizing natively.
 */

/** Longest edge, in pixels, that a resized image is allowed to keep. */
export const DEFAULT_MAX_IMAGE_DIMENSION = 1024;

/**
 * Downscales a `data:` URL so its longest edge is at most `maxDim`, re-encoding
 * as JPEG at 0.8 quality. Anything that is not a data image URL, is already
 * small enough, or fails to decode is returned unchanged — callers get a usable
 * value rather than an exception.
 */
export const resizeImageBase64 = (
  base64Str: string,
  maxDim = DEFAULT_MAX_IMAGE_DIMENSION
): Promise<string> => {
  return new Promise((resolve) => {
    if (!base64Str.startsWith('data:image/')) {
      resolve(base64Str);
      return;
    }

    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width <= maxDim && height <= maxDim) {
        resolve(base64Str);
        return;
      }

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // JPEG at 0.8 keeps the payload well under the server's per-image cap.
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };

    img.onerror = () => {
      resolve(base64Str);
    };

    img.src = base64Str;
  });
};

export interface SplitDataUrl {
  base64: string;
  mimeType: string;
}

/**
 * Splits a `data:image/jpeg;base64,AAAA` URL into the parts the photo-estimate
 * endpoint wants: raw base64 with no prefix, plus the mime type as its own
 * field. Returns null for anything that is not a base64 data URL.
 */
export function splitDataUrl(dataUrl: string): SplitDataUrl | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  const mimeType = match?.[1];
  const base64 = match?.[2];
  if (!mimeType || !base64) return null;
  return { mimeType, base64 };
}
