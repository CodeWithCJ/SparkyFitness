import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { pickImagesFromLibrary } from '../../src/utils/pickImage';

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
const mockManipulate = ImageManipulator.manipulateAsync as jest.Mock;

const heicAsset = {
  uri: 'file:///picker/IMG_0001.heic',
  mimeType: 'image/heic',
  width: 4032,
  height: 3024,
};

describe('pickImagesFromLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManipulate.mockResolvedValue({ uri: 'file:///cache/manipulated.jpg' });
  });

  it('returns a library HEIC as a JPEG capped at 1600px on the long edge', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [heicAsset],
    });

    await expect(pickImagesFromLibrary(1)).resolves.toEqual([
      { uri: 'file:///cache/manipulated.jpg', mimeType: 'image/jpeg' },
    ]);
    expect(mockManipulate).toHaveBeenCalledWith(
      heicAsset.uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.85, format: 'jpeg' }
    );
  });

  it('re-encodes a photo that is already small enough without resizing it', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ ...heicAsset, width: 1080, height: 1440 }],
    });

    await pickImagesFromLibrary(1);

    expect(mockManipulate).toHaveBeenCalledWith(heicAsset.uri, [], {
      compress: 0.85,
      format: 'jpeg',
    });
  });

  it('keeps the original and its reported type when the re-encode fails', async () => {
    mockLaunchLibrary.mockResolvedValue({
      canceled: false,
      assets: [heicAsset],
    });
    mockManipulate.mockRejectedValue(new Error('decode failed'));

    await expect(pickImagesFromLibrary(1)).resolves.toEqual([
      { uri: heicAsset.uri, mimeType: 'image/heic' },
    ]);
  });

  it('returns nothing when the picker is cancelled', async () => {
    mockLaunchLibrary.mockResolvedValue({ canceled: true });

    await expect(pickImagesFromLibrary(3)).resolves.toEqual([]);
    expect(mockManipulate).not.toHaveBeenCalled();
  });
});
