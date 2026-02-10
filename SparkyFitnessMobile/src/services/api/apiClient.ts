import { getActiveServerConfig } from '../storage';
import { addLog } from '../LogService';

export const normalizeUrl = (url: string): string => {
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

interface ApiFetchOptions {
  endpoint: string;
  serviceName: string;
  operation: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

export async function apiFetch<T>(options: ApiFetchOptions): Promise<T> {
  const { endpoint, serviceName, operation, method = 'GET', body } = options;

  const config = await getActiveServerConfig();
  if (!config) {
    throw new Error('Server configuration not found.');
  }

  const baseUrl = normalizeUrl(config.url);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      addLog(`[${serviceName}] Failed to ${operation}: ${response.status}`, 'ERROR', [errorText]);
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[${serviceName}] Failed to ${operation}: ${message}`, 'ERROR');
    throw error;
  }
}
