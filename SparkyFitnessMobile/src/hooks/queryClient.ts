import {
  MutationCache,
  QueryCache,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { ApiError } from '../services/api/errors';
import { TimeoutError } from '../utils/concurrency';
import { serverConnectionQueryKey } from './queryKeys';

// At most one connection re-check per window, however many queries fail at once.
const SERVER_RECHECK_INTERVAL_MS = 10_000;
let lastServerRecheckAt = -Infinity;
let trailingServerRecheck: ReturnType<typeof setTimeout> | null = null;

/**
 * True when a failed request suggests the server itself is not answering: a
 * network error (React Native's fetch rejects with a TypeError), a timeout, or
 * a 5xx/429 (often a reverse proxy in front of a stopped server). A 4xx means
 * the server answered; app errors such as validation or a cancelled request
 * say nothing about the connection.
 */
function serverMayBeDown(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.statusCode >= 500 || error.statusCode === 429;
  }
  return error instanceof TimeoutError || error instanceof TypeError;
}

/**
 * Data queries refetch on refresh, Retry and health-sync invalidation without
 * re-running the connection check, so a stopped server showed each screen's
 * own load error instead of "Can't reach your server". Re-check the connection
 * when a query or mutation fails that way; `ServerGate` then shows the shared offline state
 * if the server really is down, and nothing changes if it answers (#3385).
 */
function recheckServerConnection(error: unknown, queryKey?: QueryKey) {
  if (queryKey?.[0] === serverConnectionQueryKey[0]) return;
  if (!serverMayBeDown(error)) return;
  const sinceLast = Date.now() - lastServerRecheckAt;
  if (sinceLast >= SERVER_RECHECK_INTERVAL_MS) {
    runServerRecheck();
    return;
  }
  // Throttled: the last check may have passed just before the server went
  // down, so check once more when the window ends rather than dropping it.
  trailingServerRecheck ??= setTimeout(
    runServerRecheck,
    SERVER_RECHECK_INTERVAL_MS - sinceLast
  );
}

function runServerRecheck() {
  if (trailingServerRecheck) clearTimeout(trailingServerRecheck);
  trailingServerRecheck = null;
  lastServerRecheckAt = Date.now();
  void queryClient.invalidateQueries({ queryKey: serverConnectionQueryKey });
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => recheckServerConnection(error, query.queryKey),
  }),
  mutationCache: new MutationCache({
    onError: (error) => recheckServerConnection(error),
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

// Screen data uses staleTime: Infinity, so a screen let back in by `ServerGate`
// would keep showing its pre-outage cache (or the failed load's error). When
// the connection check goes from down to up, by Try again, focus, a re-check
// or a server switch, mark every data query stale so visible screens reload.
// Checks that stay connected change nothing.
let lastKnownConnected: boolean | undefined;
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'updated' || event.action.type !== 'success') return;
  if (event.query.queryKey[0] !== serverConnectionQueryKey[0]) return;
  const connected = event.query.state.data === true;
  const reconnected = connected && lastKnownConnected === false;
  lastKnownConnected = connected;
  if (!reconnected) return;
  void queryClient.invalidateQueries({
    predicate: (query) => query.queryKey[0] !== serverConnectionQueryKey[0],
  });
});
