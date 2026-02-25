import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Clipboard } from 'lucide-react';
import type { ExternalDataProvider } from './ExternalProviderSettings';

interface ProviderSpecificFieldsProps {
  provider: Partial<ExternalDataProvider>;
  setProvider: React.Dispatch<
    React.SetStateAction<Partial<ExternalDataProvider>>
  >;
  fullSyncOnConnect: boolean;
  setFullSyncOnConnect: (val: boolean) => void;
  onCopy: (text: string) => void;
}

export const ProviderSpecificFields = ({
  provider,
  setProvider,
  fullSyncOnConnect,
  setFullSyncOnConnect,
  onCopy,
}: ProviderSpecificFieldsProps) => {
  const needsBaseUrl = ['mealie', 'tandoor'].includes(
    provider.provider_type || ''
  );
  const needsAppId = [
    'nutritionix',
    'fatsecret',
    'withings',
    'fitbit',
    'strava',
    'polar',
  ].includes(provider.provider_type || '');
  const needsAppKey = [
    'mealie',
    'tandoor',
    'nutritionix',
    'fatsecret',
    'usda',
    'withings',
    'fitbit',
    'strava',
    'polar',
    'hevy',
  ].includes(provider.provider_type || '');

  const getCallbackUrl = () => {
    if (provider.provider_type === 'strava') {
      return `${window.location.origin}/strava/callback`;
    }
    return `${window.location.origin}/${provider.provider_type}/callback`;
  };

  return (
    <>
      {needsBaseUrl && (
        <div>
          <Label htmlFor="new_base_url">App URL</Label>
          <Input
            id="new_base_url"
            type="text"
            value={provider.base_url || ''}
            onChange={(e) =>
              setProvider((prev) => ({ ...prev, base_url: e.target.value }))
            }
            placeholder={`e.g., http://your-${provider.provider_type}-instance.com`}
            autoComplete="off"
          />
        </div>
      )}

      {needsAppId && (
        <div>
          <Label htmlFor="new_app_id">
            {['withings', 'fitbit', 'strava', 'polar'].includes(
              provider.provider_type || ''
            )
              ? 'Client ID'
              : 'App ID'}
          </Label>
          <Input
            id="new_app_id"
            type="text"
            value={provider.app_id || ''}
            onChange={(e) =>
              setProvider((prev) => ({ ...prev, app_id: e.target.value }))
            }
            placeholder="Enter ID"
            autoComplete="off"
          />
        </div>
      )}

      {needsAppKey && (
        <div>
          <Label htmlFor="new_app_key">
            {['withings', 'fitbit', 'strava', 'polar'].includes(
              provider.provider_type || ''
            )
              ? 'Client Secret'
              : 'API Key / App Key'}
          </Label>
          <Input
            id="new_app_key"
            type="password"
            value={provider.app_key || ''}
            onChange={(e) =>
              setProvider((prev) => ({ ...prev, app_key: e.target.value }))
            }
            placeholder="Enter Key"
            autoComplete="off"
          />
        </div>
      )}

      {provider.provider_type === 'garmin' && (
        <>
          <div>
            <Label htmlFor="add-garmin-email">Garmin Email</Label>
            <Input
              id="add-garmin-email"
              type="email"
              value={provider.app_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_id: e.target.value }))
              }
              placeholder="Enter Garmin Email"
              autoComplete="username"
            />
          </div>
          <div>
            <Label htmlFor="add-garmin-password">Garmin Password</Label>
            <Input
              id="add-garmin-password"
              type="password"
              value={provider.app_key || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_key: e.target.value }))
              }
              placeholder="Enter Garmin Password"
              autoComplete="current-password"
            />
          </div>
        </>
      )}

      {['withings', 'fitbit', 'strava', 'polar'].includes(
        provider.provider_type || ''
      ) && (
        <p className="text-sm text-muted-foreground col-span-2">
          This integration uses OAuth2. You must set your callback URL to:
          <strong className="flex items-center mt-1">
            {getCallbackUrl()}
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-5 w-5"
              onClick={(e) => {
                e.preventDefault();
                onCopy(getCallbackUrl());
              }}
            >
              <Clipboard className="h-4 w-4" />
            </Button>
          </strong>
        </p>
      )}

      {['hevy', 'polar'].includes(provider.provider_type || '') && (
        <div className="flex items-center space-x-2 col-span-2">
          <Switch
            id="full_sync_on_connect"
            checked={fullSyncOnConnect}
            onCheckedChange={setFullSyncOnConnect}
          />
          <Label htmlFor="full_sync_on_connect">
            Sync entire history on connect
          </Label>
        </div>
      )}
    </>
  );
};
