import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, Lock, Clipboard } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { globalSettingsService, type GlobalSettings } from '../../services/globalSettingsService';
import { toast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import OidcSettings from './OidcSettings';
import { Button } from '@/components/ui/button';

const AuthenticationSettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const fetchedSettings = await globalSettingsService.getSettings();
        setSettings(fetchedSettings);
      } catch (error) {
        toast({ title: t('admin.authenticationSettings.errorLoadingSettings', 'Error'), description: t('admin.authenticationSettings.errorLoadingSettingsDescription', 'Failed to load authentication settings.'), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [t]);

  const handleSwitchChange = async (id: keyof GlobalSettings, checked: boolean) => {
    if (!settings) return;
    
    const newSettings = { ...settings, [id]: checked };
    setSettings(newSettings); // Optimistically update the UI

    try {
      await globalSettingsService.saveSettings(newSettings);
      toast({ title: t('admin.authenticationSettings.settingsSaved', 'Settings Saved'), description: t('admin.authenticationSettings.loginSettingUpdated', 'Login setting updated successfully.') });
    } catch (error) {
      toast({ title: t('admin.authenticationSettings.error', 'Error'), description: t('admin.authenticationSettings.failedToSaveLoginSettings', 'Failed to save login settings.'), variant: "destructive" });
      setSettings(settings); // Revert optimistic update on failure
    }
  };

  if (loading) {
    return <div>{t('admin.authenticationSettings.loadingSettings', 'Loading settings...')}</div>;
  }

  return (
    <Accordion type="multiple" defaultValue={[]} className="w-full mx-auto space-y-6">
      <AccordionItem value="login-management" className="border rounded-lg">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t('admin.authenticationSettings.loginManagement.description', 'Enable or disable different methods for users to log in.')}
        >
          <Info className="h-5 w-5" />
          {t('admin.authenticationSettings.loginManagement.title', 'Login Management')}
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0 space-y-4">
          {settings && (
            <>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <Label htmlFor="enable_email_password_login" className="font-medium">
                  {t('admin.authenticationSettings.loginManagement.enableEmailPasswordLogin', 'Enable Email & Password Login')}
                </Label>
                <Switch
                  id="enable_email_password_login"
                  checked={settings.enable_email_password_login}
                  onCheckedChange={(checked) => handleSwitchChange('enable_email_password_login', checked)}
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <Label htmlFor="is_oidc_active" className="font-medium">
                  {t('admin.authenticationSettings.loginManagement.enableOidcLoginGlobal', 'Enable OIDC Login (Global)')}
                </Label>
                <Switch
                  id="is_oidc_active"
                  checked={settings.is_oidc_active}
                  onCheckedChange={(checked) => handleSwitchChange('is_oidc_active', checked)}
                />
              </div>
              <div className="flex items-center justify-between p-4 border rounded-md">
                <Label htmlFor="is_mfa_mandatory" className="font-medium">
                  {t('admin.authenticationSettings.loginManagement.enforceMfaForAllUsers', 'Enforce MFA for all users')}
                </Label>
                <Switch
                  id="is_mfa_mandatory"
                  checked={settings.is_mfa_mandatory}
                  onCheckedChange={(checked) => handleSwitchChange('is_mfa_mandatory', checked)}
                />
              </div>
            </>
          )}
          <div className="flex items-start p-4 mt-2 text-sm text-muted-foreground bg-secondary/20 border border-secondary/40 rounded-lg">
            <Info className="h-5 w-5 mr-3 mt-1 flex-shrink-0" />
            <div>
              <strong>{t('admin.authenticationSettings.loginManagement.emergencyFailSafe', 'Emergency Fail-Safe:')}</strong> {t('admin.authenticationSettings.loginManagement.emergencyFailSafeDescription', 'If you are ever locked out of your account, you can force email/password login to be enabled by setting the following environment variable on your server and restarting it:')}
              <code className="font-mono bg-gray-200 dark:bg-gray-700 p-1 rounded flex items-center">
                SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 h-5 w-5"
                  onClick={() => {
                    navigator.clipboard.writeText('SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true');
                    toast({ title: t('copied', 'Copied!'), description: t('admin.authenticationSettings.loginManagement.envVarCopied', 'Environment variable copied to clipboard.') });
                  }}
                >
                  <Clipboard className="h-4 w-4" />
                </Button>
              </code>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="oidc-provider-settings" className="border rounded-lg">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t('admin.authenticationSettings.oidcProviderManagement.description', 'Configure your OpenID Connect (OIDC) providers.')}
        >
          <Lock className="h-5 w-5" />
          {t('admin.authenticationSettings.oidcProviderManagement.title', 'OIDC Provider Management')}
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0">
          <OidcSettings />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default AuthenticationSettings;