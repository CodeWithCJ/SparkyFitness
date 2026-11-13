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
type InitialMessages = NonNullable<
  Parameters<typeof useChatRuntime>[0]
>['messages'];

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

type NormalizedHistoryPart = Extract<
  NonNullable<InitialMessages>[number]['parts'][number],
  { type: 'text' | 'file' }
>;

interface RawHistoryPart {
  type?: unknown;
  text?: unknown;
  url?: unknown;
  data?: unknown;
  image?: unknown;
  image_url?: unknown;
  mediaType?: unknown;
  mimeType?: unknown;
  filename?: unknown;
}

function resolveImageMediaType(
  rawPart: RawHistoryPart,
  url: string
): string | undefined {
  if (
    typeof rawPart.mediaType === 'string' &&
    rawPart.mediaType.startsWith('image/')
  ) {
    return rawPart.mediaType;
  }
  if (
    typeof rawPart.mimeType === 'string' &&
    rawPart.mimeType.startsWith('image/')
  ) {
    return rawPart.mimeType;
  }
  if (url.startsWith('data:image/')) {
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);/i.exec(url);
    return match ? match[1].toLowerCase() : 'image/jpeg';
  }
  if (rawPart.type === 'image' || rawPart.type === 'image_url') {
    const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
    if (cleanUrl.endsWith('.png')) return 'image/png';
    if (cleanUrl.endsWith('.webp')) return 'image/webp';
    if (cleanUrl.endsWith('.gif')) return 'image/gif';
    if (cleanUrl.endsWith('.avif')) return 'image/avif';
    if (cleanUrl.endsWith('.svg')) return 'image/svg+xml';
    return 'image/jpeg';
  }
  return undefined;
}

function extractImageUrl(rawPart: RawHistoryPart): string {
  if (typeof rawPart.image_url === 'string') return rawPart.image_url.trim();
  if (
    rawPart.image_url &&
    typeof rawPart.image_url === 'object' &&
    'url' in rawPart.image_url &&
    typeof rawPart.image_url.url === 'string'
  ) {
    return rawPart.image_url.url.trim();
  }
  if (typeof rawPart.image === 'string') return rawPart.image.trim();
  if (typeof rawPart.url === 'string') return rawPart.url.trim();
  if (typeof rawPart.data === 'string') return rawPart.data.trim();
  return '';
}

function normalizeHistoryPart(part: unknown): NormalizedHistoryPart | null {
  if (!part || typeof part !== 'object') return null;
  const raw = part as RawHistoryPart;

  if (raw.type === 'text' && typeof raw.text === 'string') {
    return raw.text.trim().length > 0 ? { type: 'text', text: raw.text } : null;
  }

  if (raw.type === 'image' || raw.type === 'image_url' || raw.type === 'file') {
    const url = extractImageUrl(raw);
    if (!url) return null;
    const mediaType = resolveImageMediaType(raw, url);
    if (!mediaType) return null;
    const filename =
      typeof raw.filename === 'string' && raw.filename.trim().length > 0
        ? raw.filename.trim()
        : undefined;
    return {
      type: 'file',
      mediaType,
      url,
      ...(filename ? { filename } : {}),
    };
  }

  return null;
}

function normalizeHistoryParts(parts: unknown): NormalizedHistoryPart[] | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const normalized = parts
    .map(normalizeHistoryPart)
    .filter((part): part is NormalizedHistoryPart => part !== null);
  if (normalized.length === 0) return null;

  const hasImage = normalized.some((part) => part.type === 'file');
  if (hasImage) {
    const withoutSyntheticPlaceholder = normalized.filter(
      (part) => !(part.type === 'text' && part.text === '[Image message]')
    );
    if (withoutSyntheticPlaceholder.length > 0) {
      return withoutSyntheticPlaceholder;
    }
  }

  return normalized;
}

export function mapHistoryToInitialMessages(
  entries: ChatHistoryEntry[]
): NonNullable<InitialMessages> {
  return entries.map((entry, i) => {
    const parts = normalizeHistoryParts(entry.parts) ?? [
      { type: 'text' as const, text: entry.content },
    ];

    return {
      id: entry.id || `history-${i}`,
      role:
        entry.message_type === 'user'
          ? ('user' as const)
          : ('assistant' as const),
      content: entry.content,
      parts,
    };
  });
}
