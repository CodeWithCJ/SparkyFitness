import { apiCall } from '@/api/api';

export interface UserMedicationDisplayPreference {
  id: string;
  user_id: string;
  view_group: string;
  platform: string;
  visible_items: string[];
  created_at: string;
  updated_at: string;
}

export const getMedicationDisplayPreferences = async (): Promise<
  UserMedicationDisplayPreference[]
> => {
  return apiCall('/v2/medications/display-preferences', {
    method: 'GET',
  });
};

export const upsertMedicationDisplayPreference = async (
  viewGroup: string,
  platform: string,
  visibleItems: string[]
): Promise<UserMedicationDisplayPreference> => {
  return apiCall(
    `/v2/medications/display-preferences/${viewGroup}/${platform}`,
    {
      method: 'PUT',
      body: JSON.stringify({ visible_items: visibleItems }),
    }
  );
};

export const deleteMedicationDisplayPreference = async (
  viewGroup: string,
  platform: string
): Promise<void> => {
  return apiCall(
    `/v2/medications/display-preferences/${viewGroup}/${platform}`,
    {
      method: 'DELETE',
    }
  );
};
