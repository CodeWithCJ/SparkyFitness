import type React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Info, Clipboard } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';
import { GlobalSettings } from '@/types/admin';

const CopyableEnvVar: React.FC<{ value: string }> = ({ value }) => {
  const { t } = useTranslation();
  return (
    <code className="font-mono bg-gray-200 dark:bg-gray-700 p-1 rounded flex items-center">
      {value}
      <Button
        variant="ghost"
        size="icon"
        className="ml-2 h-5 w-5"
        onClick={() => {
          navigator.clipboard.writeText(value);
          toast({
            title: t('copied', 'Copied!'),
            description: t(
              'admin.authenticationSettings.loginManagement.envVarCopied',
              'Environment variable copied to clipboard.'
            ),
          });
        }}
      >
        <Clipboard className="h-4 w-4" />
      </Button>
    </code>
  );
};

const AuthenticationSettings: React.FC = () => {
  const { t } = useTranslation();
  const { data: settings, isLoading: loading } = useSettings();

  const { mutate: updateSettings } = useUpdateSettings();

  const handleSwitchChange = (id: keyof GlobalSettings, checked: boolean) => {
    if (!settings) return;

    const newSettings = { ...settings, [id]: checked };

    updateSettings(newSettings, {
      onSuccess: () => {
        toast({
          title: t(
            'admin.authenticationSettings.settingsSaved',
            'Settings Saved'
          ),
          description: t(
            'admin.authenticationSettings.loginSettingUpdated',
            'Login setting updated successfully.'
          ),
        });
      },
      onError: () => {
        toast({
          title: t('admin.authenticationSettings.error', 'Error'),
          description: t(
            'admin.authenticationSettings.failedToSaveLoginSettings',
            'Failed to save login settings.'
          ),
          variant: 'destructive',
        });
      },
    });
  };

  if (loading) {
    return (
      <div>
        {t(
          'admin.authenticationSettings.loadingSettings',
          'Loading settings...'
        )}
      </div>
    );
  }

  return (
    <Accordion
      type="multiple"
      defaultValue={[]}
      className="w-full mx-auto space-y-6"
    >
      <AccordionItem value="login-management" className="border rounded-lg">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t(
            'admin.authenticationSettings.loginManagement.description',
            'Enable or disable different methods for users to log in.'
          )}
        >
          <Info className="h-5 w-5" />
          {t(
            'admin.authenticationSettings.loginManagement.title',
            'Login Management'
          )}
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0 space-y-4">
          {settings && (
            <>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div className="flex flex-col">
                  <Label
                    htmlFor="enable_email_password_login"
                    className="font-medium"
                  >
                    {t(
                      'admin.authenticationSettings.loginManagement.enableEmailPasswordLogin',
                      'Enable Email & Password Login'
                    )}
                  </Label>
                  {settings.is_email_login_env_configured && (
                    <Badge
                      variant="outline"
                      className="mt-1 w-fit bg-blue-50 text-blue-700 border-blue-200"
                    >
                      {t('admin.oidcSettings.envConfigured', 'Managed by Env')}
                    </Badge>
                  )}
                </div>
                <Switch
                  id="enable_email_password_login"
                  checked={settings.enable_email_password_login}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('enable_email_password_login', checked)
                  }
                  disabled={settings.is_email_login_env_configured}
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div className="flex flex-col">
                  <Label htmlFor="enable_passkey_login" className="font-medium">
                    {t(
                      'admin.authenticationSettings.loginManagement.enablePasskeyLogin',
                      'Enable Passkey Login'
                    )}
                  </Label>
                  {settings.is_passkey_login_env_configured && (
                    <Badge
                      variant="outline"
                      className="mt-1 w-fit bg-blue-50 text-blue-700 border-blue-200"
                    >
                      {t('admin.oidcSettings.envConfigured', 'Managed by Env')}
                    </Badge>
                  )}
                </div>
                <Switch
                  id="enable_passkey_login"
                  checked={settings.enable_passkey_login ?? true}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('enable_passkey_login', checked)
                  }
                  disabled={settings.is_passkey_login_env_configured}
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div className="flex flex-col">
                  <Label htmlFor="is_oidc_active" className="font-medium">
                    {t(
                      'admin.authenticationSettings.loginManagement.enableOidcLoginGlobal',
                      'Enable OIDC Login (Global)'
                    )}
                  </Label>
                  {settings.is_oidc_active_env_configured && (
                    <Badge
                      variant="outline"
                      className="mt-1 w-fit bg-blue-50 text-blue-700 border-blue-200"
                    >
                      {t('admin.oidcSettings.envConfigured', 'Managed by Env')}
                    </Badge>
                  )}
                </div>
                <Switch
                  id="is_oidc_active"
                  checked={settings.is_oidc_active}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('is_oidc_active', checked)
                  }
                  disabled={settings.is_oidc_active_env_configured}
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <Label htmlFor="is_mfa_mandatory" className="font-medium">
                  {t(
                    'admin.authenticationSettings.loginManagement.enforceMfaForAllUsers',
                    'Enforce MFA for all users'
                  )}
                </Label>
                <Switch
                  id="is_mfa_mandatory"
                  checked={settings.is_mfa_mandatory}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('is_mfa_mandatory', checked)
                  }
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div className="flex flex-col">
                  <Label htmlFor="public_api_docs" className="font-medium">
                    {t(
                      'admin.authenticationSettings.publicApiDocs',
                      'Public API Documentation'
                    )}
                  </Label>
                  <span className="text-sm text-muted-foreground mt-1">
                    {t(
                      'admin.authenticationSettings.publicApiDocsDescription',
                      'Allow Swagger API docs (/api/api-docs) to be accessed without requiring user authentication.'
                    )}
                  </span>
                </div>
                <Switch
                  id="public_api_docs"
                  checked={settings.public_api_docs === true}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('public_api_docs', checked)
                  }
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <div className="flex flex-col">
                  <Label htmlFor="dev_tools_enabled" className="font-medium">
                    {t(
                      'admin.authenticationSettings.devTools',
                      'Developer Diagnostic Tools'
                    )}
                  </Label>
                  <span className="text-sm text-muted-foreground mt-1">
                    {t(
                      'admin.authenticationSettings.devToolsDescription',
                      'Enable MCP and diagnostic database inspection tools for admins.'
                    )}
                  </span>
                </div>
                <Switch
                  id="dev_tools_enabled"
                  checked={settings.dev_tools_enabled === true}
                  onCheckedChange={(checked) =>
                    handleSwitchChange('dev_tools_enabled', checked)
                  }
                />
              </div>
            </>
          )}
          <div className="flex items-start p-4 mt-2 text-sm text-muted-foreground bg-secondary/20 border border-secondary/40 rounded-lg">
            <Info className="h-5 w-5 mr-3 mt-1 flex-shrink-0" />
            <div>
              <Trans
                i18nKey="admin.authenticationSettings.loginManagement.emergencyFailSafeIfYou"
                defaults={
                  '<strong>Emergency Fail-Safe:</strong> If you are ever locked out of your account, you can force email/password login to be enabled by setting the following environment variable on your server and restarting it:'
                }
                components={{ strong: <strong /> }}
              />
              <CopyableEnvVar value="SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true" />
              <p className="mt-2">
                {t(
                  'admin.authenticationSettings.loginManagement.emergencyFailSafePasskeyDescription',
                  'If passkey login was turned off and you can no longer sign in, force it back on with:'
                )}
              </p>
              <CopyableEnvVar value="SPARKY_FITNESS_FORCE_PASSKEY_LOGIN=true" />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default AuthenticationSettings;
