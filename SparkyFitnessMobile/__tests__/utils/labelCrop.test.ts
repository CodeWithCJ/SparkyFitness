import { computeGuideCropRect } from '../../src/utils/labelCrop';

// A helper mirroring the forward cover mapping, so tests assert round trips
// instead of hand-derived magic numbers.
function viewPointToPhotoPoint(
  vx: number,
  vy: number,
  viewW: number,
  viewH: number,
  photoW: number,
  photoH: number
): { x: number; y: number } {
  const s = Math.max(viewW / photoW, viewH / photoH);
  const offX = (photoW * s - viewW) / 2;
  const offY = (photoH * s - viewH) / 2;
  return { x: (vx + offX) / s, y: (vy + offY) / s };
}

describe('computeGuideCropRect', () => {
  const base = {
    viewWidth: 390,
    viewHeight: 844,
    guideWidth: 300,
    guideHeight: 400,
    guideCenterYOffset: -60,
    paddingRatio: 0,
  };

  it('maps a centered guide through a photo taller than the view ratio', () => {
    // iPhone-style 3:4 sensor in a 390x844 view: photo overflows horizontally.
    const rect = computeGuideCropRect({
      ...base,
      photoWidth: 1242,
      photoHeight: 2208,
    });

    const topLeft = viewPointToPhotoPoint(
      (390 - 300) / 2,
      (844 - 400) / 2 - 60,
      390,
      844,
      1242,
      2208
    );
    expect(rect.originX).toBe(Math.round(topLeft.x));
    expect(rect.originY).toBe(Math.round(topLeft.y));

    // Guide aspect must be preserved by the inverse mapping (uniform scale).
    expect(rect.width / rect.height).toBeCloseTo(300 / 400, 1);
  });

  it('maps through a photo wider than the view ratio (vertical overflow)', () => {
    const rect = computeGuideCropRect({
      ...base,
      photoWidth: 4000,
      photoHeight: 3000,
    });
    const s = Math.max(390 / 4000, 844 / 3000);
    // Horizontal overflow is huge here; the guide sits in the middle band.
    const expectedWidth = Math.round(300 / s);
    expect(Math.abs(rect.width - expectedWidth)).toBeLessThanOrEqual(1);
    expect(rect.originY).toBeGreaterThanOrEqual(0);
    expect(rect.originY + rect.height).toBeLessThanOrEqual(3000);
  });

  it('is exact when photo and view share an aspect ratio', () => {
    const rect = computeGuideCropRect({
      ...base,
      viewWidth: 390,
      viewHeight: 780,
      photoWidth: 1170,
      photoHeight: 2340,
    });
    // scale is exactly 1/3 view->photo; guide 300x400 -> 900x1200.
    expect(rect.width).toBe(900);
    expect(rect.height).toBe(1200);
    expect(rect.originX).toBe(((390 - 300) / 2) * 3);
    expect(rect.originY).toBe((((780 - 400) / 2 - 60) * 3));
  });

  it('padding grows the crop symmetrically', () => {
    const tight = computeGuideCropRect({
      ...base,
      photoWidth: 1242,
      photoHeight: 2208,
    });
    const padded = computeGuideCropRect({
      ...base,
      paddingRatio: 0.1,
      photoWidth: 1242,
      photoHeight: 2208,
    });
    expect(padded.width).toBeGreaterThan(tight.width);
    expect(padded.height).toBeGreaterThan(tight.height);
    expect(padded.originX).toBeLessThan(tight.originX);
    expect(padded.originY).toBeLessThan(tight.originY);
    // Center is preserved.
    expect(padded.originX + padded.width / 2).toBeCloseTo(
      tight.originX + tight.width / 2,
      0
    );
  });

  it('clamps to photo bounds when the guide + padding exceed the frame', () => {
    const rect = computeGuideCropRect({
      viewWidth: 390,
      viewHeight: 844,
      guideWidth: 380,
      guideHeight: 820,
      guideCenterYOffset: 0,
      paddingRatio: 0.5,
      photoWidth: 800,
      photoHeight: 600,
    });
    expect(rect.originX).toBeGreaterThanOrEqual(0);
    expect(rect.originY).toBeGreaterThanOrEqual(0);
    expect(rect.originX + rect.width).toBeLessThanOrEqual(800);
    expect(rect.originY + rect.height).toBeLessThanOrEqual(600);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('never returns a zero-size rect even on degenerate input', () => {
    const rect = computeGuideCropRect({
      viewWidth: 390,
      viewHeight: 844,
      guideWidth: 300,
      guideHeight: 400,
      guideCenterYOffset: -60,
      photoWidth: 10,
      photoHeight: 10,
    });
    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });
});
