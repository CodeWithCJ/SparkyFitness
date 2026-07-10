import { apiCall } from '@/api/api';
import { HUAWEI_HEALTH_DATA_SCOPES } from '@/constants/integrationConstants';

const HUAWEI_INTEGRATION_PATH = '/integrations/huaweihealth';
const HUAWEI_OAUTH_ORIGIN = 'https://oauth-login.cloud.huawei.com';
const HUAWEI_OAUTH_PATH = '/oauth2/v3/authorize';

export { HUAWEI_HEALTH_DATA_SCOPES };

export interface HuaweiHealthStatus {
  available: boolean;
  connected: boolean;
  isActive: boolean;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  grantedScopes: string[];
  reason?: 'HUAWEI_NOT_CONFIGURED';
}

export interface HuaweiHealthAuthorization {
  authUrl: string;
}

export interface HuaweiHealthCallbackPayload {
  code: string;
  state: string;
}

export interface HuaweiHealthSyncPayload {
  startDate?: string;
  endDate?: string;
}

export interface HuaweiHealthSyncResult {
  status: 'completed';
  startDate: string;
  endDate: string;
  processed: number;
  errors: number;
  skipped: number;
  missingScopes: string[];
  completedAt: string;
}

export function isTrustedHuaweiAuthorizationUrl(authUrl: string): boolean {
  try {
    const url = new URL(authUrl);
    return (
      url.origin === HUAWEI_OAUTH_ORIGIN && url.pathname === HUAWEI_OAUTH_PATH
    );
  } catch {
    return false;
  }
}

export async function getHuaweiHealthStatus(): Promise<HuaweiHealthStatus> {
  return apiCall(`${HUAWEI_INTEGRATION_PATH}/status`, {
    method: 'GET',
    suppressErrorToast: true,
  });
}

export async function beginHuaweiHealthAuthorization(): Promise<HuaweiHealthAuthorization> {
  const result = await apiCall(`${HUAWEI_INTEGRATION_PATH}/authorize`, {
    method: 'GET',
    suppressErrorToast: true,
    sensitive: true,
  });
  if (
    !result ||
    typeof result.authUrl !== 'string' ||
    !isTrustedHuaweiAuthorizationUrl(result.authUrl)
  ) {
    throw new Error('Huawei returned an untrusted authorization URL.');
  }
  return { authUrl: result.authUrl };
}

export async function completeHuaweiHealthAuthorization(
  payload: HuaweiHealthCallbackPayload
): Promise<{ connected: true }> {
  return apiCall(`${HUAWEI_INTEGRATION_PATH}/callback`, {
    method: 'POST',
    body: payload,
    suppressErrorToast: true,
    sensitive: true,
  });
}

export async function syncHuaweiHealth(
  payload: HuaweiHealthSyncPayload = {}
): Promise<HuaweiHealthSyncResult> {
  return apiCall(`${HUAWEI_INTEGRATION_PATH}/sync`, {
    method: 'POST',
    body: payload,
    suppressErrorToast: true,
  });
}

export async function disconnectHuaweiHealth(): Promise<{
  connected: false;
  remoteAuthorizationCancelled: boolean;
}> {
  return apiCall(`${HUAWEI_INTEGRATION_PATH}/disconnect`, {
    method: 'POST',
    suppressErrorToast: true,
  });
}
