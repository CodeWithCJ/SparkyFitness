import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useWorkoutPresets } from '@/hooks/Exercises/useWorkoutPresets';
import { getWorkoutPresets } from '@/api/Exercises/workoutPresets';
import type { PaginatedWorkoutPresets, WorkoutPreset } from '@/types/workout';

jest.mock('@/api/Exercises/workoutPresets', () => ({
  getWorkoutPresets: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const mockedGetWorkoutPresets = getWorkoutPresets as jest.MockedFunction<
  typeof getWorkoutPresets
>;

const presetFor = (userId: string): WorkoutPreset =>
  ({
    id: `preset-${userId}`,
    user_id: userId,
    name: `Preset ${userId}`,
  }) as unknown as WorkoutPreset;

const pageOf = (userId: string, page = 1): PaginatedWorkoutPresets => ({
  presets: [presetFor(userId)],
  total: 20,
  page,
  limit: 10,
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper };
};

describe('useWorkoutPresets cache isolation', () => {
  beforeEach(() => {
    mockedGetWorkoutPresets.mockReset();
  });

  it('does not serve one account the presets cached for another', async () => {
    let resolveSecondAccount: (value: PaginatedWorkoutPresets) => void = () =>
      undefined;

    mockedGetWorkoutPresets
      .mockResolvedValueOnce(pageOf('user-1'))
      .mockImplementationOnce(
        () =>
          new Promise<PaginatedWorkoutPresets>((resolve) => {
            resolveSecondAccount = resolve;
          })
      );

    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(
      ({ userId }: { userId: string }) => useWorkoutPresets(userId),
      { wrapper: Wrapper, initialProps: { userId: 'user-1' } }
    );

    await waitFor(() =>
      expect(result.current.data?.presets).toEqual([presetFor('user-1')])
    );

    // The session switches account. Until the response for the new account
    // arrives there must be no preset data at all - the cached page of the
    // previous account must not be served for the new one.
    rerender({ userId: 'user-2' });

    expect(result.current.data).toBeUndefined();

    await act(async () => {
      resolveSecondAccount(pageOf('user-2'));
    });

    await waitFor(() =>
      expect(result.current.data?.presets).toEqual([presetFor('user-2')])
    );
  });

  it('does not keep one page of presets visible while another user is loading', async () => {
    let resolveSecondPage: (value: PaginatedWorkoutPresets) => void = () =>
      undefined;

    mockedGetWorkoutPresets
      .mockResolvedValueOnce(pageOf('user-1', 1))
      .mockImplementationOnce(
        () =>
          new Promise<PaginatedWorkoutPresets>((resolve) => {
            resolveSecondPage = resolve;
          })
      );

    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(
      ({ page }: { page: number }) => useWorkoutPresets('user-1', page),
      { wrapper: Wrapper, initialProps: { page: 1 } }
    );

    await waitFor(() =>
      expect(result.current.data?.presets).toEqual([presetFor('user-1')])
    );

    // Paging is a fresh fetch with no placeholder: the previous page is not
    // carried over, so a stale row can never be mistaken for the new page.
    rerender({ page: 2 });

    expect(result.current.data).toBeUndefined();

    await act(async () => {
      resolveSecondPage({
        presets: [presetFor('user-1-page-2')],
        total: 20,
        page: 2,
        limit: 10,
      });
    });

    await waitFor(() =>
      expect(result.current.data?.presets).toEqual([presetFor('user-1-page-2')])
    );
  });
});
