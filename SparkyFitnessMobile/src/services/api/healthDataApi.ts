import { getActiveServerConfig } from '../storage';
import { addLog } from '../LogService';
import { normalizeUrl } from './apiClient';

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

  const { apiKey } = config;
  const url = normalizeUrl(config.url);

  console.log(`[API Service] Attempting to sync to URL: ${url}/health-data`);
  console.log(`[API Service] Using API Key (first 5 chars): ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

  addLog(`[API] Starting sync of ${data.length} records to server`, 'DEBUG');

  try {
    const response = await fetch(`${url}/health-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text(); // Read raw response text
      console.log('Server responded with non-OK status:', response.status, errorText); // Use console.log
      addLog(`[API] Sync failed: server returned ${response.status}`, 'ERROR', [errorText]);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    addLog(`[API] Sync successful: ${data.length} records sent to server`, 'SUCCESS');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[API] Sync failed: ${message}`, 'ERROR');
    console.error('Failed to sync health data', error);
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

  const { apiKey } = config;
  const url = normalizeUrl(config.url);

  try {
    const response = await fetch(`${url}/auth/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    // Check for successful response (2xx status code)
    if (response.ok) {
      // addLog(`[API] Server connection check successful`, 'debug');
      return true;
    } else {
      // For non-2xx responses, log the error and return false
      const errorText = await response.text();
      addLog(`[API] Server connection check failed: status ${response.status}`, 'WARNING', [errorText]);
      console.error(`[API Service] Connection check failed with status ${response.status}: ${errorText}`);
      return false;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[API] Server connection check failed: ${message}`, 'ERROR');
    console.error('[API Service] Failed to check server connection:', error);
    return false;
  }
};
