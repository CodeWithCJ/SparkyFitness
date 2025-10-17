import React, { useState, useEffect, useCallback } from 'react';
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

const OidcSettings: React.FC = () => {
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
      setError(err.message || 'Failed to fetch OIDC providers.');
      toast({ title: "Error", description: "Failed to load OIDC providers.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

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
      id_token_signed_response_alg: 'RS256',
      userinfo_signed_response_alg: 'none',
      request_timeout: 30000,
      auto_register: false,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (provider: OidcProvider) => {
    setSelectedProvider(provider);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this provider?')) {
      try {
        await oidcSettingsService.deleteProvider(id);
        toast({ title: "Success", description: "OIDC provider deleted successfully." });
        fetchProviders();
      } catch (err: any) {
        toast({ title: "Error", description: "Failed to delete OIDC provider.", variant: "destructive" });
      }
    }
  };

  const handleSave = async (provider: OidcProvider) => {
    try {
      if (provider.id) {
        await oidcSettingsService.updateProvider(provider.id, provider);
        toast({ title: "Success", description: "OIDC provider updated successfully." });
      } else {
        await oidcSettingsService.createProvider(provider);
        toast({ title: "Success", description: "OIDC provider created successfully." });
      }
      setIsDialogOpen(false);
      fetchProviders();
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to save OIDC provider.", variant: "destructive" });
    }
  };

  const handleToggleChange = async (provider: OidcProvider, field: 'is_active' | 'auto_register') => {
    const updatedProvider = { ...provider, [field]: !(provider[field] || false) };
    try {
      await oidcSettingsService.updateProvider(updatedProvider.id!, updatedProvider);
      toast({ title: "Success", description: `Provider ${field === 'is_active' ? 'status' : 'auto-register'} updated.` });
      fetchProviders();
    } catch (err: any) {
      toast({ title: "Error", description: `Failed to update provider.`, variant: "destructive" });
    }
  };

  if (loading) return <div>Loading OIDC providers...</div>;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>OIDC Authentication Providers</CardTitle>
        <CardDescription>Manage OIDC providers for user authentication.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-end mb-4">
          <Button onClick={handleAddNew}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Provider
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Logo</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Auto Register</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
  const [editedProvider, setEditedProvider] = useState<OidcProvider>(provider);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const handleResetToDefaults = () => {
    setEditedProvider(prev => ({
      ...prev,
      scope: 'openid profile email',
      token_endpoint_auth_method: 'client_secret_post',
      response_types: ['code'],
      id_token_signed_response_alg: 'RS256',
      userinfo_signed_response_alg: 'none',
      request_timeout: 30000,
    }));
    toast({ title: "Defaults Restored", description: "OIDC provider fields have been reset to their default values." });
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
        toast({ title: "Error", description: "Failed to upload logo.", variant: "destructive" });
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
            <DialogTitle>{editedProvider.id ? 'Edit' : 'Add'} OIDC Provider</DialogTitle>
            <DialogDescription>Fill in the details for the OIDC provider.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="display_name">Display Name</Label>
                <Input id="display_name" value={editedProvider.display_name || ''} onChange={handleChange} />
              </div>
              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center space-x-2">
                    <Switch id="is_active" checked={editedProvider.is_active} onCheckedChange={(c) => handleSwitchChange('is_active', c)} />
                    <Label htmlFor="is_active">Active</Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Switch id="auto_register" checked={editedProvider.auto_register || false} onCheckedChange={(c) => handleSwitchChange('auto_register', c)} />
                    <Label htmlFor="auto_register">Auto Register</Label>
                </div>
              </div>
              <div>
                <Label htmlFor="logo_file">Logo File</Label>
                <Input id="logo_file" type="file" onChange={handleFileChange} />
              </div>
              <div>
                <Label htmlFor="logo_url">Logo URL</Label>
                <Input id="logo_url" value={editedProvider.logo_url || ''} onChange={handleChange} readOnly placeholder="Will be set on upload" />
              </div>
              <div>
                <Label htmlFor="issuer_url">Issuer URL</Label>
                <Input id="issuer_url" value={editedProvider.issuer_url} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="client_id">Client ID</Label>
                <Input id="client_id" value={editedProvider.client_id} onChange={handleChange} autoComplete="off" />
              </div>
              <div>
                <Label htmlFor="client_secret">Client Secret</Label>
                <Input id="client_secret" type="password" onChange={handleChange} placeholder="Leave unchanged if *****" autoComplete="new-password" />
              </div>
              <div>
                <Label htmlFor="scope">Scope</Label>
                <Input id="scope" value={editedProvider.scope} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="redirect_uris">Redirect URI</Label>
                <Input id="redirect_uris" value={editedProvider.redirect_uris.join(', ')} onChange={handleChange} placeholder="e.g., https://app.example.com/oidc-callback" />
              </div>
              <div>
                <Label htmlFor="id_token_signed_response_alg">ID Token Signed Alg</Label>
                <Input id="id_token_signed_response_alg" value={editedProvider.id_token_signed_response_alg || ''} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="userinfo_signed_response_alg">Userinfo Signed Alg</Label>
                <Input id="userinfo_signed_response_alg" value={editedProvider.userinfo_signed_response_alg || ''} onChange={handleChange} />
              </div>
              <div>
                <Label htmlFor="request_timeout">Request Timeout (ms)</Label>
                <Input id="request_timeout" type="number" value={editedProvider.request_timeout || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="text-sm text-muted-foreground mt-4">
              <p>The Redirect URI for your OIDC provider should be: <code className="font-mono bg-gray-100 p-1 rounded">[Your App Base URL]/oidc-callback</code></p>
              <p className="mt-1">Example: <code className="font-mono bg-gray-100 p-1 rounded">https://fit.domain.com/oidc-callback</code></p>
              <p className="mt-1">Ensure your OIDC provider allows localhost or your local IP for development.</p>
              <p className="mt-2">If using a proxy like Nginx Proxy Manager, ensure the following headers are configured:</p>
              <div className="relative group mt-2">
                <pre id="proxy-config-code" className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
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
                      toast({ title: "Copied!", description: "Proxy configuration copied to clipboard." });
                    }
                  }}
                >
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={handleResetToDefaults}>Reset to Defaults</Button>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OidcSettings;