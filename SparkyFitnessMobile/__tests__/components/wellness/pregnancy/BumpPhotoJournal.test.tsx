import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import BumpPhotoJournal from '../../../../src/components/wellness/pregnancy/BumpPhotoJournal';

jest.mock('../../../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file://photo.jpg' }],
  }),
}));

const mockUsePregnancyPhotos = jest.fn();
const mockUploadAsync = jest.fn().mockResolvedValue({});
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../src/hooks/usePregnancyPhotos', () => ({
  usePregnancyPhotos: () => mockUsePregnancyPhotos(),
  usePregnancyPhotoMutations: () => ({
    uploadAsync: mockUploadAsync,
    isUploading: false,
    deleteAsync: mockDeleteAsync,
    isDeleting: false,
  }),
}));

jest.mock('../../../../src/hooks/useServerConfigs', () => ({
  useServerConfigs: () => ({
    activeConfig: { id: 'cfg-1', url: 'https://example.com' },
  }),
}));

describe('BumpPhotoJournal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders an empty state when there are no photos', () => {
    mockUsePregnancyPhotos.mockReturnValue({ photos: [], isLoading: false });
    const { getByText } = render(<BumpPhotoJournal pregnancyId="p1" currentWeek={12} />);
    expect(getByText('Capture your first bump photo to start a weekly journal.')).toBeTruthy();
  });

  it('renders existing photos with their week label', () => {
    mockUsePregnancyPhotos.mockReturnValue({
      photos: [
        {
          id: 'photo-1',
          pregnancy_id: 'p1',
          week: 12,
          entry_date: '2026-01-01',
          file_path: 'uploads/pregnancy/u1/p1/w12-1.jpg',
          notes: null,
        },
      ],
      isLoading: false,
    });

    const { getByText } = render(<BumpPhotoJournal pregnancyId="p1" currentWeek={12} />);
    expect(getByText('Week 12')).toBeTruthy();
  });

  it('uploads a photo picked from the library', async () => {
    mockUsePregnancyPhotos.mockReturnValue({ photos: [], isLoading: false });

    const { getByText } = render(<BumpPhotoJournal pregnancyId="p1" currentWeek={12} />);
    fireEvent.press(getByText('Add Photo'));
    fireEvent.press(getByText('Choose from Library'));

    await waitFor(() => {
      expect(mockUploadAsync).toHaveBeenCalledWith({
        pregnancyId: 'p1',
        week: 12,
        uri: 'file://photo.jpg',
      });
    });
  });
});
