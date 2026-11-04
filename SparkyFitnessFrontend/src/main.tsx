import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { Suspense } from 'react';
import {
  QueryClient,
  QueryCache,
  QueryClientProvider,
} from '@tanstack/react-query';
import i18n from './i18n';
import { getUserLoggingLevel } from './utils/userPreferences.ts';
import { toast } from './hooks/use-toast.ts';
import { error } from '@/utils/logging';
import { HttpApiError } from './api/api.ts';
import { createMutationCache } from './lib/mutationCache.ts';
import { installTranslationDomGuard } from './utils/translationDomGuard.ts';

installTranslationDomGuard();

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (e, query) => {
      error(getUserLoggingLevel(), 'Query Error: ', e);
      if (query.meta?.errorMessage) {
        toast({
          title:
            (query.meta.errorTitle as string) ??
            i18n.t('common.error', 'Error'),
          description: query.meta.errorMessage,
          variant: 'destructive',
        });
      }
    },
  }),
  mutationCache: createMutationCache(),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Reduced from 30m to 5m for better responsiveness
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      // A 4xx is a verdict, not a hiccup: retrying an authorization or
      // validation failure just doubles the failed requests and the noise.
      // Only server and network errors are worth a second attempt.
      retry: (failureCount, err) => {
        const status =
          err instanceof HttpApiError
            ? err.status
            : (err as { status?: number })?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) {
          return false;
        }
        return failureCount < 1;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
    },
    mutations: {
      retry: 0,
    },
  },
});
createRoot(document.getElementById('root')!).render(
  <Suspense fallback="loading">
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </Suspense>
);
