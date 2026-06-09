import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import FoodScanScreen from '../../src/screens/FoodScanScreen';
import { lookupBarcodeV2, scanNutritionLabel } from '../../src/services/api/externalFoodSearchApi';
import { ApiError } from '../../src/services/api/errors';
import { fireSuccessHaptic } from '../../src/services/haptics';
import { useActiveAiServiceSetting } from '../../src/hooks/useActiveAiServiceSetting';
import { hasSeenFoodPhotoIntro, markFoodPhotoIntroSeen } from '../../src/services/foodPhotoIntro';

jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  lookupBarcodeV2: jest.fn(),
  scanNutritionLabel: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
}));

jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: jest.fn(),
}));

jest.mock('../../src/services/foodPhotoIntro', () => ({
  hasSeenFoodPhotoIntro: jest.fn().mockResolvedValue(true),
  markFoodPhotoIntroSeen: jest.fn().mockResolvedValue(undefined),
}));

describe('FoodScanScreen', () => {
  const mockLookupBarcodeV2 = lookupBarcodeV2 as jest.MockedFunction<typeof lookupBarcodeV2>;
  const mockScanNutritionLabel = scanNutritionLabel as jest.MockedFunction<typeof scanNutritionLabel>;
  const mockFireSuccessHaptic = fireSuccessHaptic as jest.MockedFunction<
    typeof fireSuccessHaptic
  >;
  const mockUseActiveAiServiceSetting =
    useActiveAiServiceSetting as jest.MockedFunction<typeof useActiveAiServiceSetting>;
  const mockHasSeenFoodPhotoIntro =
    hasSeenFoodPhotoIntro as jest.MockedFunction<typeof hasSeenFoodPhotoIntro>;

  const mockNavigation = {
    replace: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
  } as any;

  const mockRoute = {
    key: 'FoodScan-key',
    name: 'FoodScan' as const,
    params: undefined,
  };

  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };

  const existingFoodResult = {
    source: 'local',
    food: {
      id: 'food-1',
      name: 'Greek Yogurt',
      brand: 'Sparky',
      default_variant: {
        id: 'variant-1',
        serving_size: 170,
        serving_unit: 'g',
        calories: 100,
        protein: 18,
        carbs: 6,
        fat: 0,
        dietary_fiber: null,
        saturated_fat: null,
        sodium: null,
        sugars: null,
        trans_fat: null,
        potassium: null,
        calcium: null,
        iron: null,
        cholesterol: null,
        vitamin_a: null,
        vitamin_c: null,
      },
    },
  } as any;

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodScanScreen navigation={mockNavigation} route={mockRoute} />
      </SafeAreaProvider>,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    mockScanNutritionLabel.mockReset();
    // Default: AI configured with google so Photo segment is unlocked.
    mockUseActiveAiServiceSetting.mockReturnValue({
      data: {
        id: 's',
        service_name: 'gemini',
        service_type: 'google',
        is_active: true,
      },
      isLoading: false,
    } as any);
    mockHasSeenFoodPhotoIntro.mockResolvedValue(true);
  });

  const renderScreenWithRoute = (params: any = undefined) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodScanScreen
          navigation={mockNavigation}
          route={{ ...mockRoute, params }}
        />
      </SafeAreaProvider>,
    );

  it('fires a success haptic when barcode lookup finds an existing food', async () => {
    mockLookupBarcodeV2.mockResolvedValue(existingFoodResult);
    const screen = renderScreen();

    fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
      data: '012345678905',
    });

    await waitFor(() => {
      expect(mockFireSuccessHaptic).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigation.replace).toHaveBeenCalledWith(
      'FoodEntryAdd',
      expect.objectContaining({
        item: expect.objectContaining({ id: 'food-1' }),
      }),
    );
  });

  it('does not fire a success haptic when barcode lookup finds no match', async () => {
    mockLookupBarcodeV2.mockResolvedValue({ source: 'remote', food: null } as any);
    const screen = renderScreen();

    fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
      data: '012345678905',
    });

    await waitFor(() => {
      expect(screen.getByText('No match for barcode')).toBeTruthy();
    });
    expect(mockFireSuccessHaptic).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
  });

  it('shows the lookup-failed recovery card with the server message when lookup throws', async () => {
    mockLookupBarcodeV2.mockRejectedValue(
      new ApiError(
        'Bad Gateway',
        502,
        JSON.stringify({ error: 'FatSecret API error (code 21): Invalid IP address detected' }),
      ),
    );
    const screen = renderScreen();

    fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
      data: '012345678905',
    });

    await waitFor(() => {
      expect(screen.getByText('Lookup failed')).toBeTruthy();
    });
    expect(
      screen.getByText('FatSecret API error (code 21): Invalid IP address detected'),
    ).toBeTruthy();
    // The misleading not-found copy is not shown for a real failure.
    expect(screen.queryByText('No match for barcode')).toBeNull();
    // The flow stays recoverable.
    expect(screen.getByText('Scan Nutrition Label')).toBeTruthy();
    expect(screen.getByText('Add Food Manually')).toBeTruthy();
    expect(mockFireSuccessHaptic).not.toHaveBeenCalled();
  });

  it('falls back to generic copy when a thrown lookup carries no server message', async () => {
    mockLookupBarcodeV2.mockRejectedValue(new Error('network down'));
    const screen = renderScreen();

    fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
      data: '012345678905',
    });

    await waitFor(() => {
      expect(screen.getByText('Lookup failed')).toBeTruthy();
    });
    expect(
      screen.getByText("Couldn't look up this barcode. Please try again."),
    ).toBeTruthy();
  });

  it('does not retrigger haptics while a scan lookup is locked', async () => {
    let resolveLookup: ((value: any) => void) | undefined;
    mockLookupBarcodeV2.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveLookup = resolve;
        }),
    );

    const screen = renderScreen();

    fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
      data: '012345678905',
    });
    fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
      data: '012345678905',
    });

    expect(mockLookupBarcodeV2).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLookup?.(existingFoodResult);
    });

    await waitFor(() => {
      expect(mockFireSuccessHaptic).toHaveBeenCalledTimes(1);
    });
  });

  it('does not fire a success haptic for manual barcode lookup success', async () => {
    mockLookupBarcodeV2.mockResolvedValue(existingFoodResult);
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Type Barcode Instead'));
    fireEvent.changeText(screen.getByPlaceholderText('Barcode number'), '012345678905');
    fireEvent.press(screen.getByText('Look Up'));

    await waitFor(() => {
      expect(mockNavigation.replace).toHaveBeenCalledWith(
        'FoodEntryAdd',
        expect.objectContaining({
          item: expect.objectContaining({ id: 'food-1' }),
        }),
      );
    });
    expect(mockFireSuccessHaptic).not.toHaveBeenCalled();
  });

  describe('Photo segment gating', () => {
    it('shows the setup gate when AI is unconfigured (after switching to Photo)', async () => {
      mockUseActiveAiServiceSetting.mockReturnValue({
        data: null,
        isLoading: false,
      } as any);
      const screen = renderScreen();

      fireEvent.press(screen.getByText('Photo'));

      await waitFor(() => {
        expect(
          screen.getByText(/AI photo estimates aren.t set up/),
        ).toBeTruthy();
      });
    });

    it('shows the gate via effect when initialMode=photo and AI is unconfigured', async () => {
      mockUseActiveAiServiceSetting.mockReturnValue({
        data: null,
        isLoading: false,
      } as any);
      const screen = renderScreenWithRoute({ initialMode: 'photo' });

      await waitFor(() => {
        expect(
          screen.getByText(/AI photo estimates aren.t set up/),
        ).toBeTruthy();
      });
    });

    it('treats any configured provider (e.g. mistral) as dispatchable: no gate, Photo available', async () => {
      // Attempt-all: mistral is dispatched server-side, so the gate must NOT
      // show and the Photo capture UI (library button) is available.
      mockUseActiveAiServiceSetting.mockReturnValue({
        data: {
          id: 's',
          service_name: 'mistral-large',
          service_type: 'mistral',
          is_active: true,
        },
        isLoading: false,
      } as any);
      const screen = renderScreenWithRoute({ initialMode: 'photo' });

      await waitFor(() => {
        expect(screen.getByLabelText('Choose photo from library')).toBeTruthy();
      });
      expect(
        screen.queryByText(/AI photo estimates aren.t set up/),
      ).toBeNull();
    });

    it('pushes the intro screen on first Photo use when the user has not seen it', async () => {
      mockHasSeenFoodPhotoIntro.mockResolvedValue(false);
      const screen = renderScreen();

      fireEvent.press(screen.getByText('Photo'));

      await waitFor(() => {
        expect(mockNavigation.navigate).toHaveBeenCalledWith('FoodPhotoIntro', {
          date: undefined,
        });
      });
    });

    it('does NOT push the intro when the user has seen it', async () => {
      mockHasSeenFoodPhotoIntro.mockResolvedValue(true);
      const screen = renderScreen();

      fireEvent.press(screen.getByText('Photo'));

      // Give the effect a tick to resolve.
      await act(async () => {
        await Promise.resolve();
      });
      expect(mockNavigation.navigate).not.toHaveBeenCalledWith(
        'FoodPhotoIntro',
        expect.anything(),
      );
    });

    it('hides the Photo segment when pickerMode is meal-builder', () => {
      const screen = renderScreenWithRoute({ pickerMode: 'meal-builder' });
      // Barcode + Label remain available; Photo is removed so meal-builder
      // scans can't accidentally drop into the diary-logging flow.
      expect(screen.getByText('Barcode')).toBeTruthy();
      expect(screen.getByText('Label')).toBeTruthy();
      expect(screen.queryByText('Photo')).toBeNull();
    });

    it('coerces initialMode=photo to barcode in meal-builder mode', () => {
      const screen = renderScreenWithRoute({
        pickerMode: 'meal-builder',
        initialMode: 'photo',
      });
      // No Photo segment, no AI gate — the scan opens on barcode instead.
      expect(screen.queryByText('Photo')).toBeNull();
      expect(
        screen.queryByText(/AI photo estimates aren.t set up/),
      ).toBeNull();
    });
  });

  describe('capture-barcode mode', () => {
    const captureRoute = {
      key: 'FoodScan-key',
      name: 'FoodScan' as const,
      params: { mode: 'capture-barcode' as const, returnKey: 'EditBarcode-key' },
    };

    const mockDispatch = jest.fn();
    const captureNavigation = {
      ...mockNavigation,
      dispatch: mockDispatch,
    } as any;

    const renderCapture = () =>
      render(
        <SafeAreaProvider initialMetrics={{ insets, frame }}>
          <FoodScanScreen navigation={captureNavigation} route={captureRoute} />
        </SafeAreaProvider>,
      );

    beforeEach(() => {
      mockDispatch.mockClear();
    });

    it('dispatches setParams to the returnKey on scan without calling lookup', async () => {
      const screen = renderCapture();

      fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
        data: '012345678905',
      });

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledTimes(1);
      });
      const dispatched = mockDispatch.mock.calls[0][0];
      expect(dispatched.source).toBe('EditBarcode-key');
      expect(dispatched.payload).toEqual(
        expect.objectContaining({
          params: expect.objectContaining({
            pendingScannedBarcode: '012345678905',
          }),
        }),
      );
      expect(mockLookupBarcodeV2).not.toHaveBeenCalled();
      expect(captureNavigation.goBack).toHaveBeenCalledTimes(1);
    });

    it('hides the Label and Photo segments', () => {
      const screen = renderCapture();
      expect(screen.getByText('Barcode')).toBeTruthy();
      expect(screen.queryByText('Label')).toBeNull();
      expect(screen.queryByText('Photo')).toBeNull();
    });

    it('manual submit dispatches to returnKey without lookup', async () => {
      const screen = renderCapture();

      fireEvent.press(screen.getByText('Type Barcode Instead'));
      fireEvent.changeText(screen.getByPlaceholderText('Barcode number'), '012345678905');
      fireEvent.press(screen.getByText('Use Barcode'));

      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalledTimes(1);
      });
      expect(mockLookupBarcodeV2).not.toHaveBeenCalled();
    });
  });

  describe('Active-AI refresh', () => {
    it('refetches the active-AI setting when re-tapping the Photo segment', async () => {
      const refetch = jest.fn();
      mockUseActiveAiServiceSetting.mockReturnValue({
        data: null,
        isLoading: false,
        refetch,
      } as any);
      const screen = renderScreen();

      // Switch to Photo — gate appears.
      fireEvent.press(screen.getByText('Photo'));
      await waitFor(() => {
        expect(
          screen.getByText(/AI photo estimates aren.t set up/),
        ).toBeTruthy();
      });

      // Re-tap Photo while still on Photo — should refetch.
      fireEvent.press(screen.getByText('Photo'));
      expect(refetch).toHaveBeenCalled();
    });
  });

  describe('Photo library picker', () => {
    const mockLaunchLibrary = ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
      typeof ImagePicker.launchImageLibraryAsync
    >;
    const mockMarkSeen = markFoodPhotoIntroSeen as jest.MockedFunction<
      typeof markFoodPhotoIntroSeen
    >;

    beforeEach(() => {
      mockLaunchLibrary.mockReset();
    });

    it('exposes the library button only in photo mode when AI is configured', async () => {
      const screen = renderScreen();
      // Not visible on barcode mode.
      expect(screen.queryByLabelText('Choose photo from library')).toBeNull();

      fireEvent.press(screen.getByText('Photo'));
      await waitFor(() => {
        expect(screen.getByLabelText('Choose photo from library')).toBeTruthy();
      });
    });

    it('hides the library button when AI photo is not available', async () => {
      mockUseActiveAiServiceSetting.mockReturnValue({
        data: null,
        isLoading: false,
      } as any);
      const screen = renderScreenWithRoute({ initialMode: 'photo' });

      await waitFor(() => {
        expect(
          screen.getByText(/AI photo estimates aren.t set up/),
        ).toBeTruthy();
      });
      expect(screen.queryByLabelText('Choose photo from library')).toBeNull();
    });

    it('routes a picked photo into the FoodPhotoFlow > Improve screen', async () => {
      mockLaunchLibrary.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///picked.jpg' } as any],
      } as any);

      const screen = renderScreenWithRoute({ initialMode: 'photo' });
      await waitFor(() => {
        expect(screen.getByLabelText('Choose photo from library')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Choose photo from library'));
      });

      await waitFor(() => {
        expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
      });
      expect(mockMarkSeen).toHaveBeenCalled();
      expect(mockNavigation.replace).toHaveBeenCalledWith('FoodPhotoFlow', {
        screen: 'Improve',
        params: { date: undefined, photo: { uri: 'file:///picked.jpg' } },
      });
    });

    it('does nothing when the user cancels the system picker', async () => {
      mockLaunchLibrary.mockResolvedValue({ canceled: true } as any);

      const screen = renderScreenWithRoute({ initialMode: 'photo' });
      await waitFor(() => {
        expect(screen.getByLabelText('Choose photo from library')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.press(screen.getByLabelText('Choose photo from library'));
      });

      await waitFor(() => {
        expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);
      });
      expect(mockNavigation.replace).not.toHaveBeenCalled();
    });

    it('ignores a second tap while the picker is still resolving', async () => {
      let resolveLaunch: ((value: any) => void) | undefined;
      mockLaunchLibrary.mockImplementation(
        () => new Promise((resolve) => { resolveLaunch = resolve; }),
      );

      const screen = renderScreenWithRoute({ initialMode: 'photo' });
      await waitFor(() => {
        expect(screen.getByLabelText('Choose photo from library')).toBeTruthy();
      });

      const button = screen.getByLabelText('Choose photo from library');
      await act(async () => {
        fireEvent.press(button);
        fireEvent.press(button);
      });

      expect(mockLaunchLibrary).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveLaunch?.({ canceled: true });
      });
    });
  });
});
