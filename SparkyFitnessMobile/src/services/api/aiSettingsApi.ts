import { addLog } from '../LogService';
import { normalizeUrl } from './apiClient';
import { getAuthHeaders, notifySessionExpired } from './authService';
import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { FOOD_PHOTO_PROVIDER_LABELS } from '../../utils/foodPhotoEstimate';

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

const FOOD_PHOTO_SUPPORTED_PROVIDERS = new Set(Object.keys(FOOD_PHOTO_PROVIDER_LABELS));

export function isFoodPhotoAvailable(
  setting: ActiveAiServiceSetting | null | undefined,
): boolean {
  return FOOD_PHOTO_SUPPORTED_PROVIDERS.has(setting?.service_type ?? '');
}
