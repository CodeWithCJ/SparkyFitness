import type { ChatMcpServersResponse } from '@workspace/shared';
import { getChatMcpServerChoices } from '../models/externalProviderRepository.js';
import {
  getChatMcpServerIds,
  saveChatMcpServerIds,
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
  ids: string[]
): Promise<ChatMcpServersResponse> {
  const servers = await getChatMcpServerChoices();
  const available = new Set(servers.map(({ id }) => id));
  const enabled = new Set(ids.filter((id) => available.has(id)));
  await saveChatMcpServerIds(userId, [...enabled]);
  return {
    servers: servers.map(({ id, name, send_user_id }) => ({
      id,
      name,
      send_user_id,
      enabled: enabled.has(id),
    })),
  };
}
