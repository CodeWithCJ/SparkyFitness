import { adjustLabelCrop, labelCropPixels } from '../../src/utils/labelCrop';

describe('nutrition label crop geometry', () => {
  it('maps the selected region to landscape and portrait pixels without letterboxing', () => {
    const crop = { x: 0.2, y: 0.3, width: 0.6, height: 0.5 };
    expect(labelCropPixels(crop, { width: 4000, height: 3000 })).toEqual({
      originX: 800,
      originY: 900,
      width: 2400,
      height: 1500,
    });
    expect(labelCropPixels(crop, { width: 3000, height: 4000 })).toEqual({
      originX: 600,
      originY: 1200,
      width: 1800,
      height: 2000,
    });
  });

  it('keeps the opposite corner fixed when resizing', () => {
    expect(
      adjustLabelCrop(
        { x: 0, y: 0, width: 1, height: 1 },
        'top-left',
        0.25,
        0.5
      )
    ).toEqual({ x: 0.25, y: 0.5, width: 0.75, height: 0.5 });
    expect(
      adjustLabelCrop(
        { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        'bottom-right',
        0.125,
        -0.125
      )
    ).toEqual({ x: 0.25, y: 0.25, width: 0.625, height: 0.375 });
  });

  it('clamps resizing to the image and prevents inverted or empty crops', () => {
    const crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    expect(adjustLabelCrop(crop, 'top-left', -2, -2)).toEqual({
      x: 0,
      y: 0,
      width: 0.75,
      height: 0.75,
    });
    const smallest = adjustLabelCrop(crop, 'top-left', 2, 2);
    expect(smallest.x).toBeCloseTo(0.7);
    expect(smallest.y).toBeCloseTo(0.7);
    expect(smallest.width).toBeCloseTo(0.05);
    expect(smallest.height).toBeCloseTo(0.05);
  });

  it('moves the entire selection within the image without changing its size', () => {
    expect(
      adjustLabelCrop(
        { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
        'move',
        3,
        -3
      )
    ).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
  });

  it('rounds both edges so a crop never exceeds an odd-sized image', () => {
    expect(
      labelCropPixels(
        { x: 0.333, y: 0.333, width: 0.667, height: 0.667 },
        { width: 101, height: 203 }
      )
    ).toEqual({ originX: 34, originY: 68, width: 67, height: 135 });
  });
});
