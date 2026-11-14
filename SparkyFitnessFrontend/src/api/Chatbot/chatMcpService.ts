import { apiCall } from '@/api/api';
import {
  chatMcpServersResponseSchema,
  type UpdateChatMcpServersRequest,
} from '@workspace/shared';

export const getChatMcpServers = async () =>
  chatMcpServersResponseSchema.parse(await apiCall('/chat/mcp-servers'));

export const saveChatMcpServers = async (choice: UpdateChatMcpServersRequest) =>
  chatMcpServersResponseSchema.parse(
    await apiCall('/chat/mcp-servers', {
      method: 'PUT',
      body: choice,
    })
  );
