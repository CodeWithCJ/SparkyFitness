import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Edit, Save, X, Database, Users, Share2, Lock } from "lucide-react";
import { apiCall } from '@/services/api';
import { toggleProviderPublicSharing } from '@/services/externalProviderService';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext";

interface ExternalDataProvider { // Renamed interface
  id: string;
  provider_name: string;
  provider_type: 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'free-exercise-db' | 'withings'; // Added withings
  app_id: string | null; // Keep app_id for other providers
  app_key: string | null;
  is_active: boolean;
  base_url: string | null; // Add base_url field
  user_id?: string;
  visibility: 'private' | 'public' | 'family';
  shared_with_public?: boolean;
  last_sync_at?: string; // Added for Withings
  sync_frequency?: 'hourly' | 'daily' | 'manual'; // Added for Withings
  has_token?: boolean; // Added for Withings connection status
}

const ExternalProviderSettings = () => { // Renamed component
  const { user } = useAuth();
  const { toast } = useToast();
  const { defaultFoodDataProviderId, setDefaultFoodDataProviderId } = usePreferences(); // Keep for now, will refactor later
  const [providers, setProviders] = useState<ExternalDataProvider[]>([]);
  const [newProvider, setNewProvider] = useState({
    provider_name: '',
    provider_type: 'openfoodfacts' as 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'free-exercise-db' | 'withings', // Added withings
    app_id: '',
    app_key: '',
    is_active: false,
    base_url: '', // Initialize base_url
    sync_frequency: 'manual' as 'hourly' | 'daily' | 'manual', // Initialize sync_frequency
  });
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ExternalDataProvider>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadProviders();
    }
  }, [user]);

  const loadProviders = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Use the authenticated user's provider view which returns all providers
      // visible to them (owner + family + public) — backend RLS will filter rows.
      const data = await apiCall('/external-providers', {
        method: 'GET',
        suppress404Toast: true,
      });
      setProviders(data.map((provider: any) => ({
        ...provider,
        provider_type: provider.provider_type as 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'free-exercise-db' | 'withings' // Added withings
      })) || []);
    } catch (error: any) {
      console.error('Error loading external data providers:', error);
      toast({
        title: "Error",
        description: `Failed to load external data providers: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddProvider = async () => {
    if (!user || !newProvider.provider_name) {
      toast({
        title: "Error",
        description: "Please fill in the provider name",
        variant: "destructive"
      });
      return;
    }

    // Wger and OpenFoodFacts might not need app_id/app_key, so adjust validation
    if (newProvider.provider_type === 'mealie') {
      if (!newProvider.base_url || !newProvider.app_key) {
        toast({
          title: "Error",
          description: `Please provide App URL and API Key for Mealie`,
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
    }

    setLoading(true);
    try {
      const data = await apiCall('/external-providers', { // Corrected API endpoint
        method: 'POST',
        body: JSON.stringify({
          user_id: user.id, // user_id will be handled by backend from JWT
          provider_name: newProvider.provider_name,
          provider_type: newProvider.provider_type,
          app_id: (newProvider.provider_type === 'mealie' || newProvider.provider_type === 'free-exercise-db' || newProvider.provider_type === 'wger') ? null : newProvider.app_id || null, // Only set app_id for non-mealie, free-exercise-db, wger
          app_key: newProvider.app_key || null,
          is_active: newProvider.is_active,
          base_url: (newProvider.provider_type === 'mealie' || newProvider.provider_type === 'free-exercise-db') ? newProvider.base_url || null : null, // Set base_url for mealie and free-exercise-db
          sync_frequency: newProvider.provider_type === 'withings' ? newProvider.sync_frequency : null, // Set sync_frequency for Withings
        }),
      });

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
        base_url: '', // Reset base_url
        sync_frequency: 'manual', // Reset sync_frequency
      });
      setShowAddForm(false);
      loadProviders();
      if (data && data.is_active && (data.provider_type === 'openfoodfacts' || data.provider_type === 'nutritionix' || data.provider_type === 'fatsecret' || data.provider_type === 'mealie')) { // Only set default for food providers
        setDefaultFoodDataProviderId(data.id);
      } else if (data && data.is_active && data.provider_type === 'withings') {
        // For Withings, initiate OAuth flow after adding
        handleConnectWithings(data.id);
      }
    } catch (error: any) {
      console.error('Error adding external data provider:', error);
      toast({
        title: "Error",
        description: `Failed to add external data provider: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProvider = async (providerId: string) => {
    setLoading(true);
    const providerUpdateData: Partial<ExternalDataProvider> = { // Renamed interface
      provider_name: editData.provider_name,
      provider_type: editData.provider_type,
      app_id: (editData.provider_type === 'mealie' || editData.provider_type === 'free-exercise-db' || editData.provider_type === 'wger') ? null : editData.app_id || null, // Only set app_id for non-mealie, free-exercise-db, wger
      app_key: editData.app_key || null,
      is_active: editData.is_active,
      base_url: (editData.provider_type === 'mealie' || editData.provider_type === 'free-exercise-db') ? editData.base_url || null : null, // Set base_url for mealie and free-exercise-db
      sync_frequency: editData.provider_type === 'withings' ? editData.sync_frequency : null, // Set sync_frequency for Withings
    };

    try {
      const data = await apiCall(`/external-providers/${providerId}`, { // Corrected API endpoint
        method: 'PUT',
        body: JSON.stringify(providerUpdateData),
      });

      toast({
        title: "Success",
        description: "External data provider updated successfully"
      });
      setEditingProvider(null);
      setEditData({});
      loadProviders();
      if (data && data.is_active && (data.provider_type === 'openfoodfacts' || data.provider_type === 'nutritionix' || data.provider_type === 'fatsecret' || data.provider_type === 'mealie')) { // Only set default for food providers
        setDefaultFoodDataProviderId(data.id);
      } else if (data && defaultFoodDataProviderId === data.id) {
        setDefaultFoodDataProviderId(null);
      }
    } catch (error: any) {
      console.error('Error updating external data provider:', error);
      toast({
        title: "Error",
        description: `Failed to update external data provider: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!confirm('Are you sure you want to delete this external data provider?')) return; // Updated confirmation message

    setLoading(true);
    try {
      await apiCall(`/external-providers/${providerId}`, { // Corrected API endpoint
        method: 'DELETE',
      });

      toast({
        title: "Success",
        description: "External data provider deleted successfully"
      });
      loadProviders();
      if (defaultFoodDataProviderId === providerId) {
        setDefaultFoodDataProviderId(null);
      }
    } catch (error: any) {
      console.error('Error deleting external data provider:', error);
      toast({
        title: "Error",
        description: `Failed to delete external data provider: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (providerId: string, isActive: boolean) => {
    setLoading(true);
    try {
      const data = await apiCall(`/external-providers/${providerId}`, { // Corrected API endpoint
        method: 'PUT',
        body: JSON.stringify({ is_active: isActive }),
      });

      toast({
        title: "Success",
        description: `External data provider ${isActive ? 'activated' : 'deactivated'}` // Updated message
      });
      loadProviders();
      if (data && data.is_active && (data.provider_type === 'openfoodfacts' || data.provider_type === 'nutritionix' || data.provider_type === 'fatsecret' || data.provider_type === 'mealie')) { // Only set default for food providers
        setDefaultFoodDataProviderId(data.id);
      } else if (data && defaultFoodDataProviderId === data.id) {
        setDefaultFoodDataProviderId(null);
      }
    } catch (error: any) {
      console.error('Error updating external data provider status:', error);
      toast({
        title: "Error",
        description: `Failed to update external data provider status: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWithings = async (providerId: string) => {
    setLoading(true);
    try {
      const response = await apiCall(`/withings/authorize`, {
        method: 'GET',
      });
      if (response && response.authUrl) {
        window.location.href = response.authUrl;
      } else {
        throw new Error('Failed to get Withings authorization URL.');
      }
    } catch (error: any) {
      console.error('Error connecting to Withings:', error);
      toast({
        title: "Error",
        description: `Failed to connect to Withings: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectWithings = async (providerId: string) => {
    if (!confirm('Are you sure you want to disconnect from Withings? This will revoke access and delete all associated tokens.')) return;

    setLoading(true);
    try {
      await apiCall(`/withings/disconnect`, {
        method: 'POST',
      });
      toast({
        title: "Success",
        description: "Disconnected from Withings successfully."
      });
      loadProviders();
    } catch (error: any) {
      console.error('Error disconnecting from Withings:', error);
      toast({
        title: "Error",
        description: `Failed to disconnect from Withings: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async (providerId: string) => {
    setLoading(true);
    try {
      await apiCall(`/withings/sync`, {
        method: 'POST',
      });
      toast({
        title: "Success",
        description: "Withings data synchronization initiated."
      });
      loadProviders();
    } catch (error: any) {
      console.error('Error initiating manual sync:', error);
      toast({
        title: "Error",
        description: `Failed to initiate manual sync: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };


  const startEditing = (provider: ExternalDataProvider) => { // Renamed interface
    setEditingProvider(provider.id);
    setEditData({
      provider_name: provider.provider_name,
      provider_type: provider.provider_type,
      app_id: provider.app_id || '',
      app_key: provider.app_key || '',
      is_active: provider.is_active,
      base_url: provider.base_url || '', // Set base_url
      // Add last_sync_at and sync_frequency for Withings
      last_sync_at: (provider as any).last_sync_at || null,
      sync_frequency: (provider as any).sync_frequency || 'manual',
    });
  };

  const cancelEditing = () => {
    setEditingProvider(null);
    setEditData({});
  };

  const getProviderTypes = () => [
    { value: "openfoodfacts", label: "OpenFoodFacts" },
    { value: "nutritionix", label: "Nutritionix" },
    { value: "fatsecret", label: "FatSecret" },
    { value: "wger", label: "Wger (Exercise)" },
    { value: "free-exercise-db", label: "Free Exercise DB" }, // Added Free Exercise DB
    { value: "mealie", label: "Mealie" },
    { value: "withings", label: "Withings" }, // Added Withings
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> {/* Changed icon */}
            External Data Providers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showAddForm && (
            <Button onClick={() => setShowAddForm(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add New Data Provider {/* Changed button text */}
            </Button>
          )}

          {showAddForm && (
            <form onSubmit={(e) => { e.preventDefault(); handleAddProvider(); }} className="border rounded-lg p-4 space-y-4">
              <h3 className="text-lg font-medium">Add New Data Provider</h3> {/* Changed title */}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="new_provider_name">Provider Name</Label>
                  <Input
                    id="new_provider_name"
                    value={newProvider.provider_name}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, provider_name: e.target.value }))}
                    placeholder="My Provider name" // Fixed placeholder text
                  />
                </div>
                <div>
                  <Label htmlFor="new_provider_type">Provider Type</Label>
                  <Select
                    value={newProvider.provider_type}
                    onValueChange={(value) => setNewProvider(prev => ({ ...prev, provider_type: value as 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'free-exercise-db' | 'withings', app_id: '', app_key: '', base_url: '' }))} // Added withings, reset base_url
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
                    In your <a href="https://developer.withings.com/dashboard/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Withings Developer Dashboard</a>, you must set your callback URL to: <strong>`YOUR_SERVER_URL/api/withings/callback`</strong>.
                  </p>
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
                </>
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

          {providers.length > 0 && (
            <>
              <Separator />
              <h3 className="text-lg font-medium">Configured External Data Providers</h3>
              
              <div className="space-y-4">
                {providers.map((provider) => (
                  <div key={provider.id} className="border rounded-lg p-4">
                    {editingProvider === provider.id ? (
                      // Edit Mode
                      <form onSubmit={(e) => { e.preventDefault(); handleUpdateProvider(provider.id); }} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label>Provider Name</Label>
                            <Input
                              value={editData.provider_name || ''}
                              onChange={(e) => setEditData(prev => ({ ...prev, provider_name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label>Provider Type</Label>
                            <Select
                              value={editData.provider_type || ''}
                              onValueChange={(value) => setEditData(prev => ({ ...prev, provider_type: value as 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'free-exercise-db' | 'withings', app_id: '', app_key: '', base_url: '' }))} // Added withings, reset base_url
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
                        {editData.provider_type === 'mealie' && (
                          <>
                            <div>
                              <Label>App URL</Label>
                              <Input
                                type="text"
                                value={editData.base_url || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, base_url: e.target.value }))}
                                placeholder="e.g., http://your-mealie-instance.com"
                                autoComplete="off"
                              />
                            </div>
                            <div>
                              <Label>API Key</Label>
                              <Input
                                type="password"
                                value={editData.app_key || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                                placeholder="Enter Mealie API Key"
                                autoComplete="off"
                              />
                            </div>
                          </>
                        )}
                        {(editData.provider_type === 'nutritionix' || editData.provider_type === 'fatsecret') && (
                          <>
                            <div>
                              <Label>App ID</Label>
                              <Input
                                type="text"
                                value={editData.app_id || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, app_id: e.target.value }))}
                                placeholder="Enter App ID"
                                autoComplete="off"
                              />
                            </div>
                            <div>
                              <Label>App Key</Label>
                              <Input
                                type="password"
                                value={editData.app_key || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                                placeholder="Enter App Key"
                                autoComplete="off"
                              />
                            </div>
                            {editData.provider_type === 'fatsecret' && (
                              <p className="text-sm text-muted-foreground col-span-2">
                                Note: For Fatsecret, you need to set up **your public IP** whitelisting in your Fatsecret developer account. This process can take up to 24 hours.
                              </p>
                            )}
                          </>
                        )}
                        {editData.provider_type === 'nutritionix' && (
                          <p className="text-sm text-muted-foreground col-span-2">
                            Get your App ID and App Key from the <a href="https://developer.nutritionix.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Nutritionix Developer Portal</a>.
                          </p>
                        )}
                        {editData.provider_type === 'fatsecret' && (
                          <p className="text-sm text-muted-foreground col-span-2">
                            Get your App ID and App Key from the <a href="https://platform.fatsecret.com/my-account/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Fatsecret Platform Dashboard</a>.
                          </p>
                        )}
                        {editData.provider_type === 'withings' && (
                          <>
                            <div>
                              <Label>Client ID</Label>
                              <Input
                                type="text"
                                value={editData.app_id || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, app_id: e.target.value }))}
                                placeholder="Enter Withings Client ID"
                                autoComplete="off"
                              />
                            </div>
                            <div>
                              <Label>Client Secret</Label>
                              <Input
                                type="password"
                                value={editData.app_key || ''}
                                onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                                placeholder="Enter Withings Client Secret"
                                autoComplete="off"
                              />
                            </div>
                            <p className="text-sm text-muted-foreground col-span-2">
                              Withings integration uses OAuth2. You will be redirected to Withings to authorize access after adding the provider.
                              <br />
                              In your <a href="https://developer.withings.com/dashboard/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Withings Developer Dashboard</a>, you must set your callback URL to: <strong>`YOUR_SERVER_URL/api/withings/callback`</strong>.
                            </p>
                            <div>
                              <Label htmlFor="edit_sync_frequency">Sync Frequency</Label>
                              <Select
                                value={editData.sync_frequency || 'manual'}
                                onValueChange={(value) => setEditData(prev => ({ ...prev, sync_frequency: value as 'hourly' | 'daily' | 'manual' }))}
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
                          </>
                        )}
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={editData.is_active || false}
                            onCheckedChange={(checked) => setEditData(prev => ({ ...prev, is_active: checked }))}
                          />
                          <Label>Activate this provider</Label>
                        </div>
                        <div className="flex gap-2">
                          <Button type="submit" disabled={loading}>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                          </Button>
                          <Button type="button" variant="outline" onClick={cancelEditing}>
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </div>
                      </form>
                    ) : (
                      // View Mode
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium">{provider.provider_name}</h4>
                            {/* Show Private badge for owners. If owner has shared_with_public true, also show Family badge (like foods). */}
                            {(provider.visibility === 'private' || provider.user_id === user?.id) && (
                              <>
                                <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">Private</span>
                                {provider.shared_with_public && (
                                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded ml-2">Public</span>
                                )}
                              </>
                            )}
                            {/* For non-owners, show Public or Family as appropriate */}
                            {provider.user_id !== user?.id && provider.visibility === 'public' && (
                              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Public</span>
                            )}
                            {provider.user_id !== user?.id && provider.visibility === 'family' && (
                              <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Family</span>
                            )}
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">
                              {getProviderTypes().find(t => t.value === provider.provider_type)?.label || provider.provider_type}
                              {provider.provider_type === 'mealie' && provider.base_url && ` - URL: ${provider.base_url}`}
                              {(provider.provider_type !== 'mealie' && provider.provider_type !== 'free-exercise-db' && provider.provider_type !== 'wger') && provider.app_id && ` - App ID: ${provider.app_id.substring(0, 4)}...`}
                              {(provider.provider_type === 'mealie' || provider.provider_type === 'nutritionix' || provider.provider_type === 'fatsecret' || provider.provider_type === 'withings') && provider.app_key && ` - App Key: ${provider.app_key.substring(0, 4)}...`}
                              {provider.provider_type === 'withings' && (
                                <>
                                  {provider.has_token ? (
                                    <span className="text-green-500"> - Connected</span>
                                  ) : (
                                    <span className="text-red-500"> - Not Connected</span>
                                  )}
                                  {provider.last_sync_at && ` - Last Sync: ${new Date(provider.last_sync_at).toLocaleString()}`}
                                  {provider.sync_frequency && ` - Sync: ${provider.sync_frequency}`}
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={provider.is_active}
                              onCheckedChange={(checked) => handleToggleActive(provider.id, checked)}
                              disabled={loading}
                            />
                            {provider.visibility === 'private' ? (
                              <>
                                {provider.provider_type === 'withings' && provider.is_active && !provider.has_token && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleConnectWithings(provider.id)}
                                    disabled={loading}
                                  >
                                    Connect Withings
                                  </Button>
                                )}
                                {provider.provider_type === 'withings' && provider.is_active && provider.has_token && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleManualSync(provider.id)}
                                      disabled={loading}
                                    >
                                      Sync Now
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDisconnectWithings(provider.id)}
                                      disabled={loading}
                                    >
                                      Disconnect
                                    </Button>
                                  </>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => startEditing(provider)}
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
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      const newState = !provider.shared_with_public;
                                      await toggleProviderPublicSharing(provider.id, newState);
                                      toast({ title: 'Success', description: newState ? 'Provider shared publicly' : 'Provider made private' });
                                      loadProviders();
                                    } catch (err: any) {
                                      toast({ title: 'Error', description: err.message || 'Failed to update provider sharing', variant: 'destructive' });
                                    }
                                  }}
                                >
                                  {/* When provider is public, show a lock icon (indicates shared/locked), otherwise show Share icon */}
                                  {provider.shared_with_public ? <Lock className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                                </Button>
                              </>
                            ) : (
                              // For public or family-shared providers we don't allow edit/delete from the UI
                              <div className="text-xs text-muted-foreground px-2 py-1 rounded">Read-only</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {providers.length === 0 && !showAddForm && (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" /> {/* Changed icon */}
                  <p>No data providers configured yet.</p> {/* Changed message */}
                  <p className="text-sm">Add your first data provider to enable search from external sources.</p> {/* Changed message */}
                </div>
              )}
            </>
          )}

          {providers.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" /> {/* Changed icon */}
              <p>No data providers configured yet.</p> {/* Changed message */}
              <p className="text-sm">Add your first data provider to enable search from external sources.</p> {/* Changed message */}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExternalProviderSettings;