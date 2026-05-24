import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodScanScreen from '../../src/screens/FoodScanScreen';
import { lookupBarcodeV2, scanNutritionLabel } from '../../src/services/api/externalFoodSearchApi';
import { fireSuccessHaptic } from '../../src/services/haptics';
import { useActiveAiServiceSetting } from '../../src/hooks/useActiveAiServiceSetting';
import { hasSeenFoodPhotoIntro } from '../../src/services/foodPhotoIntro';

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

    it('shows the gate when AI is configured for an unsupported provider', async () => {
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
        expect(
          screen.getByText(/AI photo estimates aren.t set up/),
        ).toBeTruthy();
      });
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
});
