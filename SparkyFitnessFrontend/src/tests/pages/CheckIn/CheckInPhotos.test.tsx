import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CheckInPhotos } from '@/pages/CheckIn/CheckInPhotos';

const deletePhoto = jest.fn();

jest.mock('@/hooks/CheckIn/useCheckInPhotos', () => ({
  checkInPhotoFileUrl: (id: string) =>
    `/api/measurements/check-in-photos/file/${id}`,
  // No two-day history, so the Compare and Time-lapse buttons stay hidden.
  useCheckInPhotoGallery: () => ({
    days: [],
    isLoading: false,
    isError: false,
  }),
  useCheckInPhotos: () => ({
    photos: [
      {
        id: 'front-1',
        user_id: 'user-1',
        check_in_measurement_id: null,
        entry_date: '2026-03-20',
        photo_type: 'front',
        file_path: 'x',
        created_at: '2026-03-20T08:00:00Z',
      },
    ],
    uploadPhoto: jest.fn(),
    deletePhoto,
    isUploading: false,
    uploadingType: undefined,
    isDeleting: false,
  }),
}));

describe('CheckInPhotos', () => {
  beforeEach(() => {
    deletePhoto.mockReset();
  });

  // On a phone the button labels are hidden and only the icons show, so the
  // accessible names are what still says what each button does.
  it('names each slot button whether or not its label is visible', () => {
    render(<CheckInPhotos selectedDate="2026-03-20" />);

    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Upload' })).toHaveLength(2);
  });

  it('names the remove button and removes that photo', () => {
    render(<CheckInPhotos selectedDate="2026-03-20" />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));

    expect(deletePhoto).toHaveBeenCalledWith('front-1');
  });
});
