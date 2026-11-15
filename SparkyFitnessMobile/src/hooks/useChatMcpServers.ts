import { ApiError } from '../services/api/errors';
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { ChatMcpServersResponse } from '@workspace/shared';
import {
  fetchChatMcpServers,
  saveChatMcpServers,
} from '../services/api/chatMcpApi';
import { chatMcpServersQueryKey } from './queryKeys';

export function useChatMcpServers() {
  const client = useQueryClient();
  const { t } = useTranslation();
  const queryKey = chatMcpServersQueryKey;
  const query = useQuery({
    queryKey,
    queryFn: fetchChatMcpServers,
    staleTime: 0,
  });
  const savingServerIds = useMutationState({
    filters: { mutationKey: queryKey, status: 'pending', exact: true },
    select: (mutation) =>
      (mutation.state.variables as { server_id: string }).server_id,
  });
  const mutation = useMutation({
    mutationKey: queryKey,
    mutationFn: saveChatMcpServers,
    onMutate: async (choice) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<ChatMcpServersResponse>(queryKey);
      if (previous)
        client.setQueryData(queryKey, {
          servers: previous.servers.map((server) => ({
            ...server,
            enabled:
              server.id === choice.server_id ? choice.enabled : server.enabled,
          })),
        });
      return {
        previous,
        query: client.getQueryCache().find({ queryKey, exact: true }),
      };
    },
    // Reload once no save is left running, so an earlier reload cannot
    // overwrite a switch another save just changed. A save still counts as
    // running during its own onSettled, and two can settle together, so check
    // after the current callbacks have finished.
    onSettled: () => {
      setTimeout(() => {
        if (client.isMutating({ mutationKey: queryKey, exact: true }) === 0)
          void client.invalidateQueries({ queryKey, exact: true });
      }, 0);
    },
    onSuccess: (data, choice, context) => {
      if (
        context?.query &&
        context.query === client.getQueryCache().find({ queryKey, exact: true })
      )
        client.setQueryData<ChatMcpServersResponse>(
          queryKey,
          (current) =>
            current && {
              servers: current.servers.map((server) =>
                server.id === choice.server_id
                  ? (data.servers.find((saved) => saved.id === server.id) ??
                    server)
                  : server
              ),
            }
        );
    },
    onError: (error, choice, context) => {
      // A 409 means the server changed or was removed since this screen
      // loaded, so nothing was saved; onSettled shows the list as it is now.
      if (
        !(error instanceof ApiError && error.statusCode === 409) &&
        context?.previous &&
        context.query === client.getQueryCache().find({ queryKey, exact: true })
      )
        client.setQueryData<ChatMcpServersResponse>(
          queryKey,
          (current) =>
            current && {
              servers: current.servers.map((server) =>
                server.id === choice.server_id
                  ? {
                      ...server,
                      enabled:
                        context.previous?.servers.find(
                          (old) => old.id === server.id
                        )?.enabled ?? false,
                    }
                  : server
              ),
            }
        );
      Toast.show({
        type: 'error',
        text1: t('aiSettings.chatMcp.saveError', {
          defaultValue: 'Could not save. Please try again.',
        }),
      });
    },
  });
  return {
    servers: query.data?.servers ?? [],
    isError: query.isError,
    isLoading: query.isLoading,
    refetch: query.refetch,
    savingServerIds,
    save: mutation.mutate,
  };
}
