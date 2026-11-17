import { apiFetch } from './apiClient';
import { UserProfile } from '../../types/profile';

/**
 * Fetches the user's profile.
 */
export const fetchProfile = async (): Promise<UserProfile> => {
  return apiFetch<UserProfile>({
    endpoint: '/api/identity/profiles',
    serviceName: 'Profile API',
    operation: 'fetch profile',
  });
};

/**
 * Sets the goal weight (kilograms), or clears it with null.
 */
export const saveTargetWeight = async (
  targetWeightKg: number | null
): Promise<{ targetWeight: number | null }> => {
  return apiFetch<{ targetWeight: number | null }>({
    endpoint: '/api/onboarding/target-weight',
    serviceName: 'Profile API',
    operation: 'save goal weight',
    method: 'PUT',
    body: { targetWeight: targetWeightKg },
  });
};
