import { apiCall } from '@/api/api';
import { error } from '@/utils/logging';
import { Message } from '@/types/Chatbot_types';

export interface UserPreferences {
  auto_clear_history: 'never' | '7days' | 'all';
  logging_level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR';
}

interface ChatHistory extends Message {
  message_type: string;
  created_at: string;
}

export const loadUserPreferences = async (): Promise<UserPreferences> => {
  const data = await apiCall(`/user-preferences`, {
    method: 'GET',
  });
  return (
    data || {
      auto_clear_history: 'never',
      logging_level: 'WARN',
    }
  );
};

export const loadChatHistory = async (
  autoClearHistory: string
): Promise<Message[]> => {
  const params = new URLSearchParams({
    autoClearHistory,
  });
  const data: ChatHistory[] = await apiCall(
    `/chat/sparky-chat-history?${params.toString()}`,
    {
      method: 'GET',
    }
  );

  return (data || []).map((item) => {
    const timestamp = new Date(item.created_at);
    if (isNaN(timestamp.getTime())) {
      error('ERROR', `Invalid timestamp from DB: ${item.created_at}`);
    }
    return {
      id: item.id,
      content: item.content,
      isUser: item.message_type === 'user',
      timestamp: timestamp,
      metadata: item.metadata,
    };
  });
};

export const clearChatHistory = async (
  clearType: 'manual' | 'all'
): Promise<void> => {
  await apiCall(
    `/chat/${clearType === 'all' ? 'clear-all-history' : 'clear-old-history'}`,
    {
      method: 'POST',
      body: {}, // No body needed, user is identified by JWT
    }
  );
};
