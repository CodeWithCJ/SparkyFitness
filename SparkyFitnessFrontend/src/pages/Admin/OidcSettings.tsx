import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { oidcSettingsService, type OidcProvider } from '../../services/oidcSettingsService';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PlusCircle, Edit, Trash2, ClipboardCopy } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";

const OidcSettings: React.FC = () => {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<OidcProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<OidcProvider | null>(null);

  const fetchProviders = useCallback(async () => {
    try {
      setLoading(true);
      const fetchedProviders = await oidcSettingsService.getProviders();
      setProviders(fetchedProviders);
    } catch (err: any) {
      setError(err.message || t('admin.oidcSettings.errorLoadingProviders', 'Failed to fetch OIDC providers.'));
      toast({ title: t('admin.oidcSettings.error', 'Error'), description: t('admin.oidcSettings.errorLoadingProviders', 'Failed to fetch OIDC providers.'), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  const handleAddNew = () => {
    setSelectedProvider({
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
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (provider: OidcProvider) => {
    setSelectedProvider(provider);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm(t('admin.oidcSettings.deleteConfirm', 'Are you sure you want to delete this provider?'))) {
      try {
        await oidcSettingsService.deleteProvider(id);
        toast({ title: t('success', 'Success'), description: t('admin.oidcSettings.deleteSuccess', 'OIDC provider deleted successfully.') });
        fetchProviders();
      } catch (err: any) {
        toast({ title: t('admin.oidcSettings.error', 'Error'), description: t('admin.oidcSettings.deleteFailed', 'Failed to delete OIDC provider.'), variant: "destructive" });
      }
    }
  };

  const handleSave = async (provider: OidcProvider) => {
    try {
      if (provider.id) {
        await oidcSettingsService.updateProvider(provider.id, provider);
        toast({ title: t('success', 'Success'), description: t('admin.oidcSettings.updateSuccess', 'OIDC provider updated successfully.') });
      } else {
        await oidcSettingsService.createProvider(provider);
        toast({ title: t('success', 'Success'), description: t('admin.oidcSettings.createSuccess', 'OIDC provider created successfully.') });
      }
      setIsDialogOpen(false);
      fetchProviders();
    } catch (err: any) {
      toast({ title: t('admin.oidcSettings.error', 'Error'), description: t('admin.oidcSettings.saveFailed', 'Failed to save OIDC provider.'), variant: "destructive" });
    }
  };

  const handleToggleChange = async (provider: OidcProvider, field: 'is_active' | 'auto_register') => {
    const updatedProvider = { ...provider, [field]: !(provider[field] || false) };
    try {
      await oidcSettingsService.updateProvider(updatedProvider.id!, updatedProvider);
      toast({ title: t('success', 'Success'), description: t('admin.oidcSettings.statusUpdated', { field: field === 'is_active' ? 'status' : 'auto-register', defaultValue: `Provider ${field === 'is_active' ? 'status' : 'auto-register'} updated.` }) });
      fetchProviders();
    } catch (err: any) {
      toast({ title: t('admin.oidcSettings.error', 'Error'), description: t('admin.oidcSettings.failedToUpdateProvider', 'Failed to update provider.'), variant: "destructive" });
    }
  };

  if (loading) return <div>{t('admin.oidcSettings.loadingProviders', 'Loading OIDC providers...')}</div>;
  if (error) return <div className="text-red-500">{t('admin.oidcSettings.error', 'Error')}: {error}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.oidcSettings.title', 'OIDC Authentication Providers')}</CardTitle>
        <CardDescription>{t('admin.oidcSettings.description', 'Manage OIDC providers for user authentication.')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-4">
          <Button onClick={handleAddNew}>
            <PlusCircle className="mr-2 h-4 w-4" /> {t('admin.oidcSettings.addNewProvider', 'Add New Provider')}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.oidcSettings.logo', 'Logo')}</TableHead>
              <TableHead>{t('admin.oidcSettings.displayName', 'Display Name')}</TableHead>
              <TableHead>{t('admin.oidcSettings.active', 'Active')}</TableHead>
              <TableHead>{t('admin.oidcSettings.autoRegister', 'Auto Register')}</TableHead>
              <TableHead className="text-right">{t('admin.oidcSettings.actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((provider) => (
              <TableRow key={provider.id}>
                <TableCell>
                  <img src={provider.logo_url || '/oidc-logo.png'} alt={`${provider.display_name} logo`} className="h-8 w-8 object-contain" />
                </TableCell>
                <TableCell>{provider.display_name}</TableCell>
                <TableCell>
                  <Switch
                    checked={provider.is_active}
                    onCheckedChange={() => handleToggleChange(provider, 'is_active')}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={provider.auto_register}
                    onCheckedChange={() => handleToggleChange(provider, 'auto_register')}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(provider)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(provider.id!)}>
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
  );
};

const ProviderDialog: React.FC<{ provider: OidcProvider; onSave: (provider: OidcProvider) => void; onClose: () => void; }> = ({ provider, onSave, onClose }) => {
  const { t } = useTranslation();
  const [editedProvider, setEditedProvider] = useState<OidcProvider>(provider);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isManualRedirectUri, setIsManualRedirectUri] = useState(false);
  const [baseUrlOverride, setBaseUrlOverride] = useState('');

  const suffix = `/api/auth/sso/callback/${editedProvider.provider_id || 'YOUR_ID'}`;

  // Initialize baseUrlOverride if provider has a custom one
  useEffect(() => {
    if (provider.redirect_uris?.[0]) {
      try {
        const url = new URL(provider.redirect_uris[0]);
        const defaultOrigin = window.location.origin;
        if (url.origin !== defaultOrigin) {
          setIsManualRedirectUri(true);
          setBaseUrlOverride(url.origin);
        }
      } catch (e) {
        // Not a standard URL, might be relative or malformed
      }
    }
  }, [provider]);

  // Sync the actual provider field whenever inputs change
  useEffect(() => {
    const base = isManualRedirectUri ? (baseUrlOverride || window.location.origin) : window.location.origin;
    // ensure no trailing slash
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const fullUri = `${cleanBase}${suffix}`;

    if (editedProvider.redirect_uris?.[0] !== fullUri) {
      setEditedProvider(prev => ({
        ...prev,
        redirect_uris: [fullUri]
      }));
    }
  }, [baseUrlOverride, isManualRedirectUri, suffix, editedProvider.redirect_uris]);

  const handleResetToDefaults = () => {
    setEditedProvider(prev => ({
      ...prev,
      scope: 'openid profile email',
      token_endpoint_auth_method: 'client_secret_post',
      response_types: ['code'],
      signing_algorithm: 'RS256',
      profile_signing_algorithm: 'none',
      timeout: 30000,
    }));
    toast({ title: t('admin.oidcSettings.defaultsRestored', 'Defaults Restored'), description: t('admin.oidcSettings.defaultsRestored', 'OIDC provider fields have been reset to their default values.') });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    if (id === 'redirect_uris') {
      setEditedProvider(prev => ({ ...prev, [id]: value.split(',').map(uri => uri.trim()) }));
    } else {
      setEditedProvider(prev => ({ ...prev, [id]: value }));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0]);
    }
  };

  const handleSwitchChange = (id: string, checked: boolean) => {
    setEditedProvider(prev => ({ ...prev, [id]: checked }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let providerToSave = { ...editedProvider };

    if (logoFile && providerToSave.id) {
      try {
        const uploadResponse = await oidcSettingsService.uploadLogo(providerToSave.id, logoFile);
        providerToSave.logo_url = uploadResponse.logoUrl;
      } catch (err) {
        toast({ title: t('admin.oidcSettings.error', 'Error'), description: t('admin.oidcSettings.uploadFailed', 'Failed to upload logo.'), variant: "destructive" });
        return; // Stop the save process if logo upload fails
      }
    }
    onSave(providerToSave);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editedProvider.id ? t('admin.oidcSettings.editProvider', 'Edit OIDC Provider') : t('admin.oidcSettings.addProvider', 'Add OIDC Provider')}</DialogTitle>
            <DialogDescription>{t('admin.oidcSettings.fillDetails', 'Fill in the details for the OIDC provider.')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="provider_id">{t('admin.oidcSettings.providerId', 'Provider ID (Slug)')}</Label>
                <Input id="provider_id" value={editedProvider.provider_id || ''} onChange={handleChange} placeholder="e.g. authentik, google, keycloak" />
                <p className="text-xs text-muted-foreground mt-1">{t('admin.oidcSettings.providerIdInfo')}</p>
              </div>
              <div>
                <Label htmlFor="display_name">{t('admin.oidcSettings.displayName', 'Display Name')}</Label>
                <Input id="display_name" value={editedProvider.display_name || ''} onChange={handleChange} />
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center space-x-2">
                  <Switch id="is_active" checked={editedProvider.is_active} onCheckedChange={(c) => handleSwitchChange('is_active', c)} />
                  <Label htmlFor="is_active">{t('admin.oidcSettings.active', 'Active')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch id="auto_register" checked={editedProvider.auto_register || false} onCheckedChange={(c) => handleSwitchChange('auto_register', c)} />
                  <Label htmlFor="auto_register">{t('admin.oidcSettings.autoRegister', 'Auto Register')}</Label>
                </div>
              </div>
              <div>
                <Label htmlFor="logo_file">{t('admin.oidcSettings.logoFile', 'Logo File')}</Label>
                <Input id="logo_file" type="file" onChange={handleFileChange} />
              </div>
              <div>
                <Label htmlFor="logo_url">{t('admin.oidcSettings.logoUrl', 'Logo URL')}</Label>
                <Input id="logo_url" value={editedProvider.logo_url || ''} onChange={handleChange} readOnly placeholder={t('admin.oidcSettings.willBeSetOnUpload', 'Will be set on upload')} />
              </div>
              <div>
                <Label htmlFor="issuer_url">{t('admin.oidcSettings.issuerUrl', 'Issuer URL')}</Label>
                <Input id="issuer_url" value={editedProvider.issuer_url} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="domain">{t('admin.oidcSettings.domain', 'Organization Domain')}</Label>
                <Input id="domain" value={editedProvider.domain || ''} onChange={handleChange} placeholder="e.g. sparkyfitness.com" />
                <p className="text-xs text-muted-foreground mt-1">{t('admin.oidcSettings.domainInfo')}</p>
              </div>
              <div>
                <Label htmlFor="client_id">{t('admin.oidcSettings.clientId', 'Client ID')}</Label>
                <Input id="client_id" value={editedProvider.client_id} onChange={handleChange} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="client_secret">{t('admin.oidcSettings.clientSecret', 'Client Secret')}</Label>
                <Input id="client_secret" type="password" onChange={handleChange} placeholder={t('admin.oidcSettings.leaveUnchanged', 'Leave unchanged if *****')} autoComplete="new-password" />
              </div>
              <div>
                <Label htmlFor="scope">{t('admin.oidcSettings.scope', 'Scope')}</Label>
                <Input id="scope" value={editedProvider.scope} onChange={handleChange} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">{t('admin.oidcSettings.redirectUri', 'Redirect URI')}</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="manual_redirect"
                      checked={isManualRedirectUri}
                      onCheckedChange={(checked) => {
                        if (checked && !window.confirm("WARNING: Changing the Base URL is only for advanced setups (proxies/custom domains). Incorrect values will break your login flow. Are you sure you want to proceed?")) {
                          return;
                        }
                        setIsManualRedirectUri(checked);
                        if (!checked) setBaseUrlOverride('');
                      }}
                      className="h-4 w-8"
                    />
                    <Label htmlFor="manual_redirect" className="text-xs text-muted-foreground">Expert Mode: Custom Domain</Label>
                  </div>
                </div>

                <div className="group relative">
                  <div className="flex items-stretch border rounded-md overflow-hidden bg-muted/30 focus-within:ring-1 focus-within:ring-primary">
                    <div className="flex-1 flex min-w-0">
                      <Input
                        id="redirect_base_url"
                        value={isManualRedirectUri ? baseUrlOverride : window.location.origin}
                        onChange={(e) => setBaseUrlOverride(e.target.value)}
                        readOnly={!isManualRedirectUri}
                        className={`border-0 rounded-none h-10 shadow-none focus-visible:ring-0 px-3 ${!isManualRedirectUri ? "bg-transparent cursor-not-allowed opacity-60" : "bg-background"}`}
                        placeholder="https://fitness.example.com"
                      />
                      <div className="bg-muted px-3 flex items-center text-xs font-mono text-muted-foreground border-l border-r whitespace-nowrap select-none">
                        {suffix}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 rounded-none hover:bg-muted border-l transition-colors"
                      title="Copy full Redirect URI"
                      onClick={() => {
                        const base = isManualRedirectUri ? (baseUrlOverride || window.location.origin) : window.location.origin;
                        const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
                        const fullUri = `${cleanBase}${suffix}`;
                        navigator.clipboard.writeText(fullUri);
                        toast({ title: t('copied', 'Copied'), description: t('admin.oidcSettings.callbackUrlCopied') });
                      }}
                    >
                      <ClipboardCopy className="h-4 w-4" />
                    </Button>
                  </div>

                  {isManualRedirectUri && baseUrlOverride && !baseUrlOverride.startsWith('http') && (
                    <p className="text-[10px] text-red-500 mt-1 font-medium italic">
                      ⚠️ URL must start with http:// or https://
                    </p>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground leading-snug">
                  {!isManualRedirectUri
                    ? "✓ Automatically synced with your current URL. Path suffix is locked for routing safety."
                    : "⚠️ Expert: Ensure your Base URL is reachable from the internet for the OIDC provider to return data."
                  }
                </p>
              </div>
              <div>
                <Label htmlFor="token_endpoint_auth_method">{t('admin.oidcSettings.tokenEndpointAuthMethod')}</Label>
		<Select
                  value={editedProvider.token_endpoint_auth_method}
                  onValueChange={(value) =>
                    setEditedProvider((prev) => ({
                      ...prev,
                      token_endpoint_auth_method: value,
                    }))
                  }
                >
                  <SelectTrigger
                    id="token_endpoint_auth_method"
                    className="w-full p-2 border rounded"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_secret_post">
                      client_secret_post
                    </SelectItem>
                    <SelectItem value="client_secret_basic">
                      client_secret_basic
                    </SelectItem>
                    <SelectItem value="none">none</SelectItem>
                  </SelectContent>
                </Select> 
              </div>
              <div>
                <Label htmlFor="signing_algorithm">{t('admin.oidcSettings.idTokenSignedAlg', 'ID Token Signed Alg')}</Label>
                <Input id="signing_algorithm" value={editedProvider.signing_algorithm || ''} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="profile_signing_algorithm">{t('admin.oidcSettings.userinfoSignedAlg', 'Userinfo Signed Alg')}</Label>
                <Input id="profile_signing_algorithm" value={editedProvider.profile_signing_algorithm || ''} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="timeout">{t('admin.oidcSettings.requestTimeout', 'Request Timeout (ms)')}</Label>
                <Input id="timeout" type="number" value={editedProvider.timeout || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="text-sm text-muted-foreground mt-4">
              <p className="mt-1">{t('admin.oidcSettings.localhostWarning', 'Ensure your OIDC provider allows localhost or your local IP for development.')}</p>
              <p className="mt-2">{t('admin.oidcSettings.proxyWarning', 'If using a proxy like Nginx Proxy Manager, ensure the following headers are configured:')}</p>
              <div className="relative group mt-2">
                <pre id="proxy-config-code" className="bg-muted p-2 rounded text-xs overflow-x-auto">
                  <code>
                    proxy_set_header Host $host;{'\n'}
                    proxy_set_header X-Real-IP $remote_addr;{'\n'}
                    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;{'\n'}
                    proxy_set_header X-Forwarded-Proto $scheme;{'\n'}
                    add_header X-Content-Type-Options "nosniff";{'\n'}
                    proxy_set_header X-Forwarded-Ssl on;
                  </code>
                </pre>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => {
                    const codeBlock = document.getElementById('proxy-config-code');
                    if (codeBlock) {
                      navigator.clipboard.writeText(codeBlock.innerText);
                      toast({ title: t('copied', 'Copied!'), description: t('admin.oidcSettings.proxyConfigCopied', 'Proxy configuration copied to clipboard.') });
                    }
                  }}
                >
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleResetToDefaults}>{t('admin.oidcSettings.resetToDefaults', 'Reset to Defaults')}</Button>
            <Button type="button" variant="outline" onClick={onClose}>{t('admin.oidcSettings.cancel', 'Cancel')}</Button>
            <Button type="submit">{t('admin.oidcSettings.save', 'Save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OidcSettings;
