import { useState } from 'react';
import { Database } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';
import AddExternalProviderForm from '../Settings/AddExternalProviderForm';
import ExternalProviderList from '../Settings/ExternalProviderList';
import { OpenFoodFactsAdminContributionSettings } from './OpenFoodFactsAdminContributionSettings';

const GlobalProviderSettings = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const { data: globalSettings, isLoading: settingsLoading } = useSettings();
  const { mutate: updateSettings } = useUpdateSettings();

  const handleAddSuccess = () => {
    setShowAddForm(false);
  };

  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem
        value="global-provider-settings"
        className="border rounded-lg"
      >
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description="Configure instance-level API keys and endpoints for food and exercise libraries."
        >
          <Database className="h-5 w-5" />
          Global Data Providers
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-6 space-y-6">
          <div className="text-sm text-muted-foreground bg-muted/40 border p-4 rounded-lg leading-relaxed">
            Global providers are shared transparently across the instance. When
            users search for foods or exercises, active global providers (e.g.
            USDA Food Database) will be queried automatically using the system
            keys. OAuth-based connections with personal user accounts (e.g.
            Garmin, Strava) cannot be added globally.
          </div>

          {globalSettings && (
            <div className="flex items-center justify-between p-4 border rounded-md">
              <div className="flex-1">
                <Label
                  htmlFor="allow_private_network_food_providers"
                  className="font-medium"
                >
                  Allow Private / LAN Recipe Providers
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Allow non-admin users to connect custom recipe providers (e.g.
                  Mealie, Tandoor) to private LAN IP addresses.
                </p>
              </div>
              <Switch
                id="allow_private_network_food_providers"
                checked={
                  globalSettings.allow_private_network_food_providers === true
                }
                onCheckedChange={(checked) => {
                  updateSettings({
                    ...globalSettings,
                    allow_private_network_food_providers: checked,
                  });
                }}
                disabled={settingsLoading}
              />
            </div>
          )}

          {globalSettings && (
            <div className="flex items-center justify-between p-4 border rounded-md">
              <div className="flex-1">
                <Label htmlFor="mock_data_enabled" className="font-medium">
                  Allow Local Provider Response Capture
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Adds two options to the provider sync dialog, for admins only:
                  save a provider&apos;s raw responses to a JSON file on the
                  server, and replay that file instead of calling the provider.
                  Intended for collecting a sample to share when troubleshooting
                  a sync. The captured file is stored per provider rather than
                  per user, so turn this back off once you have what you need.
                </p>
              </div>
              <Switch
                id="mock_data_enabled"
                checked={globalSettings.mock_data_enabled === true}
                onCheckedChange={(checked) => {
                  updateSettings({
                    ...globalSettings,
                    mock_data_enabled: checked,
                  });
                }}
                disabled={settingsLoading}
              />
            </div>
          )}

          <OpenFoodFactsAdminContributionSettings />

          <AddExternalProviderForm
            showAddForm={showAddForm}
            setShowAddForm={setShowAddForm}
            onAddSuccess={handleAddSuccess}
            isAdminMode={true}
          />

          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-muted-foreground">
              Configured Global Providers
            </h3>
            <ExternalProviderList
              showAddForm={showAddForm}
              isAdminMode={true}
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default GlobalProviderSettings;
