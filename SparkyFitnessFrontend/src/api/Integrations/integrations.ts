import { apiCall } from '@/services/api';
import { post } from '@/utils/api';

interface IntegrationPayload {
  code: string;
  state: string;
}
export const linkFitbitAccount = async (
  data: IntegrationPayload
): Promise<void> => {
  return apiCall('/integrations/fitbit/callback', {
    method: 'POST',
    body: JSON.stringify(data),
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
