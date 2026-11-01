import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Trash2,
  Edit,
  Lock,
  RefreshCw,
  Link2Off,
  Download,
  Loader2,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useCnfStatusQuery } from '@/hooks/Foods/useCanadianNutrientFile';
import { useLivsmedelsverketStatusQuery } from '@/hooks/Foods/useLivsmedelsverket';
import { decodeYazioAppId } from '@/utils/settings';
import { useExternalProviderTypesQuery } from '@/hooks/Settings/useExternalProviderSettings';
import SyncRangeDialog from './SyncRangeDialog';
import type { SyncMockOptions } from './SyncRangeDialog';
import { CnfBulkImportDialog } from './CnfBulkImportDialog';
import { LivsmedelsverketBulkImportDialog } from './LivsmedelsverketBulkImportDialog';
import { Trans } from 'react-i18next';

import {
  useConnectFitbitMutation,
  useConnectGoogleHealthMutation,
  useConnectOuraMutation,
  useConnectPolarMutation,
  useConnectStravaMutation,
  useConnectWithingsMutation,
  useDisconnectFitbitMutation,
  useDisconnectGarminMutation,
  useDisconnectGoogleHealthMutation,
  useDisconnectOuraMutation,
  useDisconnectPolarMutation,
  useDisconnectStravaMutation,
  useDisconnectWithingsMutation,
  useManualSyncWithingsMutation,
  useManualSyncFitbitMutation,
  useManualSyncGarminMutation,
  useManualSyncGoogleHealthMutation,
  useManualSyncOuraMutation,
  useManualSyncPolarMutation,
  useManualSyncStravaMutation,
  useSyncHevyMutation,
  useSyncLiftosaurMutation,
  useDisconnectLiftosaurMutation,
  useSyncIntervalsMutation,
  useDisconnectIntervalsMutation,
  useConnectCorosMutation,
  useDisconnectCorosMutation,
  useManualSyncCorosMutation,
} from '@/hooks/Integrations/useIntegrations';
import {
  useDeleteExternalProviderMutation,
  useToggleProviderStatusMutation,
  useUpdateGlobalProvider,
  useDeleteGlobalProvider,
} from '@/hooks/Settings/useExternalProviderSettings';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ExternalDataProvider } from './ExternalProviderSettings';

import { useTranslation } from 'react-i18next';
interface ProviderCardProps {
  provider: ExternalDataProvider;
  isLoading: boolean;
  startEditing: (provider: ExternalDataProvider) => void;
  isAdminMode?: boolean;
}

const PROVIDER_PORTALS: Record<string, { label: string; url: string }> = {
  strava: {
    label: 'Strava API Settings',
    url: 'https://www.strava.com/settings/api',
  },
  fitbit: {
    label: 'Fitbit Developer Portal',
    url: 'https://dev.fitbit.com/apps',
  },
  oura: {
    label: 'Oura Developer Portal',
    url: 'https://developer.ouraring.com/applications',
  },
  withings: {
    label: 'Withings Developer Dashboard',
    url: 'https://developer.withings.com/dashboard/',
  },
  polar: {
    label: 'Polar Flow Applications',
    url: 'https://flow.polar.com/settings/applications',
  },
  garmin: {
    label: 'Garmin Connect',
    url: 'https://connect.garmin.com/',
  },
  nutritionix: {
    label: 'Nutritionix Console',
    url: 'https://developer.nutritionix.com/',
  },
  fatsecret: {
    label: 'FatSecret Platform Dashboard',
    url: 'https://platform.fatsecret.com/my-account/dashboard',
  },
  usda: {
    label: 'USDA API Guide',
    url: 'https://fdc.nal.usda.gov/api-guide.html',
  },
  yazio: {
    label: 'Yazio API Docs',
    url: 'https://github.com/saganos/yazio_public_api',
  },
  openfoodfacts: {
    label: 'Open Food Facts Portal',
    url: 'https://world.openfoodfacts.org/',
  },
  coros_mcp: {
    label: 'COROS Training Hub',
    url: 'https://t.coros.com',
  },
  'canadian-nutrient-file': {
    label: 'Health Canada CNF Open Data Portal',
    url: 'https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109',
  },
  livsmedelsverket: {
    label: 'Swedish Food Agency (Livsmedelsverket) Open Data',
    url: 'https://www.livsmedelsverket.se/en/about-us/open-data/food-composition-data/',
  },
};

export const ProviderCard = ({
  provider,
  isLoading,
  startEditing,
  isAdminMode = false,
}: ProviderCardProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isCnfDialogOpen, setIsCnfDialogOpen] = useState(false);
  const isCnf = provider.provider_type === 'canadian-nutrient-file';
  const { data: cnfStatus } = useCnfStatusQuery({
    enabled: isCnf && isAdminMode,
  });
  const [isSlvDialogOpen, setIsSlvDialogOpen] = useState(false);
  const isSlv = provider.provider_type === 'livsmedelsverket';
  const { data: slvStatus } = useLivsmedelsverketStatusQuery({
    enabled: isSlv && isAdminMode,
  });
  const { data: providerTypes } = useExternalProviderTypesQuery();
  const yazioDisplay = decodeYazioAppId(provider.app_id);
  const {
    defaultFoodDataProviderId,
    setDefaultFoodDataProviderId,
    defaultBarcodeProviderId,
    setDefaultBarcodeProviderId,
    saveAllPreferences,
  } = usePreferences();

  const { mutate: handleConnectFitbit, isPending: isConnectFitbitPending } =
    useConnectFitbitMutation();
  const { mutate: handleConnectOura, isPending: isConnectOuraPending } =
    useConnectOuraMutation();
  const {
    mutate: handleConnectGoogleHealth,
    isPending: isConnectGoogleHealthPending,
  } = useConnectGoogleHealthMutation();
  const { mutate: handleConnectPolar, isPending: isConnectPolarPending } =
    useConnectPolarMutation();
  const { mutate: handleConnectStrava, isPending: isConnectStravaPending } =
    useConnectStravaMutation();
  const { mutate: handleConnectWithings, isPending: isConnectWithingsPending } =
    useConnectWithingsMutation();
  const { mutate: handleConnectCoros, isPending: isConnectCorosPending } =
    useConnectCorosMutation();

  const {
    mutate: handleDisconnectFitbit,
    isPending: isDisconnectFitbitPending,
  } = useDisconnectFitbitMutation();
  const { mutate: handleDisconnectOura, isPending: isDisconnectOuraPending } =
    useDisconnectOuraMutation();
  const {
    mutate: handleDisconnectGoogleHealth,
    isPending: isDisconnectGoogleHealthPending,
  } = useDisconnectGoogleHealthMutation();
  const {
    mutate: handleDisconnectGarmin,
    isPending: isDisconnectGarminPending,
  } = useDisconnectGarminMutation();
  const { mutate: handleDisconnectPolar, isPending: isDisconnectPolarPending } =
    useDisconnectPolarMutation();
  const {
    mutate: handleDisconnectStrava,
    isPending: isDisconnectStravaPending,
  } = useDisconnectStravaMutation();
  const {
    mutate: handleDisconnectWithings,
    isPending: isDisconnectWithingsPending,
  } = useDisconnectWithingsMutation();
  const { mutate: handleDisconnectCoros, isPending: isDisconnectCorosPending } =
    useDisconnectCorosMutation();

  const { mutate: handleManualSync, isPending: isSyncWithingsPending } =
    useManualSyncWithingsMutation();
  const { mutate: handleManualSyncFitbit, isPending: isSyncFitbitPending } =
    useManualSyncFitbitMutation();
  const { mutate: handleManualSyncOura, isPending: isSyncOuraPending } =
    useManualSyncOuraMutation();
  const { mutate: handleManualSyncGarmin, isPending: isSyncGarminPending } =
    useManualSyncGarminMutation();
  const { mutate: handleManualSyncPolar, isPending: isSyncPolarPending } =
    useManualSyncPolarMutation();
  const { mutate: handleManualSyncStrava, isPending: isSyncStravaPending } =
    useManualSyncStravaMutation();
  const {
    mutate: handleManualSyncGoogleHealth,
    isPending: isSyncGoogleHealthPending,
  } = useManualSyncGoogleHealthMutation();
  const { mutate: handleManualSyncCoros, isPending: isSyncCorosPending } =
    useManualSyncCorosMutation();
  const { mutate: syncHevyData, isPending: isSyncHevyPending } =
    useSyncHevyMutation();
  const { mutate: syncLiftosaurData, isPending: isSyncLiftosaurPending } =
    useSyncLiftosaurMutation();
  const {
    mutate: handleDisconnectLiftosaur,
    isPending: isDisconnectLiftosaurPending,
  } = useDisconnectLiftosaurMutation();
  const { mutate: syncIntervalsData, isPending: isSyncIntervalsPending } =
    useSyncIntervalsMutation();
  const {
    mutate: handleDisconnectIntervals,
    isPending: isDisconnectIntervalsPending,
  } = useDisconnectIntervalsMutation();

  const [isSyncDialogOpen, setIsSyncDialogOpen] = useState(false);

  const { mutateAsync: toggleProviderActiveStatus, isPending: statusPending } =
    useToggleProviderStatusMutation();
  const { mutateAsync: deleteExternalProvider, isPending: deletePending } =
    useDeleteExternalProviderMutation();
  const { mutateAsync: updateGlobalProvider, isPending: globalUpdatePending } =
    useUpdateGlobalProvider();
  const { mutateAsync: deleteGlobalProvider, isPending: globalDeletePending } =
    useDeleteGlobalProvider();

  const executeSync = (
    startDate: string,
    endDate: string,
    // Present only while an admin has enabled the mock-data options; the server
    // ignores them otherwise.
    mockOptions?: SyncMockOptions
  ) => {
    const mock = mockOptions ?? {};
    switch (provider.provider_type) {
      case 'withings':
        handleManualSync({ startDate, endDate, ...mock });
        break;
      case 'fitbit':
        handleManualSyncFitbit({ startDate, endDate, ...mock });
        break;
      case 'oura':
        handleManualSyncOura({ startDate, endDate, ...mock });
        break;
      case 'polar':
        handleManualSyncPolar({
          providerId: provider.id,
          startDate,
          endDate,
          ...mock,
        });
        break;
      case 'strava':
        handleManualSyncStrava({ startDate, endDate, ...mock });
        break;
      case 'garmin':
        handleManualSyncGarmin({ startDate, endDate, ...mock });
        break;
      case 'googlehealth':
        handleManualSyncGoogleHealth({ startDate, endDate, ...mock });
        break;
      case 'coros_mcp':
        handleManualSyncCoros({
          providerId: provider.id,
          startDate,
          endDate,
          ...mock,
        });
        break;
      case 'hevy':
        syncHevyData({
          fullSync: false,
          providerId: provider.id,
          startDate,
          endDate,
          ...mock,
        });
        break;
      case 'liftosaur':
        syncLiftosaurData({
          fullSync: false,
          providerId: provider.id,
          startDate,
          endDate,
        });
        break;
      case 'intervals':
        syncIntervalsData({
          providerId: provider.id,
          startDate,
          endDate,
          ...mock,
        });
        break;
    }
  };

  const loading =
    isLoading ||
    statusPending ||
    deletePending ||
    globalUpdatePending ||
    globalDeletePending ||
    isConnectFitbitPending ||
    isConnectOuraPending ||
    isConnectGoogleHealthPending ||
    isConnectPolarPending ||
    isConnectStravaPending ||
    isConnectWithingsPending ||
    isConnectCorosPending ||
    isDisconnectFitbitPending ||
    isDisconnectOuraPending ||
    isDisconnectGoogleHealthPending ||
    isDisconnectGarminPending ||
    isDisconnectPolarPending ||
    isDisconnectStravaPending ||
    isDisconnectWithingsPending ||
    isDisconnectCorosPending ||
    isSyncWithingsPending ||
    isSyncFitbitPending ||
    isSyncOuraPending ||
    isSyncGarminPending ||
    isSyncGoogleHealthPending ||
    isSyncPolarPending ||
    isSyncStravaPending ||
    isSyncCorosPending ||
    isSyncHevyPending ||
    isSyncLiftosaurPending ||
    isDisconnectLiftosaurPending ||
    isSyncIntervalsPending ||
    isDisconnectIntervalsPending;

  const handleToggleActive = async (providerId: string, isActive: boolean) => {
    try {
      if (isAdminMode) {
        await updateGlobalProvider({
          id: providerId,
          data: { is_active: isActive },
        });
      } else {
        const data = await toggleProviderActiveStatus({
          id: providerId,
          isActive,
        });
        if (
          data &&
          data.is_active &&
          (data.provider_type === 'openfoodfacts' ||
            data.provider_type === 'nutritionix' ||
            data.provider_type === 'fatsecret' ||
            data.provider_type === 'mealie' ||
            data.provider_type === 'tandoor' ||
            data.provider_type === 'norish' ||
            data.provider_type === 'usda' ||
            data.provider_type === 'yazio')
        ) {
          setDefaultFoodDataProviderId(data.id);
          saveAllPreferences({ defaultFoodDataProviderId: data.id });
        } else if (data && defaultFoodDataProviderId === data.id) {
          setDefaultFoodDataProviderId(null);
          saveAllPreferences({ defaultFoodDataProviderId: null });
        }
        if (data && !data.is_active && defaultBarcodeProviderId === data.id) {
          setDefaultBarcodeProviderId(null);
          saveAllPreferences({ defaultBarcodeProviderId: null });
        }
      }
    } catch (error: unknown) {
      // error handling is already managed by hooks/toast
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (
      window.confirm(
        isAdminMode
          ? 'Are you sure you want to delete this global provider? All users will lose access to it.'
          : 'Are you sure you want to delete this external data provider connection?'
      )
    ) {
      try {
        if (isAdminMode) {
          await deleteGlobalProvider(providerId);
        } else {
          await deleteExternalProvider(providerId);
          if (defaultFoodDataProviderId === providerId) {
            setDefaultFoodDataProviderId(null);
            saveAllPreferences({ defaultFoodDataProviderId: null });
          }
          if (defaultBarcodeProviderId === providerId) {
            setDefaultBarcodeProviderId(null);
            saveAllPreferences({ defaultBarcodeProviderId: null });
          }
        }
      } catch (error: unknown) {
        // error handling is managed by hooks/toast
      }
    }
  };

  const getProviderConfig = () => {
    // Basic hasToken check that is more robust
    const isLinked =
      provider.has_token ||
      provider.garmin_connect_status === 'linked' ||
      provider.garmin_connect_status === 'connected' ||
      provider.hevy_connect_status === 'connected' ||
      provider.liftosaur_connect_status === 'connected' ||
      provider.intervals_connect_status === 'connected';

    // Polar's is the only token expiry shown: the other OAuth providers refresh their
    // access tokens on their own, so their short expiry misleads users into reconnecting.
    switch (provider.provider_type) {
      case 'withings':
        return {
          connect: () => handleConnectWithings(),
          disconnect: () => handleDisconnectWithings(),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.withings_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'fitbit':
        return {
          connect: () => handleConnectFitbit(),
          disconnect: () => handleDisconnectFitbit(),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.fitbit_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'oura':
        return {
          connect: () => handleConnectOura(),
          disconnect: () => handleDisconnectOura(),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.oura_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'googlehealth':
        return {
          connect: () => handleConnectGoogleHealth(),
          disconnect: () => handleDisconnectGoogleHealth(),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.googlehealth_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'polar':
        return {
          connect: () => handleConnectPolar(provider.id),
          disconnect: () => handleDisconnectPolar(provider.id),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.polar_last_sync_at,
          tokenExpires: provider.polar_token_expires,
          hasToken: isLinked && provider.is_active,
        };
      case 'strava':
        return {
          connect: () => handleConnectStrava(),
          disconnect: () => handleDisconnectStrava(),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.strava_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'coros_mcp':
        return {
          connect: () => handleConnectCoros(provider.id),
          disconnect: () => handleDisconnectCoros(provider.id),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.coros_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'garmin':
        return {
          connect: null,
          disconnect: () => handleDisconnectGarmin(),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.garmin_last_status_check,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'hevy':
        return {
          connect: null,
          disconnect: null,
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.hevy_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'liftosaur':
        return {
          connect: null,
          disconnect: () => handleDisconnectLiftosaur(provider.id),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.liftosaur_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      case 'intervals':
        return {
          connect: null,
          disconnect: () => handleDisconnectIntervals(provider.id),
          sync: () => setIsSyncDialogOpen(true),
          lastSync: provider.intervals_last_sync_at,
          tokenExpires: null,
          hasToken: isLinked && provider.is_active,
        };
      default:
        return null;
    }
  };

  const config = getProviderConfig();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="font-medium">{provider.provider_name}</h4>
          {provider.is_public && (
            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">
              {t('settings.providerCard.global', 'Global')}
            </span>
          )}
          {!provider.is_public &&
            (provider.visibility === 'private' ||
              provider.user_id === user?.id) && (
              <span title={t('settings.providerCard.private', 'Private')}>
                <Lock className="h-3 w-3 text-muted-foreground" />
              </span>
            )}
        </div>
        <div className="flex items-center gap-2">
          {isAdminMode && isCnf && (
            <Button
              variant={cnfStatus?.isRunning ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIsCnfDialogOpen(true)}
              disabled={loading}
              title={t(
                'settings.providerCard.bulkImportReSync',
                'Bulk Import / Re-Sync'
              )}
              className="flex items-center gap-1.5"
            >
              {cnfStatus?.isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>
                    {t(
                      'settings.providerCard.importing',
                      'Importing ({{progress}}%)...',
                      { progress: cnfStatus.progress }
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>
                    {t(
                      'settings.providerCard.bulkImportSync',
                      'Bulk Import / Sync'
                    )}
                  </span>
                </>
              )}
            </Button>
          )}

          {isAdminMode && isSlv && (
            <Button
              variant={slvStatus?.isRunning ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setIsSlvDialogOpen(true)}
              disabled={loading}
              title={t(
                'settings.providerCard.bulkImportReSync',
                'Bulk Import / Re-Sync'
              )}
              className="flex items-center gap-1.5"
            >
              {slvStatus?.isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>
                    {t(
                      'settings.providerCard.importing',
                      'Importing ({{progress}}%)...',
                      { progress: slvStatus.progress }
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  <span>
                    {t(
                      'settings.providerCard.bulkImportSync',
                      'Bulk Import / Sync'
                    )}
                  </span>
                </>
              )}
            </Button>
          )}

          {config?.hasToken ? (
            <Button
              variant="outline"
              size="sm"
              onClick={config.sync}
              disabled={loading}
              title={t('settings.providerCard.manualSync', 'Manual Sync')}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          ) : config?.connect ? (
            <Button
              variant="outline"
              size="sm"
              onClick={config.connect}
              disabled={loading}
            >
              {t('settings.providerCard.connect', 'Connect')}
            </Button>
          ) : null}

          {isAdminMode ||
          (!provider.is_public && provider.user_id === user?.id) ? (
            <>
              {!isAdminMode && config?.hasToken && config.disconnect && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={config.disconnect}
                  disabled={loading}
                  title={t('settings.providerCard.disconnect', 'Disconnect')}
                >
                  <Link2Off className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => startEditing(provider)}
                disabled={loading}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDeleteProvider(provider.id)}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <div className="text-xs text-muted-foreground px-2 py-1 rounded">
              {t('settings.providerCard.readOnly', 'Read-only')}
            </div>
          )}
          {(isAdminMode ||
            (!provider.is_public && provider.user_id === user?.id)) && (
            <Switch
              checked={provider.is_active}
              onCheckedChange={(checked) =>
                handleToggleActive(provider.id, checked)
              }
              disabled={loading}
            />
          )}
        </div>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">
          {providerTypes?.find((t) => t.id === provider.provider_type)
            ?.display_name || provider.provider_type}
          {provider.base_url && (
            <>
              {` - ${t('settings.providerCard.urlLabel', 'URL:')} `}
              <a
                href={provider.base_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-medium"
              >
                {provider.base_url}
              </a>
            </>
          )}
          {provider.app_id &&
            ![
              'mealie',
              'tandoor',
              'norish',
              'valhalla',
              'open_meteo',
              'free-exercise-db',
              'wger',
            ].includes(provider.provider_type) && (
              <span>{` - ${t('settings.providerCard.appIdLabel', 'App ID:')} ${
                provider.provider_type === 'yazio'
                  ? (yazioDisplay.username || yazioDisplay.clientId).substring(
                      0,
                      4
                    )
                  : provider.app_id.substring(0, 4)
              }...`}</span>
            )}
          {provider.app_key &&
            [
              'mealie',
              'tandoor',
              'norish',
              'nutritionix',
              'fatsecret',
              'withings',
            ].includes(provider.provider_type) && (
              <span>{` - ${t('settings.providerCard.appKeyLabel', 'App Key:')} ${provider.app_key.substring(0, 4)}...`}</span>
            )}
          {provider.sync_frequency && (
            <span>{` - ${t('settings.providerCard.syncLabel', 'Sync:')} ${provider.sync_frequency}`}</span>
          )}
        </p>

        {provider.provider_type === 'swissfood' && (
          <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
            <Trans
              i18nKey="settings.providerCard.supportedLanguagesEnglishEnGerman"
              defaults={
                'Supported languages: <strong>English (en)</strong>, <strong2>German (de)</strong2>, <strong3>French (fr)</strong3>, and <strong4>Italian (it)</strong4>. Defaults to English if your active language is not supported. <link>Swiss Food Composition Database</link>'
              }
              components={{
                strong: <strong />,
                strong2: <strong />,
                strong3: <strong />,
                strong4: <strong />,
                link: (
                  <a
                    href="https://naehrwertdaten.ch/en/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium ml-1"
                  />
                ),
              }}
            />
          </p>
        )}

        {isCnf && (
          <>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
              <Trans
                i18nKey="settings.cnf.providerCardLicence"
                defaults="Contains information published by Health Canada licensed under the <1>Open Government Licence – Canada</1>. Supported languages: <3>English (en)</3> and <5>French (fr)</5>. <7>Canadian Nutrient File</7>"
                components={{
                  1: (
                    <a
                      href="https://open.canada.ca/en/open-government-licence-canada"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    />
                  ),
                  3: <strong />,
                  5: <strong />,
                  7: (
                    <a
                      href="https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium ml-1"
                    />
                  ),
                }}
              />
            </p>

            {cnfStatus?.isRunning && (
              <div className="mt-3 space-y-2 rounded-lg border bg-muted/40 p-3 max-w-2xl">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    {t(
                      'settings.providerCard.importingCatalogFoods',
                      'Importing catalog: {{processed}} / {{total}} foods',
                      { processed: cnfStatus.processed, total: cnfStatus.total }
                    )}
                  </span>
                  <span className="font-mono text-xs font-semibold">
                    {cnfStatus.progress}%
                  </span>
                </div>
                <Progress value={cnfStatus.progress} className="h-2" />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    {t(
                      'settings.providerCard.imported',
                      '{{imported}} imported',
                      { imported: cnfStatus.imported }
                    )}
                  </span>
                  <span>
                    {t('settings.providerCard.updated', '{{updated}} updated', {
                      updated: cnfStatus.updated,
                    })}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {isSlv && (
          <>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
              <Trans
                i18nKey="settings.livsmedelsverket.providerCardLicence"
                defaults="Contains information published by the Swedish Food Agency (Livsmedelsverket) licensed under <1>Creative Commons Attribution 4.0 (CC BY 4.0)</1>. Supported languages: <3>Swedish (sv)</3> and <5>English (en)</5>. <7>Swedish Food Composition Database</7>"
                components={{
                  1: (
                    <a
                      href="https://creativecommons.org/licenses/by/4.0/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    />
                  ),
                  3: <strong />,
                  5: <strong />,
                  7: (
                    <a
                      href="https://www.livsmedelsverket.se/en/about-us/open-data/food-composition-data/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium ml-1"
                    />
                  ),
                }}
              />
            </p>

            {slvStatus?.isRunning && (
              <div className="mt-3 space-y-2 rounded-lg border bg-muted/40 p-3 max-w-2xl">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    {t(
                      'settings.providerCard.importingCatalogFoods',
                      'Importing catalog: {{processed}} / {{total}} foods',
                      { processed: slvStatus.processed, total: slvStatus.total }
                    )}
                  </span>
                  <span className="font-mono text-xs font-semibold">
                    {slvStatus.progress}%
                  </span>
                </div>
                <Progress value={slvStatus.progress} className="h-2" />
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>
                    {t(
                      'settings.providerCard.imported',
                      '{{imported}} imported',
                      { imported: slvStatus.imported }
                    )}
                  </span>
                  <span>
                    {t('settings.providerCard.updated', '{{updated}} updated', {
                      updated: slvStatus.updated,
                    })}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {provider.provider_type === 'free-exercise-db' && (
          <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
            <Trans
              i18nKey="settings.providerCard.fetchesExerciseDataDirectlyFrom2"
              defaults={
                'Fetches exercise data directly from the community repository at <link>yuhonas/free-exercise-db on GitHub</link>.'
              }
              components={{
                link: (
                  <a
                    href="https://github.com/yuhonas/free-exercise-db"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
              }}
            />
          </p>
        )}

        {provider.provider_type === 'wger' && (
          <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
            <Trans
              i18nKey="settings.providerCard.theWgerProviderIsPublic2"
              defaults={
                'The wger provider is public, free, and requires no credentials. It fetches workout and exercise data directly from the official <link>wger Project Website</link>.'
              }
              components={{
                link: (
                  <a
                    href="https://wger.de/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  />
                ),
              }}
            />
          </p>
        )}

        {(() => {
          const portal = PROVIDER_PORTALS[provider.provider_type];
          if (!portal) return null;
          return (
            <p className="text-xs text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
              <Trans
                i18nKey="settings.providerCard.forMoreDetailsOrTo2"
                defaults={
                  'For more details or to manage your integration, visit the <link>{{label}}</link>.'
                }
                values={{ label: portal.label }}
                components={{
                  link: (
                    <a
                      href={portal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium"
                    />
                  ),
                }}
              />
            </p>
          );
        })()}

        {config?.hasToken && (config.lastSync || config.tokenExpires) && (
          <div className="text-sm text-muted-foreground">
            {config.lastSync && (
              <span>
                {t('settings.providerCard.lastSync2', 'Last Sync: {{value}}', {
                  value: new Date(config.lastSync).toLocaleString(),
                })}
              </span>
            )}
            {config.lastSync && config.tokenExpires && <span> | </span>}
            {config.tokenExpires && (
              <span>
                {t(
                  'settings.providerCard.tokenExpires2',
                  'Token Expires: {{value}}',
                  { value: new Date(config.tokenExpires).toLocaleString() }
                )}
              </span>
            )}
          </div>
        )}

        {provider.provider_type === 'intervals' && (
          <p className="text-xs text-muted-foreground mt-2">
            {t(
              'integrations.intervalsGarminNote',
              'Activities that Intervals.icu received from Garmin Connect are skipped while Garmin is connected here, so they are not imported twice.'
            )}
          </p>
        )}

        {provider.availability_error && (
          <p className="text-sm text-destructive mt-2">
            {provider.availability_error}
          </p>
        )}
      </div>

      {[
        'fitbit',
        'oura',
        'googlehealth',
        'withings',
        'polar',
        'garmin',
        'hevy',
        'liftosaur',
        'strava',
        'coros_mcp',
      ].includes(provider.provider_type) && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-2 text-xs text-yellow-800 dark:text-yellow-200 mt-2 flex items-center gap-1">
          <Trans
            i18nKey="settings.providerCard.noteFromCodewithCJIDon"
            defaults={
              "<strong>Note from CodewithCJ:</strong> I don't own {{provider_name}} device/subscription."
            }
            values={{ provider_name: provider.provider_name }}
            components={{ strong: <strong /> }}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="underline cursor-help decoration-dotted ml-1">
                  {t(
                    'settings.providerCard.howToImproveThis',
                    'How to improve this?'
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4">
                <p>
                  {t(
                    'settings.providerCard.helpImproveThisIntegrationBy',
                    'Help improve this integration by sharing anonymized mock data!'
                  )}
                </p>
                <p className="mt-2 text-xs">
                  <Trans
                    i18nKey="settings.providerCard.enableAllowLocalProviderResponse"
                    defaults={
                      'Enable <strong>Allow Local Provider Response Capture</strong> in <strong2>Admin > Global Provider Settings</strong2>, then check <strong3>Capture raw provider response</strong3> in the Sync Range dialog.'
                    }
                    components={{
                      strong: <strong />,
                      strong2: <strong />,
                      strong3: <strong />,
                    }}
                  />
                </p>
                <p className="mt-2 text-xs">
                  <Trans
                    i18nKey="settings.providerCard.shareTheExportedDiagnosticBundle2"
                    defaults={
                      'Share the exported diagnostic bundle with <strong>CodewithCJ</strong> on Discord.'
                    }
                    components={{ strong: <strong /> }}
                  />
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      <SyncRangeDialog
        isOpen={isSyncDialogOpen}
        onClose={() => setIsSyncDialogOpen(false)}
        onSync={executeSync}
        providerType={provider.provider_type}
      />

      {isCnf && isAdminMode && (
        <CnfBulkImportDialog
          open={isCnfDialogOpen}
          onOpenChange={setIsCnfDialogOpen}
        />
      )}

      {isSlv && isAdminMode && (
        <LivsmedelsverketBulkImportDialog
          open={isSlvDialogOpen}
          onOpenChange={setIsSlvDialogOpen}
        />
      )}
    </div>
  );
};
