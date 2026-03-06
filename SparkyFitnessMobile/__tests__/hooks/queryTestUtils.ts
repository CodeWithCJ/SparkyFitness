import React from 'react';
import { act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import type { DefaultOptions } from '@tanstack/react-query';

export type { QueryClient } from '@tanstack/react-query';

// Ensure React Query state updates are wrapped in act() to avoid warnings
notifyManager.setNotifyFunction((callback) => {
  act(callback);
});

/**
 * Creates a QueryClient configured for tests: no retries and instant staleness.
 * Pass `options` to replace the default options entirely at the `defaultOptions` level.
 */
export function createTestQueryClient(options?: DefaultOptions): QueryClient {
  return new QueryClient({
    defaultOptions: options ?? {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * Returns a wrapper component that provides the given QueryClient to children.
 */
export function createQueryWrapper(queryClient: QueryClient) {
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  Wrapper.displayName = 'QueryClientWrapper';
  return Wrapper;
}
