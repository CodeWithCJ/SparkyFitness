import { QueryCache, QueryClient, type QueryKey } from '@tanstack/react-query';
import { ApiError } from '../services/api/errors';
import { TimeoutError } from '../utils/concurrency';
import { serverConnectionQueryKey } from './queryKeys';

// At most one connection re-check per window, however many queries fail at once.
const SERVER_RECHECK_INTERVAL_MS = 10_000;
let lastServerRecheckAt = -Infinity;

/**
 * True when a failed request suggests the server itself is not answering: a
 * network error, a timeout, or a 5xx/429 (often a reverse proxy in front of a
 * stopped server). A 4xx answer means the server responded, and a cancelled
 * request is not a failure.
 */
function serverMayBeDown(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode >= 500 || error.statusCode === 429;
  }
  if (error instanceof TimeoutError) return true;
  return !(error instanceof Error && error.name === 'AbortError');
}

/**
 * Data queries refetch on refresh, Retry and health-sync invalidation without
 * re-running the connection check, so a stopped server showed each screen's
 * own load error instead of "Can't reach your server". Re-check the connection
 * when a query fails that way; `ServerGate` then shows the shared offline state
 * if the server really is down, and nothing changes if it answers (#3385).
 */
function recheckServerConnection(error: unknown, queryKey: QueryKey) {
  if (queryKey[0] === serverConnectionQueryKey[0]) return;
  if (!serverMayBeDown(error)) return;
  const now = Date.now();
  if (now - lastServerRecheckAt < SERVER_RECHECK_INTERVAL_MS) return;
  lastServerRecheckAt = now;
  void queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => recheckServerConnection(error, query.queryKey),
  }),
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Only refetch when explicitly triggered or polled
      // Don't retry on 4xx — those are caller-state errors (auth, validation,
      // 429 rate-limit) that won't change on a retry. Retrying amplified
      // 429s by 3× and accelerated the api-key rate-limit lockout in #1302.
      // Don't retry timeouts either: a request that hung for the full timeout
      // budget won't recover on the seconds scale, and retrying turns one
      // bounded failure into a multi-minute frozen screen (#1767). Focus
      // refetch and pull-to-refresh are the recovery paths.
      retry: (failureCount, err) => {
        if (
          err instanceof ApiError &&
          err.statusCode >= 400 &&
          err.statusCode < 500
        ) {
          return false;
        }
        if (err instanceof TimeoutError) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 0,
    },
  },
});
