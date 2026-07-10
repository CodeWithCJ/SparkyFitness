import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  beginHuaweiHealthAuthorization,
  completeHuaweiHealthAuthorization,
  disconnectHuaweiHealth,
  getHuaweiHealthStatus,
  syncHuaweiHealth,
} from '@/api/Integrations/huaweiHealth';
import { huaweiHealthKeys } from '@/api/keys/integrations';
import { externalProviderKeys } from '@/api/keys/settings';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';
import { HttpApiError } from '@/api/api';

function translateHuaweiHealthError(
  t: TFunction,
  error: unknown,
  fallbackKey: string,
  fallback: string
): string {
  const code = error instanceof HttpApiError ? error.code : undefined;
  switch (code) {
    case 'HUAWEI_PRIVACY_DISABLED':
      return t(
        'huaweiHealth.errors.privacyDisabled',
        'Health data sharing is disabled in Huawei privacy settings. Enable it there, then try again.'
      );
    case 'HUAWEI_HEALTH_APP_REQUIRED':
      return t(
        'huaweiHealth.errors.appRequired',
        'Install HUAWEI Health and finish setting up your account on your phone before syncing.'
      );
    case 'HUAWEI_NOT_CONNECTED':
    case 'HUAWEI_TOKEN_REFRESH_FAILED':
      return t(
        'huaweiHealth.errors.reconnect',
        'The connection has expired. Link your Huawei account again to continue.'
      );
    case 'HUAWEI_OWNER_ONLY':
      return t(
        'huaweiHealth.ownerOnlyDescription',
        'To protect private health data, HUAWEI Health cannot be linked or synced while you are viewing another family profile. Switch back to your own profile to continue.'
      );
    case 'HUAWEI_NOT_CONFIGURED':
      return t(
        'huaweiHealth.notConfiguredDescription',
        'A server administrator must configure the Huawei app credentials and approved Health Service scopes before users can connect.'
      );
    default:
      return t(fallbackKey, fallback);
  }
}

export const useHuaweiHealthStatus = (enabled = true) =>
  useQuery({
    queryKey: huaweiHealthKeys.status(),
    queryFn: getHuaweiHealthStatus,
    enabled,
    staleTime: 30_000,
  });

export const useConnectHuaweiHealthMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: beginHuaweiHealthAuthorization,
    meta: {
      errorMessage: (error: unknown) =>
        translateHuaweiHealthError(
          t,
          error,
          'huaweiHealth.errors.connect',
          'Could not start the connection with Huawei.'
        ),
    },
  });
};

export const useCompleteHuaweiHealthAuthorizationMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: completeHuaweiHealthAuthorization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: huaweiHealthKeys.all });
      queryClient.invalidateQueries({ queryKey: externalProviderKeys.all });
    },
  });
};

export const useSyncHuaweiHealthMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const invalidateDiary = useDiaryInvalidation();
  return useMutation({
    mutationFn: syncHuaweiHealth,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: huaweiHealthKeys.all });
      queryClient.invalidateQueries({ queryKey: externalProviderKeys.all });
      invalidateDiary();
    },
    meta: {
      errorMessage: (error: unknown) =>
        translateHuaweiHealthError(
          t,
          error,
          'huaweiHealth.errors.sync',
          'The sync could not be completed. Please try again.'
        ),
    },
  });
};

export const useDisconnectHuaweiHealthMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectHuaweiHealth,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: huaweiHealthKeys.all });
      queryClient.invalidateQueries({ queryKey: externalProviderKeys.all });
    },
    meta: {
      successMessage: t(
        'huaweiHealth.disconnectSuccess',
        'Authorization was cancelled and access tokens were removed from this server.'
      ),
      errorMessage: (error: unknown) =>
        translateHuaweiHealthError(
          t,
          error,
          'huaweiHealth.errors.disconnect',
          'Huawei authorization could not be cancelled. The local connection was left intact so the app does not show a misleading result.'
        ),
    },
  });
};
