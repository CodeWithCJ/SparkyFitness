import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Clipboard } from 'lucide-react';
import type { ExternalDataProvider } from './ExternalProviderSettings';
import { toast } from '@/hooks/use-toast';
import { getProviderTypes } from '@/utils/settings';

interface EditProviderFormProps {
  provider: ExternalDataProvider;
  editData: Partial<ExternalDataProvider>;
  setEditData: React.Dispatch<
    React.SetStateAction<Partial<ExternalDataProvider>>
  >;
  onSubmit: (providerId: string) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

export const EditProviderForm = ({
  provider,
  editData,
  setEditData,
  onSubmit,
  onCancel,
  loading,
}: EditProviderFormProps) => {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(provider.id);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Provider Name</Label>
          <Input
            value={editData.provider_name || ''}
            onChange={(e) =>
              setEditData((prev) => ({
                ...prev,
                provider_name: e.target.value,
              }))
            }
          />
        </div>
        <div>
          <Label>Provider Type</Label>
          <Select
            value={editData.provider_type || ''}
            onValueChange={(value) =>
              setEditData((prev) => ({
                ...prev,
                provider_type: value as ExternalDataProvider['provider_type'],
                app_id: '',
                app_key: '',
                base_url: '',
                garmin_connect_status: 'disconnected',
                garmin_last_status_check: '',
                garmin_token_expires: '',
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getProviderTypes().map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {editData.provider_type === 'openfoodfacts' && (
        <>
          <div>
            <Label>Open Food Facts Username (Optional)</Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder="(leave blank to keep existing)"
              autoComplete="username"
            />
          </div>
          <div>
            <Label>Open Food Facts Password (Optional)</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="•••••••• (leave blank to keep existing)"
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
      {(editData.provider_type === 'mealie' ||
        editData.provider_type === 'tandoor' ||
        editData.provider_type === 'norish') && (
        <>
          <div>
            <Label>App URL</Label>
            <Input
              type="text"
              value={editData.base_url || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  base_url: e.target.value,
                }))
              }
              placeholder={
                editData.provider_type === 'norish'
                  ? 'e.g., https://norish.your-domain.com'
                  : editData.provider_type === 'tandoor'
                    ? 'e.g., http://your-tandoor-instance.com'
                    : 'e.g., http://your-mealie-instance.com'
              }
              autoComplete="off"
            />
          </div>
          <div>
            <Label>API Key</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder={
                editData.provider_type === 'norish'
                  ? 'Enter Norish API Key'
                  : editData.provider_type === 'tandoor'
                    ? 'Enter Tandoor API Key'
                    : 'Enter Mealie API Key'
              }
              autoComplete="off"
            />
          </div>
        </>
      )}
      {(editData.provider_type === 'nutritionix' ||
        editData.provider_type === 'fatsecret') && (
        <>
          <div>
            <Label>App ID</Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder="Enter App ID"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>App Key</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Enter App Key"
              autoComplete="off"
            />
          </div>
          {editData.provider_type === 'fatsecret' && (
            <p className="text-sm text-muted-foreground col-span-2">
              Note: For Fatsecret, you need to set up **your public IP**
              whitelisting in your Fatsecret developer account. This process can
              take up to 24 hours.
            </p>
          )}
        </>
      )}
      {editData.provider_type === 'yazio' && (
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
            <Label>YAZIO Email / Username (Optional)</Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder="Enter YAZIO email or username"
              autoComplete="username"
            />
          </div>
          <div>
            <Label>YAZIO Password (Optional)</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Leave blank to keep existing password"
              autoComplete="current-password"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            Email and password are optional. Only Client ID and Client Secret
            are required.
          </p>
          <div>
            <Label>YAZIO Client ID</Label>
            <Input
              type="text"
              value={editData.yazio_client_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  yazio_client_id: e.target.value,
                }))
              }
              placeholder="Enter YAZIO Client ID"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>YAZIO Client Secret</Label>
            <Input
              type="password"
              value={editData.yazio_client_secret || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  yazio_client_secret: e.target.value,
                }))
              }
              placeholder="Leave blank to keep existing client secret"
              autoComplete="off"
            />
          </div>
        </>
      )}
      {editData.provider_type === 'nutritionix' && (
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
      {editData.provider_type === 'fatsecret' && (
        <p className="text-sm text-muted-foreground col-span-2">
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
      {editData.provider_type === 'usda' && (
        <>
          <div>
            <Label>API Key</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Enter USDA API Key"
              autoComplete="off"
            />
          </div>
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
        </>
      )}
      {editData.provider_type === 'withings' && (
        <>
          <div>
            <Label>Client ID</Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder="Enter Withings Client ID"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Enter Withings Client Secret"
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            Withings integration uses OAuth2. You will be redirected to Withings
            to authorize access after adding the provider.
            <br />
            In your{' '}
            <a
              href="https://developer.withings.com/dashboard/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Withings Developer Dashboard
            </a>
            , you must set your callback URL to:
            <strong className="flex items-center">
              {`${window.location.origin}/withings/callback`}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(
                    `${window.location.origin}/withings/callback`
                  );
                  toast({
                    title: 'Copied!',
                    description: 'Callback URL copied to clipboard.',
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
          </p>
        </>
      )}
      {editData.provider_type === 'garmin' && (
        <>
          {/* Show connection status for connected Garmin accounts instead of credential fields */}
          {provider.garmin_connect_status === 'linked' ||
          provider.garmin_connect_status === 'connected' ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                <span className="font-medium">Connected to Garmin</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Your Garmin account is connected. To reconnect with different
                credentials, disconnect first and add a new provider.
              </p>
            </div>
          ) : (
            <>
              <div>
                <Label>Garmin Email</Label>
                <Input
                  type="email"
                  value={editData.app_id || ''}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      app_id: e.target.value,
                    }))
                  }
                  placeholder="Enter Garmin Email"
                  autoComplete="username"
                />
              </div>
              <div>
                <Label>Garmin Password</Label>
                <Input
                  type="password"
                  value={editData.app_key || ''}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      app_key: e.target.value,
                    }))
                  }
                  placeholder="Enter Garmin Password"
                  autoComplete="current-password"
                />
              </div>
              <p className="text-sm text-muted-foreground col-span-2">
                Note: Garmin Connect integration is tested with few metrics
                only. Ensure your Docker Compose is updated to include Garmin
                section.
                <br />
                Sparky Fitness does not store your Garmin email or password.
                They are used only during login to obtain secure tokens.
              </p>
            </>
          )}
        </>
      )}
      {editData.provider_type === 'fitbit' && (
        <>
          <div>
            <Label>Client ID</Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder="Enter Fitbit Client ID"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Enter Fitbit Client Secret"
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            Fitbit integration uses OAuth2. You will be redirected to Fitbit to
            authorize access after adding the provider.
            <br />
            In your{' '}
            <a
              href="https://dev.fitbit.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Fitbit Developer Dashboard
            </a>
            , you must set your callback URL to:
            <strong className="flex items-center">
              {`${window.location.origin}/fitbit/callback`}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(
                    `${window.location.origin}/fitbit/callback`
                  );
                  toast({
                    title: 'Copied!',
                    description: 'Callback URL copied to clipboard.',
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
          </p>
        </>
      )}
      {editData.provider_type === 'strava' && (
        <>
          <div>
            <Label>Client ID</Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder="Enter Strava Client ID"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Enter Strava Client Secret"
              autoComplete="off"
            />
          </div>
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
            <strong className="flex items-center">
              {window.location.hostname}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(window.location.hostname);
                  toast({
                    title: 'Copied!',
                    description: 'Domain copied to clipboard.',
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
            and ensuring your local URL is correct if testing locally. Note:
            Strava callback URL on the server is configured to:
            <strong>{`${window.location.origin}/strava/callback`}</strong>
          </p>
        </>
      )}
      {editData.provider_type === 'googlehealth' && (
        <>
          <div>
            <Label>Client ID</Label>
            <Input
              type="text"
              value={editData.app_id || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_id: e.target.value,
                }))
              }
              placeholder="Enter Google Cloud Client ID"
              autoComplete="off"
            />
          </div>
          <div>
            <Label>Client Secret</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Enter Google Cloud Client Secret"
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            Google Health integration uses OAuth2. After saving, click{' '}
            <strong>Connect</strong> on the provider card to authorize access.
            <br />
            In your{' '}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline"
            >
              Google Cloud Console
            </a>
            , your OAuth 2.0 Web Application client must have this callback URL:
            <strong className="flex items-center mt-1">
              {`${window.location.origin}/googlehealth/callback`}
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5"
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(
                    `${window.location.origin}/googlehealth/callback`
                  );
                  toast({
                    title: 'Copied!',
                    description: 'Callback URL copied to clipboard.',
                  });
                }}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </strong>
          </p>
        </>
      )}
      {editData.provider_type === 'hevy' && (
        <>
          <div>
            <Label>Hevy API Key</Label>
            <Input
              type="password"
              value={editData.app_key || ''}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  app_key: e.target.value,
                }))
              }
              placeholder="Enter Hevy API Key"
              autoComplete="off"
            />
          </div>
          <p className="text-sm text-muted-foreground col-span-2">
            Get your API Key from Hevy Settings &#62; API Key.
          </p>
        </>
      )}
      {(editData.provider_type === 'withings' ||
        editData.provider_type === 'garmin' ||
        editData.provider_type === 'fitbit' ||
        editData.provider_type === 'googlehealth' ||
        editData.provider_type === 'strava' ||
        editData.provider_type === 'polar' ||
        editData.provider_type === 'hevy') && (
        <div>
          <Label htmlFor="edit_sync_frequency">Sync Frequency</Label>
          <Select
            value={editData.sync_frequency || 'manual'}
            onValueChange={(value) =>
              setEditData((prev) => ({
                ...prev,
                sync_frequency: value as 'hourly' | 'daily' | 'manual',
              }))
            }
          >
            <SelectTrigger id="edit_sync_frequency">
              <SelectValue placeholder="Select sync frequency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {editData.provider_type === 'swissfood' && (
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

      {editData.provider_type === 'free-exercise-db' && (
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

      {editData.provider_type === 'wger' && (
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

      <div className="flex items-center space-x-2">
        <Switch
          checked={editData.is_active || false}
          onCheckedChange={(checked) =>
            setEditData((prev) => ({ ...prev, is_active: checked }))
          }
        />
        <Label>Activate this provider</Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
