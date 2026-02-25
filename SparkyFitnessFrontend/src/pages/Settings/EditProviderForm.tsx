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
      {(editData.provider_type === 'mealie' ||
        editData.provider_type === 'tandoor' ||
        editData.provider_type === 'free-exercise-db') && (
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
                editData.provider_type === 'tandoor'
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
                editData.provider_type === 'tandoor'
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
