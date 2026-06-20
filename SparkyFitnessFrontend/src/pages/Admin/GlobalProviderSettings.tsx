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
        className="border rounded-lg px-6 bg-card"
      >
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2 rounded-md bg-primary/10 text-primary">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                Global Data Providers
              </h2>
              <p className="text-sm text-muted-foreground font-normal mt-0.5">
                Configure instance-level API keys and endpoints for food and
                exercise libraries.
              </p>
            </div>
          </div>
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
