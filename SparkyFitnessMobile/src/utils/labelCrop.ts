export interface CoverCropInput {
  /** Layout size of the camera preview view, in screen points. */
  viewWidth: number;
  viewHeight: number;
  /** Guide rectangle size, in screen points. */
  guideWidth: number;
  guideHeight: number;
  /**
   * Vertical offset of the guide's center from the view's center, in screen
   * points (negative = above center, matching a marginBottom-style shift).
   */
  guideCenterYOffset: number;
  /** Captured photo size, in pixels. */
  photoWidth: number;
  photoHeight: number;
  /**
   * Extra margin captured around the guide, as a fraction of the guide size
   * per side. Tolerates slight hand misalignment without clipping the label.
   */
  paddingRatio?: number;
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Map the on-screen framing guide to a pixel crop rect on the captured photo.
 *
 * The camera preview renders aspect-fill ("cover"): the photo is scaled
 * uniformly until it covers the view, and the overflow is cropped equally on
 * both sides of the overflowing axis. Inverting that mapping: a view point
 * (x, y) corresponds to photo point ((x + offX) / s, (y + offY) / s), where
 * s = max(viewWidth / photoWidth, viewHeight / photoHeight) and offX/offY are
 * half the scaled overflow on each axis.
 *
 * The result is clamped to the photo bounds, so a guide that pokes past the
 * visible frame (or a padding that would) never produces an out-of-range crop.
 */
export function computeGuideCropRect(input: CoverCropInput): CropRect {
  const {
    viewWidth,
    viewHeight,
    guideWidth,
    guideHeight,
    guideCenterYOffset,
    photoWidth,
    photoHeight,
    paddingRatio = 0.08,
  } = input;

  const scale = Math.max(viewWidth / photoWidth, viewHeight / photoHeight);
  const offX = (photoWidth * scale - viewWidth) / 2;
  const offY = (photoHeight * scale - viewHeight) / 2;

  const padX = guideWidth * paddingRatio;
  const padY = guideHeight * paddingRatio;

  const guideLeft = (viewWidth - guideWidth) / 2 - padX;
  const guideTop =
    (viewHeight - guideHeight) / 2 + guideCenterYOffset - padY;
  const guideRight = guideLeft + guideWidth + padX * 2;
  const guideBottom = guideTop + guideHeight + padY * 2;

  const x0 = Math.max(0, Math.round((guideLeft + offX) / scale));
  const y0 = Math.max(0, Math.round((guideTop + offY) / scale));
  const x1 = Math.min(photoWidth, Math.round((guideRight + offX) / scale));
  const y1 = Math.min(photoHeight, Math.round((guideBottom + offY) / scale));

  return {
    originX: x0,
    originY: y0,
    width: Math.max(1, x1 - x0),
    height: Math.max(1, y1 - y0),
  };
}
