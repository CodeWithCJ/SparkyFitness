import type { QueryClient } from '@tanstack/react-query';
import type { ServerConfig } from '../services/storage';
import { serverConfigsQueryKey } from './queryKeys';

/**
 * The server and account on screen, as `useServerConfigs` cached them
 * (`useServerConnection` keeps them loaded), or null when not known.
 *
 * A write that belongs to this account is sent with it (`apiFetch`'s
 * `serverConfig`), never with whichever server is active when the request goes
 * out: a server switch stores the new active server before `useAuth` clears
 * the cache, so a write queued behind another one, or still in its
 * `onMutate`, would otherwise reach the new account.
 */
export function serverOnScreen(queryClient: QueryClient): ServerConfig | null {
  return (
    queryClient.getQueryData<{ activeConfig: ServerConfig | null }>(
      serverConfigsQueryKey
    )?.activeConfig ?? null
  );
}
