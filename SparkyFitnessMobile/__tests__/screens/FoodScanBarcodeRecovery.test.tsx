import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodScanScreen from '../../src/screens/FoodScanScreen';
import type { RootStackScreenProps } from '../../src/types/navigation';
import {
  lookupBarcodeV2,
  type BarcodeLookupResult,
} from '../../src/services/api/externalFoodSearchApi';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useIsFocused: jest.fn(() => true),
}));
jest.mock('../../src/services/api/externalFoodSearchApi', () => ({
  lookupBarcodeV2: jest.fn(),
  scanNutritionLabel: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSuccessHaptic: jest.fn(),
}));
jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: () => ({ data: null, isLoading: false }),
}));
jest.mock('../../src/services/foodPhotoIntro', () => ({
  hasSeenFoodPhotoIntro: jest.fn().mockResolvedValue(true),
  markFoodPhotoIntroSeen: jest.fn(),
}));

type Props = RootStackScreenProps<'FoodScan'>;
const lookup = jest.mocked(lookupBarcodeV2);
const focused = jest.mocked(useIsFocused);
const missing: BarcodeLookupResult = { source: 'not_found', food: null };
const found: BarcodeLookupResult = {
  source: 'local',
  food: {
    id: 'yogurt',
    name: 'Yogurt',
    brand: null,
    is_custom: true,
    default_variant: {
      serving_size: 100,
      serving_unit: 'g',
      is_default: true,
      calories: 65,
      protein: 4,
      carbs: 5,
      fat: 3,
    },
  },
};
const navigation = {
  replace: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
};
const makeScreen = (params?: Props['route']['params']) => (
  <SafeAreaProvider
    initialMetrics={{
      insets: { top: 0, bottom: 0, left: 0, right: 0 },
      frame: { x: 0, y: 0, width: 390, height: 844 },
    }}
  >
    <FoodScanScreen
      navigation={navigation as unknown as Props['navigation']}
      route={{ key: 'scanner', name: 'FoodScan', params }}
    />
  </SafeAreaProvider>
);
const scan = (screen: ReturnType<typeof render>, barcode = '012345678905') => {
  fireEvent(screen.getByTestId('camera-view'), 'onBarcodeScanned', {
    data: barcode,
  });
};
const deferred = () => {
  let resolve!: (result: BarcodeLookupResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<BarcodeLookupResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

describe('FoodScan barcode recovery', () => {
  let changeState: (state: AppStateStatus) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    lookup.mockReset();
    focused.mockReturnValue(true);
    navigation.isFocused.mockReturnValue(true);
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        changeState = listener;
        return { remove: jest.fn() };
      });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(['miss', 'error'] as const)(
    'rescans in place after a lookup %s',
    async (outcome) => {
      if (outcome === 'miss') lookup.mockResolvedValueOnce(missing);
      else lookup.mockRejectedValueOnce(new Error('offline'));
      lookup.mockResolvedValueOnce(found);
      const screen = render(
        makeScreen({
          date: '2026-11-03',
          mealTypeId: 'lunch',
          providerId: 'provider-1',
        })
      );
      scan(screen);
      await screen.findByText(
        outcome === 'miss' ? 'No match for barcode' : 'Lookup failed'
      );
      expect(screen.getByText('012345678905')).toBeTruthy();
      fireEvent.press(screen.getByText('Scan again'));
      expect(screen.queryByText('No match for barcode')).toBeNull();
      expect(screen.queryByText('Lookup failed')).toBeNull();
      scan(screen, '4006381333931');
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(
          'FoodEntryAdd',
          expect.objectContaining({
            date: '2026-11-03',
            mealTypeId: 'lunch',
            barcodeLookup: expect.objectContaining({
              barcode: '4006381333931',
            }),
          })
        )
      );
      expect(lookup).toHaveBeenLastCalledWith(
        '4006381333931',
        'provider-1',
        expect.any(AbortSignal)
      );
    }
  );

  it('retries a failed lookup for the displayed barcode without rescanning', async () => {
    lookup
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(found);
    const screen = render(makeScreen());
    scan(screen);
    await screen.findByText('Lookup failed');
    fireEvent.press(screen.getByText('Retry lookup'));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    expect(lookup).toHaveBeenNthCalledWith(
      2,
      '012345678905',
      undefined,
      expect.any(AbortSignal)
    );
  });

  it.each(['rescan', 'background', 'blur', 'unmount'] as const)(
    'aborts the active network request on %s',
    (transition) => {
      const pending = deferred();
      lookup.mockReturnValueOnce(pending.promise);
      const screen = render(makeScreen());
      scan(screen);
      const signal = lookup.mock.calls[0]?.[2];
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);

      if (transition === 'rescan')
        fireEvent.press(screen.getByText('Scan again'));
      else if (transition === 'background')
        act(() => changeState('background'));
      else if (transition === 'blur') {
        focused.mockReturnValue(false);
        navigation.isFocused.mockReturnValue(false);
        screen.rerender(makeScreen());
      } else screen.unmount();

      expect(signal?.aborted).toBe(true);
    }
  );

  it.each(['success', 'miss', 'error'] as const)(
    'ignores an abandoned lookup %s while a newer lookup is pending',
    async (outcome) => {
      const old = deferred();
      const current = deferred();
      lookup
        .mockReturnValueOnce(old.promise)
        .mockReturnValueOnce(current.promise);
      const screen = render(makeScreen());
      scan(screen);
      fireEvent.press(screen.getByText('Scan again'));
      scan(screen, '4006381333931');
      await act(async () => {
        if (outcome === 'error') old.reject(new Error('late error'));
        else old.resolve(outcome === 'success' ? found : missing);
      });
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(screen.getByText('Looking up barcode…')).toBeTruthy();
      expect(screen.getByText('4006381333931')).toBeTruthy();
      expect(screen.queryByText('No match for barcode')).toBeNull();
      expect(screen.queryByText('Lookup failed')).toBeNull();
      await act(async () => current.resolve(found));
      expect(navigation.replace).toHaveBeenCalledTimes(1);
    }
  );

  it('accepts a scan after a camera restart and ignores events from the old preview', async () => {
    lookup.mockResolvedValue(found);
    const screen = render(makeScreen());
    const oldCamera = screen.getByTestId('camera-view');
    const oldScan = oldCamera.props.onBarcodeScanned as (event: {
      data: string;
    }) => Promise<void>;
    fireEvent.press(screen.getByText('Restart camera'));
    await act(async () => oldScan({ data: '012345678905' }));
    expect(lookup).not.toHaveBeenCalled();
    scan(screen, '4006381333931');
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    expect(lookup).toHaveBeenCalledWith(
      '4006381333931',
      undefined,
      expect.any(AbortSignal)
    );
  });

  it('offers in-place recovery from camera startup failure', () => {
    const screen = render(makeScreen());
    fireEvent(screen.getByTestId('camera-view'), 'onMountError', {
      message: 'Camera busy',
    });
    expect(screen.getByText('Camera unavailable')).toBeTruthy();
    expect(screen.queryByTestId('camera-view')).toBeNull();
    fireEvent.press(screen.getByText('Restart camera'));
    expect(screen.queryByText('Camera unavailable')).toBeNull();
    expect(screen.getByTestId('camera-view')).toBeTruthy();
  });

  it('releases the preview in the background and resumes scanning on return', async () => {
    lookup.mockResolvedValue(found);
    const screen = render(makeScreen());
    act(() => changeState('background'));
    expect(screen.queryByTestId('camera-view')).toBeNull();
    act(() => changeState('active'));
    scan(screen);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
  });

  it('ignores a queued scan immediately when the app leaves the foreground', () => {
    lookup.mockResolvedValue(found);
    const screen = render(makeScreen());
    const queuedScan = screen.getByTestId('camera-view').props
      .onBarcodeScanned as (event: { data: string }) => Promise<void>;
    act(() => {
      changeState('background');
      void queuedScan({ data: '012345678905' });
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(['background', 'blur'] as const)(
    'preserves manual entry when a queued submit runs during %s',
    async (transition) => {
      lookup.mockResolvedValue(found);
      const screen = render(makeScreen());
      fireEvent.press(screen.getByText('Type Barcode Instead'));
      fireEvent.changeText(
        screen.getByPlaceholderText('Barcode number'),
        '012345678905'
      );
      act(() => {
        if (transition === 'background') changeState('background');
        else navigation.isFocused.mockReturnValue(false);
        fireEvent.press(screen.getByText('Look Up'));
      });
      expect(lookup).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue('012345678905')).toBeTruthy();

      act(() => changeState('active'));
      navigation.isFocused.mockReturnValue(true);
      fireEvent.press(screen.getByText('Look Up'));
      await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
    }
  );

  it('discards a pending lookup that resolves after returning to the foreground', async () => {
    const pending = deferred();
    lookup.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(found);
    const screen = render(makeScreen());
    scan(screen);
    act(() => changeState('background'));
    act(() => changeState('active'));
    await act(async () => pending.resolve(found));
    expect(navigation.replace).not.toHaveBeenCalled();
    scan(screen, '4006381333931');
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
  });

  it('releases the preview when unfocused and discards the pending lookup', async () => {
    const pending = deferred();
    lookup.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(found);
    const screen = render(makeScreen());
    scan(screen);
    focused.mockReturnValue(false);
    navigation.isFocused.mockReturnValue(false);
    screen.rerender(makeScreen());
    expect(screen.queryByTestId('camera-view')).toBeNull();
    await act(async () => pending.resolve(found));
    expect(navigation.replace).not.toHaveBeenCalled();
    focused.mockReturnValue(true);
    navigation.isFocused.mockReturnValue(true);
    screen.rerender(makeScreen());
    scan(screen);
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledTimes(1));
  });

  it('restarts in capture-only mode without performing a food lookup', async () => {
    const screen = render(
      makeScreen({ mode: 'capture-barcode', returnKey: 'editor' })
    );
    fireEvent.press(screen.getByText('Restart camera'));
    scan(screen);
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));
    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'editor' })
    );
    expect(lookup).not.toHaveBeenCalled();
  });
});
