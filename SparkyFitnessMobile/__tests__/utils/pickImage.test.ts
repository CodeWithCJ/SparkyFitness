import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import {
  CHAT_MAX_IMAGE_DIMENSION,
  MAX_CHAT_ATTACHMENTS,
  downscaleFoodPhoto,
  pickImageFromCamera,
  pickChatImageFromCamera,
  pickChatImagesFromLibrary,
  prepareChatImage,
} from '../../src/utils/pickImage';

jest.mock('expo-image-picker', () => ({
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

function permission(granted: boolean): ImagePicker.CameraPermissionResponse {
  return {
    granted,
    status: granted
      ? ImagePicker.PermissionStatus.GRANTED
      : ImagePicker.PermissionStatus.DENIED,
    canAskAgain: true,
    expires: 'never',
  };
}

function asset(
  overrides: Partial<ImagePicker.ImagePickerAsset> = {}
): ImagePicker.ImagePickerAsset {
  return {
    uri: 'file:///meal.heic',
    width: 4032,
    height: 3024,
    fileName: 'IMG_1234.HEIC',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(ImagePicker.requestCameraPermissionsAsync)
    .mockResolvedValue(permission(true));
});

describe('downscaleFoodPhoto', () => {
  test.each([
    ['wide', { width: 4000, height: 3000 }, [{ resize: { width: 1600 } }]],
    ['tall', { width: 2400, height: 4800 }, [{ resize: { height: 1600 } }]],
    ['small', { width: 800, height: 600 }, []],
    ['unknown', {}, []],
    ['zero', { width: 0, height: 0 }, []],
  ])(
    'handles %s dimensions without changing the food-photo quality',
    async (_name, dimensions, actions) => {
      const result = await downscaleFoodPhoto({
        uri: 'file:///food.png',
        ...dimensions,
      });
      expect(result.uri).toBe('file:///food.png-manipulated.jpg');
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file:///food.png',
        actions,
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
    }
  );

  test('keeps the original food photo if re-encoding fails', async () => {
    jest
      .mocked(ImagePicker.launchCameraAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [asset()] });
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockRejectedValueOnce(new Error('Cannot decode'));
    await expect(pickImageFromCamera()).resolves.toEqual({
      status: 'ok',
      image: { uri: 'file:///meal.heic' },
    });
  });
});

describe('prepareChatImage', () => {
  test('resizes wide HEIC photos and sends the encoded JPEG, not the original bytes', async () => {
    const result = await prepareChatImage(asset());
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///meal.heic',
      [{ resize: { width: CHAT_MAX_IMAGE_DIMENSION } }],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    expect(result).toEqual({
      uri: 'file:///meal.heic-manipulated.jpg',
      dataUrl: 'data:image/jpeg;base64,AAAA-manipulated-base64',
      name: 'IMG_1234.jpg',
      mimeType: 'image/jpeg',
    });
  });

  test('resizes tall photos and generates missing filenames', async () => {
    const result = await prepareChatImage(
      asset({ width: 1500, height: 3000, fileName: null }),
      2
    );
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///meal.heic',
      [{ resize: { height: CHAT_MAX_IMAGE_DIMENSION } }],
      expect.objectContaining({ base64: true })
    );
    expect(result.name).toBe('photo-3.jpg');
  });

  test.each([
    { width: 1024, height: 768 },
    { width: 800, height: 600 },
    { width: 0, height: 0 },
    {},
  ])('still encodes a JPEG without resizing %j', async (dimensions) => {
    await prepareChatImage({ uri: 'file:///small.png', ...dimensions });
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'file:///small.png',
      [],
      {
        compress: 0.8,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
  });

  test.each([
    ['  menu.PNG  ', 'menu.jpg'],
    ['meal', 'meal.jpg'],
    ['  ', 'photo-1.jpg'],
  ])('normalizes filename %s', async (fileName, expected) => {
    expect((await prepareChatImage(asset({ fileName }))).name).toBe(expected);
  });

  test('fails if JPEG bytes are missing rather than relabeling original image bytes', async () => {
    jest.mocked(ImageManipulator.manipulateAsync).mockResolvedValueOnce({
      uri: 'file:///encoded.jpg',
      width: 1024,
      height: 768,
    });
    await expect(
      prepareChatImage(asset({ base64: 'ORIGINAL_HEIC' }))
    ).rejects.toThrow('Failed to encode photo for chat');
  });
});

describe('pickChatImageFromCamera', () => {
  test('distinguishes denied permission from cancellation', async () => {
    jest
      .mocked(ImagePicker.requestCameraPermissionsAsync)
      .mockResolvedValueOnce(permission(false));
    await expect(pickChatImageFromCamera()).resolves.toEqual({
      status: 'denied',
    });
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
  });

  test.each<ImagePicker.ImagePickerResult>([
    { canceled: true, assets: null },
    { canceled: false, assets: [] },
  ])('returns cancelled without a captured photo', async (result) => {
    jest.mocked(ImagePicker.launchCameraAsync).mockResolvedValueOnce(result);
    await expect(pickChatImageFromCamera()).resolves.toEqual({
      status: 'cancelled',
    });
    expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
  });

  test('prepares a captured photo', async () => {
    jest
      .mocked(ImagePicker.launchCameraAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [asset()] });
    await expect(pickChatImageFromCamera()).resolves.toMatchObject({
      status: 'ok',
      image: { name: 'IMG_1234.jpg', mimeType: 'image/jpeg' },
    });
    expect(ImagePicker.launchCameraAsync).toHaveBeenCalledWith({
      mediaTypes: 'images',
      quality: 1,
    });
  });

  test('propagates encoding errors instead of attaching an unprocessed photo', async () => {
    jest
      .mocked(ImagePicker.launchCameraAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [asset()] });
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockRejectedValueOnce(new Error('Cannot decode'));
    await expect(pickChatImageFromCamera()).rejects.toThrow('Cannot decode');
  });
});

describe('pickChatImagesFromLibrary', () => {
  test('caps both native selection and returned assets at five photos', async () => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
      canceled: false,
      assets: Array.from({ length: 7 }, () => asset()),
    });
    const result = await pickChatImagesFromLibrary(10);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: 'images',
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: MAX_CHAT_ATTACHMENTS,
    });
    expect(result).toHaveLength(MAX_CHAT_ATTACHMENTS);
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledTimes(
      MAX_CHAT_ATTACHMENTS
    );
  });

  test('uses single selection when one slot remains', async () => {
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [asset(), asset()] });
    await expect(pickChatImagesFromLibrary(1)).resolves.toHaveLength(1);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: 'images',
      quality: 1,
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });
  });

  test.each<ImagePicker.ImagePickerResult>([
    { canceled: true, assets: null },
    { canceled: false, assets: [] },
    { canceled: false, assets: [asset({ uri: '' })] },
  ])(
    'returns no attachments for an empty or cancelled selection',
    async (result) => {
      jest
        .mocked(ImagePicker.launchImageLibraryAsync)
        .mockResolvedValueOnce(result);
      await expect(pickChatImagesFromLibrary()).resolves.toEqual([]);
      expect(ImageManipulator.manipulateAsync).not.toHaveBeenCalled();
    }
  );

  test('does not silently drop photos whose encoding fails', async () => {
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValueOnce({ canceled: false, assets: [asset(), asset()] });
    jest
      .mocked(ImageManipulator.manipulateAsync)
      .mockResolvedValueOnce({
        uri: 'file:///one.jpg',
        width: 1024,
        height: 768,
        base64: 'JPEG',
      })
      .mockResolvedValueOnce({
        uri: 'file:///two.jpg',
        width: 1024,
        height: 768,
      });
    await expect(pickChatImagesFromLibrary()).rejects.toThrow(
      'Failed to encode photo for chat'
    );
  });
});
