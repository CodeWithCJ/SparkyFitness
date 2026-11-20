import type {
  FeatureChoicesResponse,
  UpdateFeatureChoicesBody,
} from '@workspace/shared';
import { apiCall, HttpApiError } from '@/api/api';

const FEATURES_PATH = '/user-preferences/features';

/**
 * The person's explicit feature choices, per platform (#3487), or null from a
 * server older than the route (it answers 404 and stores none). A failure is
 * shown in place (Settings → Features offers Retry), so no toast.
 */
export const getFeatureChoices =
  async (): Promise<FeatureChoicesResponse | null> => {
    try {
      return await apiCall(FEATURES_PATH, {
        method: 'GET',
        suppressErrorToast: true,
      });
    } catch (error) {
      if (error instanceof HttpApiError && error.status === 404) return null;
      throw error;
    }
  };

/** Merges a change into the person's choices; answers all of them. */
export const updateFeatureChoices = (
  body: UpdateFeatureChoicesBody
): Promise<FeatureChoicesResponse> =>
  apiCall(FEATURES_PATH, { method: 'PATCH', body });
