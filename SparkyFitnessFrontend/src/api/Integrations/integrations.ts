import { apiCall } from '@/services/api';

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
export const linkPolarFlowAccount = async (
  data: IntegrationPayload
): Promise<void> => {
  return apiCall('/integrations/polar/callback', {
    method: 'POST',
    body: data,
  });
};

export const connectHevyAccount = async (data: {
  apiKey: string;
}): Promise<void> => {
  return apiCall('/hevy/connect', {
    method: 'POST',
    body: data,
  });
};

export const syncHevyData = async (
  fullSync: boolean = false
): Promise<void> => {
  return apiCall(`/hevy/sync${fullSync ? '?fullSync=true' : ''}`, {
    method: 'POST',
  });
};

export const disconnectHevyAccount = async (): Promise<void> => {
  return apiCall('/hevy/disconnect', {
    method: 'POST',
  });
};
