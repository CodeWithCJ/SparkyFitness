import * as ImageManipulator from 'expo-image-manipulator';
import { downscaleFoodPhoto } from '../../src/utils/pickImage';

describe('downscaleFoodPhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('resizes wide images exceeding MAX_DIMENSION', async () => {
    const result = await downscaleFoodPhoto({
      uri: 'file:///photo-wide.jpg',
      width: 4000,
      height: 3000,
    });

    expect(result.uri).toContain('-manipulated.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///photo-wide.jpg',
      [{ resize: { width: 1600 } }],
      expect.objectContaining({
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      })
    );
  });

  test('resizes tall images exceeding MAX_DIMENSION', async () => {
    const result = await downscaleFoodPhoto({
      uri: 'file:///photo-tall.jpg',
      width: 2400,
      height: 4800,
    });

    expect(result.uri).toContain('-manipulated.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///photo-tall.jpg',
      [{ resize: { height: 1600 } }],
      expect.objectContaining({
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      })
    );
  });

  test('does not add resize action if dimensions are already below MAX_DIMENSION', async () => {
    const result = await downscaleFoodPhoto({
      uri: 'file:///photo-small.png',
      width: 800,
      height: 600,
    });

    expect(result.uri).toContain('-manipulated.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///photo-small.png',
      [],
      expect.objectContaining({
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      })
    );
  });

  test('falls back to no resize action when width or height is undefined', async () => {
    const result = await downscaleFoodPhoto({
      uri: 'file:///photo-nodims.jpg',
    });

    expect(result.uri).toContain('-manipulated.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///photo-nodims.jpg',
      [],
      expect.objectContaining({
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      })
    );
  });

  test('falls back to no resize action when dimensions are zero', async () => {
    const result = await downscaleFoodPhoto({
      uri: 'file:///photo-zero-dim.jpg',
      width: 0,
      height: 0,
    });

    expect(result.uri).toContain('-manipulated.jpg');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///photo-zero-dim.jpg',
      [],
      expect.objectContaining({
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      })
    );
  });
});
