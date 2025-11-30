import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Database } from "lucide-react";
import { apiCall } from '@/services/api';
import { toggleProviderPublicSharing } from '@/services/externalProviderService';
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext";
import AddExternalProviderForm from "./AddExternalProviderForm";
import ExternalProviderList from "./ExternalProviderList";
import GarminConnectSettings from "./GarminConnectSettings";

export interface ExternalDataProvider {
  id: string;
  provider_name: string;
  provider_type: 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'free-exercise-db' | 'withings' | 'garmin' | 'tandoor';
  app_id: string | null;
  app_key: string | null;
  is_active: boolean;
  base_url: string | null;
  user_id?: string;
  visibility: 'private' | 'public' | 'family';
  shared_with_public?: boolean;
  last_sync_at?: string; // Generic last sync for providers that don't have specific fields
  sync_frequency?: 'hourly' | 'daily' | 'manual';
  has_token?: boolean;
  garmin_connect_status?: 'linked' | 'connected' | 'disconnected';
  garmin_last_status_check?: string;
  garmin_token_expires?: string;
  withings_last_sync_at?: string;
  withings_token_expires?: string;
}

const ExternalProviderSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { defaultFoodDataProviderId, setDefaultFoodDataProviderId } = usePreferences();
  const [providers, setProviders] = useState<ExternalDataProvider[]>([]);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ExternalDataProvider>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showGarminMfaInputFromAddForm, setShowGarminMfaInputFromAddForm] = useState(false);
  const [garminClientStateFromAddForm, setGarminClientStateFromAddForm] = useState<string | null>(null);

  const loadProviders = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const providersData = await apiCall('/external-providers', {
        method: 'GET',
        suppress404Toast: true,
      });

      const updatedProviders = await Promise.all(providersData.map(async (provider: any) => {
        if (provider.provider_type === 'garmin') {
          try {
            const garminStatus = await apiCall('/integrations/garmin/status');
            return {
              ...provider,
              provider_type: provider.provider_type as ExternalDataProvider['provider_type'],
              garmin_connect_status: garminStatus.isLinked ? 'linked' : 'disconnected',
              garmin_last_status_check: garminStatus.lastUpdated,
              garmin_token_expires: garminStatus.tokenExpiresAt,
            };
          } catch (garminError) {
            console.error('Failed to fetch Garmin specific status for provider:', provider.id, garminError);
            return {
              ...provider,
              provider_type: provider.provider_type as ExternalDataProvider['provider_type'],
              garmin_connect_status: 'disconnected',
            };
          }
        }
        return {
          ...provider,
          provider_type: provider.provider_type as ExternalDataProvider['provider_type'],
          garmin_connect_status: provider.garmin_connect_status || 'disconnected',
        };
      }));

      const withingsProviders = updatedProviders.filter((p: ExternalDataProvider) => p.provider_type === 'withings' && p.has_token);
      if (withingsProviders.length > 0) {
        const withingsStatusPromises = withingsProviders.map(async (provider: ExternalDataProvider) => {
          try {
            const withingsStatus = await apiCall(`/withings/status`, {
              method: 'GET',
              params: { providerId: provider.id }
            });
            return {
              ...provider,
              withings_last_sync_at: withingsStatus.lastSyncAt,
              withings_token_expires: withingsStatus.tokenExpiresAt,
            };
          } catch (withingsError) {
            console.error('Failed to fetch Withings specific status for provider:', provider.id, withingsError);
            return provider; // Return original provider if status fetch fails
          }
        });
        const updatedWithingsProviders = await Promise.all(withingsStatusPromises);
        const finalProviders = updatedProviders.map(p => {
          const updatedProvider = updatedWithingsProviders.find(up => up.id === p.id);
          return updatedProvider || p;
        });
        setProviders(finalProviders || []);
      } else {
        setProviders(updatedProviders || []);
      }
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
  }, [user, toast]);

  useEffect(() => {
    if (user) {
      loadProviders();
    }
  }, [user, loadProviders, setDefaultFoodDataProviderId]);

  const handleAddProviderSuccess = () => {
    setShowAddForm(false);
    loadProviders();
  };

  const handleGarminMfaRequiredFromAddForm = (clientState: string) => {
    setShowGarminMfaInputFromAddForm(true);
    setGarminClientStateFromAddForm(clientState);
  };

  const handleUpdateProvider = async (providerId: string) => {
    setLoading(true);
    const providerUpdateData: Partial<ExternalDataProvider> = {
      provider_name: editData.provider_name,
      provider_type: editData.provider_type,
      app_id: (editData.provider_type === 'mealie' || editData.provider_type === 'tandoor' || editData.provider_type === 'free-exercise-db' || editData.provider_type === 'wger') ? null : editData.app_id || null,
      app_key: editData.app_key || null,
      is_active: editData.is_active,
      base_url: (editData.provider_type === 'mealie' || editData.provider_type === 'tandoor' || editData.provider_type === 'free-exercise-db') ? editData.base_url || null : null,
      sync_frequency: (editData.provider_type === 'withings' || editData.provider_type === 'garmin') ? editData.sync_frequency : null,
      garmin_connect_status: editData.provider_type === 'garmin' ? editData.garmin_connect_status : null,
      garmin_last_status_check: editData.provider_type === 'garmin' ? editData.garmin_last_status_check : null,
      garmin_token_expires: editData.provider_type === 'garmin' ? editData.garmin_token_expires : null,
      withings_last_sync_at: editData.provider_type === 'withings' ? editData.withings_last_sync_at : null,
      withings_token_expires: editData.provider_type === 'withings' ? editData.withings_token_expires : null,
    };

    try {
      const data = await apiCall(`/external-providers/${providerId}`, {
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
      if (data && data.is_active && (data.provider_type === 'openfoodfacts' || data.provider_type === 'nutritionix' || data.provider_type === 'fatsecret' || data.provider_type === 'mealie' || data.provider_type === 'tandoor')) {
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
    if (!confirm('Are you sure you want to delete this external data provider?')) return;

    setLoading(true);
    try {
      await apiCall(`/external-providers/${providerId}`, {
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
      const data = await apiCall(`/external-providers/${providerId}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: isActive }),
      });

      toast({
        title: "Success",
        description: `External data provider ${isActive ? 'activated' : 'deactivated'}`
      });
      loadProviders();
      if (data && data.is_active && (data.provider_type === 'openfoodfacts' || data.provider_type === 'nutritionix' || data.provider_type === 'fatsecret' || data.provider_type === 'mealie' || data.provider_type === 'tandoor')) {
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
      const response = await apiCall(`/api/withings/authorize`, {
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

  const handleConnectGarmin = async (providerId: string) => {
    setLoading(true);
    try {
      // Placeholder for Garmin connection logic
      // This would typically redirect to Garmin Connect for OAuth
      toast({
        title: "Info",
        description: "Garmin connection flow initiated (placeholder)."
      });
      loadProviders(); // Reload to reflect potential status changes
    } catch (error: any) {
      console.error('Error connecting to Garmin:', error);
      toast({
        title: "Error",
        description: `Failed to connect to Garmin: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectGarmin = async (providerId: string) => {
    if (!confirm('Are you sure you want to disconnect from Garmin? This will revoke access and delete all associated tokens.')) return;

    setLoading(true);
    try {
      // Call the Garmin unlink endpoint
      await apiCall(`/integrations/garmin/unlink`, {
        method: 'POST',
      });
      toast({
        title: "Success",
        description: "Disconnected from Garmin successfully."
      });
      loadProviders();
    } catch (error: any) {
      console.error('Error disconnecting from Garmin:', error);
      toast({
        title: "Error",
        description: `Failed to disconnect from Garmin: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleManualSyncGarmin = async (providerId: string) => {
    setLoading(true);
    try {
      const today = new Date();
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);

      const startDate = sevenDaysAgo.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];

      // Sync health and wellness data
      await apiCall(`/integrations/garmin/sync/health_and_wellness`, {
        method: 'POST',
        body: JSON.stringify({
          startDate,
          endDate,
          // metricTypes are now optional, the backend will fetch all available if not provided
        }),
      });

      // Sync activities and workouts data
      await apiCall(`/integrations/garmin/sync/activities_and_workouts`, {
        method: 'POST',
        body: JSON.stringify({
          startDate,
          endDate,
          // activityType is optional, the backend will fetch all available if not provided
        }),
      });
      toast({
        title: "Success",
        description: "Garmin data synchronization initiated."
      });
      loadProviders();
    } catch (error: any) {
      console.error('Error initiating manual Garmin sync:', error);
      toast({
        title: "Error",
        description: `Failed to initiate manual Garmin sync: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (provider: ExternalDataProvider) => {
    setEditingProvider(provider.id);
    setEditData({
      provider_name: provider.provider_name,
      provider_type: provider.provider_type,
      app_id: provider.app_id || '',
      // Never pre-fill API keys when editing for security/privacy
      app_key: '',
      is_active: provider.is_active,
      base_url: provider.base_url || '',
      last_sync_at: provider.last_sync_at || null,
      sync_frequency: provider.sync_frequency || 'manual',
      garmin_connect_status: provider.garmin_connect_status || 'disconnected',
      garmin_last_status_check: provider.garmin_last_status_check || '',
      garmin_token_expires: provider.garmin_token_expires || '',
      withings_last_sync_at: provider.withings_last_sync_at || '',
      withings_token_expires: provider.withings_token_expires || '',
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
    { value: "free-exercise-db", label: "Free Exercise DB" },
    { value: "mealie", label: "Mealie" },
    { value: "tandoor", label: "Tandoor" },
    { value: "withings", label: "Withings" },
    { value: "garmin", label: "Garmin" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            External Data Providers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AddExternalProviderForm
            showAddForm={showAddForm}
            setShowAddForm={setShowAddForm}
            onAddSuccess={handleAddProviderSuccess}
            loading={loading}
            getProviderTypes={getProviderTypes}
            handleConnectWithings={handleConnectWithings}
            onGarminMfaRequired={handleGarminMfaRequiredFromAddForm}
          />

          {showGarminMfaInputFromAddForm && garminClientStateFromAddForm && (
            <GarminConnectSettings
              initialClientState={garminClientStateFromAddForm}
              onMfaComplete={() => {
                setShowGarminMfaInputFromAddForm(false);
                setGarminClientStateFromAddForm(null);
                loadProviders();
              }}
              onStatusChange={loadProviders}
            />
          )}
 
           {providers.length > 0 && (
             <>
               <Separator />
              <h3 className="text-lg font-medium">Configured External Data Providers</h3>

              <ExternalProviderList
                providers={providers}
                editingProvider={editingProvider}
                editData={editData}
                loading={loading}
                user={user}
                handleUpdateProvider={handleUpdateProvider}
                setEditData={setEditData}
                getProviderTypes={getProviderTypes}
                handleToggleActive={handleToggleActive}
                handleConnectWithings={handleConnectWithings}
                handleManualSync={handleManualSync}
                handleDisconnectWithings={handleDisconnectWithings}
                handleManualSyncGarmin={handleManualSyncGarmin}
                handleDisconnectGarmin={handleDisconnectGarmin}
                startEditing={startEditing}
                handleDeleteProvider={handleDeleteProvider}
                toggleProviderPublicSharing={toggleProviderPublicSharing}
                loadProviders={loadProviders}
                toast={toast}
                cancelEditing={cancelEditing}
              />
            </>
          )}

          {providers.length === 0 && !showAddForm && (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No data providers configured yet.</p>
              <p className="text-sm">Add your first data provider to enable search from external sources.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExternalProviderSettings;