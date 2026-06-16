import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { pressAction, expectActionPresent } from './helpers/nativeHeaderTestUtils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import EditBarcodeScreen from '../../src/screens/EditBarcodeScreen';
import { updateFood } from '../../src/services/api/foodsApi';
import { lookupBarcodeV2 } from '../../src/services/api/externalFoodSearchApi';

jest.mock('../../src/services/api/foodsApi', () => ({
  updateFood: jest.fn(),
}));

jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  lookupBarcodeV2: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View testID={`icon-${props.name}`} />,
  };
});

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockUpdateFood = updateFood as jest.MockedFunction<typeof updateFood>;
const mockLookupBarcodeV2 = lookupBarcodeV2 as jest.MockedFunction<typeof lookupBarcodeV2>;

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

const buildRoute = (paramsOverrides: Record<string, unknown> = {}) => ({
  key: 'EditBarcode-key',
  name: 'EditBarcode' as const,
  params: {
    foodId: 'food-1',
    foodName: 'Greek Yogurt',
    currentBarcode: null as string | null,
    returnKey: 'FoodDetail-key',
    ...paramsOverrides,
  },
});

const navigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  dispatch: jest.fn(),
} as any;

const renderScreen = (paramsOverrides: Record<string, unknown> = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <EditBarcodeScreen
          navigation={navigation}
          route={buildRoute(paramsOverrides) as any}
        />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
};

describe('EditBarcodeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves a new barcode after a clean conflict check and dispatches the normalized value back', async () => {
    mockLookupBarcodeV2.mockResolvedValue({ source: 'not_found', food: null } as any);
    mockUpdateFood.mockResolvedValue({
      id: 'food-1',
      name: 'Greek Yogurt',
      brand: null,
      is_custom: true,
      barcode: '0012345678905',
      default_variant: {} as any,
    } as any);

    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('012345678905'), '012345678905');
    pressAction(screen, navigation, 'Save');

    await waitFor(() => {
      expect(mockUpdateFood).toHaveBeenCalledWith('food-1', { barcode: '012345678905' });
    });
    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    const dispatched = navigation.dispatch.mock.calls[0][0];
    expect(dispatched.source).toBe('FoodDetail-key');
    // Server normalized 12-digit UPC-A to 13-digit EAN-13 — that's what we echo.
    expect(dispatched.payload.params.updatedBarcode).toBe('0012345678905');
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', text1: 'Barcode saved' }),
    );
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('shows a conflict alert when the barcode is already on another local food', async () => {
    mockLookupBarcodeV2.mockResolvedValue({
      source: 'local',
      food: { id: 'food-2', name: 'Other Yogurt' },
    } as any);

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => {
        // simulate user pressing Cancel
      });

    const screen = renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('012345678905'), '012345678905');

    await act(async () => {
      pressAction(screen, navigation, 'Save');
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Barcode already in use',
      expect.stringContaining('Other Yogurt'),
      expect.any(Array),
      expect.any(Object),
    );
    expect(mockUpdateFood).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('shows the Remove button only when a barcode is currently set', () => {
    const screenWithout = renderScreen({ currentBarcode: null });
    expect(screenWithout.queryByText('Remove barcode')).toBeNull();
    screenWithout.unmount();

    const screenWith = renderScreen({ currentBarcode: '3017620422003' });
    expect(screenWith.getByText('Remove barcode')).toBeTruthy();
  });

  it('removes the barcode after confirm and dispatches null back', async () => {
    mockUpdateFood.mockResolvedValue({
      id: 'food-1',
      name: 'Greek Yogurt',
      brand: null,
      is_custom: true,
      barcode: null,
      default_variant: {} as any,
    } as any);

    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        const removeBtn = buttons?.find((b: any) => b.text === 'Remove');
        removeBtn?.onPress?.();
      });

    const screen = renderScreen({ currentBarcode: '3017620422003' });
    await act(async () => {
      fireEvent.press(screen.getByText('Remove barcode'));
    });

    await waitFor(() => {
      expect(mockUpdateFood).toHaveBeenCalledWith('food-1', { barcode: null });
    });
    const dispatched = navigation.dispatch.mock.calls[0][0];
    expect(dispatched.source).toBe('FoodDetail-key');
    expect(dispatched.payload.params.updatedBarcode).toBeNull();
    expect(navigation.goBack).toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it('rejects invalid format client-side without calling the API', () => {
    const screen = renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('012345678905'), 'abc');

    // Save is disabled when value is invalid, so the regex inline error shows.
    expect(screen.getByText(/Barcode must be 8-14 digits/)).toBeTruthy();
    expect(mockUpdateFood).not.toHaveBeenCalled();
  });

  it('short-circuits when value matches the stored normalized form (12 vs 13 digit UPC-A)', async () => {
    const screen = renderScreen({ currentBarcode: '0012345678905' });
    fireEvent.changeText(screen.getByPlaceholderText('012345678905'), '012345678905');

    pressAction(screen, navigation, 'Save');
    // Save is disabled because the normalized value matches; nothing happens.
    expect(mockLookupBarcodeV2).not.toHaveBeenCalled();
    expect(mockUpdateFood).not.toHaveBeenCalled();
  });

  it('applies a barcode handed back via pendingScannedBarcode/scannedBarcodeNonce', () => {
    const screen = renderScreen({
      pendingScannedBarcode: '3017620422003',
      scannedBarcodeNonce: 1,
    });
    const input = screen.getByPlaceholderText('012345678905') as any;
    expect(input.props.value).toBe('3017620422003');
    expect(navigation.setParams).toHaveBeenCalledWith({
      pendingScannedBarcode: undefined,
      scannedBarcodeNonce: undefined,
    });
  });
});
