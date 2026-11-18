import type {
  FeatureChoicesResponse,
  UpdateFeatureChoicesBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const FEATURES_ENDPOINT = '/api/user-preferences/features';

/** The person's explicit feature choices (#3487), both platforms. A server
 * older than the route answers 404. */
export const fetchFeatureChoices = (): Promise<FeatureChoicesResponse> =>
  apiFetch<FeatureChoicesResponse>({
    endpoint: FEATURES_ENDPOINT,
    serviceName: 'Feature choices API',
    operation: 'get feature choices',
  });

/** Changes only the keys sent: true or false sets a choice, null resets it. */
export const updateFeatureChoices = (
  body: UpdateFeatureChoicesBody
): Promise<FeatureChoicesResponse> =>
  apiFetch<FeatureChoicesResponse>({
    endpoint: FEATURES_ENDPOINT,
    serviceName: 'Feature choices API',
    operation: 'update feature choices',
    method: 'PATCH',
    body,
  });
