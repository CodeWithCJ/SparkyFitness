import { apiFetch } from './apiClient';
import { UserPreferences } from '../../types/preferences';
import { isValidTimeZone } from '@workspace/shared';
import { addLog } from '../LogService';

interface EnsureTimezoneBootstrappedOptions {
  throwOnFailure?: boolean;
}

interface TimezoneBootstrapResult {
  timezone?: string;
  error?: Error;
}

let timezoneBootstrapPromise: Promise<TimezoneBootstrapResult> | null = null;

/**
 * Fetches user preferences.
 */
export const fetchPreferences = async (): Promise<UserPreferences> => {
  return apiFetch<UserPreferences>({
    endpoint: '/api/user-preferences',
    serviceName: 'Preferences API',
    operation: 'fetch preferences',
  });
};

/**
 * Updates user preferences (partial — only provided fields are changed).
 * Uses PUT to update an existing row; omitted fields keep their current values
 * via server-side COALESCE. POST would be an upsert that resets omitted fields
 * to defaults on INSERT.
 */
export const updatePreferences = async (
  data: Partial<UserPreferences>,
): Promise<UserPreferences> => {
  return apiFetch<UserPreferences>({
    endpoint: '/api/user-preferences',
    serviceName: 'Preferences API',
    operation: 'update preferences',
    method: 'PUT',
    body: data,
  });
};

/**
 * Ensures the server has a timezone for this user by sending the current
 * device timezone to a server-side atomic bootstrap endpoint. The server
 * only fills timezone when it is currently NULL and otherwise returns the
 * existing explicit preference unchanged.
 */
export async function ensureTimezoneBootstrapped(
  { throwOnFailure = false }: EnsureTimezoneBootstrappedOptions = {},
): Promise<string | undefined> {
  if (timezoneBootstrapPromise) {
    const result = await timezoneBootstrapPromise;
    if (result.error) {
      if (throwOnFailure) throw result.error;
      return undefined;
    }
    return result.timezone;
  }

  timezoneBootstrapPromise = (async () => {
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!deviceTz || !isValidTimeZone(deviceTz)) {
      const error = new Error(`Device timezone invalid or unavailable: ${deviceTz}`);
      addLog(`[Preferences] ${error.message}`, 'WARNING');
      return { error };
    }

    try {
      addLog(`[Preferences] Ensuring server timezone from device: ${deviceTz}`, 'INFO');
      const prefs = await apiFetch<UserPreferences>({
        endpoint: '/api/user-preferences/bootstrap-timezone',
        serviceName: 'Preferences API',
        operation: 'bootstrap timezone',
        method: 'POST',
        body: { timezone: deviceTz },
      });

      if (!prefs.timezone) {
        const error = new Error('Server did not return a timezone after bootstrap');
        addLog(`[Preferences] ${error.message}`, 'WARNING');
        return { error };
      }

      return { timezone: prefs.timezone };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      addLog(
        `[Preferences] Timezone bootstrap failed: ${error.message}`,
        'WARNING',
      );
      return { error };
    }
  })();

  try {
    const result = await timezoneBootstrapPromise;
    if (result.error) {
      if (throwOnFailure) throw result.error;
      return undefined;
    }
    return result.timezone;
  } finally {
    timezoneBootstrapPromise = null;
  }
}
