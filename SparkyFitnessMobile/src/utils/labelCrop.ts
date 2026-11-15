import type { ActionCrop } from 'expo-image-manipulator';

/** Fractions of the original image, independent of preview size or letterboxing. */
export interface LabelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabelCropHandle =
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'move';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function adjustLabelCrop(
  crop: LabelCrop,
  handle: LabelCropHandle,
  dx: number,
  dy: number
): LabelCrop {
  if (handle === 'move') {
    return {
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height),
    };
  }

  let left = crop.x;
  let top = crop.y;
  let right = left + crop.width;
  let bottom = top + crop.height;
  // Keep a usable selection even if a handle is dragged past its opposite edge.
  const minimum = 0.05;
  if (handle === 'top-left' || handle === 'bottom-left')
    left = clamp(left + dx, 0, right - minimum);
  else right = clamp(right + dx, left + minimum, 1);
  if (handle === 'top-left' || handle === 'top-right')
    top = clamp(top + dy, 0, bottom - minimum);
  else bottom = clamp(bottom + dy, top + minimum, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function labelCropPixels(
  crop: LabelCrop,
  image: { width: number; height: number }
): ActionCrop['crop'] {
  const originX = clamp(Math.round(crop.x * image.width), 0, image.width - 1);
  const originY = clamp(Math.round(crop.y * image.height), 0, image.height - 1);
  const right = clamp(
    Math.round((crop.x + crop.width) * image.width),
    originX + 1,
    image.width
  );
  const bottom = clamp(
    Math.round((crop.y + crop.height) * image.height),
    originY + 1,
    image.height
  );
  return { originX, originY, width: right - originX, height: bottom - originY };
}
