import React from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Trash2, Edit, Lock, Share2, RefreshCw, Link2Off, Clipboard, History } from "lucide-react";
import { ExternalDataProvider } from "./ExternalProviderSettings";
import GarminSyncProgress from './GarminSyncProgress';
import { SyncStatus } from '@/services/garminSyncService';

interface ExternalProviderListProps {
  providers: ExternalDataProvider[];
  editingProvider: string | null;
  editData: Partial<ExternalDataProvider>;
  loading: boolean;
  user: any; // Replace with a more specific user type if available
  handleUpdateProvider: (providerId: string) => void;
  setEditData: React.Dispatch<React.SetStateAction<Partial<ExternalDataProvider>>>;
  getProviderTypes: () => { value: string; label: string }[];
  handleToggleActive: (providerId: string, isActive: boolean) => void;
  handleConnectWithings: (providerId: string) => void;
  handleManualSync: (providerId: string) => void;
  handleDisconnectWithings: (providerId: string) => void;
  handleManualSyncGarmin: (providerId: string) => void;
  handleDisconnectGarmin: (providerId: string) => void;
  startEditing: (provider: ExternalDataProvider) => void;
  handleDeleteProvider: (providerId: string) => void;
  toggleProviderPublicSharing: (providerId: string, isPublic: boolean) => void;
  loadProviders: () => void;
  toast: any; // Replace with a more specific toast type if available
  cancelEditing: () => void;
  garminSyncStatus?: SyncStatus | null;
  onHistoricalImport?: () => void;
  onResumeSync?: () => void;
  onCancelSync?: () => void;
  syncLoading?: boolean;
  lastSuccessfulSync?: string | null;
}

const ExternalProviderList: React.FC<ExternalProviderListProps> = ({
  providers,
  editingProvider,
  editData,
  loading,
  user,
  handleUpdateProvider,
  setEditData,
  getProviderTypes,
  handleToggleActive,
  handleConnectWithings,
  handleManualSync,
  handleDisconnectWithings,
  handleManualSyncGarmin,
  handleDisconnectGarmin,
  startEditing,
  handleDeleteProvider,
  toggleProviderPublicSharing,
  loadProviders,
  toast,
  cancelEditing,
  garminSyncStatus,
  onHistoricalImport,
  onResumeSync,
  onCancelSync,
  syncLoading = false,
  lastSuccessfulSync,
}) => {
  return (
    <div className="space-y-4">
      {providers.map((provider) => (
        <div key={provider.id} className="border rounded-lg p-4">
          {editingProvider === provider.id ? (
            // Edit Mode
            <form onSubmit={(e) => { e.preventDefault(); handleUpdateProvider(provider.id); }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Provider Name</Label>
                  <Input
                    value={editData.provider_name || ''}
                    onChange={(e) => setEditData(prev => ({ ...prev, provider_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Provider Type</Label>
                  <Select
                    value={editData.provider_type || ''}
                    onValueChange={(value) => setEditData(prev => ({ ...prev, provider_type: value as ExternalDataProvider['provider_type'], app_id: '', app_key: '', base_url: '', garmin_connect_status: 'disconnected', garmin_last_status_check: '', garmin_token_expires: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {getProviderTypes().map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(editData.provider_type === 'mealie' || editData.provider_type === 'tandoor' || editData.provider_type === 'free-exercise-db') && (
                <>
                  <div>
                    <Label>App URL</Label>
                    <Input
                      type="text"
                      value={editData.base_url || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, base_url: e.target.value }))}
                      placeholder={editData.provider_type === 'tandoor' ? 'e.g., http://your-tandoor-instance.com' : 'e.g., http://your-mealie-instance.com'}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={editData.app_key || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                      placeholder={editData.provider_type === 'tandoor' ? 'Enter Tandoor API Key' : 'Enter Mealie API Key'}
                      autoComplete="off"
                    />
                  </div>
                </>
              )}
              {(editData.provider_type === 'nutritionix' || editData.provider_type === 'fatsecret') && (
                <>
                  <div>
                    <Label>App ID</Label>
                    <Input
                      type="text"
                      value={editData.app_id || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, app_id: e.target.value }))}
                      placeholder="Enter App ID"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label>App Key</Label>
                    <Input
                      type="password"
                      value={editData.app_key || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                      placeholder="Enter App Key"
                      autoComplete="off"
                    />
                  </div>
                  {editData.provider_type === 'fatsecret' && (
                    <p className="text-sm text-muted-foreground col-span-2">
                      Note: For Fatsecret, you need to set up **your public IP** whitelisting in your Fatsecret developer account. This process can take up to 24 hours.
                    </p>
                  )}
                </>
              )}
              {editData.provider_type === 'nutritionix' && (
                <p className="text-sm text-muted-foreground col-span-2">
                  Get your App ID and App Key from the <a href="https://developer.nutritionix.com/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Nutritionix Developer Portal</a>.
                </p>
              )}
              {editData.provider_type === 'fatsecret' && (
                <p className="text-sm text-muted-foreground col-span-2">
                  Get your App ID and App Key from the <a href="https://platform.fatsecret.com/my-account/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Fatsecret Platform Dashboard</a>.
                </p>
              )}
              {editData.provider_type === 'usda' && (
                <>
                  <div>
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={editData.app_key || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                      placeholder="Enter USDA API Key"
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground col-span-2">
                    Get your API Key from the <a href="https://fdc.nal.usda.gov/api-guide.html" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">USDA FoodData Central API Guide</a>.
                  </p>
                </>
              )}
              {editData.provider_type === 'withings' && (
                <>
                  <div>
                    <Label>Client ID</Label>
                    <Input
                      type="text"
                      value={editData.app_id || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, app_id: e.target.value }))}
                      placeholder="Enter Withings Client ID"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label>Client Secret</Label>
                    <Input
                      type="password"
                      value={editData.app_key || ''}
                      onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                      placeholder="Enter Withings Client Secret"
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground col-span-2">
                    Withings integration uses OAuth2. You will be redirected to Withings to authorize access after adding the provider.
                    <br />
                    In your <a href="https://developer.withings.com/dashboard/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Withings Developer Dashboard</a>, you must set your callback URL to:
                    <strong className="flex items-center">
                      {`${window.location.origin}/withings/callback`}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="ml-2 h-5 w-5"
                        onClick={(e) => {
                          e.preventDefault();
                          navigator.clipboard.writeText(`${window.location.origin}/withings/callback`);
                          toast({ title: "Copied!", description: "Callback URL copied to clipboard." });
                        }}
                      >
                        <Clipboard className="h-4 w-4" />
                      </Button>
                    </strong>
                  </p>
                </>
              )}
              {editData.provider_type === 'garmin' && (
                <>
                  {/* Show connection status for connected Garmin accounts instead of credential fields */}
                  {(provider.garmin_connect_status === 'linked' || provider.garmin_connect_status === 'connected') ? (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                        <span className="font-medium">Connected to Garmin</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        Your Garmin account is connected. To reconnect with different credentials, disconnect first and add a new provider.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div>
                        <Label>Garmin Email</Label>
                        <Input
                          type="email"
                          value={editData.app_id || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, app_id: e.target.value }))}
                          placeholder="Enter Garmin Email"
                          autoComplete="username"
                        />
                      </div>
                      <div>
                        <Label>Garmin Password</Label>
                        <Input
                          type="password"
                          value={editData.app_key || ''}
                          onChange={(e) => setEditData(prev => ({ ...prev, app_key: e.target.value }))}
                          placeholder="Enter Garmin Password"
                          autoComplete="current-password"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground col-span-2">
                        Note: Garmin Connect integration is tested with few metrics only. Ensure your Docker Compose is updated to include Garmin section.
                        <br />
                        Sparky Fitness does not store your Garmin email or password. They are used only during login to obtain secure tokens.
                      </p>
                    </>
                  )}
                </>
              )}
              {(editData.provider_type === 'withings' || editData.provider_type === 'garmin') && (
                <div>
                  <Label htmlFor="edit_sync_frequency">Sync Frequency</Label>
                  <Select
                    value={editData.sync_frequency || 'manual'}
                    onValueChange={(value) => setEditData(prev => ({ ...prev, sync_frequency: value as 'hourly' | 'daily' | 'manual' }))}
                  >
                    <SelectTrigger id="edit_sync_frequency">
                      <SelectValue placeholder="Select sync frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <Switch
                  checked={editData.is_active || false}
                  onCheckedChange={(checked) => setEditData(prev => ({ ...prev, is_active: checked }))}
                />
                <Label>Activate this provider</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  Save Changes
                </Button>
                <Button type="button" variant="outline" onClick={cancelEditing}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            // View Mode
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{provider.provider_name}</h4>
                  {(provider.visibility === 'private' || provider.user_id === user?.id) && (
                    <>
                      <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">Private</span>
                      {provider.shared_with_public && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded ml-2">Public</span>
                      )}
                    </>
                  )}
                  {provider.user_id !== user?.id && provider.visibility === 'public' && (
                    <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">Public</span>
                  )}
                  {provider.user_id !== user?.id && provider.visibility === 'family' && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Family</span>
                  )}
                  {provider.provider_type === 'garmin' && (
                    <>
                      {provider.is_active && (provider.garmin_connect_status === 'linked' || provider.garmin_connect_status === 'connected') && (
                        <>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleManualSyncGarmin(provider.id)}
                                  disabled={loading}
                                  className="ml-2 text-blue-500"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Sync Now</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDisconnectGarmin(provider.id)}
                                  disabled={loading}
                                  className="ml-2 text-red-500"
                                >
                                  <Link2Off className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Disconnect</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          {/* Historical Import button */}
                          {!garminSyncStatus?.hasActiveJob && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={onHistoricalImport}
                              disabled={loading || syncLoading}
                              className="ml-2"
                            >
                              <History className="h-4 w-4 mr-2" />
                              Historical Import
                            </Button>
                          )}
                        </>
                      )}
                      {/* Show sync progress if active */}
                      {garminSyncStatus?.hasActiveJob && garminSyncStatus.job && (
                        <GarminSyncProgress
                          job={garminSyncStatus.job}
                          onResume={onResumeSync || (() => {})}
                          onCancel={onCancelSync || (() => {})}
                          loading={syncLoading}
                        />
                      )}
                    </>
                  )}
                  {provider.provider_type === 'withings' && provider.is_active && provider.has_token && (
                    <>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleManualSync(provider.id)}
                              disabled={loading}
                              className="ml-2 text-blue-500"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Sync Now</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDisconnectWithings(provider.id)}
                              disabled={loading}
                              className="ml-2 text-red-500"
                            >
                              <Link2Off className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Disconnect</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {provider.visibility === 'private' ? (
                    <>
                      {/* Share/Lock Button - First icon, not for Garmin/Withings */}
                      {provider.provider_type !== 'garmin' && provider.provider_type !== 'withings' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              const newState = !provider.shared_with_public;
                              await toggleProviderPublicSharing(provider.id, newState);
                              toast({ title: 'Success', description: newState ? 'Provider shared publicly' : 'Provider made private' });
                              loadProviders();
                            } catch (err: any) {
                              toast({ title: 'Error', description: err.message || 'Failed to update provider sharing', variant: 'destructive' });
                            }
                          }}
                        >
                          {provider.shared_with_public ? <Lock className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                        </Button>
                      )}

                      {/* Connect Withings Button */}
                      {provider.provider_type === 'withings' && provider.is_active && !provider.has_token && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleConnectWithings(provider.id)}
                          disabled={loading}
                        >
                          Connect Withings
                        </Button>
                      )}

                      {/* Edit Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditing(provider)}
                        >
                        <Edit className="h-4 w-4" />
                      </Button>

                      {/* Delete Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteProvider(provider.id)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground px-2 py-1 rounded">Read-only</div>
                  )}
                  <Switch
                    checked={provider.is_active}
                    onCheckedChange={(checked) => handleToggleActive(provider.id, checked)}
                    disabled={loading}
                  />
                </div>
              </div>
              {provider.provider_type === 'garmin' && (provider.garmin_connect_status === 'linked' || provider.garmin_connect_status === 'connected') && (
                <div className="text-sm text-muted-foreground space-y-1">
                  {garminSyncStatus?.lastSuccessfulSync && (
                    <div className="flex items-center gap-1">
                      <span className="font-medium text-green-600 dark:text-green-400">✓ Synced up to:</span>
                      <span>{new Date(garminSyncStatus.lastSuccessfulSync).toLocaleDateString()}</span>
                    </div>
                  )}
                  <div>
                    {provider.garmin_last_status_check && (
                      <span>Last Status Check: {new Date(provider.garmin_last_status_check).toLocaleString()}</span>
                    )}
                    {provider.garmin_last_status_check && provider.garmin_token_expires && <span> | </span>}
                    {provider.garmin_token_expires && (
                      <span>Token Expires: {new Date(provider.garmin_token_expires).toLocaleString()}</span>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">
                  {getProviderTypes().find(t => t.value === provider.provider_type)?.label || provider.provider_type}
                  {(provider.provider_type === 'mealie' || provider.provider_type === 'tandoor') && provider.base_url && ` - URL: ${provider.base_url}`}
                  {(provider.provider_type !== 'mealie' && provider.provider_type !== 'tandoor' && provider.provider_type !== 'free-exercise-db' && provider.provider_type !== 'wger') && provider.app_id && ` - App ID: ${provider.app_id.substring(0, 4)}...`}
                  {(provider.provider_type === 'mealie' || provider.provider_type === 'tandoor' || provider.provider_type === 'nutritionix' || provider.provider_type === 'fatsecret' || provider.provider_type === 'withings') && provider.app_key && ` - App Key: ${provider.app_key.substring(0, 4)}...`}
                  {provider.provider_type === 'withings' && (
                    <>
                      {provider.sync_frequency && ` - Sync: ${provider.sync_frequency}`}
                    </>
                  )}
                  {provider.provider_type === 'garmin' && (
                    <>
                      {provider.sync_frequency && ` - Sync: ${provider.sync_frequency}`}
                    </>
                  )}
                </p>
                {provider.provider_type === 'withings' && (provider.has_token) && (
                  <div className="text-sm text-muted-foreground">
                    {provider.withings_last_sync_at && (
                      <span>Last Sync: {new Date(provider.withings_last_sync_at).toLocaleString()}</span>
                    )}
                    {provider.withings_last_sync_at && provider.withings_token_expires && <span> | </span>}
                    {provider.withings_token_expires && (
                      <span>Token Expires: {new Date(provider.withings_token_expires).toLocaleString()}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ExternalProviderList;