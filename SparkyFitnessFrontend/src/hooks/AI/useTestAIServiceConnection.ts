import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { testAIServiceConnection } from '@/api/Settings/aiServiceSettingsService';
import { TestAiServiceConnectionRequest } from '@workspace/shared';

// Inline status rendered next to the Test Connection button.
export type TestConnectionStatus =
  | { state: 'success' }
  | { state: 'error'; message: string }
  | null;

// Shared hook so the test call + category→message mapping isn't duplicated
// across the parents that own a ServiceForm. Both pages (per-user + global)
// invoke this and thread `testConnection`, `isPending`, and `status` down to
// the form, which renders the result inline rather than via a toast.
export const useTestAIServiceConnection = () => {
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: (payload: TestAiServiceConnectionRequest) =>
      testAIServiceConnection(payload),
    // No `meta`: the global MutationCache only toasts when meta.successMessage
    // exists, and we surface the result inline instead. We also omit onError —
    // a thrown error (a rare, UI-illegitimate gate/validation reject) keeps the
    // global MutationCache error toast rather than the inline status.
  });

  // Cleared while a test is in flight so a stale result never lingers over a
  // fresh run; otherwise reflects the most recently completed test.
  let status: TestConnectionStatus = null;
  if (!mutation.isPending && mutation.data) {
    status = mutation.data.ok
      ? { state: 'success' }
      : {
          state: 'error',
          message: t(
            `settings.aiService.test.categories.${mutation.data.category ?? 'unknown'}`,
            t('settings.aiService.test.categories.unknown')
          ),
        };
  }

  // No query invalidation: a test mutates nothing.
  return {
    testConnection: mutation.mutate,
    isPending: mutation.isPending,
    status,
    // Parents own a single page-level instance, so they call this when opening,
    // closing, or switching forms to clear a previous service's stale result.
    reset: mutation.reset,
  };
};
