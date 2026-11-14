import { HttpApiError } from '@/api/api';
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
    onError: (error, choice, context) => {
      // A 409 means the server changed or was removed since this page loaded,
      // so nothing was saved; onSettled shows the list as it is now.
      if (
        !(error instanceof HttpApiError && error.status === 409) &&
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
    meta: {
      errorMessage: t('settings.chatMcp.saveError'),
    },
  });
  return {
    servers: isActingOnBehalf ? [] : (query.data?.servers ?? []),
    savingServerIds,
    save: mutation.mutate,
  };
}
