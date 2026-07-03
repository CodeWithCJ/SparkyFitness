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

export async function fetchUserAiConfigAllowed(): Promise<boolean> {
  const config = await getActiveServerConfig();
  if (!config) return false;

  const baseUrl = normalizeUrl(config.url);
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) {
    return false;
  }

  try {
    const response = await fetch(`${baseUrl}/api/global-settings/allow-user-ai-config`, {
      method: 'GET',
      cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
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
        `[AI Settings] User AI config gate fetch failed: ${response.status}`,
        'WARNING',
      );
      return false;
    }

    const body = await response.json();
    return body?.allow_user_ai_config === true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[AI Settings] User AI config gate fetch error: ${message}`,
      'WARNING',
    );
    return false;
  }
}

// Returns `null` when nothing is configured or any failure occurs — never
// throws, so callers can gate UI without a try/catch.
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
      cache: 'no-store', // skip native HTTP cache to avoid 304 empty bodies (#1353)
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

// Food photo is attempt-all: any configured provider is dispatched server-side
// (dispatchAiRequest tries every service_type it has a builder for). So the
// mobile gate only asks "is a provider configured at all" — a genuinely
// unbuildable type is caught server-side as UNSUPPORTED_PROVIDER and surfaced
// via mapEstimateError. service_type is a free-form string in the shared model,
// so trim before testing for emptiness.
export function isFoodPhotoAvailable(
  setting: ActiveAiServiceSetting | null | undefined,
): boolean {
  return (setting?.service_type ?? '').trim().length > 0;
}
