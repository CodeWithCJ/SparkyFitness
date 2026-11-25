import type {
  FeatureChoicesResponse,
  UpdateFeatureChoicesBody,
} from '@workspace/shared';
import type { ServerConfig } from '../storage';
import { apiFetch } from './apiClient';
import { ApiError } from './errors';

const FEATURES_ENDPOINT = '/api/user-preferences/features';

/** The person's explicit feature choices (#3487), both platforms, from the
 * active server. Null when the server is older than Features: it answers 404
 * and stores nothing, so every feature is at its default. Any other failure
 * throws. The app's query and the background task both read them here. */
export const fetchFeatureChoices =
  async (): Promise<FeatureChoicesResponse | null> => {
    try {
      return await apiFetch<FeatureChoicesResponse>({
        endpoint: FEATURES_ENDPOINT,
        serviceName: 'Feature choices API',
        operation: 'get feature choices',
      });
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) return null;
      throw error;
    }
  };

/** Changes only the keys sent: true or false sets a choice, null resets it.
 * Sent to `serverConfig`, the account the change was made for, whichever is
 * active by the time it goes out. */
export const updateFeatureChoices = (
  body: UpdateFeatureChoicesBody,
  serverConfig: ServerConfig
): Promise<FeatureChoicesResponse> =>
  apiFetch<FeatureChoicesResponse>({
    endpoint: FEATURES_ENDPOINT,
    serviceName: 'Feature choices API',
    operation: 'update feature choices',
    method: 'PATCH',
    body,
    serverConfig,
  });
