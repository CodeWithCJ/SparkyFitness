import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.tsx';
import './i18n';
import { Suspense } from 'react';
import { PreferencesProvider } from './contexts/PreferencesContext.tsx';
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: string | ((...args: any[]) => string) | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
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
      const description =
        resolvedErrorMessage ||
        (err instanceof Error ? err.message : 'An error occurred');
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
    <BrowserRouter>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <PreferencesProvider>
            <App />
          </PreferencesProvider>
        </QueryClientProvider>
      </AuthProvider>
    </BrowserRouter>
  </Suspense>
);
