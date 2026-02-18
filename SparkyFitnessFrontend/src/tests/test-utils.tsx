import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  MutationCache,
  QueryCache,
} from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

// helper function to allow variables in toast messages
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolveMessage = (message: any, ...args: any[]): string | undefined => {
  if (typeof message === 'function') {
    return message(...args);
  }
  return message;
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false, // Disable retries for tests
      },
    },
    queryCache: new QueryCache({
      onError: (e, query) => {
        if (query.meta?.errorMessage) {
          toast({
            title: (query.meta.errorTitle as string) || 'Error',
            description: query.meta.errorMessage as string,
            variant: 'destructive',
          });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, variables, _context, mutation) => {
        const resolvedErrorMessage = resolveMessage(
          mutation.meta?.errorMessage,
          err,
          variables
        );
        const description =
          resolvedErrorMessage ||
          (err instanceof Error ? err.message : 'An error occurred');
        toast({
          title: (mutation.meta?.errorTitle as string) || 'Error',
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
            title: 'Success',
            description: message,
          });
        }
      },
    }),
  });

export function renderWithClient(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  const testQueryClient = createTestQueryClient();
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={testQueryClient}>
      {children}
    </QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper, ...options });
}
