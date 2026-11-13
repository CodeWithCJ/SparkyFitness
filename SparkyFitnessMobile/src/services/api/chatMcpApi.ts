import { chatMcpServersResponseSchema } from '@workspace/shared';
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

export async function saveChatMcpServers(enabled_server_ids: string[]) {
  return chatMcpServersResponseSchema.parse(
    await apiFetch<unknown>({
      endpoint: '/api/chat/mcp-servers',
      method: 'PUT',
      body: { enabled_server_ids },
      serviceName: 'AI Settings',
      operation: 'save outside tool servers',
    })
  );
}
