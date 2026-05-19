import { addLog } from '../LogService';
import { normalizeUrl } from './apiClient';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';

export interface ActiveAiServiceSetting {
  id: string;
  service_name: string;
  service_type: string;
  model_name?: string;
  is_active: boolean;
  source?: 'user' | 'global' | string;
}

/**
 * Fetches the active AI service setting (user-scoped, with global fallback
 * inside the server). Returns `null` when nothing is configured or any
 * failure occurs — this never throws, so callers can gate UI without
 * a try/catch.
 *
 * Server contract (chatRoutes.ts:227-254 + chatService.ts:66-90):
 *   - 200 + setting object when active config exists
 *   - 200 + `null` body when none is configured (or service errored)
 *   - 404 only for a specific message the service no longer throws
 */
export async function fetchActiveAiServiceSetting(): Promise<ActiveAiServiceSetting | null> {
  const config = await getActiveServerConfig();
  if (!config) return null;

  const baseUrl = normalizeUrl(config.url);
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}/api/chat/ai-service-settings/active`, {
      method: 'GET',
      headers: {
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
    });
    if (!response.ok) {
      if (response.status === 401 && config.authType === 'session') {
        notifySessionExpired(config.id);
      }
      addLog(
        `[AI Settings] Active setting fetch failed: ${response.status}`,
        'WARNING',
      );
      return null;
    }
    if (
      response.status === 204 ||
      response.headers?.get('content-length') === '0'
    ) {
      return null;
    }
    const body = await response.json();
    if (!body || typeof body !== 'object') return null;
    return body as ActiveAiServiceSetting;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[AI Settings] Active setting fetch error: ${message}`, 'WARNING');
    return null;
  }
}

const FOOD_PHOTO_SUPPORTED_PROVIDERS = new Set(['google', 'openai', 'anthropic']);

/**
 * Food photo estimation supports Google, OpenAI, and Anthropic on the
 * server. Any other provider (or missing config) should gate the UI.
 */
export function isFoodPhotoAvailable(
  setting: ActiveAiServiceSetting | null | undefined,
): boolean {
  return FOOD_PHOTO_SUPPORTED_PROVIDERS.has(setting?.service_type ?? '');
}
