import React from 'react';
import { Platform, Text } from 'react-native';
import Toast from 'react-native-toast-message';
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
import {
  useScreenHeader,
  type HeaderItem,
  type ScreenHeaderConfig,
} from '../../src/hooks/useScreenHeader';
import { offerCheckinRemindersAfterLeaving } from '../../src/services/offerCheckinReminders';
import { useGuidedCheckInStore } from '../../src/stores/guidedCheckInStore';
import type { ProgressPhotoDay } from '../../src/types/checkInPhotos';
import type { RootStackParamList } from '../../src/types/navigation';
import { pickImageFromCamera } from '../../src/utils/pickImage';
import { paddingAbove } from './helpers/insetTestUtils';

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
const mockInsets = { top: 0, bottom: 0, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockInsets,
}));
// Native iOS header by default; a test turns it off for the screen-owned bar.
let mockNativeHeadersActive = true;
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: () => mockNativeHeadersActive,
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
const mockCalendarSheetRender = jest.fn();
jest.mock('../../src/components/CalendarSheet', () => ({
  __esModule: true,
  default: () => {
    mockCalendarSheetRender();
    return null;
  },
}));
// The guided check-in's last step makes the reminder offer step 1 held back.
jest.mock('../../src/services/offerCheckinReminders', () => ({
  offerCheckinRemindersAfterLeaving: jest.fn(),
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

type BeforeRemoveListener = (event: {
  data: { action: { type: string } };
}) => void;
const beforeRemoveListeners = new Set<BeforeRemoveListener>();

/** Calls the screen's beforeRemove listeners, as the navigator does. */
const emitBeforeRemove = (type: string) => {
  for (const listener of beforeRemoveListeners) {
    listener({ data: { action: { type } } });
  }
};

const navigation = {
  navigate: jest.fn(),
  // The navigator reports the removal from inside goBack, before it returns.
  goBack: jest.fn(() => emitBeforeRemove('GO_BACK')),
  replace: jest.fn(),
  isFocused: jest.fn(() => true),
  addListener: jest.fn((event: string, listener: BeforeRemoveListener) => {
    if (event === 'beforeRemove') beforeRemoveListeners.add(listener);
    return () => {
      beforeRemoveListeners.delete(listener);
    };
  }),
};

/** What the navigator reports as it removes the screen with an action. */
const removeScreen = (type: string) => {
  act(() => emitBeforeRemove(type));
};
const route = { key: 'ProgressPhotos-key', name: 'ProgressPhotos' as const };
type RouteParams = NonNullable<RootStackParamList['ProgressPhotos']>;

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

const renderScreen = (params?: RouteParams) =>
  render(
    <ProgressPhotosScreen
      navigation={
        navigation as unknown as React.ComponentProps<
          typeof ProgressPhotosScreen
        >['navigation']
      }
      route={
        (params
          ? { ...route, params }
          : route) as unknown as React.ComponentProps<
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

  // AddSheet → Check-In ends here as step 3 of 3, replaced in from
  // MeasurementsAdd with the flow's day and the flags the earlier steps set.
  describe('guided check-in', () => {
    const FLOW_DATE = '2026-03-20';
    const renderInFlow = (
      guidedCheckIn: NonNullable<RouteParams['guidedCheckIn']> = {}
    ) => renderScreen({ date: FLOW_DATE, guidedCheckIn });

    type PrimaryItem = Extract<HeaderItem, { kind: 'primary' }>;
    type DismissItem = Extract<HeaderItem, { kind: 'dismiss' }>;

    /** The header config of the latest render. */
    const headerConfig = (): ScreenHeaderConfig => {
      const config = mockUseScreenHeader.mock.calls.at(-1)?.[0];
      if (!config) throw new Error('useScreenHeader was not called');
      return config;
    };
    const rightItems = (): HeaderItem[] => {
      const right = headerConfig().right;
      if (right == null) return [];
      return Array.isArray(right) ? right : [right];
    };
    const finishItem = (): PrimaryItem => {
      const [item] = rightItems();
      if (item?.kind !== 'primary') throw new Error('no primary header item');
      return item;
    };
    const closeItem = (): DismissItem => {
      const left = headerConfig().left;
      if (left?.kind !== 'dismiss') throw new Error('no dismiss header item');
      return left;
    };
    /** Presses an item of the action sheet the way a tap would. */
    const pressSheetItem = async (key: string) => {
      const item = sheetItems()?.find((entry) => entry.key === key);
      if (!item?.onPress) throw new Error(`no ${key} item on the sheet`);
      await act(async () => {
        item.onPress?.();
      });
    };
    const takeFrontPhoto = async (
      getByLabelText: ReturnType<typeof renderScreen>['getByLabelText']
    ) => {
      fireEvent.press(getByLabelText('Add the front photo'));
      await pressSheetItem('camera');
    };

    const toastShow = jest.mocked(Toast.show);
    const successToast = expect.objectContaining({
      type: 'success',
      text1: 'Check-in complete',
    });

    it('swaps Back for a Close X and puts a single Finish on the right', () => {
      renderInFlow();

      expect(headerConfig().left).toEqual(
        expect.objectContaining({
          kind: 'dismiss',
          accessibilityLabel: 'Close',
        })
      );
      expect(rightItems()).toHaveLength(1);
      expect(finishItem()).toEqual(
        expect.objectContaining({
          kind: 'primary',
          label: 'Finish',
          disabled: false,
        })
      );
    });

    it('shows step 3 of 3 with no Skip, since Finish is the way on', () => {
      const { getByText, queryByText, queryByRole } = renderInFlow();

      expect(getByText('Check-in: Step 3 of 3')).toBeTruthy();
      expect(queryByRole('button', { name: 'Skip this step' })).toBeNull();
      expect(queryByText('Skip')).toBeNull();
    });

    it('locks the day the check-in started on', async () => {
      const { queryByLabelText, getByLabelText } = renderInFlow();

      // No day picker, no calendar sheet, and no request for the dates it marks.
      expect(queryByLabelText('Choose the day')).toBeNull();
      expect(mockCalendarSheetRender).not.toHaveBeenCalled();
      expect(mockUseDates).toHaveBeenCalledWith(false);
      expect(mockUseDates).not.toHaveBeenCalledWith(true);

      await takeFrontPhoto(getByLabelText);

      expect(uploadAsync).toHaveBeenCalledWith(
        expect.objectContaining({ date: FLOW_DATE, type: 'front' })
      );
    });

    it.each([
      ['an upload', { isUploading: true, isDeleting: false }],
      ['a removal', { isUploading: false, isDeleting: true }],
    ])('keeps Finish off while %s is in flight', (_what, pending) => {
      mockUseMutations.mockReturnValue({
        uploadAsync,
        deleteAsync,
        uploadingType: pending.isUploading ? 'front' : undefined,
        ...pending,
      } as unknown as ReturnType<typeof useCheckInPhotoMutations>);

      renderInFlow();

      expect(finishItem().disabled).toBe(true);
    });

    it('keeps Finish off and inert while a picked photo is still on its way', async () => {
      // The pick (and the shrink after it) has not handed over to the upload.
      jest
        .mocked(pickImageFromCamera)
        .mockImplementationOnce(() => new Promise<never>(() => {}));

      const { getByLabelText } = renderInFlow();
      await takeFrontPhoto(getByLabelText);

      expect(finishItem().disabled).toBe(true);
      act(() => finishItem().onPress());

      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(uploadAsync).not.toHaveBeenCalled();
      expect(toastShow).not.toHaveBeenCalled();
    });

    it('goes back and confirms the check-in once a photo was uploaded', async () => {
      const { getByLabelText } = renderInFlow();
      await takeFrontPhoto(getByLabelText);

      expect(uploadAsync).toHaveBeenCalledTimes(1);
      expect(finishItem().disabled).toBe(false);
      expect(toastShow).not.toHaveBeenCalled();

      act(() => finishItem().onPress());
      // A second press after leaving moves nothing more.
      act(() => finishItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(navigation.replace).not.toHaveBeenCalled();
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith(successToast);
    });

    it('leaves without a confirmation when nothing was saved', () => {
      renderInFlow();

      act(() => finishItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).not.toHaveBeenCalled();
      expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();
    });

    it('does not confirm a photo whose upload failed', async () => {
      uploadAsync.mockRejectedValueOnce(new Error('network'));

      const { getByLabelText } = renderInFlow();
      await takeFrontPhoto(getByLabelText);

      // The failure is reported, and Finish is usable again.
      expect(toastShow).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error' })
      );
      expect(finishItem().disabled).toBe(false);

      act(() => finishItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).not.toHaveBeenCalledWith(successToast);
    });

    it('confirms what an earlier step saved even with no new photo', () => {
      renderInFlow({ saved: true });

      act(() => finishItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith(successToast);
    });

    it('makes the reminder offer step 1 held back once Finish leaves', () => {
      renderInFlow({ offerReminders: true, saved: true });

      expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();
      act(() => finishItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(offerCheckinRemindersAfterLeaving).toHaveBeenCalledTimes(1);
      expect(offerCheckinRemindersAfterLeaving).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('closes the last step like Finish, since its photos are already saved', async () => {
      const { getByLabelText } = renderInFlow({ offerReminders: true });
      await takeFrontPhoto(getByLabelText);

      act(() => closeItem().onPress());
      // A Finish press after the X moves nothing more.
      act(() => finishItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledWith(successToast);
      expect(offerCheckinRemindersAfterLeaving).toHaveBeenCalledTimes(1);
    });

    it('closes without a confirmation when nothing was saved', () => {
      renderInFlow();

      act(() => closeItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).not.toHaveBeenCalled();
      expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();
    });

    const backButton = (
      getByRole: ReturnType<typeof renderScreen>['getByRole']
    ) => getByRole('button', { name: 'Go back to the previous step' });

    it('Back reopens step 2 with the flags, and the replace does not finish', () => {
      const { getByRole } = renderInFlow({ saved: true });

      fireEvent.press(backButton(getByRole));
      // The navigator reports the replace as a removal of this step.
      removeScreen('REPLACE');

      expect(navigation.replace).toHaveBeenCalledWith('MeasurementsAdd', {
        date: FLOW_DATE,
        guidedCheckIn: { offerReminders: false, saved: true },
      });
      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(toastShow).not.toHaveBeenCalled();
    });

    it('Back after a photo was uploaded keeps the check-in counted as saved', async () => {
      const { getByLabelText, getByRole } = renderInFlow();
      await takeFrontPhoto(getByLabelText);

      fireEvent.press(backButton(getByRole));

      const flags = { offerReminders: false, saved: true };
      expect(navigation.replace).toHaveBeenCalledWith('MeasurementsAdd', {
        date: FLOW_DATE,
        guidedCheckIn: flags,
      });
      // The recorded progress a later Continue opens says so too.
      expect(useGuidedCheckInStore.getState().progress).toEqual({
        date: FLOW_DATE,
        step: 'MeasurementsAdd',
        flags,
      });
    });

    it('keeps Back off and inert while a picked photo is still on its way', async () => {
      jest
        .mocked(pickImageFromCamera)
        .mockImplementationOnce(() => new Promise<never>(() => {}));

      const { getByLabelText, getByRole } = renderInFlow();
      await takeFrontPhoto(getByLabelText);

      expect(backButton(getByRole)).toBeDisabled();
      fireEvent.press(backButton(getByRole));
      expect(navigation.replace).not.toHaveBeenCalled();
    });

    it('keeps the X off and inert while a picked photo is still on its way', async () => {
      jest
        .mocked(pickImageFromCamera)
        .mockImplementationOnce(() => new Promise<never>(() => {}));

      const { getByLabelText } = renderInFlow({ offerReminders: true });
      await takeFrontPhoto(getByLabelText);

      expect(closeItem().disabled).toBe(true);
      act(() => closeItem().onPress());

      expect(navigation.goBack).not.toHaveBeenCalled();
      expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();
    });

    it.each([
      ['system Back', 'GO_BACK'],
      ['the iOS swipe', 'POP'],
    ])(
      'finishes when %s closes the last step, since its photos are already saved',
      async (_how, actionType) => {
        const { getByLabelText } = renderInFlow({ offerReminders: true });
        await takeFrontPhoto(getByLabelText);

        removeScreen(actionType);
        // The X (or Finish) cannot run it a second time.
        act(() => closeItem().onPress());

        // The navigator is the one removing the screen.
        expect(navigation.goBack).not.toHaveBeenCalled();
        expect(toastShow).toHaveBeenCalledTimes(1);
        expect(toastShow).toHaveBeenCalledWith(successToast);
        expect(offerCheckinRemindersAfterLeaving).toHaveBeenCalledTimes(1);
      }
    );

    describe('closed by the navigator while a photo is on its way', () => {
      let settleUpload: { resolve: () => void; reject: (error: Error) => void };

      beforeEach(() => {
        uploadAsync.mockImplementationOnce(
          () =>
            new Promise<void>((resolve, reject) => {
              settleUpload = { resolve, reject };
            })
        );
      });

      it('confirms the check-in once that photo has landed', async () => {
        const { getByLabelText } = renderInFlow({ offerReminders: true });
        await takeFrontPhoto(getByLabelText);
        expect(uploadAsync).toHaveBeenCalledTimes(1);

        removeScreen('GO_BACK');
        // Nothing yet: the photo has not been saved.
        expect(toastShow).not.toHaveBeenCalled();
        expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();

        await act(async () => {
          settleUpload.resolve();
        });

        expect(toastShow).toHaveBeenCalledTimes(1);
        expect(toastShow).toHaveBeenCalledWith(successToast);
        expect(offerCheckinRemindersAfterLeaving).toHaveBeenCalledTimes(1);
        expect(navigation.goBack).not.toHaveBeenCalled();
      });

      it('confirms nothing for a photo that then fails, but still makes the held offer', async () => {
        const { getByLabelText } = renderInFlow({ offerReminders: true });
        await takeFrontPhoto(getByLabelText);

        removeScreen('POP');
        await act(async () => {
          settleUpload.reject(new Error('network'));
        });

        expect(toastShow).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'error' })
        );
        expect(toastShow).not.toHaveBeenCalledWith(successToast);
        expect(offerCheckinRemindersAfterLeaving).toHaveBeenCalledTimes(1);
      });
    });

    it('confirms nothing on a system Back when nothing was saved', () => {
      renderInFlow();

      removeScreen('GO_BACK');

      expect(toastShow).not.toHaveBeenCalled();
      expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();
    });

    it('does not finish on its own Finish a second time', () => {
      renderInFlow({ saved: true, offerReminders: true });

      // Finish's goBack reaches the navigator, which reports the removal
      // from inside it.
      act(() => finishItem().onPress());

      expect(navigation.goBack).toHaveBeenCalledTimes(1);
      expect(toastShow).toHaveBeenCalledTimes(1);
      expect(offerCheckinRemindersAfterLeaving).toHaveBeenCalledTimes(1);
    });

    it('leaves the check-in alone when the stack is reset rather than closed', () => {
      renderInFlow({ saved: true, offerReminders: true });

      removeScreen('RESET');

      expect(toastShow).not.toHaveBeenCalled();
      expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();
    });

    it('leaves Compare and Time-lapse to the screen opened on its own', () => {
      const { queryByText, queryByRole } = renderInFlow();

      expect(queryByText('Compare')).toBeNull();
      expect(queryByText('Time-lapse')).toBeNull();
      expect(queryByRole('button', { name: /Compare|Time-lapse/ })).toBeNull();
    });

    it('describes a capped history without pointing at Compare or Time-lapse', () => {
      setGallery(
        Array.from({ length: 10 }, (_, i) =>
          dayWith(`2026-03-${String(28 - i).padStart(2, '0')}`, 100 + i)
        )
      );

      const { getByText, queryByText } = renderInFlow();

      expect(getByText('Your 7 most recent, newest first.')).toBeTruthy();
      expect(queryByText(/Compare or Time-lapse/)).toBeNull();
    });

    it('shows the weight but no Log weight prompt, which is the step before', () => {
      setGallery([dayWith(FLOW_DATE, null), dayWith('2026-03-01', 84)]);

      const { getByText, queryByText, queryByLabelText } = renderInFlow();

      // Neither the day block nor the history row of a day without weight
      // offers to log one.
      expect(queryByText('Log weight')).toBeNull();
      expect(queryByLabelText('Log your weight for this day')).toBeNull();
      expect(getByText('84 kg')).toBeTruthy();
      expect(navigation.navigate).not.toHaveBeenCalled();
    });

    it('keeps Back, the day picker and no step indicator outside the check-in', () => {
      const { getByLabelText, queryByText } = renderScreen({
        date: FLOW_DATE,
      });

      expect(headerConfig().left).toEqual({ kind: 'back' });
      expect(getByLabelText('Choose the day')).toBeTruthy();
      expect(mockCalendarSheetRender).toHaveBeenCalled();
      expect(mockUseDates).not.toHaveBeenCalledWith(false);
      expect(queryByText(/Check-in: Step/)).toBeNull();

      // Going back is just going back.
      removeScreen('GO_BACK');
      expect(toastShow).not.toHaveBeenCalled();
      expect(offerCheckinRemindersAfterLeaving).not.toHaveBeenCalled();
    });
  });

  describe('the status bar inset', () => {
    beforeEach(() => {
      mockInsets.top = 47;
      mockUseScreenHeader.mockImplementation(() => <Text>Screen header</Text>);
    });
    afterEach(() => {
      mockInsets.top = 0;
      mockNativeHeadersActive = true;
      mockUseScreenHeader.mockImplementation(() => null);
    });

    it('keeps its own header below the status bar (Android, iOS 26+ with Liquid Glass off)', () => {
      mockNativeHeadersActive = false;
      const { getByText } = renderScreen();

      expect(paddingAbove(getByText('Screen header'), 'paddingTop')).toBe(47);
    });

    it('adds no top inset under the native iOS header', () => {
      const { getByText } = renderScreen();

      expect(
        paddingAbove(getByText('Screen header'), 'paddingTop')
      ).toBeUndefined();
    });

    it('adds no top inset as the check-in sheet on iOS, which already starts below the status bar', () => {
      mockNativeHeadersActive = false;
      const { getByText } = renderScreen({
        date: '2026-03-20',
        guidedCheckIn: {},
      });

      expect(
        paddingAbove(getByText('Screen header'), 'paddingTop')
      ).toBeUndefined();
    });

    it('keeps the top inset in the check-in on Android, where every screen is full height', () => {
      mockNativeHeadersActive = false;
      const platform = jest.replaceProperty(Platform, 'OS', 'android');
      try {
        const { getByText } = renderScreen({
          date: '2026-03-20',
          guidedCheckIn: {},
        });

        expect(paddingAbove(getByText('Screen header'), 'paddingTop')).toBe(47);
      } finally {
        platform.restore();
      }
    });
  });
});
