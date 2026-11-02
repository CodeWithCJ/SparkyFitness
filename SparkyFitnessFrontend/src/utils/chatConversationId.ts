import { generateClientId } from './generateClientId';

const STORAGE_KEY = 'sparky.chat.conversationId';

// One ID per browser conversation. The server scopes it to the signed-in user,
// and it stays the same across reopening the chat so session-affine providers
// keep their session. Rotate it only when the chat history is cleared or the
// provider changes.
export const getChatConversationId = (): string => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const id = generateClientId();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
};

export const rotateChatConversationId = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
