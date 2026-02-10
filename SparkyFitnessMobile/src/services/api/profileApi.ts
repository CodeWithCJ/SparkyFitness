import { apiFetch } from './apiClient';
import { UserProfile } from '../../types/profile';

/**
 * Fetches the user's profile.
 */
export const fetchProfile = async (): Promise<UserProfile> => {
  return apiFetch<UserProfile>({
    endpoint: '/api/auth/profiles',
    serviceName: 'Profile API',
    operation: 'fetch profile',
  });
};
