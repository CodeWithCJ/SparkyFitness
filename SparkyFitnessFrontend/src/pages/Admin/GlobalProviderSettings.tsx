import { useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Database } from 'lucide-react';
import AddExternalProviderForm from '../Settings/AddExternalProviderForm';
import ExternalProviderList from '../Settings/ExternalProviderList';

const GlobalProviderSettings = () => {
  const [showAddForm, setShowAddForm] = useState(false);

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
