import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  getChatMcpServers,
  saveChatMcpServers,
} from '@/api/Chatbot/chatMcpService';
import type { ChatMcpServersResponse } from '@workspace/shared';

export function useChatMcpServers() {
  const { user } = useAuth();
  const { isActingOnBehalf } = useActiveUser();
  const { t } = useTranslation();
  const client = useQueryClient();
  const queryKey = ['chatMcpServers', user?.id];
  const query = useQuery({
    queryKey,
    queryFn: getChatMcpServers,
    enabled: !!user && user.isDemo === false && !isActingOnBehalf,
    staleTime: 0,
    meta: {
      errorMessage: t('settings.chatMcp.loadError'),
    },
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
    onError: (_error, _ids, context) => {
      if (
        context?.previous &&
        context.query === client.getQueryCache().find({ queryKey, exact: true })
      )
        client.setQueryData(queryKey, context.previous);
    },
    onSuccess: (data, _ids, context) => {
      if (
        context?.query &&
        context.query === client.getQueryCache().find({ queryKey, exact: true })
      )
        client.setQueryData(queryKey, data);
    },
    meta: {
      errorMessage: t('settings.chatMcp.saveError'),
    },
  });
  return {
    servers: isActingOnBehalf ? [] : (query.data?.servers ?? []),
    isSaving: mutation.isPending,
    save: mutation.mutate,
  };
}
