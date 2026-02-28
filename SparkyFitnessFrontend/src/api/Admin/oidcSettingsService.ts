import { apiCall } from '@/api/api';
import { OidcProvider, CreateOidcProvider } from '@/types/admin';

const oidcSettingsService = {
  getProviders: async (): Promise<OidcProvider[]> => {
    return await apiCall('/admin/oidc-settings');
  },

  getProvider: async (id: number): Promise<OidcProvider> => {
    return await apiCall(`/admin/oidc-settings/${id}`);
  },

  createProvider: async (
    provider: OidcProvider
  ): Promise<CreateOidcProvider> => {
    return await apiCall('/admin/oidc-settings', {
      method: 'POST',
      body: provider,
    });
  },

  updateProvider: async (
    id: string,
    provider: OidcProvider
  ): Promise<OidcProvider> => {
    return await apiCall(`/admin/oidc-settings/${id}`, {
      method: 'PUT',
      body: provider,
    });
  },

  deleteProvider: async (id: string): Promise<void> => {
    await apiCall(`/admin/oidc-settings/${id}`, {
      method: 'DELETE',
    });
  },

  uploadLogo: async (id: string, logo: File): Promise<{ logoUrl: string }> => {
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
