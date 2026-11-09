import * as ImageManipulator from 'expo-image-manipulator';
import { prepareLabelPhoto } from '../../src/utils/labelPhoto';

describe('nutrition label image preparation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crops before resizing and encodes the selected area instead of reusing the full image', async () => {
    const result = await prepareLabelPhoto(
      {
        uri: 'file:///label.jpg',
        width: 4000,
        height: 3000,
        base64: 'uncropped',
      },
      1600,
      { originX: 1000, originY: 500, width: 2000, height: 1000 }
    );
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///label.jpg',
      [
        { crop: { originX: 1000, originY: 500, width: 2000, height: 1000 } },
        { resize: { width: 1600 } },
      ],
      { compress: 0.85, format: 'jpeg', base64: true }
    );
    expect(result?.base64).toBe('AAAA-manipulated-base64');
  });

  it('does not downscale a small crop based on the original image dimensions', async () => {
    await prepareLabelPhoto(
      { uri: 'file:///label.jpg', width: 4000, height: 3000 },
      1600,
      { originX: 1000, originY: 500, width: 600, height: 1200 }
    );
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///label.jpg',
      [{ crop: { originX: 1000, originY: 500, width: 600, height: 1200 } }],
      expect.any(Object)
    );
  });

  it('keeps a previously cropped gallery image when no further changes are needed', async () => {
    expect(
      await prepareLabelPhoto({
        uri: 'file:///gallery.jpg',
        width: 800,
        height: 1200,
        base64: 'cropped-gallery',
      })
    ).toEqual({ uri: 'file:///gallery.jpg', base64: 'cropped-gallery' });
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
  });
});
