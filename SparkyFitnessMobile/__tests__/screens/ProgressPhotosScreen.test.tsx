import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ProgressPhotosScreen from '../../src/screens/ProgressPhotosScreen';
import {
  useCheckInPhotoGallery,
  useCheckInPhotoDates,
  useCheckInPhotosByDate,
  useCheckInPhotoMutations,
} from '../../src/hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../../src/hooks/useCheckInPhotoSource';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useScreenHeader } from '../../src/hooks/useScreenHeader';
import type { ProgressPhotoDay } from '../../src/types/checkInPhotos';

jest.mock('../../src/hooks/useCheckInPhotos', () => ({
  useCheckInPhotoGallery: jest.fn(),
  useCheckInPhotoDates: jest.fn(),
  useCheckInPhotosByDate: jest.fn(),
  useCheckInPhotoMutations: jest.fn(),
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
jest.mock('../../src/utils/pickImage', () => ({
  pickImageFromCamera: jest.fn(async () => ({
    status: 'picked',
    image: { uri: 'file:///picked.jpg' },
  })),
  pickImagesFromLibrary: jest.fn(async () => [{ uri: 'file:///picked.jpg' }]),
}));

// The sheets need a BottomSheetModalProvider. Record the action sheet's items
// on each render so a test can invoke one the way a tap would.
type SheetItem = { key: string; onPress?: () => void; destructive?: boolean };
const mockActionSheetRender = jest.fn<void, [{ items: SheetItem[] }]>();
jest.mock('../../src/components/ActionSheet', () => {
  const { forwardRef, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: forwardRef<
      { present: () => void; dismiss: () => void },
      { items: SheetItem[] }
    >((props, ref) => {
      mockActionSheetRender(props);
      useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return null;
    }),
  };
});
jest.mock('../../src/components/CalendarSheet', () => ({
  __esModule: true,
  default: () => null,
}));

/** Items on the action sheet's latest render. */
const sheetItems = (): SheetItem[] | undefined =>
  mockActionSheetRender.mock.calls.at(-1)?.[0].items;

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
const mockUseDates = useCheckInPhotoDates as jest.MockedFunction<
  typeof useCheckInPhotoDates
>;
const mockUseByDate = useCheckInPhotosByDate as jest.MockedFunction<
  typeof useCheckInPhotosByDate
>;
const mockUseMutations = useCheckInPhotoMutations as jest.MockedFunction<
  typeof useCheckInPhotoMutations
>;
const uploadAsync = jest.fn();
const deleteAsync = jest.fn();

/** The day block's stored photos for the selected day. */
const setDayPhotos = (angles: ('front' | 'back' | 'side')[]) => {
  mockUseByDate.mockReturnValue({
    photos: angles.map((angle) => ({
      id: `today-${angle}`,
      user_id: 'u1',
      check_in_measurement_id: null,
      entry_date: '2026-03-20',
      photo_type: angle,
      file_path: `uploads/${angle}.jpg`,
      created_at: '2026-03-20T00:00:00Z',
    })),
    isLoading: false,
  } as unknown as ReturnType<typeof useCheckInPhotosByDate>);
};

const navigation = { navigate: jest.fn(), goBack: jest.fn() };
const route = { key: 'ProgressPhotos-key', name: 'ProgressPhotos' as const };

const dayWith = (
  entry_date: string,
  weight: number | null,
  angles: ('front' | 'back' | 'side')[] = ['front']
): ProgressPhotoDay => ({
  entry_date,
  weight,
  photos: Object.fromEntries(
    angles.map((angle) => [
      angle,
      { id: `${entry_date}-${angle}`, entry_date, photo_type: angle, weight },
    ])
  ),
});

const setGallery = (
  days: ProgressPhotoDay[],
  extra: { isLoading?: boolean; isError?: boolean } = {}
) => {
  mockUseGallery.mockReturnValue({
    days,
    isLoading: extra.isLoading ?? false,
    isError: extra.isError ?? false,
    error: null,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useCheckInPhotoGallery>);
};

const renderScreen = () =>
  render(
    <ProgressPhotosScreen
      navigation={
        navigation as unknown as React.ComponentProps<
          typeof ProgressPhotosScreen
        >['navigation']
      }
      route={
        route as unknown as React.ComponentProps<
          typeof ProgressPhotosScreen
        >['route']
      }
    />
  );

describe('ProgressPhotosScreen', () => {
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
    mockUseDates.mockReturnValue({ dates: [] } as unknown as ReturnType<
      typeof useCheckInPhotoDates
    >);
    mockUseMutations.mockReturnValue({
      uploadAsync,
      deleteAsync,
      uploadingType: undefined,
      isUploading: false,
      isDeleting: false,
    } as unknown as ReturnType<typeof useCheckInPhotoMutations>);
    setDayPhotos([]);
    setGallery([dayWith('2026-03-20', 80), dayWith('2026-03-01', 84)]);
  });

  it('lists a row per day with that day’s weight', () => {
    const { getByText } = renderScreen();

    expect(getByText('80 kg')).toBeTruthy();
    expect(getByText('84 kg')).toBeTruthy();
  });

  it('shows the change against the previous shoot, not against the first', () => {
    // A pile of dated pictures is not progression; the delta is what makes the
    // list read as one.
    const { getByText } = renderScreen();

    expect(getByText('-4 kg since previous')).toBeTruthy();
  });

  it('shows only the selected angle and switches with the history control', () => {
    setGallery([
      dayWith('2026-03-20', 80, ['front']),
      dayWith('2026-03-01', 84, ['back']),
    ]);

    const { getByText, getByRole, queryByText } = renderScreen();

    // Front is the default, so only the front day has a row.
    expect(getByText('80 kg')).toBeTruthy();
    expect(queryByText('84 kg')).toBeNull();

    fireEvent.press(getByRole('tab', { name: 'Back' }));

    expect(getByText('84 kg')).toBeTruthy();
    expect(queryByText('80 kg')).toBeNull();
  });

  it('opens the comparison for the angle being viewed', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Compare'));

    expect(navigation.navigate).toHaveBeenCalledWith('ProgressPhotoCompare', {
      angle: 'front',
    });
  });

  it('opens the time-lapse for the angle being viewed', () => {
    const { getByText } = renderScreen();

    fireEvent.press(getByText('Time-lapse'));

    expect(navigation.navigate).toHaveBeenCalledWith('ProgressPhotoTimelapse', {
      angle: 'front',
    });
  });

  it('leaves compare and time-lapse inert with a single shoot', () => {
    // Both need two photos of the angle to say anything.
    setGallery([dayWith('2026-03-20', 80)]);

    const { getByText } = renderScreen();

    fireEvent.press(getByText('Compare'));
    fireEvent.press(getByText('Time-lapse'));

    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('keeps the header free of a capture action now the day block owns adding', () => {
    renderScreen();

    const config = mockUseScreenHeader.mock.calls[0][0] as unknown as {
      right?: unknown;
    };

    expect(config.right).toBeUndefined();
  });

  it('prompts to add photos when the angle has none', () => {
    setGallery([]);

    const { getByText } = renderScreen();

    expect(getByText('No front photos yet')).toBeTruthy();
  });

  it('surfaces a load failure instead of an empty timeline', () => {
    setGallery([], { isError: true });

    const { getByText } = renderScreen();

    expect(getByText("Couldn't load your progress photos.")).toBeTruthy();
  });

  it('offers to log the weight on a day that has none', () => {
    // A photo taken before the day's weigh-in would otherwise read as missing
    // forever, since the only way back was Measurements.
    setGallery([dayWith('2026-03-20', null)]);

    const { getAllByText, queryByText } = renderScreen();

    // Once in the day block, once on the timeline row for the same day.
    expect(getAllByText('Log weight')).toHaveLength(2);
    expect(queryByText('No weight logged')).toBeNull();
  });

  it('opens weight entry for the row’s own day, not the selected one', () => {
    // The day block sits on today; a timeline row must still hand over its own
    // date rather than whatever the block happens to be showing.
    setGallery([dayWith('2026-03-20', null)]);

    const { getAllByText } = renderScreen();
    fireEvent.press(getAllByText('Log weight')[1]);

    expect(navigation.navigate).toHaveBeenCalledWith('MeasurementsAdd', {
      date: '2026-03-20',
    });
  });

  it('shows the weight plainly on a row that has one', () => {
    setGallery([dayWith('2026-03-20', 81)]);

    const { getAllByText } = renderScreen();

    // Once, on its row. The day block is on today, which has no photos.
    expect(getAllByText('81 kg')).toHaveLength(1);
  });

  describe('the history preview', () => {
    /** `n` shoots, newest first, one kilo apart so every delta is -1 kg. */
    const shoots = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        dayWith(`2026-03-${String(28 - i).padStart(2, '0')}`, 100 + i)
      );

    it('lists only the seven most recent shoots', () => {
      setGallery(shoots(10));

      const { getByText, queryByText } = renderScreen();

      // Newest is 100 kg, so the seventh back is 106 and the eighth 107.
      expect(getByText('106 kg')).toBeTruthy();
      expect(queryByText('107 kg')).toBeNull();
    });

    it('still shows a delta on the oldest visible row', () => {
      // The shoot it compares against sits outside the preview, so this only
      // holds if the cut happens after the deltas are worked out.
      setGallery(shoots(10));

      const { getAllByText } = renderScreen();

      expect(getAllByText('-1 kg since previous')).toHaveLength(7);
    });

    it('says it is capped only when there is more history than fits', () => {
      setGallery(shoots(10));

      const { getByText } = renderScreen();

      expect(
        getByText(
          'Your 7 most recent. Compare or Time-lapse look further back.'
        )
      ).toBeTruthy();
    });

    it('describes the section plainly when nothing is cut', () => {
      setGallery(shoots(3));

      const { getByText, queryByText } = renderScreen();

      expect(
        getByText('Your photos for this angle, newest first.')
      ).toBeTruthy();
      expect(queryByText(/most recent/)).toBeNull();
    });

    it('keeps compare and time-lapse live on a long history', () => {
      // They are what the description sends you to for anything older, so
      // gating them on the preview rather than the whole history would switch
      // them off for exactly the people who need them.
      setGallery(shoots(10));

      const { getByText } = renderScreen();
      fireEvent.press(getByText('Compare'));

      expect(navigation.navigate).toHaveBeenCalledWith('ProgressPhotoCompare', {
        angle: 'front',
      });
    });
  });

  describe('the day block', () => {
    it('offers a slot per angle so the day’s gaps read at a glance', () => {
      setDayPhotos(['front']);

      const { getByLabelText } = renderScreen();

      // Front is filled, so it is a view target; the other two invite a photo.
      expect(getByLabelText('View the front photo full screen')).toBeTruthy();
      expect(getByLabelText('Add the back photo')).toBeTruthy();
      expect(getByLabelText('Add the side photo')).toBeTruthy();
    });

    it('uploads straight away rather than staging behind a Save', async () => {
      setDayPhotos([]);

      const { getByLabelText } = renderScreen();
      fireEvent.press(getByLabelText('Add the front photo'));

      const camera = sheetItems()?.find((item) => item.key === 'camera');
      await act(async () => {
        camera?.onPress?.();
      });

      expect(uploadAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'front', uri: 'file:///picked.jpg' })
      );
    });

    it('offers removal only on a slot that has a photo', () => {
      setDayPhotos([]);

      const { getByLabelText } = renderScreen();
      fireEvent.press(getByLabelText('Add the front photo'));

      expect(sheetItems()?.map((item) => item.key)).toEqual([
        'camera',
        'library',
      ]);
    });

    it('keeps viewing and managing on separate targets', () => {
      setDayPhotos(['front']);

      const { getByLabelText } = renderScreen();

      // A filled slot has both: the photo opens the viewer, the corner button
      // opens replace/remove. Neither is hidden behind a long press.
      expect(getByLabelText('View the front photo full screen')).toBeTruthy();
      expect(getByLabelText('Replace or remove the front photo')).toBeTruthy();
    });

    it('does not follow the history angle control', () => {
      // The control below scopes the timeline; the day block always shows all
      // three angles, which is the one ambiguity this layout has to get right.
      setDayPhotos(['back']);
      setGallery([
        dayWith('2026-03-20', 80, ['front']),
        dayWith('2026-03-01', 84, ['back']),
      ]);

      const { getByRole, getByLabelText } = renderScreen();
      fireEvent.press(getByRole('tab', { name: 'Back' }));

      expect(getByLabelText('Add the front photo')).toBeTruthy();
      expect(getByLabelText('View the back photo full screen')).toBeTruthy();
    });
  });
});
