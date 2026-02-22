import { ExternalDataProvider } from '@/pages/Settings/ExternalProviderSettings';
import { apiCall } from '@/services/api';

export interface DataProvider {
  id: string;
  name: string;
  provider_type: string; // e.g., 'wger', 'fatsecret', 'openfoodfacts', 'nutritionix'
  provider_name: string; // e.g., 'Wger', 'FatSecret' (for display and value)
  is_active: boolean; // Changed from is_enabled to is_active
  has_token?: boolean;
  shared_with_public?: boolean;
  is_strictly_private?: boolean;
}

export const getExternalDataProviders = async (): Promise<DataProvider[]> => {
  return apiCall('/external-providers', {
    method: 'GET',
  });
};

export const getProviderCategory = (
  provider: DataProvider
): ('food' | 'exercise' | 'other')[] => {
  switch (
    provider.provider_type.toLowerCase() ||
    provider.provider_name.toLowerCase() // Use provider.provider_type
  ) {
    case 'wger':
    case 'free-exercise-db': // Added free-exercise-db
      return ['exercise'];
    case 'fatsecret':
    case 'openfoodfacts':
    case 'mealie':
    case 'tandoor':
    case 'usda':
      return ['food'];
    case 'nutritionix':
      return ['food', 'exercise'];
    default:
      return ['other'];
  }
};

export const toggleProviderPublicSharing = async (
  id: string,
  sharedWithPublic: boolean
) => {
  return apiCall(`/external-providers/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ shared_with_public: sharedWithPublic }),
  });
};

export interface CreateExternalProviderPayload {
  user_id: string;
  provider_name: string;
  provider_type: string;
  app_id?: string | null;
  app_key?: string | null;
  is_active: boolean;
  base_url?: string | null;
  sync_frequency?: string | null;
}

export interface ExternalProviderResponse {
  id: string;
  provider_type: string;
  is_active: boolean;
}

export const createExternalProvider = async (
  payload: CreateExternalProviderPayload
): Promise<ExternalProviderResponse> => {
  return apiCall('/external-providers', {
    method: 'POST',
    body: JSON.stringify({
      user_id: payload.user_id,
      provider_name: payload.provider_name,
      provider_type: payload.provider_type,
      app_id: [
        'mealie',
        'tandoor',
        'free-exercise-db',
        'wger',
        'usda',
      ].includes(payload.provider_type)
        ? null
        : payload.app_id || null,
      app_key: payload.app_key || null,
      is_active: payload.is_active,
      base_url: ['mealie', 'tandoor', 'free-exercise-db'].includes(
        payload.provider_type
      )
        ? payload.base_url || null
        : null,
      sync_frequency: [
        'withings',
        'garmin',
        'fitbit',
        'strava',
        'polar',
      ].includes(payload.provider_type)
        ? payload.sync_frequency
        : null,
    }),
  });
};

export const handleConnectWithings = async () => {
  try {
    const response = await apiCall(`/withings/authorize`, {
      method: 'GET',
    });
    if (response && response.authUrl) {
      window.location.href = response.authUrl;
    } else {
      throw new Error('Failed to get Withings authorization URL.');
    }
  } catch (error: unknown) {
    console.error('Error connecting to Withings:', error);
    throw error;
  }
};

export const handleDisconnectWithings = async () => {
  if (
    !confirm(
      'Are you sure you want to disconnect from Withings? This will revoke access and delete all associated tokens.'
    )
  )
    return;

  try {
    await apiCall(`/withings/disconnect`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error disconnecting from Withings:', error);
    throw error;
  }
};

export const handleManualSync = async () => {
  try {
    await apiCall(`/withings/sync`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error initiating manual sync:', error);
    throw error;
  }
};

export const handleDisconnectGarmin = async () => {
  if (
    !confirm(
      'Are you sure you want to disconnect from Garmin? This will revoke access and delete all associated tokens.'
    )
  )
    return;

  try {
    // Call the Garmin unlink endpoint
    await apiCall(`/integrations/garmin/unlink`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error disconnecting from Garmin:', error);
    throw error;
  }
};

export const handleManualSyncGarmin = async () => {
  try {
    // Call the simplified sync endpoint. Backend handles date ranges (7 days for manual).
    await apiCall(`/integrations/garmin/sync`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error initiating manual Garmin sync:', error);
    throw error;
  }
};

export const handleConnectFitbit = async () => {
  try {
    const response = await apiCall(`/integrations/fitbit/authorize`, {
      method: 'GET',
    });
    if (response && response.authUrl) {
      window.location.href = response.authUrl;
    } else {
      throw new Error('Failed to get Fitbit authorization URL.');
    }
  } catch (error: unknown) {
    console.error('Error connecting to Fitbit:', error);
    throw error;
  }
};

export const handleDisconnectFitbit = async () => {
  if (
    !confirm(
      'Are you sure you want to disconnect from Fitbit? This will revoke access and delete all associated tokens.'
    )
  )
    return;

  try {
    await apiCall(`/integrations/fitbit/disconnect`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error disconnecting from Fitbit:', error);
    throw error;
  }
};

export const handleManualSyncFitbit = async () => {
  try {
    await apiCall(`/integrations/fitbit/sync`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error initiating manual Fitbit sync:', error);
    throw error;
  }
};

export const handleConnectPolar = async (providerId: string) => {
  try {
    const response = await apiCall(`/integrations/polar/authorize`, {
      method: 'GET',
      params: { providerId },
    });
    if (response && response.authUrl) {
      window.location.href = response.authUrl;
    } else {
      throw new Error('Failed to get Polar authorization URL.');
    }
  } catch (error: unknown) {
    console.error('Error connecting to Polar:', error);
    throw error;
  }
};

export const handleDisconnectPolar = async (providerId: string) => {
  if (
    !confirm(
      'Are you sure you want to disconnect from Polar? This will revoke access and delete all associated tokens.'
    )
  )
    return;

  try {
    await apiCall(`/integrations/polar/disconnect`, {
      method: 'POST',
      body: JSON.stringify({ providerId }),
    });
  } catch (error: unknown) {
    console.error('Error disconnecting from Polar:', error);
    throw error;
  }
};

export const handleManualSyncPolar = async (providerId: string) => {
  try {
    await apiCall(`/integrations/polar/sync`, {
      method: 'POST',
      body: JSON.stringify({ providerId }),
    });
  } catch (error: unknown) {
    console.error('Error initiating manual Polar sync:', error);
    throw error;
  }
};

export const handleConnectStrava = async () => {
  try {
    const response = await apiCall(`/integrations/strava/authorize`, {
      method: 'GET',
    });
    if (response && response.url) {
      window.location.href = response.url;
    } else {
      throw new Error('Failed to get Strava authorization URL.');
    }
  } catch (error: unknown) {
    console.error('Error connecting to Strava:', error);
    throw error;
  }
};

export const handleDisconnectStrava = async () => {
  if (
    !confirm(
      'Are you sure you want to disconnect from Strava? This will revoke access.'
    )
  )
    return;

  try {
    await apiCall(`/integrations/strava/disconnect`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error disconnecting from Strava:', error);
    throw error;
  }
};

export const handleManualSyncStrava = async () => {
  try {
    await apiCall(`/integrations/strava/sync`, {
      method: 'POST',
    });
  } catch (error: unknown) {
    console.error('Error initiating manual Strava sync:', error);
    throw error;
  }
};

export const fetchBaseProviders = async (): Promise<ExternalDataProvider[]> => {
  return apiCall('/external-providers', {
    method: 'GET',
    suppress404Toast: true,
  });
};

export interface GarminStatusResponse {
  isLinked: boolean;
  lastUpdated: string;
  tokenExpiresAt: string;
}

export const fetchGarminStatus = async (): Promise<GarminStatusResponse> => {
  return apiCall('/integrations/garmin/status');
};

export interface OAuthStatusResponse {
  lastSyncAt: string;
  tokenExpiresAt: string;
}

export const fetchWithingsStatus = async (
  providerId: string
): Promise<OAuthStatusResponse> => {
  return apiCall('/withings/status', {
    method: 'GET',
    params: { providerId },
  });
};

export const fetchFitbitStatus = async (): Promise<OAuthStatusResponse> => {
  return apiCall('/integrations/fitbit/status');
};

export const fetchPolarStatus = async (
  providerId: string
): Promise<OAuthStatusResponse> => {
  return apiCall('/integrations/polar/status', {
    method: 'GET',
    params: { providerId },
  });
};

export interface HevyStatusResponse {
  connected: boolean;
  lastSyncAt: string;
}

export const fetchHevyStatus = async (): Promise<HevyStatusResponse> => {
  return apiCall('/integrations/hevy/status');
};

export const fetchStravaStatus = async (): Promise<OAuthStatusResponse> => {
  return apiCall('/integrations/strava/status');
};

export const getEnrichedProviders = async (): Promise<
  ExternalDataProvider[]
> => {
  const baseProviders = await fetchBaseProviders();

  if (!baseProviders || baseProviders.length === 0) {
    return [];
  }

  const enrichedProviders = await Promise.all(
    baseProviders.map(async (provider: ExternalDataProvider) => {
      const enriched = { ...provider };

      try {
        switch (provider.provider_type) {
          case 'garmin': {
            const status = await fetchGarminStatus();
            enriched.garmin_connect_status = status.isLinked
              ? 'linked'
              : 'disconnected';
            enriched.garmin_last_status_check = status.lastUpdated;
            enriched.garmin_token_expires = status.tokenExpiresAt;
            break;
          }
          case 'withings': {
            if (provider.has_token) {
              const status = await fetchWithingsStatus(provider.id);
              enriched.withings_last_sync_at = status.lastSyncAt;
              enriched.withings_token_expires = status.tokenExpiresAt;
            }
            break;
          }
          case 'fitbit': {
            if (provider.has_token) {
              const status = await fetchFitbitStatus();
              enriched.fitbit_last_sync_at = status.lastSyncAt;
              enriched.fitbit_token_expires = status.tokenExpiresAt;
            }
            break;
          }
          case 'polar': {
            if (provider.has_token) {
              const status = await fetchPolarStatus(provider.id);
              enriched.polar_last_sync_at = status.lastSyncAt;
              enriched.polar_token_expires = status.tokenExpiresAt;
            }
            break;
          }
          case 'hevy': {
            const status = await fetchHevyStatus();
            enriched.hevy_connect_status = status.connected
              ? 'connected'
              : 'disconnected';
            enriched.hevy_last_sync_at = status.lastSyncAt;
            break;
          }
          case 'strava': {
            if (provider.has_token) {
              const status = await fetchStravaStatus();
              enriched.strava_last_sync_at = status.lastSyncAt;
              enriched.strava_token_expires = status.tokenExpiresAt;
            }
            break;
          }
        }
      } catch (error) {
        console.error(error);
        if (provider.provider_type === 'garmin') {
          enriched.garmin_connect_status = 'disconnected';
        }
        if (provider.provider_type === 'hevy') {
          enriched.hevy_connect_status = 'disconnected';
        }
      }

      return enriched;
    })
  );

  return enrichedProviders;
};

export const updateExternalProvider = async (
  providerId: string,
  providerData: Partial<ExternalDataProvider>
): Promise<ExternalDataProvider> => {
  return apiCall(`/external-providers/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify(providerData),
  });
};

export const toggleProviderActiveStatus = async (
  providerId: string,
  isActive: boolean
): Promise<ExternalDataProvider> => {
  return apiCall(`/external-providers/${providerId}`, {
    method: 'PUT',
    body: JSON.stringify({ is_active: isActive }),
  });
};

export const deleteExternalProvider = async (
  providerId: string
): Promise<void> => {
  return apiCall(`/external-providers/${providerId}`, {
    method: 'DELETE',
  });
};

export interface GarminMfaPayload {
  client_state: string | null;
  mfa_code: string;
}

export interface GarminMfaResponse {
  status: string;
  message?: string;
}

export const resumeGarminLogin = async (
  payload: GarminMfaPayload
): Promise<GarminMfaResponse> => {
  const result = await apiCall('/integrations/garmin/resume_login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (result.status !== 'success') {
    throw new Error(
      result.message || 'Failed to submit MFA code. Please try again.'
    );
  }

  return result;
};
