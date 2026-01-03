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
import GarminSyncProgress from './GarminSyncProgress';
import HistoricalImportDialog from './HistoricalImportDialog';
import {
  getSyncStatus,
  startIncrementalSync,
  startHistoricalSync,
  resumeSync,
  cancelSync,
  SyncStatus
} from '@/services/garminSyncService';

export interface ExternalDataProvider {
  id: string;
  provider_name: string;
  provider_type: 'openfoodfacts' | 'nutritionix' | 'fatsecret' | 'wger' | 'mealie' | 'free-exercise-db' | 'withings' | 'garmin' | 'tandoor' | 'usda';
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
  const [garminSyncStatus, setGarminSyncStatus] = useState<SyncStatus | null>(null);
  const [showHistoricalImport, setShowHistoricalImport] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

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

  // Poll for Garmin sync status
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    const pollStatus = async () => {
      try {
        const status = await getSyncStatus();
        setGarminSyncStatus(status);

        // Stop polling if no active job
        if (!status.hasActiveJob && interval) {
          clearInterval(interval);
          interval = null;
          loadProviders(); // Refresh provider list on completion
        }
      } catch (error) {
        console.error('Error polling sync status:', error);
      }
    };

    // Initial fetch
    pollStatus();

    // Start polling if there might be an active job
    if (providers.some(p => p.provider_type === 'garmin')) {
      interval = setInterval(pollStatus, 3000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [providers.length]);

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
    setSyncLoading(true);
    try {
      const result = await startIncrementalSync();

      if (result.status === 'started') {
        toast({
          title: "Sync Started",
          description: result.message,
        });
      } else if (result.status === 'already_running') {
        toast({
          title: "Sync In Progress",
          description: "A sync is already running.",
        });
      } else if (result.status === 'up_to_date') {
        toast({
          title: "Already Synced",
          description: "Your data is already up to date.",
        });
      }
    } catch (error: any) {
      console.error('Error starting Garmin sync:', error);
      toast({
        title: "Error",
        description: `Failed to start sync: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleStartHistoricalImport = async (startDate: string, endDate: string, skipExisting: boolean): Promise<boolean> => {
    setSyncLoading(true);
    try {
      const result = await startHistoricalSync(startDate, endDate, skipExisting);

      if (result.status === 'started') {
        toast({
          title: "Historical Import Started",
          description: `Importing ${result.chunksTotal} chunks (est. ${result.estimatedMinutes} min)`,
        });
        // Don't close dialog - let it show progress
        // Trigger immediate status poll to pick up the new job
        setTimeout(async () => {
          try {
            const status = await getSyncStatus();
            setGarminSyncStatus(status);
          } catch (e) {
            console.error('Error polling after start:', e);
          }
        }, 500);
        return true;
      } else if (result.status === 'already_running') {
        toast({
          title: "Sync In Progress",
          description: "Please wait for the current sync to complete.",
          variant: "destructive",
        });
        return false;
      }
      return false;
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to start import: ${error.message}`,
        variant: "destructive",
      });
      return false;
    } finally {
      setSyncLoading(false);
    }
  };

  const handleResumeSync = async () => {
    if (!garminSyncStatus?.job?.id) return;
    setSyncLoading(true);
    try {
      await resumeSync(garminSyncStatus.job.id);
      toast({ title: "Sync Resumed" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to resume: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSyncLoading(false);
    }
  };

  const handleCancelSync = async () => {
    if (!garminSyncStatus?.job?.id) return;
    setSyncLoading(true);
    try {
      await cancelSync(garminSyncStatus.job.id);
      toast({ title: "Sync Cancelled" });
      setGarminSyncStatus(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: `Failed to cancel: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setSyncLoading(false);
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
    { value: "usda", label: "USDA" },
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
                garminSyncStatus={garminSyncStatus}
                onHistoricalImport={() => setShowHistoricalImport(true)}
                onResumeSync={handleResumeSync}
                onCancelSync={handleCancelSync}
                syncLoading={syncLoading}
                lastSuccessfulSync={garminSyncStatus?.lastSuccessfulSync}
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
      <HistoricalImportDialog
        open={showHistoricalImport}
        onClose={() => setShowHistoricalImport(false)}
        onStart={handleStartHistoricalImport}
        loading={syncLoading}
      />
    </div>
  );
};

export default ExternalProviderSettings;