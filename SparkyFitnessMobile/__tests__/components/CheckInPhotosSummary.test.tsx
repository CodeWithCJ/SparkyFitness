import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CheckInPhotosSummary from '../../src/components/CheckInPhotosSummary';
import { useCheckInPhotoSource } from '../../src/hooks/useCheckInPhotoSource';
import type { CheckInPhoto, PhotoType } from '../../src/types/checkInPhotos';

jest.mock('../../src/hooks/useCheckInPhotoSource', () => ({
  useCheckInPhotoSource: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseSource = useCheckInPhotoSource as jest.MockedFunction<
  typeof useCheckInPhotoSource
>;

const DATE = '2026-03-20';
const onPress = jest.fn();

// The diary owns the query and hands the day's photos down, so the fixture is a
// plain prop rather than a mocked hook.
let photos: CheckInPhoto[] = [];

const setPhotos = (angles: PhotoType[]) => {
  photos = angles.map((angle) => ({
    id: `${DATE}-${angle}`,
    user_id: 'u1',
    check_in_measurement_id: null,
    entry_date: DATE,
    photo_type: angle,
    file_path: `uploads/${angle}.jpg`,
    created_at: `${DATE}T00:00:00Z`,
  }));
};

const renderSummary = () =>
  render(
    <CheckInPhotosSummary date={DATE} photos={photos} onPress={onPress} />
  );

describe('CheckInPhotosSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSource.mockReturnValue({
      getPhotoSource: jest.fn((id: string) => ({
        uri: `https://x/${id}`,
        headers: {},
      })),
      isReady: true,
    } as unknown as ReturnType<typeof useCheckInPhotoSource>);
  });

  it('prompts on a day with no photos rather than rendering nothing', () => {
    // Same affordance food and exercise get: a blank space gives no way in.
    setPhotos([]);

    const { getByText } = renderSummary();

    expect(getByText('Tap to add photos')).toBeTruthy();
  });

  it('opens that day from the prompt', () => {
    setPhotos([]);

    const { getByText } = renderSummary();
    fireEvent.press(getByText('Tap to add photos'));

    expect(onPress).toHaveBeenCalled();
  });

  it('shows every angle so a gap in the day is visible', () => {
    setPhotos(['front', 'back']);

    const { getByLabelText, getByText } = renderSummary();

    expect(getByLabelText('View the front photo full screen')).toBeTruthy();
    expect(getByLabelText('View the back photo full screen')).toBeTruthy();
    expect(getByLabelText('No side photo on this day')).toBeTruthy();
    expect(getByText('2 of 3')).toBeTruthy();
  });

  it('hands the diary day over rather than defaulting to today', () => {
    setPhotos(['front']);

    const { getByLabelText } = renderSummary();
    fireEvent.press(getByLabelText('Open the progress photos for this day'));

    expect(onPress).toHaveBeenCalled();
  });

  it('opens a thumbnail in the viewer without leaving the diary', () => {
    setPhotos(['front']);

    const { getByLabelText, queryByText } = renderSummary();
    fireEvent.press(getByLabelText('View the front photo full screen'));

    expect(onPress).not.toHaveBeenCalled();
    // The viewer captions the day it belongs to.
    expect(queryByText(/Mar/)).toBeTruthy();
  });

  it('carries no weight, which the measurements summary above already shows', () => {
    setPhotos(['front', 'back', 'side']);

    const { queryByText } = renderSummary();

    expect(queryByText(/kg|lb/)).toBeNull();
  });
});
