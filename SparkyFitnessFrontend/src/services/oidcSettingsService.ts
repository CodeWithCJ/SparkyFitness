import { apiCall } from './api';

export interface OidcProvider {
  id?: number;
  issuer_url: string;
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
  scope: string;
  token_endpoint_auth_method: string;
  response_types: string[];
  is_active: boolean;
  display_name?: string;
  logo_url?: string;
  auto_register?: boolean;
  signing_algorithm?: string;
  profile_signing_algorithm?: string;
  timeout?: number;
}

const oidcSettingsService = {
  getProviders: async (): Promise<OidcProvider[]> => {
    return await apiCall('/admin/oidc-settings');
  },

  getProvider: async (id: number): Promise<OidcProvider> => {
    return await apiCall(`/admin/oidc-settings/${id}`);
  },

  createProvider: async (provider: OidcProvider): Promise<OidcProvider> => {
    return await apiCall('/admin/oidc-settings', {
      method: 'POST',
      body: provider,
    });
  },

  updateProvider: async (id: number, provider: OidcProvider): Promise<OidcProvider> => {
    return await apiCall(`/admin/oidc-settings/${id}`, {
      method: 'PUT',
      body: provider,
    });
  },

  deleteProvider: async (id: number): Promise<void> => {
    await apiCall(`/admin/oidc-settings/${id}`, {
      method: 'DELETE',
    });
  },

  uploadLogo: async (id: number, logo: File): Promise<{ logoUrl: string }> => {
    const formData = new FormData();
    formData.append('logo', logo);
    return await apiCall(`/admin/oidc-settings/${id}/logo`, {
      method: 'POST',
      body: formData,
      isFormData: true,
    });
  },
};

export { oidcSettingsService };