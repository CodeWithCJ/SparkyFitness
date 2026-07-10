import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { Suspense } from 'react';
import {
  QueryClient,
  QueryCache,
  MutationCache,
  QueryClientProvider,
} from '@tanstack/react-query';
import i18n from './i18n';
import { getUserLoggingLevel } from './utils/userPreferences.ts';
import { toast } from './hooks/use-toast.ts';
import { error } from '@/utils/logging';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: {
      errorTitle?: string;
      errorMessage?: string;
    };
    mutationMeta: {
      successMessage?: string | ((data: unknown, variables: unknown) => string);
      errorMessage?: string | ((error: unknown, variables: unknown) => string);
      errorTitle?: string;
    };
  }
}
// helper function to allow variables in toast messages
const resolveMessage = (
  message: string | ((...args: unknown[]) => string) | undefined,
  ...args: unknown[]
): string | undefined => {
  if (typeof message === 'function') {
    return message(...args);
  }
  return message;
};
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
  mutationCache: new MutationCache({
    onError: (err, variables, _context, mutation) => {
      const loggingLevel = getUserLoggingLevel();
      error(loggingLevel, 'Mutation Error: ', err);
      const resolvedErrorMessage = resolveMessage(
        mutation.meta?.errorMessage,
        err,
        variables
      );
      // Surface backend-provided error detail alongside the meta-defined
      // friendly message. Previously the meta string would always win,
      // hiding 401/429/500 detail from the user (e.g. Garmin auth, MFA,
      // rate-limit reasons all collapsed to "Failed to connect to Garmin.").
      const errDetail =
        err instanceof Error &&
        err.message &&
        !(
          'code' in err &&
          typeof (err as Error & { code?: unknown }).code === 'string'
        )
          ? err.message
          : '';
      const description =
        resolvedErrorMessage && errDetail && errDetail !== resolvedErrorMessage
          ? `${resolvedErrorMessage} — ${errDetail}`
          : resolvedErrorMessage || errDetail || 'An error occurred';
      toast({
        title:
          (mutation.meta?.errorTitle as string) ||
          i18n.t('common.error', 'Error'),
        description: description,
        variant: 'destructive',
      });
    },
    onSuccess: (data, variables, _context, mutation) => {
      const message = resolveMessage(
        mutation.meta?.successMessage,
        data,
        variables
      );

      if (message) {
        toast({
          title: i18n.t('common.success', 'Success'),
          description: message,
        });
      }
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Reduced from 30m to 5m for better responsiveness
      gcTime: 1000 * 60 * 60,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: 1,
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
