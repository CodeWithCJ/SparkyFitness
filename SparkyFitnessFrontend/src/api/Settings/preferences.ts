import { apiCall } from '@/api/api';
import { DefaultPreferences } from '@/contexts/PreferencesContext';

export const upsertUserPreferences = async (
  payload: Partial<DefaultPreferences>
): Promise<unknown> => {
  return apiCall('/user-preferences', {
    method: 'POST',
    body: payload,
  });
};
