import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UserPreferences } from '../../../src/types/preferences';
import { preferencesQueryKey } from '../../../src/hooks/queryKeys';

/**
 * Creates a QueryClientProvider whose preferences query is pre-seeded with the
 * given (or default) user preferences, so components that call usePreferences()
 * / useCalendarPresentation() resolve the canonical first_day_of_week without
 * issuing a network request.
 */
export function queryProviderForPreferences(
  preferences: Partial<UserPreferences> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });
  queryClient.setQueryData(preferencesQueryKey, {
    ...preferences,
  } as UserPreferences);
  return {
    queryClient,
    Wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}
