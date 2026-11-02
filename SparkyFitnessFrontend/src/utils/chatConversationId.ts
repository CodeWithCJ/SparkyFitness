import { generateClientId } from './generateClientId';
import { warn } from './logging';
import { getUserLoggingLevel } from './userPreferences';

const STORAGE_PREFIX = 'sparky.chat.conversationId';

// Used when localStorage or crypto.subtle is unavailable. Kept in memory only.
const memoryFallback = new Map<string, string>();

const warnFallback = (reason: string, cause: unknown) => {
  warn(
    getUserLoggingLevel(),
    `Chat: ${reason}. Using an in-memory conversation ID for this page session.`,
    cause
  );
};

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');

// The user ID is only used to tell acting users apart, so the storage key holds its SHA-256 hash.
const storageKey = async (userId: string) => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(userId)
  );
  return `${STORAGE_PREFIX}:${toHex(digest)}`;
};

const memoryId = (userId: string, reason: string, cause: unknown) => {
  const existing = memoryFallback.get(userId);
  if (existing) return existing;
  warnFallback(reason, cause);
  const id = generateClientId();
  memoryFallback.set(userId, id);
  return id;
};

// One ID per browser conversation for each acting user, so family-access views
// never share a session with the owner's chat. The server scopes the session to
// the signed-in user too. The ID stays the same across reopening the chat.
// Rotate it only when the chat history is cleared or the provider changes.
export const getChatConversationId = async (
  userId: string
): Promise<string> => {
  let key: string;
  try {
    key = await storageKey(userId);
  } catch (error) {
    return memoryId(userId, 'crypto.subtle is unavailable', error);
  }
  try {
    const stored = localStorage.getItem(key);
    if (stored) return stored;
    const id = generateClientId();
    localStorage.setItem(key, id);
    return id;
  } catch (error) {
    return memoryId(userId, 'localStorage is unavailable', error);
  }
};

export const rotateChatConversationId = async (
  userId: string
): Promise<void> => {
  memoryFallback.delete(userId);
  try {
    localStorage.removeItem(await storageKey(userId));
  } catch (error) {
    warnFallback('Could not clear the stored conversation ID', error);
  }
};

// A provider change starts a new conversation for every acting user. It doesn't
// know which user is acting, so it clears all stored IDs.
export const rotateAllChatConversationIds = (): void => {
  memoryFallback.clear();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(`${STORAGE_PREFIX}:`)) localStorage.removeItem(key);
    }
  } catch (error) {
    warnFallback('Could not clear the stored conversation IDs', error);
  }
};
