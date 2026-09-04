import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ProgressPhotoCompareScreen from '../../src/screens/ProgressPhotoCompareScreen';
import { useCheckInPhotoGallery } from '../../src/hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../../src/hooks/useCheckInPhotoSource';
import { usePreferences } from '../../src/hooks/usePreferences';
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

type CalendarProps = {
  markedDates?: string[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
};
const mockCalendarProps: { current: CalendarProps } = { current: {} };
jest.mock('../../src/components/CalendarSheet', () => {
  const ReactLocal = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactLocal.forwardRef(
      (props: CalendarProps, ref: React.Ref<unknown>) => {
        mockCalendarProps.current = props;
        ReactLocal.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return <View testID="calendar-sheet" />;
      }
    ),
  };
});

const mockUseGallery = useCheckInPhotoGallery as jest.MockedFunction<
  typeof useCheckInPhotoGallery
>;
const mockUseSource = useCheckInPhotoSource as jest.MockedFunction<
  typeof useCheckInPhotoSource
>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

const day = (entry_date: string, weight: number | null): ProgressPhotoDay => ({
  entry_date,
  weight,
  photos: {
    front: {
      id: `${entry_date}-front`,
      entry_date,
      photo_type: 'front',
      weight,
    },
  },
});

const setGallery = (days: ProgressPhotoDay[], isLoading = false) => {
  mockUseGallery.mockReturnValue({
    days,
    isLoading,
    isError: false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCheckInPhotoGallery>);
};

const renderScreen = (params: { angle?: 'front' | 'back' | 'side' } = {}) =>
  render(
    <ProgressPhotoCompareScreen
      navigation={
        navigation as unknown as React.ComponentProps<
          typeof ProgressPhotoCompareScreen
        >['navigation']
      }
      route={
        {
          key: 'ProgressPhotoCompare-key',
          name: 'ProgressPhotoCompare',
          params,
        } as unknown as React.ComponentProps<
          typeof ProgressPhotoCompareScreen
        >['route']
      }
    />
  );

describe('ProgressPhotoCompareScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    // Gallery order is newest-first, as the server returns it.
    setGallery([
      day('2026-03-20', 78),
      day('2026-03-10', 81),
      day('2026-03-01', 84),
    ]);
  });

  it('defaults to the widest span so it says something before any picking', () => {
    const { getByText } = renderScreen();

    // Oldest against newest: 84 kg -> 78 kg.
    expect(getByText('84 kg')).toBeTruthy();
    expect(getByText('78 kg')).toBeTruthy();
    expect(getByText('Δ -6 kg')).toBeTruthy();
  });

  it('says how far apart the two shoots are', () => {
    const { getByText } = renderScreen();

    expect(getByText('19 days apart')).toBeTruthy();
  });

  it('loads only the two photos on screen, not the whole history', () => {
    // The strip this replaced mounted one image per shoot, so a long history
    // decoded hundreds of bitmaps at once.
    const getPhotoSource = jest.fn((id: string) => ({
      uri: `https://x/${id}`,
      headers: {},
    }));
    mockUseSource.mockReturnValue({
      getPhotoSource,
      isReady: true,
    } as unknown as ReturnType<typeof useCheckInPhotoSource>);

    renderScreen();

    const requested = new Set(getPhotoSource.mock.calls.map(([id]) => id));
    expect(requested).toEqual(
      new Set(['2026-03-01-front', '2026-03-20-front'])
    );
    expect(requested.has('2026-03-10-front')).toBe(false);
  });

  it('marks only the days that have this angle', () => {
    renderScreen();

    expect(mockCalendarProps.current.markedDates).toEqual([
      '2026-03-01',
      '2026-03-10',
      '2026-03-20',
    ]);
  });

  it('assigns a picked day to the side whose date was tapped', () => {
    const { getByText, getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('Choose the Before day'));
    act(() => mockCalendarProps.current.onSelectDate?.('2026-03-10'));

    // Before moved to the middle shoot, so the delta narrows to 81 -> 78.
    expect(getByText('Δ -3 kg')).toBeTruthy();
  });

  it('refuses a day with no photo for this angle', () => {
    const { getByText, getByLabelText } = renderScreen();

    fireEvent.press(getByLabelText('Choose the Before day'));
    act(() => mockCalendarProps.current.onSelectDate?.('2026-03-05'));

    // Unchanged: still the widest span.
    expect(getByText('Δ -6 kg')).toBeTruthy();
  });

  it('falls back when the picked day disappears from the gallery', () => {
    // Deleting a day's last photo elsewhere must not leave a pane pointing at
    // a photo that no longer exists.
    const { getByText, getByLabelText, rerender } = renderScreen();

    fireEvent.press(getByLabelText('Choose the Before day'));
    act(() => mockCalendarProps.current.onSelectDate?.('2026-03-10'));
    expect(getByText('Δ -3 kg')).toBeTruthy();

    setGallery([day('2026-03-20', 78), day('2026-03-01', 84)]);
    rerender(
      <ProgressPhotoCompareScreen
        navigation={
          navigation as unknown as React.ComponentProps<
            typeof ProgressPhotoCompareScreen
          >['navigation']
        }
        route={
          {
            key: 'ProgressPhotoCompare-key',
            name: 'ProgressPhotoCompare',
            params: {},
          } as unknown as React.ComponentProps<
            typeof ProgressPhotoCompareScreen
          >['route']
        }
      />
    );

    expect(getByText('Δ -6 kg')).toBeTruthy();
  });

  it('compares the angle it was opened for', () => {
    setGallery([
      {
        entry_date: '2026-03-20',
        weight: 78,
        photos: {
          back: {
            id: 'back-late',
            entry_date: '2026-03-20',
            photo_type: 'back',
            weight: 78,
          },
        },
      },
      {
        entry_date: '2026-03-01',
        weight: 84,
        photos: {
          back: {
            id: 'back-early',
            entry_date: '2026-03-01',
            photo_type: 'back',
            weight: 84,
          },
        },
      },
    ]);

    const { getByText } = renderScreen({ angle: 'back' });

    expect(getByText('Δ -6 kg')).toBeTruthy();
  });

  it('omits the weight change when either side has no weight', () => {
    setGallery([day('2026-03-20', null), day('2026-03-01', 84)]);

    const { queryByText } = renderScreen();

    expect(queryByText(/Δ/)).toBeNull();
  });
});
