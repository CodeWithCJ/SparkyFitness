import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FoodPhotoImproveScreen from '../../src/screens/FoodPhotoImproveScreen';
import { useEstimateFoodPhoto } from '../../src/hooks/useEstimateFoodPhoto';

jest.mock('../../src/hooks/useEstimateFoodPhoto', () => ({
  useEstimateFoodPhoto: jest.fn(),
}));

jest.mock('../../src/hooks/useActiveAiServiceSetting', () => ({
  useActiveAiServiceSetting: jest.fn(() => ({ data: null, isLoading: false })),
}));

const mockBase64 = jest.fn().mockResolvedValue('AAAA-base64');
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    base64: mockBase64,
  })),
  Paths: { cache: { uri: 'file:///mock/' } },
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

describe('FoodPhotoImproveScreen', () => {
  const parentNavigation = {
    replace: jest.fn(),
    popToTop: jest.fn(),
  };
  const navigation = {
    replace: jest.fn(),
    goBack: jest.fn(),
    navigate: jest.fn(),
    popToTop: jest.fn(),
    getParent: jest.fn(() => parentNavigation),
  } as any;
  const baseRoute = {
    key: 'k',
    name: 'Improve' as const,
    params: {
      date: '2026-05-18',
      photo: { uri: 'file:///photo.jpg' },
    },
  };

  const mockMutate = jest.fn();
  const mockUseEstimate = useEstimateFoodPhoto as jest.MockedFunction<
    typeof useEstimateFoodPhoto
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBase64.mockResolvedValue('AAAA-base64');
    navigation.getParent.mockReturnValue(parentNavigation);
    mockUseEstimate.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);
  });

  const renderScreen = (overrides: Partial<typeof baseRoute.params> = {}) =>
    render(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodPhotoImproveScreen
          navigation={navigation}
          route={{ ...baseRoute, params: { ...baseRoute.params, ...overrides } }}
        />
      </SafeAreaProvider>,
    );

  it('rejects negative weight', async () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 350'), '0');
    fireEvent.press(screen.getByText('Generate estimate'));

    await waitFor(() => {
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Invalid weight',
        }),
      );
    });
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('Generate with empty fields sends a single-image images[] payload, base64 is read once', async () => {
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Generate estimate'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
    expect(mockBase64).toHaveBeenCalledTimes(1);
    const [input] = mockMutate.mock.calls[0];
    expect(input).toEqual(
      expect.objectContaining({
        images: [{ base64Image: 'AAAA-base64', mimeType: 'image/jpeg' }],
        description: undefined,
        totalWeight: undefined,
        weightUnit: undefined,
      }),
    );
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('Generate path forwards weight+unit+description to the mutation', async () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 350'), '250');
    fireEvent.changeText(
      screen.getByPlaceholderText(/salmon with lemon/),
      'yogurt and berries',
    );
    fireEvent.press(screen.getByText('Generate estimate'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
    const [input] = mockMutate.mock.calls[0];
    expect(input).toEqual(
      expect.objectContaining({
        images: [{ base64Image: 'AAAA-base64', mimeType: 'image/jpeg' }],
        description: 'yogurt and berries',
        totalWeight: 250,
        weightUnit: 'g',
      }),
    );
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('shows the pending state (spinner, status message, cancel) while estimating', () => {
    mockUseEstimate.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
      reset: jest.fn(),
    } as any);
    const screen = renderScreen();

    expect(screen.queryByText('Generate estimate')).toBeNull();
    expect(screen.queryByPlaceholderText('e.g. 350')).toBeNull();
    expect(screen.queryByPlaceholderText(/salmon with lemon/)).toBeNull();

    expect(screen.getByText('Reading your photo…')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('Cancel aborts the in-flight request and suppresses the error toast', async () => {
    const resetFn = jest.fn();
    let pending = false;
    mockUseEstimate.mockImplementation(() => ({
      mutate: mockMutate,
      isPending: pending,
      reset: resetFn,
    }) as any);

    pending = false;
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Generate estimate'));
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
    const [input, callbacks] = mockMutate.mock.calls[0];
    const signal: AbortSignal = input.signal;
    expect(signal.aborted).toBe(false);

    pending = true;
    screen.rerender(
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <FoodPhotoImproveScreen
          navigation={navigation}
          route={baseRoute as any}
        />
      </SafeAreaProvider>,
    );

    fireEvent.press(screen.getByText('Cancel'));

    expect(signal.aborted).toBe(true);
    expect(resetFn).toHaveBeenCalledTimes(1);

    callbacks.onError({ code: 'UPSTREAM_ERROR', message: 'aborted' });
    expect(Toast.show).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
