import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodScanScreen from '../../src/screens/FoodScanScreen';
import { lookupBarcodeV2, scanNutritionLabel } from '../../src/services/api/externalFoodSearchApi';
import { fireSuccessHaptic } from '../../src/services/haptics';

jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  lookupBarcodeV2: jest.fn(),
  scanNutritionLabel: jest.fn(),
}));

jest.mock('../../src/services/haptics', () => ({
  fireSelectionHaptic: jest.fn(),
  fireSuccessHaptic: jest.fn(),
}));

describe('FoodScanScreen', () => {
  const mockLookupBarcodeV2 = lookupBarcodeV2 as jest.MockedFunction<typeof lookupBarcodeV2>;
  const mockScanNutritionLabel = scanNutritionLabel as jest.MockedFunction<typeof scanNutritionLabel>;
  const mockFireSuccessHaptic = fireSuccessHaptic as jest.MockedFunction<
    typeof fireSuccessHaptic
  >;

  const mockNavigation = {
    replace: jest.fn(),
    goBack: jest.fn(),
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
  });

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
});
