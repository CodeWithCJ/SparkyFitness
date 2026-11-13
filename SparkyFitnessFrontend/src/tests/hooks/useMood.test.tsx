import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { HttpApiError } from '@/api/api';
import { createMoodCheckin } from '@/api/CheckIn/moodService';
import { moodKeys } from '@/api/keys/checkin';
import {
  useCreateMoodCheckinMutation,
  useDeleteMoodCheckinMutation,
  useUpdateMoodCheckinMutation,
} from '@/hooks/CheckIn/useMood';

jest.mock('@/api/CheckIn/moodService');

const setup = () => {
  const queryClient = new QueryClient();
  const invalidate = jest
    .spyOn(queryClient, 'invalidateQueries')
    .mockResolvedValue();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, wrapper };
};

describe('check-in mutations refresh what depends on mood', () => {
  it('create', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCreateMoodCheckinMutation(), {
      wrapper,
    });
    await act(() => result.current.mutateAsync({ mood_value: 70 }));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: moodKeys.all });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-correlations'],
    });
  });

  it('update', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useUpdateMoodCheckinMutation(), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({ id: 'a', body: { energy_value: 3 } })
    );

    expect(invalidate).toHaveBeenCalledWith({ queryKey: moodKeys.all });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-correlations'],
    });
  });

  it('delete', async () => {
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useDeleteMoodCheckinMutation(), {
      wrapper,
    });
    await act(() => result.current.mutateAsync('a'));

    expect(invalidate).toHaveBeenCalledWith({ queryKey: moodKeys.all });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['cycle-correlations'],
    });
  });
});

describe('check-in error toast', () => {
  const errorMessageFor = async (error: Error): Promise<unknown> => {
    jest.mocked(createMoodCheckin).mockRejectedValueOnce(error);
    const { queryClient, wrapper } = setup();
    const { result } = renderHook(() => useCreateMoodCheckinMutation(), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({ mood_value: 70 }).catch(() => {})
    );
    const errorMessage = queryClient.getMutationCache().getAll()[0]?.options
      .meta?.errorMessage;
    return typeof errorMessage === 'function'
      ? errorMessage(error, undefined)
      : errorMessage;
  };

  it("uses the server's message when the error carries one", async () => {
    const error = new HttpApiError('Add a mood, note or tag.', 400);
    expect(await errorMessageFor(error)).toBe('Add a mood, note or tag.');
  });

  it('falls back to the generic text otherwise', async () => {
    expect(await errorMessageFor(new Error(''))).toBe(
      'Failed to save mood entry.'
    );
  });
});
