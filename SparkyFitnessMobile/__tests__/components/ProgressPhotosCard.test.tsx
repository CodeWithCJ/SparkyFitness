import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ProgressPhotosCard from '../../src/components/ProgressPhotosCard';
import { useCheckInPhotoGallery } from '../../src/hooks/useCheckInPhotos';
import { useCheckInPhotoSource } from '../../src/hooks/useCheckInPhotoSource';
import { usePreferences } from '../../src/hooks/usePreferences';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
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

const mockUseGallery = useCheckInPhotoGallery as jest.MockedFunction<
  typeof useCheckInPhotoGallery
>;
const mockUseSource = useCheckInPhotoSource as jest.MockedFunction<
  typeof useCheckInPhotoSource
>;
const mockUsePreferences = usePreferences as jest.MockedFunction<
  typeof usePreferences
>;

const navigation = { navigate: jest.fn() };

const day = (overrides: Partial<ProgressPhotoDay> = {}): ProgressPhotoDay => ({
  entry_date: '2026-03-15',
  weight: 82.5,
  photos: {
    front: {
      id: 'photo-front',
      entry_date: '2026-03-15',
      photo_type: 'front',
      weight: 82.5,
    },
  },
  ...overrides,
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

const renderCard = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ProgressPhotosCard
        navigation={
          navigation as unknown as React.ComponentProps<
            typeof ProgressPhotosCard
          >['navigation']
        }
      />
    </SafeAreaProvider>
  );

describe('ProgressPhotosCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ progressPhotosCardVisible: true });
    mockUseSource.mockReturnValue({
      getPhotoSource: jest.fn(() => ({ uri: 'https://x/1', headers: {} })),
      isReady: true,
    } as unknown as ReturnType<typeof useCheckInPhotoSource>);
    mockUsePreferences.mockReturnValue({
      preferences: { default_weight_unit: 'kg' },
    } as unknown as ReturnType<typeof usePreferences>);
    setGallery([day()]);
  });

  it('shows the latest shoot with its date and weight', () => {
    const { getByText } = renderCard();

    expect(getByText('Progress')).toBeTruthy();
    expect(getByText('82.5 kg')).toBeTruthy();
  });

  it('opens the gallery when tapped', () => {
    const { getByLabelText } = renderCard();

    fireEvent.press(getByLabelText('View progress photos'));

    expect(navigation.navigate).toHaveBeenCalledWith('ProgressPhotos');
  });

  it('prompts for a first shoot when the user has no photos yet', () => {
    // Nothing else on the dashboard hints the feature exists, so a card that
    // only appears once you already have photos can never be what gets you to
    // take the first one.
    setGallery([]);

    const { getByText } = renderCard();

    expect(getByText('Progress')).toBeTruthy();
    expect(getByText('Tap to add check-in photos')).toBeTruthy();
  });

  it('sends the empty card to the gallery, where the day block takes over', () => {
    setGallery([]);

    const { getByText } = renderCard();
    fireEvent.press(getByText('Tap to add check-in photos'));

    expect(navigation.navigate).toHaveBeenCalledWith('ProgressPhotos', {});
  });

  it('renders nothing while the gallery is still loading', () => {
    setGallery([], true);

    const { queryByText } = renderCard();

    expect(queryByText('Progress')).toBeNull();
  });

  it('does not query the gallery when the card is hidden', () => {
    useAppPreferencesStore.setState({ progressPhotosCardVisible: false });

    const { queryByText } = renderCard();

    // The hook takes `enabled`; passing false is what keeps a hidden card from
    // costing a request at app open.
    expect(mockUseGallery).toHaveBeenCalledWith(false);
    expect(queryByText('Progress')).toBeNull();
  });

  it('prefers the front angle for the thumbnail over the row order', () => {
    // The server orders photos by photo_type alphabetically, so taking the
    // first row would show the back photo on any day that has one.
    const getPhotoSource = jest.fn(() => ({ uri: 'https://x/1', headers: {} }));
    mockUseSource.mockReturnValue({
      getPhotoSource,
      isReady: true,
    } as unknown as ReturnType<typeof useCheckInPhotoSource>);
    setGallery([
      day({
        photos: {
          back: {
            id: 'photo-back',
            entry_date: '2026-03-15',
            photo_type: 'back',
            weight: 82.5,
          },
          front: {
            id: 'photo-front',
            entry_date: '2026-03-15',
            photo_type: 'front',
            weight: 82.5,
          },
        },
      }),
    ]);

    renderCard();

    expect(getPhotoSource).toHaveBeenCalledWith('photo-front');
  });

  it('says so when the latest shoot has no weight logged', () => {
    setGallery([day({ weight: null })]);

    const { getByText } = renderCard();

    expect(getByText('No weight logged')).toBeTruthy();
  });
});
