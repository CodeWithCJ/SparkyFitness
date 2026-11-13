import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  const mutation = useMutation({
    mutationFn: saveChatMcpServers,
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<ChatMcpServersResponse>(queryKey);
      if (previous)
        client.setQueryData(queryKey, {
          servers: previous.servers.map((server) => ({
            ...server,
            enabled: ids.includes(server.id),
          })),
        });
      return {
        previous,
        query: client.getQueryCache().find({ queryKey, exact: true }),
      };
    },
    onSuccess: (data, _ids, context) => {
      if (
        context?.query &&
        context.query === client.getQueryCache().find({ queryKey, exact: true })
      )
        client.setQueryData(queryKey, data);
    },
    onError: (_error, _ids, context) => {
      if (
        context?.previous &&
        context.query === client.getQueryCache().find({ queryKey, exact: true })
      )
        client.setQueryData(queryKey, context.previous);
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
    isSaving: mutation.isPending,
    save: mutation.mutate,
  };
}
