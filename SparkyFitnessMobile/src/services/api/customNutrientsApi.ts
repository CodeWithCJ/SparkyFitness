import { apiFetch } from './apiClient';

/** Mirrors the `user_custom_nutrients` table shape returned by GET /api/custom-nutrients. */
export interface UserCustomNutrient {
  id: string;
  name: string;
  unit: string;
}

/**
 * Fetches the current user's custom nutrient definitions.
 * GET /api/custom-nutrients
 */
export const fetchCustomNutrients = (): Promise<UserCustomNutrient[]> =>
  apiFetch<UserCustomNutrient[]>({
    endpoint: '/api/custom-nutrients',
    serviceName: 'Custom Nutrients API',
    operation: 'fetch custom nutrients',
  });
