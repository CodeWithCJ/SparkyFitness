import { useQuery } from '@tanstack/react-query';
import { loadChatHistory, mapHistoryToInitialMessages } from '../services/api/chatApi';
import { chatHistoryQueryKey } from './queryKeys';

interface UseChatHistoryOptions {
  enabled?: boolean;
}

/**
 * Loads the server-stored chat history and maps it to AI-SDK seed messages.
 *
 * `gcTime: 0` (not just `staleTime: 0`) is required: with a warm cache React
 * Query reports `isLoading: false` immediately, so an `isLoading`-gated screen
 * would mount the thread and seed the runtime with stale messages before the
 * background refetch lands — and the runtime ignores `messages` changes after
 * mount. Dropping the cache on unmount makes every (re)open "cold", so
 * `isLoading` is `true` until the fresh fetch resolves and the runtime always
 * seeds from the latest server state. This is the always-refetch-on-open model,
 * so no `onFinish` invalidation is needed.
 *
 * On error `data` is `undefined`; callers default to `[]` so chat still works
 * against an older/offline server.
 */
export function useChatHistory({ enabled = true }: UseChatHistoryOptions = {}) {
  return useQuery({
    queryKey: chatHistoryQueryKey,
    queryFn: loadChatHistory,
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
    select: mapHistoryToInitialMessages,
  });
}
