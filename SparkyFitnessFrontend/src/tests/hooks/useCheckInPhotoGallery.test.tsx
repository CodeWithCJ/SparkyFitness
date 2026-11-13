import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { checkInKeys } from '@/api/keys/checkin';
import { useCheckInPhotoGallery } from '@/hooks/CheckIn/useCheckInPhotos';
import { fetchCheckInPhotoGallery } from '@/api/CheckIn/checkInPhotoService';

jest.mock('@/api/CheckIn/checkInPhotoService', () => ({
  ...jest.requireActual('@/api/CheckIn/checkInPhotoService'),
  fetchCheckInPhotoGallery: jest.fn(),
}));

const mockFetch = fetchCheckInPhotoGallery as jest.MockedFunction<
  typeof fetchCheckInPhotoGallery
>;

const setup = () => {
  const queryClient = new QueryClient({
    // The app's default: without the key change, a remount inside this
    // window would keep a stale weight.
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
};

describe('useCheckInPhotoGallery', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('groups the gallery by day', async () => {
    mockFetch.mockResolvedValue([
      {
        id: 'a',
        entry_date: '2026-03-20',
        photo_type: 'front',
        weight: 70,
      },
      {
        id: 'b',
        entry_date: '2026-03-20',
        photo_type: 'back',
        weight: 70,
      },
    ]);
    const { wrapper } = setup();

    const { result } = renderHook(() => useCheckInPhotoGallery(), { wrapper });

    await waitFor(() => expect(result.current.days).toHaveLength(1));
    expect(result.current.days[0]?.photos.back?.id).toBe('b');
  });

  it('refetches when the check-in measurements are invalidated', async () => {
    // Saving, editing or clearing a weight invalidates checkInKeys.all; the
    // day weights shown with the photos come from this query, so it has to
    // be part of that family.
    mockFetch
      .mockResolvedValueOnce([
        {
          id: 'a',
          entry_date: '2026-03-20',
          photo_type: 'front',
          weight: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 'a', entry_date: '2026-03-20', photo_type: 'front', weight: 71 },
      ]);
    const { queryClient, wrapper } = setup();

    const { result } = renderHook(() => useCheckInPhotoGallery(), { wrapper });
    await waitFor(() => expect(result.current.days).toHaveLength(1));
    expect(result.current.days[0]?.weight).toBeNull();

    await act(() =>
      queryClient.invalidateQueries({ queryKey: checkInKeys.all })
    );

    await waitFor(() => expect(result.current.days[0]?.weight).toBe(71));
  });
});
