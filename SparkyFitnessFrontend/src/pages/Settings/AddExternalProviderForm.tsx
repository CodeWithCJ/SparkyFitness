import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Save, X } from 'lucide-react';
import type { ExternalDataProvider } from './ExternalProviderSettings';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  useConnectFitbitMutation,
  useConnectPolarMutation,
  useConnectStravaMutation,
  useConnectWithingsMutation,
  useLoginGarminMutation,
  useSyncHevyMutation,
} from '@/hooks/Integrations/useIntegrations';
import { useCreateExternalProviderMutation } from '@/hooks/Settings/useExternalProviderSettings';
import { getProviderTypes, validateProvider } from '@/utils/settings';
import { ProviderSpecificFields } from './ProviderSpecificFields';

interface AddExternalProviderFormProps {
  showAddForm: boolean;
  setShowAddForm: (show: boolean) => void;
  onAddSuccess: () => void;
  onGarminMfaRequired: (clientState: string) => void; // New prop for MFA handling
}

const AddExternalProviderForm = ({
  showAddForm,
  setShowAddForm,
  onAddSuccess,
  onGarminMfaRequired,
}: AddExternalProviderFormProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutateAsync: syncHevyData, isPending: isSyncingHevy } =
    useSyncHevyMutation();
  const { mutateAsync: loginGarmin, isPending: isLoggingInGarmin } =
    useLoginGarminMutation();
  const { mutateAsync: createExternalProvider, isPending: isCreatingProvider } =
    useCreateExternalProviderMutation();

  const { mutateAsync: handleConnectFitbit, isPending: isConnectingFitbit } =
    useConnectFitbitMutation();
  const { mutateAsync: handleConnectPolar, isPending: isConnectingPolar } =
    useConnectPolarMutation();
  const { mutateAsync: handleConnectStrava, isPending: isConnectingStrava } =
    useConnectStravaMutation();
  const {
    mutateAsync: handleConnectWithings,
    isPending: isConnectingWithings,
  } = useConnectWithingsMutation();

  const isAnyIntegrationPending =
    isSyncingHevy ||
    isLoggingInGarmin ||
    isCreatingProvider ||
    isConnectingFitbit ||
    isConnectingPolar ||
    isConnectingStrava ||
    isConnectingWithings;

  const [newProvider, setNewProvider] = useState<Partial<ExternalDataProvider>>(
    {
      provider_name: '',
      provider_type: 'openfoodfacts',
      app_id: '',
      app_key: '',
      is_active: false,
      base_url: '',
      sync_frequency: 'manual' as 'hourly' | 'daily' | 'manual',
      garmin_connect_status:
        'disconnected' as ExternalDataProvider['garmin_connect_status'],
      garmin_last_status_check: '',
      garmin_token_expires: '',
    }
  );
  const [fullSyncOnConnect, setFullSyncOnConnect] = useState(false);

  const connectionHandlers: Record<string, (id: string) => Promise<void>> = {
    withings: () => handleConnectWithings(),
    fitbit: () => handleConnectFitbit(),
    polar: (id) => handleConnectPolar(id),
    strava: () => handleConnectStrava(),
  };
  const handleAddProvider = async () => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'User not authenticated. Please log in again.',
        variant: 'destructive',
      });
      return;
    }

    const validationError = validateProvider(newProvider);
    if (validationError) {
      toast({
        title: 'Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }

    try {
      interface CreatedProvider {
        id: string;
        provider_type: string;
        is_active?: boolean;
      }

      let createdProvider: CreatedProvider;

      if (newProvider.provider_type === 'garmin') {
        const garminData = await loginGarmin({
          email: newProvider.app_id || '',
          password: newProvider.app_key || '',
        });

        if (garminData?.status === 'needs_mfa' && garminData?.client_state) {
          onGarminMfaRequired(garminData.client_state);
          toast({
            title: 'Garmin MFA Required',
            description:
              'Please complete Multi-Factor Authentication for Garmin.',
          });
          setShowAddForm(false);
          return;
        }

        if (garminData?.status !== 'success') {
          throw new Error(garminData?.error || 'Garmin login failed.');
        }

        createdProvider = garminData.provider as CreatedProvider;
      } else {
        createdProvider = await createExternalProvider({
          user_id: user.id,
          provider_name: newProvider.provider_name || '',
          provider_type: newProvider.provider_type || '',
          app_id: newProvider.app_id || null,
          app_key: newProvider.app_key || null,
          is_active: newProvider.is_active || false,
          base_url: newProvider.base_url || null,
          sync_frequency: newProvider.sync_frequency || null,
        });
      }

      if (newProvider.provider_type === 'hevy' && newProvider.is_active) {
        try {
          await syncHevyData({
            fullSync: fullSyncOnConnect,
            providerId: createdProvider.id,
          });
        } catch (error: unknown) {
          if (error instanceof Error) {
            console.error(error);
          }
        }
      }

      toast({
        title: 'Success',
        description: 'External data provider added successfully',
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

      if (
        createdProvider?.is_active &&
        connectionHandlers[createdProvider.provider_type]
      ) {
        connectionHandlers[createdProvider.provider_type](createdProvider.id);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(error);
        toast({
          title: 'Error',
          description: `Failed to add external data provider: ${error.message}`,
          variant: 'destructive',
        });
      }
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddProvider();
          }}
          className="border rounded-lg p-4 space-y-4"
        >
          <h3 className="text-lg font-medium">Add New Data Provider</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="new_provider_name">Provider Name</Label>
              <Input
                id="new_provider_name"
                value={newProvider.provider_name}
                onChange={(e) =>
                  setNewProvider((prev) => ({
                    ...prev,
                    provider_name: e.target.value,
                  }))
                }
                placeholder="My Provider name"
              />
            </div>
            <div>
              <Label htmlFor="new_provider_type">Provider Type</Label>
              <Select
                value={newProvider.provider_type}
                onValueChange={(value) =>
                  setNewProvider((prev) => ({
                    ...prev,
                    provider_type:
                      value as ExternalDataProvider['provider_type'],
                    app_id: '',
                    app_key: '',
                    base_url: '',
                    garmin_connect_status: 'disconnected',
                    garmin_last_status_check: '',
                    garmin_token_expires: '',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getProviderTypes().map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <ProviderSpecificFields
            provider={newProvider}
            setProvider={setNewProvider}
            fullSyncOnConnect={fullSyncOnConnect}
            setFullSyncOnConnect={setFullSyncOnConnect}
            onCopy={(text) => {
              navigator.clipboard.writeText(text);
              toast({
                title: 'Copied!',
                description: 'URL copied to clipboard.',
              });
            }}
          />
          <div className="flex items-center space-x-2">
            <Switch
              id="new_is_active"
              checked={newProvider.is_active}
              onCheckedChange={(checked) =>
                setNewProvider((prev) => ({ ...prev, is_active: checked }))
              }
            />
            <Label htmlFor="new_is_active">Activate this provider</Label>
          </div>

          <div className="flex gap-2">
            <Button disabled={isAnyIntegrationPending} type="submit">
              <Save className="h-4 w-4 mr-2" />
              {isAnyIntegrationPending ? 'Connecting...' : 'Add Provider'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddForm(false)}
            >
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
