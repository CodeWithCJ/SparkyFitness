import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

import { Database } from 'lucide-react';
import AddExternalProviderForm from './AddExternalProviderForm';
import ExternalProviderList from './ExternalProviderList';
import GarminConnectSettings from './GarminConnectSettings';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useExternalProviders } from '@/hooks/Settings/useExternalProviderSettings';
import { useAuth } from '@/hooks/useAuth';

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

const BARCODE_PROVIDER_TYPES = ['openfoodfacts', 'usda'];

const ExternalProviderSettings = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showGarminMfaInputFromAddForm, setShowGarminMfaInputFromAddForm] =
    useState(false);
  const [garminClientStateFromAddForm, setGarminClientStateFromAddForm] =
    useState<string | null>(null);
  const { user } = useAuth();
  const {
    defaultBarcodeProviderId,
    setDefaultBarcodeProviderId,
    saveAllPreferences,
  } = usePreferences();
  const { data: providers = [] } = useExternalProviders(user?.activeUserId);

  const barcodeProviders = providers.filter(
    (p) => p.is_active && BARCODE_PROVIDER_TYPES.includes(p.provider_type)
  );

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

            {barcodeProviders.length > 0 && (
              <>
                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="barcode-provider">Barcode (mobile app)</Label>
                  <Select
                    value={defaultBarcodeProviderId ?? ''}
                    onValueChange={(value) => {
                      const id = value || null;
                      setDefaultBarcodeProviderId(id);
                      saveAllPreferences({ defaultBarcodeProviderId: id });
                    }}
                  >
                    <SelectTrigger id="barcode-provider">
                      <SelectValue placeholder="Select a barcode provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {barcodeProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.provider_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ExternalProviderSettings;
