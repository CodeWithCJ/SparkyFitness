import React from 'react';
import { Animated } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type {
  CameraCapturedPicture,
  CameraPictureOptions,
  CameraView as MockCameraView,
  CameraViewProps as MockCameraViewProps,
} from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import FoodScanScreen from '../../src/screens/FoodScanScreen';
import type { RootStackScreenProps } from '../../src/types/navigation';
import {
  scanNutritionLabel,
  type LabelScanResult,
} from '../../src/services/api/externalFoodSearchApi';

const mockTakePicture = jest.fn<
  Promise<CameraCapturedPicture | undefined>,
  [CameraPictureOptions?]
>();

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));
jest.mock('expo-camera', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = require('react-native') as typeof import('react-native');
  return {
    CameraView: React.forwardRef<MockCameraView, MockCameraViewProps>(
      (props, ref) => {
        React.useImperativeHandle(
          ref,
          () =>
            ({ takePictureAsync: mockTakePicture }) as unknown as MockCameraView
        );
        return <View {...props} testID="camera-view" />;
      }
    ),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true }),
}));
jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  lookupBarcodeV2: jest.fn(),
  scanNutritionLabel: jest.fn(),
}));
jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({ data: null, isLoading: false }),
}));
jest.mock('../../src/services/onDeviceLabelScan', () => ({
  scanLabelOnDevice: jest.fn().mockResolvedValue(null),
  isOnDeviceLabelScanAvailable: () => false,
}));

type Props = RootStackScreenProps<'FoodScan'>;
const navigation = {
  replace: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
};
const photo: CameraCapturedPicture = {
  uri: 'file:///camera-label.jpg',
  width: 4000,
  height: 3000,
  format: 'jpg',
};
const labelResult: LabelScanResult = {
  name: 'Test label',
  brand: '',
  serving_size: 100,
  serving_unit: 'g',
  calories: 100,
  protein: 10,
  carbs: 10,
  fat: 2,
  fiber: null,
  saturated_fat: null,
  trans_fat: null,
  sodium: null,
  sugars: null,
  cholesterol: null,
  potassium: null,
  calcium: null,
  iron: null,
  caffeine_mg: null,
  water_ml: null,
  alcohol_g: null,
  vitamin_a: null,
  vitamin_c: null,
};
const renderScreen = (
  params: Props['route']['params'] = { initialMode: 'label' }
) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
        frame: { x: 0, y: 0, width: 390, height: 844 },
      }}
    >
      <FoodScanScreen
        navigation={navigation as unknown as Props['navigation']}
        route={{ key: 'label-camera', name: 'FoodScan', params }}
      />
    </SafeAreaProvider>
  );
const takePhoto = async (screen: ReturnType<typeof render>) => {
  fireEvent(screen.getByTestId('camera-view'), 'cameraReady');
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Take nutrition label photo'));
  });
};

describe('in-app nutrition label camera', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // TouchableOpacity's native opacity animation needs an attached native
    // view when camera readiness changes; the renderer has no native tree.
    jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    mockTakePicture.mockReset().mockResolvedValue(photo);
    navigation.isFocused.mockReturnValue(true);
    jest.mocked(scanNutritionLabel).mockResolvedValue(labelResult);
  });
  afterEach(() => jest.restoreAllMocks());

  it('captures the existing preview and reviews the photo without opening a second camera', async () => {
    const screen = renderScreen();
    await takePhoto(screen);
    expect(screen.getByText('Use Photo')).toBeTruthy();
    expect(mockTakePicture).toHaveBeenCalledWith(
      expect.objectContaining({
        quality: 1,
        base64: false,
      })
    );
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(scanNutritionLabel).not.toHaveBeenCalled();
  });

  it('crops the selected region before encoding and returns recognized values to the unsaved editor', async () => {
    const screen = renderScreen({
      mode: 'capture-label',
      returnKey: 'food-editor',
    });
    await takePhoto(screen);
    fireEvent(screen.getByTestId('label-photo-cropper'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } },
    });
    fireEvent(
      screen.getByLabelText('Top left crop handle'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'right' },
      }
    );
    fireEvent(
      screen.getByLabelText('Top left crop handle'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'down' },
      }
    );
    await act(async () => fireEvent.press(screen.getByText('Use Photo')));
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      photo.uri,
      [
        { crop: { originX: 200, originY: 150, width: 3800, height: 2850 } },
        { resize: { width: 1600 } },
      ],
      expect.objectContaining({ base64: true, format: 'jpeg' })
    );
    expect(scanNutritionLabel).toHaveBeenCalledWith(
      'AAAA-manipulated-base64',
      'image/jpeg'
    );
    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'food-editor',
        payload: {
          params: {
            pendingNutritionLabelScan: {
              result: labelResult,
              nonce: expect.any(Number),
            },
          },
        },
      })
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('returns to the in-app camera when retaking a photo', async () => {
    const screen = renderScreen();
    await takePhoto(screen);
    fireEvent.press(screen.getByLabelText('Retake photo'));
    expect(screen.getByTestId('camera-view')).toBeTruthy();
    expect(screen.queryByText('Use Photo')).toBeNull();
    await takePhoto(screen);
    expect(mockTakePicture).toHaveBeenCalledTimes(2);
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('waits for camera readiness before allowing capture', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Take nutrition label photo'));
    expect(mockTakePicture).not.toHaveBeenCalled();
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
  });

  it('ignores duplicate shutter taps and a photo that arrives after leaving the scanner', async () => {
    let resolvePhoto!: (value: CameraCapturedPicture) => void;
    mockTakePicture.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePhoto = resolve;
        })
    );
    const screen = renderScreen();
    fireEvent(screen.getByTestId('camera-view'), 'cameraReady');
    fireEvent.press(screen.getByLabelText('Take nutrition label photo'));
    fireEvent.press(screen.getByLabelText('Take nutrition label photo'));
    expect(mockTakePicture).toHaveBeenCalledTimes(1);
    navigation.isFocused.mockReturnValue(false);
    await act(async () => resolvePhoto(photo));
    expect(screen.queryByText('Use Photo')).toBeNull();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('keeps capture failures recoverable by taking another photo', async () => {
    mockTakePicture.mockRejectedValueOnce(new Error('Camera busy'));
    const screen = renderScreen();
    await takePhoto(screen);
    expect(screen.queryByText('Use Photo')).toBeNull();
    expect(navigation.goBack).not.toHaveBeenCalled();
    await takePhoto(screen);
    await waitFor(() => expect(screen.getByText('Use Photo')).toBeTruthy());
  });
});
