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
  const needsBaseUrl = ['mealie', 'tandoor', 'norish'].includes(
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
    'norish',
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
              : provider.provider_type === 'yazio'
                ? 'YAZIO Email / Username'
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
              : provider.provider_type === 'yazio'
                ? 'YAZIO Password'
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

      {provider.provider_type === 'openfoodfacts' && (
        <>
          <div>
            <Label htmlFor="add-openfoodfacts-username">
              Open Food Facts Username (Optional)
            </Label>
            <Input
              id="add-openfoodfacts-username"
              type="text"
              value={provider.app_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_id: e.target.value }))
              }
              placeholder="Enter Open Food Facts username"
              autoComplete="username"
            />
          </div>
          <div>
            <Label htmlFor="add-openfoodfacts-password">
              Open Food Facts Password (Optional)
            </Label>
            <Input
              id="add-openfoodfacts-password"
              type="password"
              value={provider.app_key || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_key: e.target.value }))
              }
              placeholder="Enter Open Food Facts password"
              autoComplete="current-password"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            Username and password for Open Food Facts are optional. If you have
            an account, adding these credentials allows Sparky to make
            authenticated requests, which can help reduce rate limiting during
            busy periods. If you want to keep the existing credentials, simply
            leave the fields blank. Note that credentials cannot be combined
            with publicly sharing this provider row.
          </p>
          <p className="text-sm text-muted-foreground col-span-2">
            Open Food Facts is a community-driven database that supports
            localization. Sparky automatically queries products in your active
            language setting in SparkyFitness. For more information, visit the{' '}
            <a
              href="https://world.openfoodfacts.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Open Food Facts Portal
            </a>{' '}
            or learn about language support in the{' '}
            <a
              href="https://en.wiki.openfoodfacts.org/Translations"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Open Food Facts Translations Wiki
            </a>
            .
          </p>
        </>
      )}

      {provider.provider_type === 'yazio' && (
        <>
          <div className="col-span-2">
            <div className="rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 space-y-1.5">
              <p className="text-sm font-semibold text-red-800 dark:text-red-200">
                ⚠️ Unofficial API — Use at your own risk
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                YAZIO integration uses an{' '}
                <strong>unofficial, undocumented API</strong> that is not
                provided or endorsed by YAZIO. Using it may{' '}
                <strong>risk getting your YAZIO account banned</strong>. The API
                could also <strong>stop working at any time</strong> without
                notice if YAZIO changes their backend.
              </p>
              <p className="text-sm text-red-700 dark:text-red-300">
                For more information & client credentials, see{' '}
                <a
                  href="https://github.com/saganos/yazio_public_api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-800 dark:text-red-200 underline font-medium"
                >
                  saganos/yazio_public_api
                </a>
                .
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="add-yazio-username">YAZIO Email / Username</Label>
            <Input
              id="add-yazio-username"
              type="text"
              value={provider.app_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_id: e.target.value }))
              }
              placeholder="Enter YAZIO email or username"
              autoComplete="username"
            />
          </div>
          <div>
            <Label htmlFor="add-yazio-password">YAZIO Password</Label>
            <Input
              id="add-yazio-password"
              type="password"
              value={provider.app_key || ''}
              onChange={(e) =>
                setProvider((prev) => ({ ...prev, app_key: e.target.value }))
              }
              placeholder="Enter YAZIO password"
              autoComplete="current-password"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            All fields (Email/Username, Password, Client ID, and Client Secret)
            are required.
          </p>
          <div>
            <Label htmlFor="add-yazio-client-id">YAZIO Client ID</Label>
            <Input
              id="add-yazio-client-id"
              type="text"
              value={provider.yazio_client_id || ''}
              onChange={(e) =>
                setProvider((prev) => ({
                  ...prev,
                  yazio_client_id: e.target.value,
                }))
              }
              placeholder="Enter YAZIO Client ID"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="add-yazio-client-secret">YAZIO Client Secret</Label>
            <Input
              id="add-yazio-client-secret"
              type="password"
              value={provider.yazio_client_secret || ''}
              onChange={(e) =>
                setProvider((prev) => ({
                  ...prev,
                  yazio_client_secret: e.target.value,
                }))
              }
              placeholder="Enter YAZIO Client Secret"
              autoComplete="off"
            />
          </div>
        </>
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

      {['withings', 'fitbit', 'polar'].includes(
        provider.provider_type || ''
      ) && (
        <p className="text-sm text-muted-foreground col-span-2">
          This integration uses OAuth2. You will be redirected to the provider
          to authorize access after adding or updating the provider.
          <br />
          In your provider's developer dashboard, you must set your callback URL
          to:
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

      {provider.provider_type === 'strava' && (
        <p className="text-sm text-muted-foreground col-span-2">
          Strava integration uses OAuth2. You will be redirected to Strava to
          authorize access after adding or updating the provider.
          <br />
          In your{' '}
          <a
            href="https://www.strava.com/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Strava API Dashboard
          </a>
          , you must set your "Authorization Callback Domain" to:
          <strong className="flex items-center mt-1">
            {window.location.hostname}
            <Button
              variant="ghost"
              size="icon"
              className="ml-2 h-5 w-5"
              onClick={(e) => {
                e.preventDefault();
                onCopy(window.location.hostname);
              }}
            >
              <Clipboard className="h-4 w-4" />
            </Button>
          </strong>
          and ensure your local URL is correct if testing locally. Note: Strava
          callback URL on the server is configured to:
          <strong>{` ${window.location.origin}/strava/callback`}</strong>
        </p>
      )}

      {provider.provider_type === 'garmin' && (
        <p className="text-sm text-muted-foreground col-span-2">
          Note: Garmin Connect integration is tested with few metrics only.
          Ensure your Docker Compose is updated to include Garmin section.
          <br />
          Sparky Fitness does not store your Garmin email or password. They are
          used only during login to obtain secure tokens.
        </p>
      )}

      {provider.provider_type === 'hevy' && (
        <p className="text-sm text-muted-foreground col-span-2">
          Get your API Key from Hevy Settings &#62; API Key.
        </p>
      )}

      {provider.provider_type === 'nutritionix' && (
        <p className="text-sm text-muted-foreground col-span-2">
          Get your App ID and App Key from the{' '}
          <a
            href="https://developer.nutritionix.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Nutritionix Developer Portal
          </a>
          .
        </p>
      )}

      {provider.provider_type === 'fatsecret' && (
        <p className="text-sm text-muted-foreground col-span-2">
          Note: For Fatsecret, you need to set up **your public IP**
          whitelisting in your Fatsecret developer account. This process can
          take up to 24 hours.
          <br />
          Get your App ID and App Key from the{' '}
          <a
            href="https://platform.fatsecret.com/my-account/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            Fatsecret Platform Dashboard
          </a>
          .
        </p>
      )}

      {provider.provider_type === 'usda' && (
        <p className="text-sm text-muted-foreground col-span-2">
          Get your API Key from the{' '}
          <a
            href="https://fdc.nal.usda.gov/api-guide.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline"
          >
            USDA FoodData Central API Guide
          </a>
          .
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

      {provider.provider_type === 'swissfood' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            The Swiss Food Composition Database API is free, public, and
            requires no credentials. Supported languages for searches and
            nutritional value labels are <strong>English (en)</strong>,{' '}
            <strong>German (de)</strong>, <strong>French (fr)</strong>, and{' '}
            <strong>Italian (it)</strong>.
          </p>
          <p className="text-sm text-muted-foreground">
            If your active language in SparkyFitness is not supported, the API
            queries will default to English. For more details, see the official
            portal at{' '}
            <a
              href="https://naehrwertdaten.ch/en/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              Swiss Food Composition Database
            </a>
            .
          </p>
        </div>
      )}

      {provider.provider_type === 'free-exercise-db' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            The Free Exercise DB provider is public, free, and requires no
            credentials. It fetches exercise data directly from the community
            repository at{' '}
            <a
              href="https://github.com/yuhonas/free-exercise-db"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              yuhonas/free-exercise-db on GitHub
            </a>
            .
          </p>
        </div>
      )}

      {provider.provider_type === 'wger' && (
        <div className="col-span-2 space-y-2">
          <p className="text-sm text-muted-foreground">
            The wger provider is public, free, and requires no credentials. It
            fetches workout and exercise data directly from the official{' '}
            <a
              href="https://wger.de/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium"
            >
              wger Project Website
            </a>
            .
          </p>
        </div>
      )}
    </>
  );
};
