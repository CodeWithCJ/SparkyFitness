import React from 'react';
import { act, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import ProgressPhotoTimelapseScreen from '../../src/screens/ProgressPhotoTimelapseScreen';
import { useCheckInPhotoGallery } from '../../src/hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../../src/hooks/useCheckInPhotoSource';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import { formatShortDate, getTodayDate } from '../../src/utils/dateUtils';
import type { ProgressPhotoDay } from '../../src/types/checkInPhotos';

jest.mock('../../src/hooks/useCheckInPhotos', () => ({
  useCheckInPhotoGallery: jest.fn(),
}));
jest.mock('../../src/hooks/useCheckInPhotoSource', () => ({
  useCheckInPhotoSource: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The real sheet needs a BottomSheetModalProvider. Record its props on each
// render instead, so a test can present it and confirm a range the way a tap
// would. Recorded through a mock call rather than an assignment: the compiler
// lint forbids writing to an outer variable from a component body.
type SheetProps = {
  onConfirm: (from: string, to: string) => void;
  title?: string;
  confirmLabel?: string;
};
const mockSheetRender = jest.fn<void, [SheetProps]>();
const mockPresentSheet = jest.fn();
jest.mock('../../src/components/DateRangeSheet', () => {
  const { forwardRef, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: forwardRef<
      { present: () => void; dismiss: () => void },
      SheetProps
    >((props, ref) => {
      mockSheetRender(props);
      useImperativeHandle(ref, () => ({
        present: mockPresentSheet,
        dismiss: jest.fn(),
      }));
      return null;
    }),
  };
});

/** Props from the sheet's latest render. */
const sheetProps = (): SheetProps | undefined =>
  mockSheetRender.mock.calls.at(-1)?.[0];

const mockUseGallery = useCheckInPhotoGallery as jest.MockedFunction<
  typeof useCheckInPhotoGallery
>;
const mockUseSource = useCheckInPhotoSource as jest.MockedFunction<
  typeof useCheckInPhotoSource
>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;
const mockUseScreenHeader = useScreenHeader as jest.MockedFunction<
  typeof useScreenHeader
>;
let prefetchSpy: jest.SpiedFunction<typeof Image.prefetch>;

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

/** `n` days before today, so the range windows can be exercised. */
const daysAgo = (n: number): string => {
  const today = new Date(`${getTodayDate()}T00:00:00`);
  today.setDate(today.getDate() - n);
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(today.getDate()).padStart(2, '0');
  return `${today.getFullYear()}-${month}-${dayOfMonth}`;
};

/** Same formatting the screen uses for the range label. */
const shortDate = (isoDay: string): string =>
  formatShortDate(isoDay, 'en-US').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const day = (entry_date: string): ProgressPhotoDay => ({
  entry_date,
  weight: 80,
  photos: {
    front: {
      id: `${entry_date}-front`,
      entry_date,
      photo_type: 'front',
      weight: 80,
    },
  },
});

const setGallery = (days: ProgressPhotoDay[]) => {
  mockUseGallery.mockReturnValue({
    days,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCheckInPhotoGallery>);
};

/** The range menu lives in the header, which is mocked away. */
const rangeMenu = () =>
  (
    mockUseScreenHeader.mock.calls[
      mockUseScreenHeader.mock.calls.length - 1
    ][0] as unknown as {
      right?: {
        showsBadge?: boolean;
        items?: {
          items: {
            label: string;
            selected?: boolean;
            onPress: () => void;
          }[];
        }[];
      };
    }
  ).right;

const renderScreen = () =>
  render(
    <ProgressPhotoTimelapseScreen
      navigation={
        navigation as unknown as React.ComponentProps<
          typeof ProgressPhotoTimelapseScreen
        >['navigation']
      }
      route={
        {
          key: 'ProgressPhotoTimelapse-key',
          name: 'ProgressPhotoTimelapse',
          params: {},
        } as unknown as React.ComponentProps<
          typeof ProgressPhotoTimelapseScreen
        >['route']
      }
    />
  );

describe('ProgressPhotoTimelapseScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prefetchSpy = jest
      .spyOn(Image, 'prefetch')
      .mockResolvedValue(true as never);
    mockUseSource.mockReturnValue({
      getPhotoSource: jest.fn((id: string) => ({
        uri: `https://x/${id}`,
        headers: {},
      })),
      isReady: true,
    } as unknown as ReturnType<typeof useCheckInPhotoSource>);
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'kg' },
    } as unknown as ReturnType<typeof usePreferences>);
  });

  afterEach(() => {
    prefetchSpy.mockRestore();
  });

  it('plays a bounded window rather than the whole history by default', () => {
    // 200 shoots spread over two years: the default window keeps the run
    // watchable instead of a ten-minute slideshow.
    setGallery(
      Array.from({ length: 200 }, (_, i) => day(daysAgo(i * 4))).reverse()
    );

    const { getByText } = renderScreen();

    // 92-day window at one shoot every 4 days is 24 frames, not 200.
    expect(getByText(/of 24 · Last 3 months/)).toBeTruthy();
  });

  it('warms only a few frames ahead, never the whole set', () => {
    // The buffer is what keeps a long run from pulling every image at once.
    setGallery(Array.from({ length: 30 }, (_, i) => day(daysAgo(i))).reverse());

    renderScreen();

    expect(prefetchSpy.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('offers the windows and marks the active one', () => {
    setGallery([day(daysAgo(2)), day(daysAgo(1))].reverse());

    renderScreen();

    const section = rangeMenu()?.items?.[0];
    expect(section?.items.map((item) => item.label)).toEqual([
      'Last 30 days',
      'Last 3 months',
      'All time',
      'Custom range…',
    ]);
    expect(section?.items.find((item) => item.selected)?.label).toBe(
      'Last 3 months'
    );
  });

  it('falls back to everything when the default window is empty', () => {
    // A history that predates the window would otherwise show the "add two
    // photos" empty state to someone who has plenty.
    setGallery([day(daysAgo(500)), day(daysAgo(400))].reverse());

    const { getByText, queryByText } = renderScreen();

    expect(getByText(/of 2/)).toBeTruthy();
    expect(
      queryByText('Add at least two photos of this angle to play a time-lapse.')
    ).toBeNull();
  });

  it('plays exactly the days a custom range covers', () => {
    setGallery(
      [day(daysAgo(400)), day(daysAgo(10)), day(daysAgo(5)), day(daysAgo(1))]
        .slice()
        .reverse()
    );

    const { getByText } = renderScreen();

    act(() => {
      sheetProps()?.onConfirm(daysAgo(12), daysAgo(4));
    });

    // The 400-day-old and yesterday's shoots fall outside the picked window.
    expect(
      getByText(
        new RegExp(
          `of 2 · ${shortDate(daysAgo(12))} – ${shortDate(daysAgo(4))}`
        )
      )
    ).toBeTruthy();
  });

  it('respects an empty custom range instead of falling back to everything', () => {
    // The preset windows fall back to all-time so an old history is not a dead
    // screen, but dates picked by hand must not be quietly widened.
    setGallery([day(daysAgo(400)), day(daysAgo(390))].reverse());

    const { getByText } = renderScreen();

    act(() => {
      sheetProps()?.onConfirm(daysAgo(20), daysAgo(10));
    });

    expect(
      getByText('Add at least two photos of this angle to play a time-lapse.')
    ).toBeTruthy();
  });

  it('opens the picker rather than selecting a range straight from the menu', () => {
    setGallery([day(daysAgo(2)), day(daysAgo(1))].reverse());

    renderScreen();

    const custom = rangeMenu()?.items?.[0].items.find(
      (item) => item.label === 'Custom range…'
    );
    act(() => custom?.onPress());

    expect(mockPresentSheet).toHaveBeenCalled();
    // Nothing is picked yet, so the active window must not have moved.
    expect(
      rangeMenu()?.items?.[0].items.find((item) => item.selected)?.label
    ).toBe('Last 3 months');
  });

  it('says there is nothing to play when the angle has no photos', () => {
    setGallery([]);

    const { getByText } = renderScreen();

    expect(
      getByText('Add at least two photos of this angle to play a time-lapse.')
    ).toBeTruthy();
  });
});
