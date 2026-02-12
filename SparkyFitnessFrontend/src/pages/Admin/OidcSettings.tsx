import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type OidcProvider } from '../../api/Admin/oidcSettingsService';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Edit, Trash2, Lock } from 'lucide-react';
import {
  useCreateOidcProvider,
  useDeleteOidcProvider,
  useOidcProviders,
  useUpdateOidcProvider,
  useUploadOidcLogo,
} from '@/hooks/Admin/useOidcProvider';
import { ProviderDialog } from './OidcProviderDialog';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';

const OidcSettings: React.FC = () => {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<OidcProvider | null>(
    null
  );
  const { mutateAsync: createProvider } = useCreateOidcProvider();
  const { mutateAsync: updateProvider } = useUpdateOidcProvider();
  const { mutateAsync: deleteProvider } = useDeleteOidcProvider();
  const { mutateAsync: uploadLogo } = useUploadOidcLogo();
  const {
    data: providers,
    isLoading: loading,
    isError: error,
  } = useOidcProviders();

  const defaultProvider: OidcProvider = {
    issuer_url: '',
    client_id: '',
    redirect_uris: [],
    scope: 'openid profile email',
    token_endpoint_auth_method: 'client_secret_post',
    response_types: ['code'],
    is_active: true,
    signing_algorithm: 'RS256',
    profile_signing_algorithm: 'none',
    timeout: 30000,
    auto_register: false,
  };

  const handleAddNew = () => {
    setSelectedProvider(defaultProvider);
    setIsDialogOpen(true);
  };

  const handleEdit = (provider: OidcProvider) => {
    setSelectedProvider(provider);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('admin.oidcSettings.deleteConfirm', 'Are you sure?')))
      return;

    try {
      await deleteProvider(id);
      toast({
        title: t('success', 'Success'),
        description: t(
          'admin.oidcSettings.deleteSuccess',
          'OIDC provider deleted successfully.'
        ),
      });
    } catch (err: any) {
      toast({
        title: t('admin.oidcSettings.error', 'Error'),
        description: t(
          'admin.oidcSettings.deleteFailed',
          'Failed to delete OIDC provider.'
        ),
        variant: 'destructive',
      });
    }
  };

  const handleSave = async (provider: OidcProvider, logoFile?: File | null) => {
    try {
      let currentProvider = { ...provider };

      if (currentProvider.id) {
        if (logoFile) {
          try {
            const uploadResponse = await uploadLogo({
              id: currentProvider.id,
              file: logoFile,
            });
            currentProvider.logo_url = uploadResponse.logoUrl;
          } catch (uploadErr) {
            toast({
              title: t('admin.oidcSettings.error', 'Error'),
              description: t(
                'admin.oidcSettings.uploadFailed',
                'Failed to upload logo.'
              ),
              variant: 'destructive',
            });
            return;
          }
        }
        await updateProvider(currentProvider);
        toast({
          title: t('success', 'Success'),
          description: t(
            'admin.oidcSettings.updateSuccess',
            'OIDC provider updated successfully.'
          ),
        });
      } else {
        const newProvider = await createProvider(currentProvider);
        // provider id is only known after creating it. The upload logo function shouldn't take the id of the provider in the future. The mapping from provider to logo is down with url
        if (logoFile && newProvider.id) {
          try {
            const uploadResponse = await uploadLogo({
              id: newProvider.id,
              file: logoFile,
            });
            const providerToUpdate = {
              ...currentProvider,
              id: newProvider.id,
              logo_url: uploadResponse.logoUrl,
            };
            await updateProvider(providerToUpdate);
          } catch (uploadError) {
            console.error(uploadError);
            toast({
              title: t('warning', 'Warning'),
              description: t(
                'admin.oidcSettings.logoUploadFailed',
                'Provider created, but logo upload failed.'
              ),
              variant: 'destructive',
            });
          }
        }
        toast({
          title: t('success', 'Success'),
          description: t(
            'admin.oidcSettings.createSuccess',
            'OIDC provider created successfully.'
          ),
        });
      }

      setIsDialogOpen(false);
    } catch (err: any) {
      toast({
        title: t('admin.oidcSettings.error', 'Error'),
        description: t(
          'admin.oidcSettings.saveFailed',
          'Failed to save OIDC provider.'
        ),
        variant: 'destructive',
      });
    }
  };

  const handleToggleChange = (
    provider: OidcProvider,
    field: 'is_active' | 'auto_register'
  ) => {
    const updatedProvider = {
      ...provider,
      [field]: !provider[field],
    };
    updateProvider(updatedProvider, {
      onSuccess: () => {
        toast({
          title: t('success', 'Success'),
          description: t('admin.oidcSettings.statusUpdated', {
            field: field === 'is_active' ? 'status' : 'auto-register',
            defaultValue: `Provider ${field === 'is_active' ? 'status' : 'auto-register'} updated.`,
          }),
        });
      },
      onError: () => {
        toast({
          title: t('admin.oidcSettings.error', 'Error'),
          description: t(
            'admin.oidcSettings.failedToUpdateProvider',
            'Failed to update provider.'
          ),
          variant: 'destructive',
        });
      },
    });
  };

  if (loading)
    return (
      <div>
        {t('admin.oidcSettings.loadingProviders', 'Loading OIDC providers...')}
      </div>
    );
  if (error)
    return (
      <div className="text-red-500">
        {t('admin.oidcSettings.error', 'Error')}: {error}
      </div>
    );

  return (
    <Accordion type="multiple" className="w-full">
      <AccordionItem
        value="oidc-provider-settings"
        className="border rounded-lg"
      >
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t(
            'admin.authenticationSettings.oidcProviderManagement.description',
            'Configure your OpenID Connect (OIDC) providers.'
          )}
        >
          <Lock className="h-5 w-5" />
          {t(
            'admin.authenticationSettings.oidcProviderManagement.title',
            'OIDC Provider Management'
          )}
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0">
          <Card>
            <CardHeader>
              <CardTitle>
                {t('admin.oidcSettings.title', 'OIDC Authentication Providers')}
              </CardTitle>
              <CardDescription>
                {t(
                  'admin.oidcSettings.description',
                  'Manage OIDC providers for user authentication.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button onClick={handleAddNew}>
                  <PlusCircle className="mr-2 h-4 w-4" />{' '}
                  {t('admin.oidcSettings.addNewProvider', 'Add New Provider')}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('admin.oidcSettings.logo', 'Logo')}
                    </TableHead>
                    <TableHead>
                      {t('admin.oidcSettings.displayName', 'Display Name')}
                    </TableHead>
                    <TableHead>
                      {t('admin.oidcSettings.active', 'Active')}
                    </TableHead>
                    <TableHead>
                      {t('admin.oidcSettings.autoRegister', 'Auto Register')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('admin.oidcSettings.actions', 'Actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <img
                          src={provider.logo_url || '/oidc-logo.png'}
                          alt={`${provider.display_name} logo`}
                          className="h-8 w-8 object-contain"
                        />
                      </TableCell>
                      <TableCell>{provider.display_name}</TableCell>
                      <TableCell>
                        <Switch
                          checked={provider.is_active}
                          onCheckedChange={() =>
                            handleToggleChange(provider, 'is_active')
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={provider.auto_register}
                          onCheckedChange={() =>
                            handleToggleChange(provider, 'auto_register')
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(provider)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(provider.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isDialogOpen && selectedProvider && (
                <ProviderDialog
                  provider={selectedProvider}
                  onSave={handleSave}
                  onClose={() => setIsDialogOpen(false)}
                />
              )}
            </CardContent>
          </Card>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default OidcSettings;
