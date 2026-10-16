import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import TooltipWarning from '@/components/TooltipWarning';
import {
  useGarminStatus,
  useLoginGarminMutation,
  useResumeGarminLoginMutation,
} from '@/hooks/Integrations/useIntegrations';

import { useTranslation } from 'react-i18next';
interface GarminConnectSettingsProps {
  initialClientState?: string | null;
  onMfaComplete?: () => void;
}

const GarminConnectSettings = ({
  initialClientState,
  onMfaComplete,
}: GarminConnectSettingsProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [garminEmail, setGarminEmail] = useState('');
  const [garminPassword, setGarminPassword] = useState('');
  const [garminMfaCode, setGarminMfaCode] = useState('');

  const [garminClientState, setGarminClientState] = useState<string | null>(
    initialClientState || null
  );
  const [showGarminMfaInput, setShowGarminMfaInput] =
    useState(!!initialClientState);

  const { data: garminStatus } = useGarminStatus();
  const { mutateAsync: loginGarmin, isPending: loginPending } =
    useLoginGarminMutation();
  const { mutateAsync: resumeLogin, isPending: resumePending } =
    useResumeGarminLoginMutation();

  const loading = loginPending || resumePending;

  const handleGarminLogin = async () => {
    if (!user) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'settings.garminConnectSettings.userNotAuthenticatedPleaseLog',
          'User not authenticated. Please log in.'
        ),
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await loginGarmin({
        email: garminEmail,
        password: garminPassword,
      });

      if (result.status === 'needs_mfa' && result.client_state) {
        setGarminClientState(result.client_state);
        setShowGarminMfaInput(true);
        toast({
          title: t(
            'settings.garminConnectSettings.mfaRequired',
            'MFA Required'
          ),
          description: t(
            'settings.garminConnectSettings.pleaseEnterTheMFACode',
            'Please enter the MFA code from your Garmin Connect app.'
          ),
        });
      } else if (result.status === 'success') {
        setShowGarminMfaInput(false);
        setGarminMfaCode('');
        if (onMfaComplete) {
          onMfaComplete();
        }
      }
    } catch (error: unknown) {
      console.error('Login Error:', error);
    }
  };

  const handleGarminMfaSubmit = async () => {
    if (!user) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'settings.garminConnectSettings.userNotAuthenticatedPleaseLog',
          'User not authenticated. Please log in.'
        ),
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await resumeLogin({
        client_state: garminClientState,
        mfa_code: garminMfaCode,
      });

      if (result.status === 'success') {
        setShowGarminMfaInput(false);
        setGarminMfaCode('');
        setGarminClientState(null);
        if (onMfaComplete) {
          onMfaComplete();
        }
      }
    } catch (error: unknown) {
      console.error('MFA Error:', error);
    }
  };

  return (
    <div className="space-y-4">
      <TooltipWarning
        warningMsg={
          'Garmin Connect integration is tested with few metrics only. Ensure your Docker Compose is updated to include Garmin section.'
        }
      />
      <p className="text-sm text-muted-foreground">
        {t(
          'settings.garminConnectSettings.sparkyFitnessDoesNotStore',
          'Sparky Fitness does not store your Garmin email or password. They are used only during login to obtain secure tokens.'
        )}
      </p>
      {!garminStatus?.isLinked &&
        !showGarminMfaInput &&
        !initialClientState && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleGarminLogin();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="garmin-email">
                  {t(
                    'settings.garminConnectSettings.garminEmail',
                    'Garmin Email'
                  )}
                </Label>
                <Input
                  id="settings-garmin-email"
                  type="email"
                  placeholder={t(
                    'settings.garminConnectSettings.enterYourGarminEmail',
                    'Enter your Garmin email'
                  )}
                  value={garminEmail}
                  onChange={(e) => setGarminEmail(e.target.value)}
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
              <div>
                <Label htmlFor="garmin-password">
                  {t(
                    'settings.garminConnectSettings.garminPassword',
                    'Garmin Password'
                  )}
                </Label>
                <Input
                  id="settings-garmin-password"
                  type="password"
                  placeholder={t(
                    'settings.garminConnectSettings.enterYourGarminPassword',
                    'Enter your Garmin password'
                  )}
                  value={garminPassword}
                  onChange={(e) => setGarminPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading
                ? t(
                    'settings.garminConnectSettings.connecting',
                    'Connecting...'
                  )
                : t(
                    'settings.garminConnectSettings.connectGarmin',
                    'Connect Garmin'
                  )}
            </Button>
          </form>
        )}

      {showGarminMfaInput && (
        <>
          <Label htmlFor="garmin-mfa-code">
            {t(
              'settings.garminConnectSettings.garminMFACode',
              'Garmin MFA Code'
            )}
          </Label>
          <Input
            id="settings-garmin-mfa-code"
            type="text"
            placeholder={t(
              'settings.garminConnectSettings.enterMFACode',
              'Enter MFA code'
            )}
            value={garminMfaCode}
            onChange={(e) => setGarminMfaCode(e.target.value)}
            disabled={loading}
          />
          <Button onClick={handleGarminMfaSubmit} disabled={loading}>
            {loading
              ? t('settings.garminConnectSettings.submitting', 'Submitting...')
              : t(
                  'settings.garminConnectSettings.submitMFACode',
                  'Submit MFA Code'
                )}
          </Button>
        </>
      )}
    </div>
  );
};

export default GarminConnectSettings;
