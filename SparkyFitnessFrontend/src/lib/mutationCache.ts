import { MutationCache } from '@tanstack/react-query';
import i18n from 'i18next';
import { toast } from '@/hooks/use-toast';
import { error } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';

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
      /** The caller shows the failure itself, so no error toast is raised. */
      silentError?: boolean;
    };
  }
}

// helper function to allow variables in toast messages
export const resolveMessage = (
  message: string | ((...args: unknown[]) => string) | undefined,
  ...args: unknown[]
): string | undefined => {
  if (typeof message === 'function') {
    return message(...args);
  }
  return message;
};

/** The app's mutation cache: a toast for each failure and each success message. */
export const createMutationCache = () =>
  new MutationCache({
    onError: (err, variables, _context, mutation) => {
      const loggingLevel = getUserLoggingLevel();
      error(loggingLevel, 'Mutation Error: ', err);
      if (mutation.meta?.silentError) return;
      const resolvedErrorMessage = resolveMessage(
        mutation.meta?.errorMessage,
        err,
        variables
      );
      // Surface backend-provided error detail alongside the meta-defined
      // friendly message. Previously the meta string would always win,
      // hiding 401/429/500 detail from the user (e.g. Garmin auth, MFA,
      // rate-limit reasons all collapsed to "Failed to connect to Garmin.").
      const errDetail = err instanceof Error && err.message ? err.message : '';
      const description =
        resolvedErrorMessage && errDetail && errDetail !== resolvedErrorMessage
          ? `${resolvedErrorMessage} — ${errDetail}`
          : resolvedErrorMessage ||
            errDetail ||
            i18n.t('common.errorOccurred', 'An Error Occurred');
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
  });
