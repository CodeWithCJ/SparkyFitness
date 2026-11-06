import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import FoodScanScreen from '../../src/screens/FoodScanScreen';
import type {
  RootStackParamList,
  RootStackScreenProps,
} from '../../src/types/navigation';
import {
  scanNutritionLabel,
  type LabelScanResult,
} from '../../src/services/api/externalFoodSearchApi';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: () => true,
}));

jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  lookupBarcodeV2: jest.fn(),
  scanNutritionLabel: jest.fn(),
}));

jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({ data: null, isLoading: false }),
}));

jest.mock('../../src/services/foodPhotoIntro', () => ({
  hasSeenFoodPhotoIntro: jest.fn().mockResolvedValue(true),
  markFoodPhotoIntroSeen: jest.fn().mockResolvedValue(undefined),
}));

type CameraPermission = NonNullable<ReturnType<typeof useCameraPermissions>[0]>;

const deniedPermission: CameraPermission = {
  granted: false,
  status: 'denied' as CameraPermission['status'],
  canAskAgain: true,
  expires: 'never',
};

const labelResult: LabelScanResult = {
  name: 'Scanned label',
  brand: '',
  serving_size: 100,
  serving_unit: 'g',
  calories: 0,
  protein: 12,
  carbs: 0,
  fat: 0,
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

describe('FoodScanScreen without camera permission', () => {
  const requestPermission = jest.fn<Promise<CameraPermission>, []>();
  const getPermission = jest.fn<Promise<CameraPermission>, []>();
  const navigation = {
    replace: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
    dispatch: jest.fn(),
    isFocused: jest.fn(() => true),
  };

  const renderScreen = (
    params: RootStackParamList['FoodScan'] = {
      mode: 'capture-label',
      returnKey: 'FoodForm-edit-key',
    }
  ) =>
    render(
      <SafeAreaProvider
        initialMetrics={{
          insets: { top: 0, bottom: 0, left: 0, right: 0 },
          frame: { x: 0, y: 0, width: 390, height: 844 },
        }}
      >
        <FoodScanScreen
          navigation={
            navigation as unknown as RootStackScreenProps<'FoodScan'>['navigation']
          }
          route={{ key: 'FoodScan-key', name: 'FoodScan', params }}
        />
      </SafeAreaProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    requestPermission.mockResolvedValue(deniedPermission);
    getPermission.mockResolvedValue(deniedPermission);
    jest
      .mocked(useCameraPermissions)
      .mockReturnValue([deniedPermission, requestPermission, getPermission]);
    jest.mocked(scanNutritionLabel).mockResolvedValue(labelResult);
  });

  it('returns to the unsaved editor without asking for camera access', () => {
    const screen = renderScreen();
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'analyzes a library label when canAskAgain=%s',
    async (canAskAgain) => {
      jest
        .mocked(useCameraPermissions)
        .mockReturnValue([
          { ...deniedPermission, canAskAgain },
          requestPermission,
          getPermission,
        ]);
      jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            uri: 'file:///label.jpg',
            width: 800,
            height: 400,
            base64: 'label-base64',
          },
        ],
      });
      const screen = renderScreen();
      expect(screen.queryByTestId('camera-view')).toBeNull();
      expect(
        screen.getByLabelText('Take nutrition label photo')
      ).toBeDisabled();
      await act(async () =>
        fireEvent.press(
          screen.getByLabelText('Choose label photo from library')
        )
      );
      expect(screen.queryByText('Grant Permission')).toBeNull();
      await act(async () => fireEvent.press(screen.getByText('Use Photo')));
      expect(navigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'FoodForm-edit-key',
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
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(requestPermission).not.toHaveBeenCalled();
    }
  );

  it('returns unchanged when the library picker is cancelled without camera access', async () => {
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValueOnce({ canceled: true, assets: null });
    const screen = renderScreen();
    await act(async () =>
      fireEvent.press(screen.getByLabelText('Choose label photo from library'))
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(scanNutritionLabel).not.toHaveBeenCalled();
  });

  it('keeps an explicit action for requesting camera access', async () => {
    const screen = renderScreen();
    expect(requestPermission).not.toHaveBeenCalled();
    await act(async () =>
      fireEvent.press(screen.getByText('Grant Permission'))
    );
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('keeps the back action available for barcode capture', () => {
    const screen = renderScreen({
      mode: 'capture-barcode',
      returnKey: 'EditBarcode-key',
    });
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('camera-view')).toBeNull();
  });
});
