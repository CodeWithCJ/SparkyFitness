import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../services/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Only refetch when explicitly triggered or polled
      // Don't retry on 4xx — those are caller-state errors (auth, validation,
      // 429 rate-limit) that won't change on a retry. Retrying amplified
      // 429s by 3× and accelerated the api-key rate-limit lockout in #1302.
      retry: (failureCount, err) => {
        if (
          err instanceof ApiError &&
          err.statusCode >= 400 &&
          err.statusCode < 500
        ) {
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
