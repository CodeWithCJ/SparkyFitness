import { getActiveServerConfig } from './storage';

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

  let { url, apiKey } = config;
  url = url.endsWith('/') ? url.slice(0, -1) : url; // Remove trailing slash if present

  console.log(`[API Service] Attempting to sync to URL: ${url}/health-data`);
  console.log(`[API Service] Using API Key (first 5 chars): ${apiKey ? apiKey.substring(0, 5) + '...' : 'N/A'}`);

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
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
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

  let { url, apiKey } = config;
  url = url.endsWith('/') ? url.slice(0, -1) : url; // Ensure no trailing slash

  try {
    console.log(`[API Service] Attempting to check connection to: ${url}/auth/user`);
    const response = await fetch(`${url}/auth/user`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    console.log(`[API Service] Connection check response status: ${response.status}`);
    // Check for successful response (2xx status code)
    if (response.ok) {
      return true;
    } else {
      // For non-2xx responses, log the error and return false
      const errorText = await response.text();
      console.error(`[API Service] Connection check failed with status ${response.status}: ${errorText}`);
      return false;
    }
  } catch (error) {
    console.error('[API Service] Failed to check server connection:', error);
    return false;
  }
};
