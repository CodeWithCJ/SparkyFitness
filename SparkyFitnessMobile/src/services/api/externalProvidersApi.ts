import { apiFetch } from './apiClient';
import { ExternalProvider } from '../../types/externalProviders';

/**
 * Fetches all external providers configured on the server.
 */
export const fetchExternalProviders = async (): Promise<ExternalProvider[]> => {
  return apiFetch<ExternalProvider[]>({
    endpoint: '/api/external-providers',
    serviceName: 'External Providers API',
    operation: 'fetch external providers',
  });
};
