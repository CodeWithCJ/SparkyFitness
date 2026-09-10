import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useFoodEntryInvalidation } from '@/hooks/useInvalidateKeys';
import { caffeineKeys, waterIntakeKeys } from '@/api/keys/diary';

describe('useFoodEntryInvalidation (#2115)', () => {
  // A food entry logged from a water container owns its water log row
  // (ON DELETE CASCADE), so removing the food silently changes the day's
  // water total. Without this the diary keeps showing the drink until a
  // browser refresh, and deleting it then 404s.
  it('refreshes water intake as well as the food diary', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useFoodEntryInvalidation(), {
      wrapper,
    });
    result.current();

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: waterIntakeKeys.all,
    });
  });

  // The caffeine card is a derived view over the same entries, and its query
  // is keyed by date rather than by entry, so nothing else would refresh it:
  // editing a coffee left the curve showing the old dose until a reload.
  it('refreshes the caffeine curve too', () => {
    const queryClient = new QueryClient();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useFoodEntryInvalidation(), {
      wrapper,
    });
    result.current();

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: caffeineKeys.all,
    });
  });
});
