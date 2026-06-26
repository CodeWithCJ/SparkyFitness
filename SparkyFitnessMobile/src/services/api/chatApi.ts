import type { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { apiFetch } from './apiClient';

/**
 * Server-side Sparky chat persistence. The streaming endpoint auto-saves each
 * completed exchange on `onFinish`, so the client only needs to read the
 * history back (to seed the runtime on open) and clear it.
 */

/** A single stored chat message as returned by the server. */
export interface ChatHistoryEntry {
  id: string;
  message_type: 'user' | 'assistant';
  content: string;
  parts?: unknown;
  metadata?: unknown;
  created_at: string;
}

/**
 * The `messages` option of `useChatRuntime` — the seed (initial) messages.
 * Imported as a type only so this module stays free of the assistant-ui
 * runtime's ESM/web-fetch dependency chain (it's loaded in plain unit tests).
 */
type InitialMessages = NonNullable<Parameters<typeof useChatRuntime>[0]>['messages'];

/**
 * Fetches the user's recent chat history (server returns the ~50 most recent
 * messages in chronological order). The GET handler ignores the web's
 * `autoClearHistory` query param, so no params are needed here.
 * GET /api/chat/sparky-chat-history
 */
export const loadChatHistory = (): Promise<ChatHistoryEntry[]> =>
  apiFetch<ChatHistoryEntry[]>({
    endpoint: '/api/chat/sparky-chat-history',
    serviceName: 'Chat API',
    operation: 'load chat history',
  });

/**
 * Clears all stored chat history for the user.
 * POST /api/chat/clear-all-history
 */
export const clearAllChatHistory = (): Promise<void> =>
  apiFetch<void>({
    endpoint: '/api/chat/clear-all-history',
    serviceName: 'Chat API',
    operation: 'clear chat history',
    method: 'POST',
    body: {},
  });

/** True when `parts` is a non-empty array of `{ type: 'text', text: string }`. */
function isTextOnlyParts(parts: unknown): parts is { type: 'text'; text: string }[] {
  return (
    Array.isArray(parts) &&
    parts.length > 0 &&
    parts.every(
      (part) =>
        !!part &&
        typeof part === 'object' &&
        (part as { type?: unknown }).type === 'text' &&
        typeof (part as { text?: unknown }).text === 'string'
    )
  );
}

/**
 * Maps server history rows to the AI-SDK initial-message shape consumed by
 * `useChatRuntime`. Text-only: assistant rows are stored as a single text part
 * and image-bearing user turns are already flattened to `content` server-side,
 * so normal history maps cleanly. If a row's `parts` contains a non-text part
 * (e.g. a web image attachment) it isn't text-only, so we fall back to the
 * `content` string — the surrounding text is preserved, the image is dropped
 * (mobile can neither render nor send images). The `id` fallback guards a
 * missing key colliding in the AI-SDK store.
 */
export function mapHistoryToInitialMessages(entries: ChatHistoryEntry[]): InitialMessages {
  return entries.map((entry, i) => {
    const parts = isTextOnlyParts(entry.parts)
      ? entry.parts
      : [{ type: 'text' as const, text: entry.content }];

    return {
      id: entry.id || `history-${i}`,
      role: entry.message_type === 'user' ? ('user' as const) : ('assistant' as const),
      content: entry.content,
      parts,
    };
  }) as unknown as InitialMessages;
}
