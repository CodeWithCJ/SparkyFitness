import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Database } from 'lucide-react';
import AddExternalProviderForm from './AddExternalProviderForm';
import ExternalProviderList from './ExternalProviderList';
import GarminConnectSettings from './GarminConnectSettings';

export interface ExternalDataProvider {
  id: string;
  provider_name: string;
  provider_type:
    | 'openfoodfacts'
    | 'nutritionix'
    | 'fatsecret'
    | 'wger'
    | 'mealie'
    | 'free-exercise-db'
    | 'withings'
    | 'garmin'
    | 'tandoor'
    | 'usda'
    | 'fitbit'
    | 'polar'
    | 'hevy'
    | 'strava';
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
  fitbit_last_sync_at?: string;
  fitbit_token_expires?: string;
  polar_last_sync_at?: string;
  polar_token_expires?: string;
  hevy_last_sync_at?: string;
  hevy_connect_status?: 'connected' | 'disconnected';
  strava_last_sync_at?: string;
  strava_token_expires?: string;
  is_strictly_private?: boolean;
}

const ExternalProviderSettings = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showGarminMfaInputFromAddForm, setShowGarminMfaInputFromAddForm] =
    useState(false);
  const [garminClientStateFromAddForm, setGarminClientStateFromAddForm] =
    useState<string | null>(null);

  const handleAddProviderSuccess = () => {
    setShowAddForm(false);
  };

  const handleGarminMfaRequiredFromAddForm = (clientState: string) => {
    setShowGarminMfaInputFromAddForm(true);
    setGarminClientStateFromAddForm(clientState);
  };

  return (
    <>
      <Separator />
      <h3 className="text-lg font-medium">
        Configured External Data Providers
      </h3>
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
              onGarminMfaRequired={handleGarminMfaRequiredFromAddForm}
            />

            {showGarminMfaInputFromAddForm && garminClientStateFromAddForm && (
              <GarminConnectSettings
                key={garminClientStateFromAddForm || 'default'}
                initialClientState={garminClientStateFromAddForm}
                onMfaComplete={() => {
                  setShowGarminMfaInputFromAddForm(false);
                  setGarminClientStateFromAddForm(null);
                }}
              />
            )}

            <ExternalProviderList showAddForm={showAddForm} />
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ExternalProviderSettings;
