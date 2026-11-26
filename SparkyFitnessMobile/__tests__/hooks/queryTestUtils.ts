import React from 'react';
import { act } from '@testing-library/react-native';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';
import type { DefaultOptions } from '@tanstack/react-query';
import { serverConfigsQueryKey } from '../../src/hooks/queryKeys';
import type { ServerConfig } from '../../src/services/storage';

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

/** A saved server and account, for tests of writes bound to one. */
export const testServer: ServerConfig = {
  id: 'server-a',
  url: 'https://a.example.com',
  apiKey: '',
  authType: 'session',
  sessionToken: 'token-a',
};

/**
 * Puts `config` on screen as the active server, as `useServerConfigs` caches
 * it (`useServerConnection` keeps it loaded). Writes that belong to an account
 * are bound to it (`serverOnScreen`).
 */
export function showServerOnScreen(
  queryClient: QueryClient,
  config: ServerConfig = testServer
) {
  queryClient.setQueryData(serverConfigsQueryKey, {
    allConfigs: [config],
    activeConfig: config,
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
