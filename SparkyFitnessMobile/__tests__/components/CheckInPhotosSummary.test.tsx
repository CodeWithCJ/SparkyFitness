import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import CheckInPhotosSummary from '../../src/components/CheckInPhotosSummary';
import { useCheckInPhotosByDate } from '../../src/hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../../src/hooks/useCheckInPhotoSource';
import type { PhotoType } from '../../src/types/checkInPhotos';

jest.mock('../../src/hooks/useCheckInPhotos', () => ({
  useCheckInPhotosByDate: jest.fn(),
}));
jest.mock('../../src/hooks/useCheckInPhotoSource', () => ({
  useCheckInPhotoSource: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockUseByDate = useCheckInPhotosByDate as jest.MockedFunction<
  typeof useCheckInPhotosByDate
>;
const mockUseSource = useCheckInPhotoSource as jest.MockedFunction<
  typeof useCheckInPhotoSource
>;

const DATE = '2026-03-20';
const onPress = jest.fn();

const setPhotos = (angles: PhotoType[]) => {
  mockUseByDate.mockReturnValue({
    photos: angles.map((angle) => ({
      id: `${DATE}-${angle}`,
      user_id: 'u1',
      check_in_measurement_id: null,
      entry_date: DATE,
      photo_type: angle,
      file_path: `uploads/${angle}.jpg`,
      created_at: `${DATE}T00:00:00Z`,
    })),
    isLoading: false,
  } as unknown as ReturnType<typeof useCheckInPhotosByDate>);
};

const renderSummary = () =>
  render(<CheckInPhotosSummary date={DATE} onPress={onPress} />);

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

  it('renders nothing on a day with no photos', () => {
    // The diary lists what a day holds; prompting for what it does not is the
    // dashboard card's job.
    setPhotos([]);

    const { toJSON } = renderSummary();

    expect(toJSON()).toBeNull();
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
