import {
  linkFitbitAccount,
  linkOuraAccount,
  linkGoogleHealthAccount,
  linkPolarFlowAccount,
  linkCorosAccount,
  linkWithingsAccount,
  linkStravaAccount,
  syncHevyData,
  syncLiftosaurData,
  LiftosaurSyncResult,
  loginGarmin,
  GarminLoginPayload,
} from '@/api/Integrations/integrations';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';

import {
  handleConnectWithings,
  handleDisconnectWithings,
  handleManualSync,
  handleDisconnectGarmin,
  handleManualSyncGarmin,
  handleConnectFitbit,
  handleDisconnectFitbit,
  handleManualSyncFitbit,
  handleConnectOura,
  handleDisconnectOura,
  handleManualSyncOura,
  handleConnectPolar,
  handleDisconnectPolar,
  handleManualSyncPolar,
  handleConnectCoros,
  handleDisconnectCoros,
  handleManualSyncCoros,
  handleConnectGoogleHealth,
  handleDisconnectGoogleHealth,
  handleManualSyncGoogleHealth,
  handleConnectStrava,
  handleDisconnectStrava,
  handleManualSyncStrava,
  handleDisconnectLiftosaur,
  fetchGarminStatus,
  GarminMfaPayload,
  resumeGarminLogin,
} from '@/api/Settings/externalProviderService';
import { garminKeys } from '@/api/keys/integrations';
import { externalProviderKeys } from '@/api/keys/settings';
import { useDiaryInvalidation } from '@/hooks/useInvalidateKeys';
import i18n from 'i18next';
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

export const useLinkOuraMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkOuraAccount,
    onSuccess: invalidate,
    meta: {
      errorMessage: t(
        'integrations.ouraLinkError',
        'Failed to link Oura account.'
      ),
      successMessage: t(
        'integrations.ouraLinkSuccess',
        'Oura account successfully linked!'
      ),
    },
  });
};

export const useLinkGoogleHealthMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();

  return useMutation({
    mutationFn: linkGoogleHealthAccount,
    onSuccess: invalidate,
    meta: {
      errorMessage: t(
        'integrations.googleHealthLinkError',
        'Failed to link Google Health account.'
      ),
      successMessage: t(
        'integrations.googleHealthLinkSuccess',
        'Google Health account successfully linked!'
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

export const useCorosMutation = () => {
  const { t } = useTranslation();
  const invalidate = useDiaryInvalidation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: linkCorosAccount,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
    meta: {
      successMessage: t(
        'integrations.corosLinkSuccess',
        'Your COROS account has been successfully linked.'
      ),
      errorMessage: t(
        'integrations.corosLinkError',
        'Failed to link COROS account. Please try again.'
      ),
    },
  });
};

interface SyncHevyVariables {
  saveMockData?: boolean;
  dataSource?: string;
  fullSync?: boolean;
  providerId?: string;
  startDate?: string;
  endDate?: string;
}

export const useSyncHevyMutation = () => {
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      fullSync = false,
      providerId,
      startDate,
      endDate,
      ...mock
    }: SyncHevyVariables) =>
      syncHevyData(fullSync, providerId, startDate, endDate, mock),
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

interface SyncLiftosaurVariables {
  fullSync?: boolean;
  providerId?: string;
  startDate?: string;
  endDate?: string;
}

export const useSyncLiftosaurMutation = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const invalidateDiary = useDiaryInvalidation();

  return useMutation({
    mutationFn: ({
      fullSync = false,
      providerId,
      startDate,
      endDate,
    }: SyncLiftosaurVariables) =>
      syncLiftosaurData(fullSync, providerId, startDate, endDate),
    onSuccess: (data: LiftosaurSyncResult) => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
      invalidateDiary();

      const workoutsImp = data?.workoutsImported ?? data?.processedCount ?? 0;
      const measImp = data?.measurementsImported ?? 0;

      toast({
        title: t(
          'integrations.liftosaurSyncSuccessTitle',
          'Liftosaur synced successfully'
        ),
        description: t(
          'integrations.liftosaurSyncDetails',
          'Synced: {{workoutsImported}} workouts, {{measurementsImported}} measurements imported.',
          {
            workoutsImported: workoutsImp,
            measurementsImported: measImp,
          }
        ),
      });
    },
    meta: {
      errorMessage: t(
        'integrations.liftosaurSyncError',
        'Liftosaur sync failed. Please check your API key in settings.'
      ),
    },
  });
};

export const useDisconnectLiftosaurMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (providerId?: string) => handleDisconnectLiftosaur(providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
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

interface SyncVariables {
  startDate?: string;
  endDate?: string;
  // Troubleshooting options, only present when an admin enabled them.
  saveMockData?: boolean;
  dataSource?: string;
}

export const useManualSyncWithingsMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: ({ startDate, endDate, ...mock }: SyncVariables) =>
      handleManualSync(startDate, endDate, mock),
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
    mutationFn: ({ startDate, endDate, ...mock }: SyncVariables) =>
      handleManualSyncGarmin(startDate, endDate, mock),
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
    mutationFn: ({ startDate, endDate, ...mock }: SyncVariables) =>
      handleManualSyncFitbit(startDate, endDate, mock),
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};

export const useConnectOuraMutation = () => {
  return useMutation({
    mutationFn: handleConnectOura,
  });
};

export const useDisconnectOuraMutation = () => {
  return useMutation({
    mutationFn: handleDisconnectOura,
  });
};

export const useManualSyncOuraMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: ({ startDate, endDate, ...mock }: SyncVariables) =>
      handleManualSyncOura(startDate, endDate, mock),
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

interface SyncPolarVariables extends SyncVariables {
  providerId: string;
}

export const useManualSyncPolarMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: ({
      providerId,
      startDate,
      endDate,
      ...mock
    }: SyncPolarVariables) =>
      handleManualSyncPolar(providerId, startDate, endDate, mock),
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};

export const useConnectCorosMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId?: string) => handleConnectCoros(providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
  });
};

export const useDisconnectCorosMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId?: string) => handleDisconnectCoros(providerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: externalProviderKeys.lists(),
      });
    },
  });
};

interface SyncCorosVariables extends SyncVariables {
  providerId?: string;
}

export const useManualSyncCorosMutation = () => {
  const invalidateSyncData = useDiaryInvalidation();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: ({
      providerId,
      startDate,
      endDate,
      ...mock
    }: SyncCorosVariables) =>
      handleManualSyncCoros({ providerId, startDate, endDate, mock }),
    onSuccess: (data) => {
      invalidateSyncData();
      if (data) {
        const parts: string[] = [];
        if (data.imported > 0)
          parts.push(
            t('integrations.syncImported', 'Imported {{count}}', {
              count: data.imported,
            })
          );
        if (data.updated > 0)
          parts.push(
            t('integrations.syncUpdated', 'Updated {{count}}', {
              count: data.updated,
            })
          );
        if (data.skippedExisting > 0)
          parts.push(
            t('integrations.syncSkipped', 'Skipped {{count}} existing', {
              count: data.skippedExisting,
            })
          );
        if (data.deferred > 0)
          parts.push(
            t('integrations.syncDeferred', 'Deferred {{count}}', {
              count: data.deferred,
            })
          );
        if (data.summaryOnly > 0)
          parts.push(
            t('integrations.syncSummaryOnly', 'Summary only: {{count}}', {
              count: data.summaryOnly,
            })
          );
        const summary =
          parts.length > 0
            ? parts.join(', ')
            : t('integrations.corosNoNew', 'No new activities found.');
        toast({
          title: t('integrations.corosSyncSuccess', 'COROS Sync Completed'),
          description: summary,
        });
        if (data.warnings && data.warnings.length > 0) {
          toast({
            title: t('warning', 'Warning'),
            description: data.warnings.join('\n'),
            variant: 'destructive',
          });
        }
      }
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
    mutationFn: ({ startDate, endDate, ...mock }: SyncVariables) =>
      handleManualSyncStrava(startDate, endDate, mock),
    onSuccess: () => {
      invalidateSyncData();
    },
  });
};

export const useConnectGoogleHealthMutation = () => {
  return useMutation({
    mutationFn: handleConnectGoogleHealth,
  });
};

export const useDisconnectGoogleHealthMutation = () => {
  return useMutation({
    mutationFn: handleDisconnectGoogleHealth,
  });
};

export const useManualSyncGoogleHealthMutation = () => {
  const { t } = useTranslation();
  const invalidateSyncData = useDiaryInvalidation();

  return useMutation({
    mutationFn: ({ startDate, endDate, ...mock }: SyncVariables) =>
      handleManualSyncGoogleHealth(startDate, endDate, mock),
    onSuccess: () => {
      invalidateSyncData();
    },
    meta: {
      errorMessage: t(
        'integrations.googleHealthSyncError',
        'Google Health sync did not finish.'
      ),
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
      successMessage: i18n.t(
        'hooks.useIntegrations.garminConnectLinkedSuccessfully',
        'Garmin Connect linked successfully!'
      ),
      errorMessage: i18n.t(
        'hooks.useIntegrations.failedToSubmitMFACode',
        'Failed to submit MFA code. Please try again.'
      ),
    },
  });
};
