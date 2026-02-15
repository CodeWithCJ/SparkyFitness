import { apiCall } from '@/services/api';
import { post } from '@/utils/api';

interface IntegrationPayload {
  code: string;
  state: string | null;
}
export const linkFitbitAccount = async (
  data: IntegrationPayload
): Promise<void> => {
  return apiCall('/integrations/fitbit/callback', {
    method: 'POST',
    body: data,
  });
};
export const linkWithingsAccount = async (
  data: IntegrationPayload
): Promise<void> => {
  return apiCall('/withings/callback', {
    method: 'POST',
    body: data,
  });
};
