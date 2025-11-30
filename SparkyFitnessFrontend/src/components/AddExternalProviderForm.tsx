import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Save, X, Clipboard } from "lucide-react";
import { ExternalDataProvider } from "./ExternalProviderSettings";
import { apiCall } from '@/services/api';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface AddExternalProviderFormProps {
  showAddForm: boolean;
  setShowAddForm: (show: boolean) => void;
  loading: boolean;
  getProviderTypes: () => { value: string; label: string }[];
  onAddSuccess: () => void;
  handleConnectWithings: (providerId: string) => Promise<void>;
  onGarminMfaRequired: (clientState: string) => void; // New prop for MFA handling
}

const AddExternalProviderForm: React.FC<AddExternalProviderFormProps> = ({
  showAddForm,
  setShowAddForm,
  loading,
  getProviderTypes,
  onAddSuccess,
  handleConnectWithings,
  onGarminMfaRequired,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newProvider, setNewProvider] = useState<Partial<ExternalDataProvider>>({
    provider_name: '',
    provider_type: 'openfoodfacts',
    app_id: '',
    app_key: '',
    is_active: false,
    base_url: '',
    sync_frequency: 'manual' as 'hourly' | 'daily' | 'manual',
    garmin_connect_status: 'disconnected' as ExternalDataProvider['garmin_connect_status'],
    garmin_last_status_check: '',
    garmin_token_expires: '',
  });

  const handleAddProvider = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "User not authenticated. Please log in again.",
        variant: "destructive"
      });
      return;
    }
    if (!newProvider.provider_name) {
      toast({
        title: "Error",
        description: "Please fill in the provider name",
        variant: "destructive"
      });
      return;
    }

    if (newProvider.provider_type === 'mealie' || newProvider.provider_type === 'tandoor') {
      if (!newProvider.base_url || !newProvider.app_key) {
        toast({
          title: "Error",
          description: `Please provide App URL and API Key for ${newProvider.provider_type === 'mealie' ? 'Mealie' : 'Tandoor'}`,
          variant: "destructive"
        });
        return;
      }
    } else if ((newProvider.provider_type === 'nutritionix' || newProvider.provider_type === 'fatsecret') && (!newProvider.app_id || !newProvider.app_key)) {
      toast({
        title: "Error",
        description: `Please provide App ID and App Key for ${newProvider.provider_type}`,
        variant: "destructive"
      });
      return;
    } else if (newProvider.provider_type === 'withings') {
      if (!newProvider.app_id || !newProvider.app_key) {
        toast({
          title: "Error",
          description: `Please provide Client ID and Client Secret for ${newProvider.provider_type}`,
          variant: "destructive"
        });
        return;
      }
    } else if (newProvider.provider_type === 'garmin') {
      if (!newProvider.app_id || !newProvider.app_key) { // app_id is email, app_key is password
        toast({
          title: "Error",
          description: `Please provide Garmin Email and Password`,
          variant: "destructive"
        });
        return;
      }
    }

    try {
      let data;
      if (newProvider.provider_type === 'garmin') {
        data = await apiCall('/integrations/garmin/login', {
          method: 'POST',
          body: JSON.stringify({
            email: newProvider.app_id, // Use app_id as email
            password: newProvider.app_key, // Use app_key as password
          }),
        });
        // If Garmin login is successful, we need to create an external provider entry
        // The garminConnectService.garminLogin already handles creating/updating the provider in the backend
        // So we just need to ensure the frontend state is updated.
        // The backend /garmin/login endpoint returns the provider details if successful.
        if (data && data.status === 'success' && data.provider) {
          // The backend /garmin/login endpoint now returns the provider details if successful.
          // We need to ensure the frontend state is updated with this provider.
          // The `data` variable here is the response from the backend, which now contains `status` and `provider`.
          // We should use `data.provider` for subsequent operations if needed, but for now,
          // the `onAddSuccess()` call will trigger a refresh of the provider list.
          // No direct assignment to `data` is needed here as the `onAddSuccess` handles the refresh.
        } else if (data && data.status === 'needs_mfa' && data.client_state) {
          onGarminMfaRequired(data.client_state);
          toast({
            title: "Garmin MFA Required",
            description: "Please complete Multi-Factor Authentication for Garmin.",
          });
          setShowAddForm(false); // Close the form after initiating MFA
          return; // Exit the function as MFA flow is initiated
        }
        else {
          throw new Error(data.error || 'Garmin login failed.');
        }
      } else {
        data = await apiCall('/external-providers', {
          method: 'POST',
          body: JSON.stringify({
            user_id: user.id,
            provider_name: newProvider.provider_name,
            provider_type: newProvider.provider_type,
            app_id: (newProvider.provider_type === 'mealie' || newProvider.provider_type === 'tandoor' || newProvider.provider_type === 'free-exercise-db' || newProvider.provider_type === 'wger') ? null : newProvider.app_id || null,
            app_key: newProvider.app_key || null,
            is_active: newProvider.is_active,
            base_url: (newProvider.provider_type === 'mealie' || newProvider.provider_type === 'tandoor' || newProvider.provider_type === 'free-exercise-db') ? newProvider.base_url || null : null,
            sync_frequency: ['withings', 'garmin'].includes(newProvider.provider_type) ? newProvider.sync_frequency : null,
          }),
        });
      }

      toast({
        title: "Success",
        description: "External data provider added successfully"
      });
      setNewProvider({
        provider_name: '',
        provider_type: 'openfoodfacts',
        app_id: '',
        app_key: '',
        is_active: false,
        base_url: '',
        sync_frequency: 'manual',
        garmin_connect_status: 'disconnected',
        garmin_last_status_check: '',
        garmin_token_expires: '',
      });
      onAddSuccess();
      if (data && data.is_active && data.provider_type === 'withings') {
        handleConnectWithings(data.id);
      }
      // For Garmin, the connection is handled during the addProvider call itself,
      // so no separate handleConnectGarmin call is needed here.
    } catch (error: any) {
      console.error('Error adding external data provider:', error);
      toast({
        title: "Error",
        description: `Failed to add external data provider: ${error.message}`,
        variant: "destructive"
      });
    }
  };

  return (
    <>
      {!showAddForm && (
        <Button onClick={() => setShowAddForm(true)} variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add New Data Provider
        </Button>
      )}

      {showAddForm && (
        <form onSubmit={(e) => { e.preventDefault(); handleAddProvider(); }} className="border rounded-lg p-4 space-y-4">
          <h3 className="text-lg font-medium">Add New Data Provider</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="new_provider_name">Provider Name</Label>
              <Input
                id="new_provider_name"
                value={newProvider.provider_name}
                onChange={(e) => setNewProvider(prev => ({ ...prev, provider_name: e.target.value }))}
                placeholder="My Provider name"
              />
            </div>
            <div>
              <Label htmlFor="new_provider_type">Provider Type</Label>
              <Select
                value={newProvider.provider_type}
                onValueChange={(value) => setNewProvider(prev => ({ ...prev, provider_type: value as ExternalDataProvider['provider_type'], app_id: '', app_key: '', base_url: '', garmin_connect_status: 'disconnected', garmin_last_status_check: '', garmin_token_expires: '' }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getProviderTypes().map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {newProvider.provider_type === 'tandoor' && (
            <>
              <div>
                <Label htmlFor="new_base_url">App URL</Label>
                <Input
                  id="new_base_url"
                  type="text"
                  value={newProvider.base_url}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, base_url: e.target.value }))}
                  placeholder="e.g., http://your-tandoor-instance.com"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="new_app_key">API Key</Label>
                <Input
                  id="new_app_key"
                  type="password"
                  value={newProvider.app_key}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_key: e.target.value }))}
                  placeholder="Enter Tandoor API Key"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          {newProvider.provider_type === 'mealie' && (
            <>
              <div>
                <Label htmlFor="new_base_url">App URL</Label>
                <Input
                  id="new_base_url"
                  type="text"
                  value={newProvider.base_url}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, base_url: e.target.value }))}
                  placeholder="e.g., http://your-mealie-instance.com"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="new_app_key">API Key</Label>
                <Input
                  id="new_app_key"
                  type="password"
                  value={newProvider.app_key}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_key: e.target.value }))}
                  placeholder="Enter Mealie API Key"
                  autoComplete="off"
                />
              </div>
            </>
          )}
          {(newProvider.provider_type === 'nutritionix' || newProvider.provider_type === 'fatsecret') && (
            <>
              <div>
                <Label htmlFor="new_app_id">App ID</Label>
                <Input
                  id="new_app_id"
                  type="text"
                  value={newProvider.app_id}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_id: e.target.value }))}
                  placeholder="Enter App ID"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="new_app_key">App Key</Label>
                <Input
                  id="new_app_key"
                  type="password"
                  value={newProvider.app_key}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_key: e.target.value }))}
                  placeholder="Enter App Key"
                  autoComplete="off"
                />
              </div>
              {newProvider.provider_type === 'fatsecret' && (
                <p className="text-sm text-muted-foreground col-span-2">
                  Note: For Fatsecret, you need to set up **your public IP** whitelisting in your Fatsecret developer account. This process can take up to 24 hours.
                </p>
              )}
            </>
          )}
          {newProvider.provider_type === 'nutritionix' && (
            <p className="text-sm text-muted-foreground col-span-2">
              Get your App ID and App Key from the <a href="https://developer.nutritionix.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Nutritionix Developer Portal</a>.
            </p>
          )}
          {newProvider.provider_type === 'fatsecret' && (
            <p className="text-sm text-muted-foreground col-span-2">
              Get your App ID and App Key from the <a href="https://platform.fatsecret.com/my-account/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Fatsecret Platform Dashboard</a>.
            </p>
          )}
          {newProvider.provider_type === 'withings' && (
            <>
              <div>
                <Label htmlFor="new_app_id">Client ID</Label>
                <Input
                  id="new_app_id"
                  type="text"
                  value={newProvider.app_id}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_id: e.target.value }))}
                  placeholder="Enter Withings Client ID"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="new_app_key">Client Secret</Label>
                <Input
                  id="new_app_key"
                  type="password"
                  value={newProvider.app_key}
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_key: e.target.value }))}
                  placeholder="Enter Withings Client Secret"
                  autoComplete="off"
                />
              </div>
              <p className="text-sm text-muted-foreground col-span-2">
                Withings integration uses OAuth2. You will be redirected to Withings to authorize access after adding the provider.
                <br />
                In your <a href="https://developer.withings.com/dashboard/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Withings Developer Dashboard</a>, you must set your callback URL to:
                <strong className="flex items-center">
                  {`${window.location.origin}/withings/callback`}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-2 h-5 w-5"
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(`${window.location.origin}/withings/callback`);
                      toast({ title: "Copied!", description: "Callback URL copied to clipboard." });
                    }}
                  >
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </strong>
              </p>
            </>
          )}

          {newProvider.provider_type === 'garmin' && (
            <>
              <div>
                <Label htmlFor="add-garmin-email">Garmin Email</Label>
                <Input
                  id="add-garmin-email"
                  type="email"
                  value={newProvider.app_id} // Using app_id to temporarily store email
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_id: e.target.value }))}
                  placeholder="Enter Garmin Email"
                  autoComplete="username"
                />
              </div>
              <div>
                <Label htmlFor="add-garmin-password">Garmin Password</Label>
                <Input
                  id="add-garmin-password"
                  type="password"
                  value={newProvider.app_key} // Using app_key to temporarily store password
                  onChange={(e) => setNewProvider(prev => ({ ...prev, app_key: e.target.value }))}
                  placeholder="Enter Garmin Password"
                  autoComplete="current-password"
                />
              </div>
              <p className="text-sm text-muted-foreground col-span-2">
                    Note: Garmin Connect integration is tested with few metrics only. Ensure your Docker Compose is updated to include Garmin section.
                    <br />
                    Sparky Fitness does not store your Garmin email or password. They are used only during login to obtain secure tokens.
              </p>
            </>
          )}
          
          {(newProvider.provider_type === 'withings' || newProvider.provider_type === 'garmin') && (
            <div>
              <Label htmlFor="new_sync_frequency">Sync Frequency</Label>
              <Select
                value={newProvider.sync_frequency || 'manual'}
                onValueChange={(value) => setNewProvider(prev => ({ ...prev, sync_frequency: value as 'hourly' | 'daily' | 'manual' }))}
              >
                <SelectTrigger id="new_sync_frequency">
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
              id="new_is_active"
              checked={newProvider.is_active}
              onCheckedChange={(checked) => setNewProvider(prev => ({ ...prev, is_active: checked }))}
            />
            <Label htmlFor="new_is_active">Activate this provider</Label>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </form>
      )}
    </>
  );
};

export default AddExternalProviderForm;