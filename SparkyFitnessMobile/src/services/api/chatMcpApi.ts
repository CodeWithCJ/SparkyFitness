import {
  chatMcpServersResponseSchema,
  type UpdateChatMcpServersRequest,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

export async function fetchChatMcpServers() {
  return chatMcpServersResponseSchema.parse(
    await apiFetch<unknown>({
      endpoint: '/api/chat/mcp-servers',
      serviceName: 'AI Settings',
      operation: 'fetch outside tool servers',
    })
  );
}

export async function saveChatMcpServers(choice: UpdateChatMcpServersRequest) {
  return chatMcpServersResponseSchema.parse(
    await apiFetch<unknown>({
      endpoint: '/api/chat/mcp-servers',
      method: 'PUT',
      body: choice,
      serviceName: 'AI Settings',
      operation: 'save outside tool servers',
    })
  );
}
