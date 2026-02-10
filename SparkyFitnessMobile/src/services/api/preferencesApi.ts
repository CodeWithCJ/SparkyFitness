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
