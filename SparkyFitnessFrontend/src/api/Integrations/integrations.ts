import { apiCall } from '@/api/api';

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

export const linkStravaAccount = async (
  data: IntegrationPayload
): Promise<void> => {
  return apiCall('/integrations/strava/callback', {
    method: 'POST',
    body: data,
  });
};

export const syncHevyData = async (
  fullSync: boolean = false,
  providerId?: string
): Promise<void> => {
  return apiCall(`/integrations/hevy/sync${fullSync ? '?fullSync=true' : ''}`, {
    method: 'POST',
    body: JSON.stringify({ providerId }),
  });
};
export interface GarminLoginPayload {
  email: string;
  password: string;
}
export interface GarminProviderData {
  id: string;
  provider_type: string;
}

export interface GarminLoginResponse {
  status: string;
  provider?: GarminProviderData;
  client_state?: string;
  error?: string;
  id: string;
}

export const loginGarmin = async (
  payload: GarminLoginPayload
): Promise<GarminLoginResponse> => {
  return apiCall('/integrations/garmin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};
