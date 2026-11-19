import { apiFetch } from './apiClient';
import { getCacheRow, putCacheRows } from '../../offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../offline/collections';
import { withOfflineFallback } from '../../offline/withOfflineFallback';
import { UserProfile } from '../../types/profile';

/**
 * Fetches the user's profile.
 */
export const fetchProfile = async (): Promise<UserProfile> =>
  withOfflineFallback<UserProfile>({
    fetch: () =>
      apiFetch<UserProfile>({
        endpoint: '/api/identity/profiles',
        serviceName: 'Profile API',
        operation: 'fetch profile',
      }),
    store: (db, serverConfigId, profile) =>
      putCacheRows(db, serverConfigId, CACHE_COLLECTIONS.profile, [
        { key: SINGLE_DOCUMENT_KEY, payload: profile },
      ]),
    read: async (db, serverConfigId) => {
      const row = await getCacheRow(
        db,
        serverConfigId,
        CACHE_COLLECTIONS.profile,
        SINGLE_DOCUMENT_KEY
      );
      return row ? (row.payload as UserProfile) : null;
    },
  });

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
