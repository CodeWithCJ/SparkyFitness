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
import { ClipboardCopy, KeyRound, Trash2, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
// Import GarminConnectSettings
// Import parse for parsing user-entered date strings
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'; // Import Accordion components
import TooltipWarning from '@/components/TooltipWarning';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useDeleteApiKeyMutation,
  useToggleApiKeyMutation,
  useCleanupApiKeysMutation,
} from '@/hooks/Settings/useApiKeys';

export const ApiSettings = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null); // New state to show secret key once
  const [newApiKeyDescription, setNewApiKeyDescription] = useState<string>('');
  const [newApiKeyExpiresIn, setNewApiKeyExpiresIn] = useState<number | null>(
    null
  );
  const { data: apiKeys = [], isLoading: isFetchingKeys } = useApiKeysQuery(
    user?.id
  );
  const { mutateAsync: createKey, isPending: generatingApiKey } =
    useCreateApiKeyMutation();
  const { mutateAsync: deleteKey, isPending: deletingApiKey } =
    useDeleteApiKeyMutation();
  const { mutateAsync: toggleKey, isPending: togglingApiKey } =
    useToggleApiKeyMutation();
  const { mutateAsync: cleanupKeys, isPending: cleaningUpKeys } =
    useCleanupApiKeysMutation();

  const isFormLoading = isFetchingKeys || deletingApiKey || togglingApiKey;

  const handleGenerateApiKey = async () => {
    if (!user) return;
    setNewlyCreatedKey(null);

    try {
      const data = await createKey({
        name: newApiKeyDescription || 'New API Key',
        expiresIn: newApiKeyExpiresIn || undefined,
      });

      if (data && data.key) {
        setNewlyCreatedKey(data.key);
      }
      setNewApiKeyDescription('');
    } catch (error: unknown) {
      console.error(error);
    }
  };

  const handleDeleteApiKey = async (apiKeyId: string) => {
    if (!user) return;
    if (
      !window.confirm(
        'Are you sure you want to delete this API key? This action cannot be undone.'
      )
    ) {
      return;
    }

    try {
      await deleteKey(apiKeyId);
    } catch (error: unknown) {
      console.error(error);
    }
  };

  const handleToggleApiKey = async (apiKeyId: string, enabled: boolean) => {
    if (!user) return;
    try {
      await toggleKey({ keyId: apiKeyId, enabled });
    } catch (error: unknown) {
      console.error(error);
    }
  };

  const handleCleanupExpiredKeys = async () => {
    if (!user) return;
    try {
      await cleanupKeys();
    } catch (error: unknown) {
      console.error(error);
    }
  };

  return (
    <AccordionItem
      value="api-key-management"
      className="border rounded-lg mb-4"
    >
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.apiKeyManagement.description',
          'Generate and manage API keys for external integrations'
        )}
      >
        <KeyRound className="h-5 w-5" />
        {t('settings.apiKeyManagement.title', 'API Key Management')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.apiKeyManagement.infoText',
            'Generate API keys to securely submit data from external applications like iPhone Shortcuts. These keys are tied to your account and can be revoked at any time.'
          )}
        </p>

        <TooltipWarning
          warningMsg={t(
            'settings.apiKeyManagement.wikiWarning',
            'Refer to the Wiki page in Github for sample setup instructions for iPhone and Android.'
          )}
          color="blue"
        />
        {newlyCreatedKey && (
          <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-md mb-4">
            <p className="text-sm font-bold text-yellow-800 dark:text-yellow-200 mb-1">
              {t(
                'settings.apiKeyManagement.newKeyGenerated',
                'New API Key Generated!'
              )}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
              {t(
                'settings.apiKeyManagement.copyWarning',
                'Copy this key now. For security, it will NOT be shown again.'
              )}
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={newlyCreatedKey}
                className="font-mono text-xs bg-background"
              />
              <Button
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(newlyCreatedKey);
                  toast({
                    title: t('settings.apiKeyManagement.copied', 'Copied!'),
                    description: t(
                      'settings.apiKeyManagement.apiKeyCopied',
                      'API key copied to clipboard.'
                    ),
                  });
                }}
              >
                <ClipboardCopy className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNewlyCreatedKey(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-grow space-y-2 w-full">
              <Label htmlFor="api-key-description">
                {t(
                  'settings.apiKeyManagement.descriptionLabel',
                  "Description (e.g., 'iPhone Health Shortcut')"
                )}
              </Label>
              <Input
                id="api-key-description"
                value={newApiKeyDescription}
                onChange={(e) => setNewApiKeyDescription(e.target.value)}
                placeholder={t(
                  'settings.apiKeyManagement.placeholder',
                  "Description (e.g., 'iPhone Health Shortcut')"
                )}
              />
            </div>
            <div className="space-y-2 w-full sm:w-48">
              <Label htmlFor="api-key-expiry">
                {t('settings.apiKeyManagement.expiresIn', 'Expires In')}
              </Label>
              <Select
                value={newApiKeyExpiresIn?.toString() || 'null'}
                onValueChange={(val) =>
                  setNewApiKeyExpiresIn(val === 'null' ? null : parseInt(val))
                }
              >
                <SelectTrigger id="api-key-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="null">
                    {t('settings.apiKeyManagement.never', 'Never')}
                  </SelectItem>
                  <SelectItem value={(60 * 60 * 24 * 7).toString()}>
                    {t('settings.apiKeyManagement.7days', '7 Days')}
                  </SelectItem>
                  <SelectItem value={(60 * 60 * 24 * 30).toString()}>
                    {t('settings.apiKeyManagement.30days', '30 Days')}
                  </SelectItem>
                  <SelectItem value={(60 * 60 * 24 * 90).toString()}>
                    {t('settings.apiKeyManagement.90days', '90 Days')}
                  </SelectItem>
                  <SelectItem value={(60 * 60 * 24 * 365).toString()}>
                    {t('settings.apiKeyManagement.1year', '1 Year')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleGenerateApiKey}
              disabled={generatingApiKey}
              className="w-full sm:w-auto"
            >
              <KeyRound className="h-4 w-4 mr-2" />
              {generatingApiKey
                ? t('settings.apiKeyManagement.generating', 'Generating...')
                : t('settings.apiKeyManagement.generate', 'Generate New Key')}
            </Button>
          </div>

          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleCleanupExpiredKeys}
              disabled={cleaningUpKeys}
            >
              <Trash2 className="h-3 w-3 mr-1" />
              {cleaningUpKeys
                ? t('common.processing', 'Processing...')
                : t(
                    'settings.apiKeyManagement.cleanupExpired',
                    'Cleanup Expired Keys'
                  )}
            </Button>
          </div>
        </div>

        {/* API Key List */}
        <div className="space-y-4">
          {apiKeys.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">
              {t(
                'settings.apiKeyManagement.noApiKeys',
                'No API keys generated yet.'
              )}
            </p>
          ) : (
            apiKeys.map((key) => (
              <div
                key={key.id}
                className={`flex items-center space-x-4 p-3 border rounded-md ${!key.enabled ? 'bg-muted/50 opacity-80' : ''}`}
              >
                <div className="flex-grow space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {key.name ||
                        t(
                          'settings.apiKeyManagement.noDescription',
                          'No Description'
                        )}
                    </p>
                    {!key.enabled && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded border uppercase font-bold">
                        {t('settings.apiKeyManagement.disabled', 'Disabled')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono text-xs">{key.id}</span>
                    <TooltipWarning
                      warningMsg={t(
                        'settings.apiKeyManagement.idOnlyInfo',
                        'Only the Key ID is shown for security.'
                      )}
                      color="blue"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <p>
                      {t('settings.apiKeyManagement.created', 'Created:')}{' '}
                      {key.createdAt
                        ? new Date(key.createdAt).toLocaleDateString()
                        : 'N/A'}
                    </p>
                    {key.expiresAt && (
                      <p
                        className={
                          new Date(key.expiresAt) < new Date()
                            ? 'text-destructive font-semibold'
                            : ''
                        }
                      >
                        {t('settings.apiKeyManagement.expires', 'Expires:')}{' '}
                        {new Date(key.expiresAt).toLocaleDateString()}
                      </p>
                    )}
                    {key.updatedAt && (
                      <p>
                        {t('settings.apiKeyManagement.lastUsed', 'Last Used:')}{' '}
                        {new Date(key.updatedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={key.enabled}
                    onCheckedChange={(checked) =>
                      handleToggleApiKey(key.id, checked)
                    }
                    disabled={isFormLoading}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteApiKey(key.id)}
                    disabled={isFormLoading}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
