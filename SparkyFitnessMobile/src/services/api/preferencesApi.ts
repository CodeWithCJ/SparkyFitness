import { apiFetch } from './apiClient';
import { UserPreferences } from '../../types/preferences';

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
