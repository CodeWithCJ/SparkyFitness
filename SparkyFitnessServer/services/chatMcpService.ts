import type {
  ChatMcpServersResponse,
  UpdateChatMcpServersRequest,
} from '@workspace/shared';
import { getChatMcpServerChoices } from '../models/externalProviderRepository.js';
import {
  getChatMcpServerIds,
  saveChatMcpServerChoice,
} from '../models/chatMcpPreferenceRepository.js';

export async function getChatMcpServers(
  userId: string
): Promise<ChatMcpServersResponse> {
  const servers = await getChatMcpServerChoices();
  const enabled = new Set(await getChatMcpServerIds(userId));
  return {
    servers: servers.map(({ id, name, send_user_id }) => ({
      id,
      name,
      send_user_id,
      enabled: enabled.has(id),
    })),
  };
}

export async function updateChatMcpServers(
  userId: string,
  choice: UpdateChatMcpServersRequest
): Promise<{ status: number; data: ChatMcpServersResponse }> {
  const updated = await saveChatMcpServerChoice(userId, choice);
  return {
    status: choice.enabled && !updated ? 409 : 200,
    data: await getChatMcpServers(userId),
  };
}
