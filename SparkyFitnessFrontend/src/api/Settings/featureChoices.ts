import type {
  FeatureChoicesResponse,
  UpdateFeatureChoicesBody,
} from '@workspace/shared';
import { apiCall } from '@/api/api';

const FEATURES_PATH = '/user-preferences/features';

/** The person's explicit feature choices, per platform (#3487). Its failure
 * is shown in place (Settings → Features offers Retry), so no toast. */
export const getFeatureChoices = (): Promise<FeatureChoicesResponse> =>
  apiCall(FEATURES_PATH, { method: 'GET', suppressErrorToast: true });

/** Merges a change into the person's choices; answers all of them. */
export const updateFeatureChoices = (
  body: UpdateFeatureChoicesBody
): Promise<FeatureChoicesResponse> =>
  apiCall(FEATURES_PATH, { method: 'PATCH', body });
