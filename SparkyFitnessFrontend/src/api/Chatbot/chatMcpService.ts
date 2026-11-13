import { apiCall } from '@/api/api';
import { chatMcpServersResponseSchema } from '@workspace/shared';

export const getChatMcpServers = async () =>
  chatMcpServersResponseSchema.parse(await apiCall('/chat/mcp-servers'));

export const saveChatMcpServers = async (enabled_server_ids: string[]) =>
  chatMcpServersResponseSchema.parse(
    await apiCall('/chat/mcp-servers', {
      method: 'PUT',
      body: { enabled_server_ids },
    })
  );
