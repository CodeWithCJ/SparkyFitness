import {
  linkFitbitAccount,
  linkPolarFlowAccount,
  linkWithingsAccount,
  linkStravaAccount,
  syncHevyData,
  loginGarmin,
  GarminLoginPayload,
} from '@/api/Integrations/integrations';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDiaryInvalidation } from '@/hooks/Diary/useDiaryInvalidation';

import {
  handleConnectWithings,
  handleDisconnectWithings,
  handleManualSync,
  handleDisconnectGarmin,
  handleManualSyncGarmin,
  handleConnectFitbit,
  handleDisconnectFitbit,
  handleManualSyncFitbit,
  handleConnectPolar,
  handleDisconnectPolar,
  handleManualSyncPolar,
  handleConnectStrava,
  handleDisconnectStrava,
  handleManualSyncStrava,
  fetchGarminStatus,
  GarminMfaPayload,
  resumeGarminLogin,
} from '@/api/Settings/externalProviderService';
import { garminKeys } from '@/api/keys/integrations';
import { externalProviderKeys } from '@/api/keys/settings';
export const useLinkFitbitMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkFitbitAccount,
    onSuccess: invalidate,
    meta: {
      errorMessage: t(
        'integrations.fitbitLinkError',
        'Failed to link Fitbit account.'
      ),
      successMessage: t(
        'integrations.fitbitLinkSuccess',
        'Fitbit account successfully linked!'
      ),
    },
  });
};

export const useLinkWithingsMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkWithingsAccount,
    onSuccess: invalidate,
    meta: {
      successMessage: t(
        'integrations.withingsSuccess',
        'Your Withings account has been successfully linked.'
      ),
      errorMessage: t(
        'integrations.withingsError',
        'Failed to link Withings account. Please try again.'
      ),
    },
  });
};

export const useLinkStravaMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkStravaAccount,
    onSuccess: invalidate,
    meta: {
      successMessage: t(
        'integrations.stravaSuccess',
        'Your Strava account has been successfully linked.'
      ),
      errorMessage: t(
        'integrations.stravaError',
        'Failed to link Strava account. Please try again.'
      ),
    },
  });
};

export const usePolarFlowMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkPolarFlowAccount,
    onSuccess: invalidate,
    meta: {
      successMessage: t(
        'integrations.polarSuccess',
        'Your Polar account has been successfully linked.'
      ),
      errorMessage: t(
        'integrations.polarError',
        'Failed to link Polar account. Please try again.'
      ),
    },
  });
};

interface SyncHevyVariables {
  fullSync?: boolean;
  providerId?: string;
}

export const useSyncHevyMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({ fullSync = false, providerId }: SyncHevyVariables) =>
      syncHevyData(fullSync, providerId),
    meta: {
      successMessage: t(
        'integrations.hevySyncSuccess',
        'Hevy data synced successfully.'
      ),
      errorMessage: t(
        'integrations.hevySyncError',
        'Hevy sync failed. Please check your API key in settings.'
      ),
    },
  });
};
export const useLoginGarminMutation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GarminLoginPayload) => loginGarmin(payload),
    onSuccess: () => {
      return queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      errorMessage: t(
        'integrations.garminLoginError',
        'Failed to connect to Garmin.'
      ),
      successMessage: t(
        'integrations.garminLoginSuccess',
        'Garmin connected successfully.'
      ),
    },
  });
};

export const useConnectWithingsMutation = () => {
  return useMutation({
    mutationFn: handleConnectWithings,
  });
};

export const useDisconnectWithingsMutation = () => {
  return useMutation({
    mutationFn: handleDisconnectWithings,
  });
};

export const useManualSyncWithingsMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: handleManualSync,
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};

export const useDisconnectGarminMutation = () => {
  return useMutation({
    mutationFn: handleDisconnectGarmin,
  });
};

export const useManualSyncGarminMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: handleManualSyncGarmin,
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};

export const useConnectFitbitMutation = () => {
  return useMutation({
    mutationFn: handleConnectFitbit,
  });
};

export const useDisconnectFitbitMutation = () => {
  return useMutation({
    mutationFn: handleDisconnectFitbit,
  });
};

export const useManualSyncFitbitMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: handleManualSyncFitbit,
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};

export const useConnectPolarMutation = () => {
  return useMutation({
    mutationFn: (providerId: string) => handleConnectPolar(providerId),
  });
};

export const useDisconnectPolarMutation = () => {
  return useMutation({
    mutationFn: handleDisconnectPolar,
  });
};

export const useManualSyncPolarMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: handleManualSyncPolar,
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};

export const useConnectStravaMutation = () => {
  return useMutation({
    mutationFn: handleConnectStrava,
  });
};

export const useDisconnectStravaMutation = () => {
  return useMutation({
    mutationFn: handleDisconnectStrava,
  });
};

export const useManualSyncStravaMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: handleManualSyncStrava,
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};
export interface GarminStatusResponse {
  isLinked: boolean;
  lastUpdated: string | null;
  tokenExpiresAt: string | null;
}

export const useGarminStatus = (userId?: string) => {
  return useQuery({
    queryKey: garminKeys.status,
    queryFn: fetchGarminStatus,
    enabled: !!userId,
  });
};

export const useResumeGarminLoginMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GarminMfaPayload) => resumeGarminLogin(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      successMessage: 'Garmin Connect linked successfully!',
      errorMessage: 'Failed to submit MFA code. Please try again.',
    },
  });
};
