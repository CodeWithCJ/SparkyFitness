import { getActiveServerConfig, proxyHeadersToRecord } from '../storage';
import { addLog } from '../LogService';
import { normalizeUrl } from './apiClient';
import { getAuthHeaders, notifySessionExpired } from './authService';

export interface HealthDataPayloadItem {
  type: string;
  date: string;  // YYYY-MM-DD format
  value: number;
}

export type HealthDataPayload = HealthDataPayloadItem[];

/**
 * Sends health data to the server.
 */
export const syncHealthData = async (data: HealthDataPayload): Promise<unknown> => {
  const config = await getActiveServerConfig();
  if (!config) {
    throw new Error('Server configuration not found.');
  }

  const url = normalizeUrl(config.url);

  if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
    throw new Error('HTTPS is required for server connections. Please update your server URL in Settings.');
  }

  console.log(`[API Service] Attempting to sync to URL: ${url}/api/health-data`);

  addLog(`[API] Starting sync of ${data.length} records to server`, 'DEBUG');

  try {
    const response = await fetch(`${url}/api/health-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      if (response.status === 401 && config.authType === 'session') {
        notifySessionExpired(config.id);
      }
      const errorText = await response.text();
      console.log('Server responded with non-OK status:', response.status, errorText);
      addLog(`[API] Sync failed: server returned ${response.status}`, 'ERROR', [errorText]);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    addLog(`[API] Sync successful: ${data.length} records sent to server`, 'SUCCESS');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[API] Sync failed: ${message}`, 'ERROR');
    throw error;
  }
};

/**
 * Checks the server connection status.
 */
export const checkServerConnection = async (): Promise<boolean> => {
  const config = await getActiveServerConfig();
  if (!config || !config.url) {
    console.log('[API Service] No active server configuration found for connection check.');
    return false; // No configuration, so no connection
  }

  const url = normalizeUrl(config.url);

  if (!__DEV__ && url.toLowerCase().startsWith('http://')) {
    addLog('[API] Connection check blocked: HTTPS is required', 'WARNING');
    return false;
  }

  try {
    const response = await fetch(`${url}/api/identity/user`, {
      method: 'GET',
      headers: {
        ...proxyHeadersToRecord(config.proxyHeaders),
        ...getAuthHeaders(config),
      },
    });
    if (response.ok) {
      return true;
    } else {
      if (response.status === 401 && config.authType === 'session') {
        notifySessionExpired(config.id);
      }
      const errorText = await response.text();
      addLog(`[API] Server connection check failed: status ${response.status}`, 'WARNING', [errorText]);
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[API] Server connection check failed: ${message}`, 'ERROR');
    return false;
  }
};
