import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Trash2, Edit, Lock, Share2, RefreshCw, Link2Off } from 'lucide-react';
import { getProviderTypes } from '@/utils/settings';

import {
  useConnectFitbitMutation,
  useConnectPolarMutation,
  useConnectStravaMutation,
  useConnectWithingsMutation,
  useDisconnectFitbitMutation,
  useDisconnectGarminMutation,
  useDisconnectPolarMutation,
  useDisconnectStravaMutation,
  useDisconnectWithingsMutation,
  useManualSyncWithingsMutation,
  useManualSyncFitbitMutation,
  useManualSyncGarminMutation,
  useManualSyncPolarMutation,
  useManualSyncStravaMutation,
  useSyncHevyMutation,
} from '@/hooks/Integrations/useIntegrations';
import {
  useDeleteExternalProviderMutation,
  useToggleProviderPublicSharingMutation,
  useToggleProviderStatusMutation,
} from '@/hooks/Settings/useExternalProviderSettings';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ExternalDataProvider } from './ExternalProviderSettings';

interface ProviderCardProps {
  provider: ExternalDataProvider;
  isLoading: boolean;
  startEditing: (provider: ExternalDataProvider) => void;
}

export const ProviderCard = ({
  provider,
  isLoading,
  startEditing,
}: ProviderCardProps) => {
  const { user } = useAuth();
  const { defaultFoodDataProviderId, setDefaultFoodDataProviderId } =
    usePreferences();

  const { mutate: handleConnectFitbit, isPending: isConnectFitbitPending } =
    useConnectFitbitMutation();
  const { mutate: handleConnectPolar, isPending: isConnectPolarPending } =
    useConnectPolarMutation();
  const { mutate: handleConnectStrava, isPending: isConnectStravaPending } =
    useConnectStravaMutation();
  const { mutate: handleConnectWithings, isPending: isConnectWithingsPending } =
    useConnectWithingsMutation();

  const {
    mutate: handleDisconnectFitbit,
    isPending: isDisconnectFitbitPending,
  } = useDisconnectFitbitMutation();
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

  const { mutate: handleManualSync, isPending: isSyncWithingsPending } =
    useManualSyncWithingsMutation();
  const { mutate: handleManualSyncFitbit, isPending: isSyncFitbitPending } =
    useManualSyncFitbitMutation();
  const { mutate: handleManualSyncGarmin, isPending: isSyncGarminPending } =
    useManualSyncGarminMutation();
  const { mutate: handleManualSyncPolar, isPending: isSyncPolarPending } =
    useManualSyncPolarMutation();
  const { mutate: handleManualSyncStrava, isPending: isSyncStravaPending } =
    useManualSyncStravaMutation();
  const { mutate: syncHevyData, isPending: isSyncHevyPending } =
    useSyncHevyMutation();
  const {
    mutateAsync: toggleProviderPublicSharing,
    isPending: isToggleSharingPending,
  } = useToggleProviderPublicSharingMutation();

  const { mutateAsync: toggleProviderActiveStatus, isPending: statusPending } =
    useToggleProviderStatusMutation();
  const { mutateAsync: deleteExternalProvider, isPending: deletePending } =
    useDeleteExternalProviderMutation();

  const loading =
    isLoading ||
    statusPending ||
    deletePending ||
    isConnectFitbitPending ||
    isConnectPolarPending ||
    isConnectStravaPending ||
    isConnectWithingsPending ||
    isDisconnectFitbitPending ||
    isDisconnectGarminPending ||
    isDisconnectPolarPending ||
    isDisconnectStravaPending ||
    isDisconnectWithingsPending ||
    isSyncWithingsPending ||
    isSyncFitbitPending ||
    isSyncGarminPending ||
    isSyncPolarPending ||
    isSyncStravaPending ||
    isSyncHevyPending ||
    isToggleSharingPending;

  const handleToggleActive = async (providerId: string, isActive: boolean) => {
    try {
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
          data.provider_type === 'tandoor')
      ) {
        setDefaultFoodDataProviderId(data.id);
      } else if (data && defaultFoodDataProviderId === data.id) {
        setDefaultFoodDataProviderId(null);
      }
    } catch (error: unknown) {
      console.error(error);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (
      !confirm('Are you sure you want to delete this external data provider?')
    )
      return;

    try {
      await deleteExternalProvider(providerId);
      if (defaultFoodDataProviderId === providerId) {
        setDefaultFoodDataProviderId(null);
      }
    } catch (error: unknown) {
      console.error(error);
    }
  };

  const getProviderConfig = () => {
    switch (provider.provider_type) {
      case 'withings':
        return {
          connect: () => handleConnectWithings(),
          disconnect: () => handleDisconnectWithings(),
          sync: () => handleManualSync(),
          lastSync: provider.withings_last_sync_at,
          tokenExpires: provider.withings_token_expires,
          hasToken: provider.has_token,
        };
      case 'fitbit':
        return {
          connect: () => handleConnectFitbit(),
          disconnect: () => handleDisconnectFitbit(),
          sync: () => handleManualSyncFitbit(),
          lastSync: provider.fitbit_last_sync_at,
          tokenExpires: provider.fitbit_token_expires,
          hasToken: provider.has_token,
        };
      case 'polar':
        return {
          connect: () => handleConnectPolar(provider.id),
          disconnect: () => handleDisconnectPolar(provider.id),
          sync: () => handleManualSyncPolar(provider.id),
          lastSync: provider.polar_last_sync_at,
          tokenExpires: provider.polar_token_expires,
          hasToken: provider.has_token,
        };
      case 'strava':
        return {
          connect: () => handleConnectStrava(),
          disconnect: () => handleDisconnectStrava(),
          sync: () => handleManualSyncStrava(),
          lastSync: provider.strava_last_sync_at,
          tokenExpires: provider.strava_token_expires,
          hasToken: provider.has_token,
        };
      case 'garmin':
        return {
          connect: null,
          disconnect: () => handleDisconnectGarmin(),
          sync: () => handleManualSyncGarmin(),
          lastSync: provider.garmin_last_status_check,
          tokenExpires: provider.garmin_token_expires,
          hasToken:
            provider.garmin_connect_status === 'linked' ||
            provider.garmin_connect_status === 'connected',
        };
      case 'hevy':
        return {
          connect: null,
          disconnect: null,
          sync: () => syncHevyData({ fullSync: true, providerId: provider.id }),
          lastSync: provider.hevy_last_sync_at,
          tokenExpires: null,
          hasToken: true,
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
          {(provider.visibility === 'private' ||
            provider.user_id === user?.id) && (
            <>
              <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                Private
              </span>
              {provider.shared_with_public && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded ml-2">
                  Public
                </span>
              )}
            </>
          )}
          {provider.user_id !== user?.id &&
            provider.visibility === 'public' && (
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                Public
              </span>
            )}
          {provider.user_id !== user?.id &&
            provider.visibility === 'family' && (
              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                Family
              </span>
            )}

          {provider.is_active && config && (
            <>
              {!config.hasToken && config.connect && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={config.connect}
                  disabled={loading}
                  className="ml-2"
                >
                  Connect {provider.provider_type}
                </Button>
              )}
              {config.hasToken && (
                <>
                  {config.sync && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={config.sync}
                            disabled={loading}
                            className="ml-2 text-blue-500"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Sync Now</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {config.disconnect && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={config.disconnect}
                            disabled={loading}
                            className="ml-2 text-red-500"
                          >
                            <Link2Off className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Disconnect</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {provider.visibility === 'private' ? (
            <>
              {!provider.is_strictly_private && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    toggleProviderPublicSharing({
                      id: provider.id,
                      sharedWithPublic: !provider.shared_with_public,
                    })
                  }
                  disabled={loading}
                >
                  {provider.shared_with_public ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Share2 className="h-4 w-4" />
                  )}
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
              Read-only
            </div>
          )}
          <Switch
            checked={provider.is_active}
            onCheckedChange={(checked) =>
              handleToggleActive(provider.id, checked)
            }
            disabled={loading}
          />
        </div>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">
          {getProviderTypes().find((t) => t.value === provider.provider_type)
            ?.label || provider.provider_type}
          {provider.base_url && ` - URL: ${provider.base_url}`}
          {provider.app_id &&
            !['mealie', 'tandoor', 'free-exercise-db', 'wger'].includes(
              provider.provider_type
            ) &&
            ` - App ID: ${provider.app_id.substring(0, 4)}...`}
          {provider.app_key &&
            [
              'mealie',
              'tandoor',
              'nutritionix',
              'fatsecret',
              'withings',
            ].includes(provider.provider_type) &&
            ` - App Key: ${provider.app_key.substring(0, 4)}...`}
          {provider.sync_frequency && ` - Sync: ${provider.sync_frequency}`}
        </p>

        {config?.hasToken && (config.lastSync || config.tokenExpires) && (
          <div className="text-sm text-muted-foreground">
            {config.lastSync && (
              <span>
                Last Sync: {new Date(config.lastSync).toLocaleString()}
              </span>
            )}
            {config.lastSync && config.tokenExpires && <span> | </span>}
            {config.tokenExpires && (
              <span>
                Token Expires: {new Date(config.tokenExpires).toLocaleString()}
              </span>
            )}
          </div>
        )}
      </div>

      {['fitbit', 'withings', 'polar', 'garmin', 'hevy', 'strava'].includes(
        provider.provider_type
      ) && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-2 text-xs text-yellow-800 dark:text-yellow-200 mt-2 flex items-center gap-1">
          <strong>Note from CodewithCJ:</strong> I don't own{' '}
          {provider.provider_name} device/subscription.
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="underline cursor-help decoration-dotted ml-1">
                  How to improve this?
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4">
                <p>
                  Help improve this integration by sharing anonymized mock data!
                </p>
                <p className="mt-2 font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-2 rounded border border-gray-200 dark:border-gray-700">
                  SPARKY_FITNESS_SAVE_MOCK_DATA=true
                </p>
                <p className="mt-2 text-xs">
                  Add this variable to the <strong>SparkyFitnessServer</strong>{' '}
                  container & restart the container. Syncing after setup will
                  generate JSON files in{' '}
                  <code>/app/SparkyFitnessServer/mock_data</code>.
                </p>
                <p className="mt-2 text-xs">
                  Share files with <strong>CodewithCJ</strong> on Discord.
                  Ensure data is anonymized.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};
