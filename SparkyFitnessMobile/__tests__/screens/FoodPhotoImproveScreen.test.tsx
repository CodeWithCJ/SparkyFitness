import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import FoodPhotoImproveScreen from '../../src/screens/FoodPhotoImproveScreen';
import type { ActionSheetRef as MockActionSheetRef } from '../../src/components/ActionSheet';
import { useEstimateFoodPhoto } from '../../src/hooks/useEstimateFoodPhoto';
import i18n, { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useEstimateFoodPhoto', () => ({
  useEstimateFoodPhoto: jest.fn(),
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

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock('../../src/utils/pickImage', () => ({
  downscaleFoodPhoto: jest.fn(async (asset: { uri: string }) => asset),
}));

// The add-image sheet: present() shows its items, dismiss() only records the
// call, and finishDismiss() ends the close animation and fires onDismiss, so a
// test can check that no picker opens while the sheet is still closing.
const mockAddSheet = {
  present: jest.fn(),
  dismiss: jest.fn(),
  finishDismiss: () => {},
};

jest.mock('../../src/components/ActionSheet', () => {
  const React: typeof import('react') = require('react');
  const {
    View,
    Text,
    Pressable,
  }: typeof import('react-native') = require('react-native');
  type MockSheetProps = React.ComponentPropsWithoutRef<
    typeof import('../../src/components/ActionSheet').default
  >;
  return {
    __esModule: true,
    default: React.forwardRef<MockActionSheetRef, MockSheetProps>(
      (props, ref) => {
        const [visible, setVisible] = React.useState(false);
        React.useImperativeHandle(ref, () => ({
          present: () => {
            mockAddSheet.present();
            setVisible(true);
          },
          dismiss: mockAddSheet.dismiss,
        }));
        const { onDismiss } = props;
        React.useEffect(() => {
          mockAddSheet.finishDismiss = () => {
            setVisible(false);
            onDismiss?.();
          };
        }, [onDismiss]);
        if (!visible) return null;
        return React.createElement(
          View,
          { testID: 'add-image-sheet' },
          React.createElement(Text, null, props.title),
          props.items.map((item) =>
            React.createElement(
              Pressable,
              { key: item.key, onPress: item.onPress },
              React.createElement(Text, null, item.label)
            )
          )
        );
      }
    ),
  };
});

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
          route={{
            ...baseRoute,
            params: { ...baseRoute.params, ...overrides },
          }}
        />
      </SafeAreaProvider>
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
        })
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
      })
    );
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('Generate path forwards weight+unit+description to the mutation', async () => {
    const screen = renderScreen();

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 350'), '250');
    fireEvent.changeText(
      screen.getByPlaceholderText(/salmon with lemon/),
      'yogurt and berries'
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
      })
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
    mockUseEstimate.mockImplementation(
      () =>
        ({
          mutate: mockMutate,
          isPending: pending,
          reset: resetFn,
        }) as any
    );

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
      </SafeAreaProvider>
    );

    fireEvent.press(screen.getByText('Cancel'));

    expect(signal.aborted).toBe(true);
    expect(resetFn).toHaveBeenCalledTimes(1);

    callbacks.onError({ code: 'UPSTREAM_ERROR', message: 'aborted' });
    expect(Toast.show).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  // Regression: the descriptionHint subject must use i18next count pluralization
  // (subjectLabel_one/few/many/other) instead of a manual ternary. PL requires
  // one/few/many/other; verify against the real PL catalog, not just defaultValue.
  describe('descriptionHint subjectLabel pluralization (real catalogs)', () => {
    beforeEach(async () => {
      await act(async () => {
        await initializeI18n('pl');
        await i18n.changeLanguage('pl');
      });
    });

    afterAll(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('PL: 1 zdjęcie (one)', () => {
      expect(i18n.t('foodPhotoImprove.subjectLabel', { count: 1 })).toBe(
        'zdjęcie'
      );
    });

    it('PL: 2 zdjęcia (few)', () => {
      expect(i18n.t('foodPhotoImprove.subjectLabel', { count: 2 })).toBe(
        'zdjęcia'
      );
    });

    it('PL: 3 zdjęcia (few)', () => {
      expect(i18n.t('foodPhotoImprove.subjectLabel', { count: 3 })).toBe(
        'zdjęcia'
      );
    });

    it('PL: 5 zdjęć (many)', () => {
      expect(i18n.t('foodPhotoImprove.subjectLabel', { count: 5 })).toBe(
        'zdjęć'
      );
    });

    it('PL: 12 zdjęć (many)', () => {
      expect(i18n.t('foodPhotoImprove.subjectLabel', { count: 12 })).toBe(
        'zdjęć'
      );
    });

    it('PL: 22 zdjęcia (few)', () => {
      expect(i18n.t('foodPhotoImprove.subjectLabel', { count: 22 })).toBe(
        'zdjęcia'
      );
    });
  });

  describe('add another image', () => {
    const mockLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;
    const mockCamera = ImagePicker.launchCameraAsync as jest.Mock;
    const mockCameraPermission =
      ImagePicker.requestCameraPermissionsAsync as jest.Mock;

    const openAddSheet = () => {
      const screen = renderScreen();
      fireEvent.press(screen.getByLabelText('Add another image'));
      expect(mockAddSheet.present).toHaveBeenCalledTimes(1);
      return screen;
    };

    const sentImages = async (screen: ReturnType<typeof renderScreen>) => {
      fireEvent.press(screen.getByText('Generate estimate'));
      await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
      return mockMutate.mock.calls[0][0].images;
    };

    it('opens the library only after the sheet has finished closing, and adds the pick', async () => {
      mockLibrary.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///library.png', mimeType: 'image/png' }],
      });
      const screen = openAddSheet();

      fireEvent.press(screen.getByText('Choose from library'));
      expect(mockAddSheet.dismiss).toHaveBeenCalledTimes(1);
      expect(mockLibrary).not.toHaveBeenCalled();

      await act(async () => mockAddSheet.finishDismiss());

      expect(mockLibrary).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(screen.getByLabelText('Remove image 2')).toBeTruthy()
      );
      expect(await sentImages(screen)).toEqual([
        { base64Image: 'AAAA-base64', mimeType: 'image/jpeg' },
        { base64Image: 'AAAA-base64', mimeType: 'image/png' },
      ]);
    });

    it('opens the camera only after the sheet has finished closing', async () => {
      mockCameraPermission.mockResolvedValueOnce({ granted: true });
      mockCamera.mockResolvedValueOnce({
        canceled: false,
        assets: [{ uri: 'file:///camera.jpg', mimeType: 'image/jpeg' }],
      });
      const screen = openAddSheet();

      fireEvent.press(screen.getByText('Take photo'));
      expect(mockCameraPermission).not.toHaveBeenCalled();
      expect(mockCamera).not.toHaveBeenCalled();

      await act(async () => mockAddSheet.finishDismiss());

      expect(mockCamera).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(screen.getByLabelText('Remove image 2')).toBeTruthy()
      );
    });

    it('closing the sheet without a choice opens no picker', async () => {
      openAddSheet();

      await act(async () => mockAddSheet.finishDismiss());

      expect(mockLibrary).not.toHaveBeenCalled();
      expect(mockCameraPermission).not.toHaveBeenCalled();
      expect(mockCamera).not.toHaveBeenCalled();
    });
  });
});
