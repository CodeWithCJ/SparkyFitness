import { Database } from 'lucide-react';
import type { ExternalDataProvider } from './ExternalProviderSettings';
import {
  useExternalProviders,
  useUpdateExternalProviderMutation,
} from '@/hooks/Settings/useExternalProviderSettings';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { EditProviderForm } from './EditProviderForm';
import { ProviderCard } from './ProviderCard';

interface ExternalProviderListProps {
  showAddForm: boolean;
}

const ExternalProviderList = ({ showAddForm }: ExternalProviderListProps) => {
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<ExternalDataProvider>>({});
  const { user } = useAuth();
  const { defaultFoodDataProviderId, setDefaultFoodDataProviderId } =
    usePreferences();
  const { data: providers = [], isLoading: providersLoading } =
    useExternalProviders(user.activeUserId);

  const { mutateAsync: updateExternalProvider, isPending: updatePending } =
    useUpdateExternalProviderMutation();

  const loading = providersLoading || updatePending;

  const handleUpdateProvider = async (providerId: string) => {
    const providerUpdateData: Partial<ExternalDataProvider> = {
      provider_name: editData.provider_name,
      provider_type: editData.provider_type,
      app_id:
        editData.provider_type === 'mealie' ||
        editData.provider_type === 'tandoor' ||
        editData.provider_type === 'free-exercise-db' ||
        editData.provider_type === 'wger'
          ? null
          : editData.app_id || null,
      app_key: editData.app_key || null,
      is_active: editData.is_active,
      base_url:
        editData.provider_type === 'mealie' ||
        editData.provider_type === 'tandoor' ||
        editData.provider_type === 'free-exercise-db'
          ? editData.base_url || null
          : null,
      withings_last_sync_at:
        editData.provider_type === 'withings'
          ? editData.withings_last_sync_at
          : null,
      withings_token_expires:
        editData.provider_type === 'withings'
          ? editData.withings_token_expires
          : null,
      fitbit_last_sync_at:
        editData.provider_type === 'fitbit'
          ? editData.fitbit_last_sync_at
          : null,
      fitbit_token_expires:
        editData.provider_type === 'fitbit'
          ? editData.fitbit_token_expires
          : null,
      polar_last_sync_at:
        editData.provider_type === 'polar' ? editData.polar_last_sync_at : null,
      polar_token_expires:
        editData.provider_type === 'polar'
          ? editData.polar_token_expires
          : null,
      strava_last_sync_at:
        editData.provider_type === 'strava'
          ? editData.strava_last_sync_at
          : null,
      strava_token_expires:
        editData.provider_type === 'strava'
          ? editData.strava_token_expires
          : null,
      sync_frequency:
        editData.provider_type === 'withings' ||
        editData.provider_type === 'garmin' ||
        editData.provider_type === 'fitbit' ||
        editData.provider_type === 'hevy' ||
        editData.provider_type === 'strava' ||
        editData.provider_type === 'polar'
          ? editData.sync_frequency
          : null,
    };

    try {
      const data = await updateExternalProvider({
        id: providerId,
        data: providerUpdateData,
      });
      setEditData({});
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('Error updating external data provider:', error);
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
      fitbit_last_sync_at: provider.fitbit_last_sync_at || '',
      fitbit_token_expires: provider.fitbit_token_expires || '',
      polar_last_sync_at: provider.polar_last_sync_at || '',
      polar_token_expires: provider.polar_token_expires || '',
    });
  };

  const cancelEditing = () => {
    setEditingProvider(null);
    setEditData({});
  };

  if (providers.length === 0 && !showAddForm) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No data providers configured yet.</p>
        <p className="text-sm">
          Add your first data provider to enable search from external sources.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <div key={provider.id} className="border rounded-lg p-4">
          {editingProvider === provider.id ? (
            // Edit Mode
            <EditProviderForm
              provider={provider}
              editData={editData}
              setEditData={setEditData}
              onSubmit={handleUpdateProvider}
              onCancel={cancelEditing}
              loading={loading}
            />
          ) : (
            // View Mode
            <ProviderCard
              provider={provider}
              isLoading={loading}
              startEditing={startEditing}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ExternalProviderList;
