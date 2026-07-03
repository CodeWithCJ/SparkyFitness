import type React from 'react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, QrCode, KeyRound, Loader2 } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/api';
import { BetterAuthUser } from '@/types/auth';

export interface MfaChallengeProps {
  userId: string;
  email: string;
  mfaTotpEnabled?: boolean;
  mfaEmailEnabled?: boolean;
  needsMfaSetup?: boolean;
  mfaToken?: string;
  onMfaSuccess: () => void;
  onMfaCancel: () => void;
}

const MfaChallenge: React.FC<MfaChallengeProps> = ({
  email,
  mfaTotpEnabled = true, // Defaulting to true as Better Auth usually starts with TOTP
  mfaEmailEnabled = false,
  needsMfaSetup = false,
  onMfaSuccess,
  onMfaCancel,
}) => {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  const [loading, setLoading] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [activeTab, setActiveTab] = useState(
    mfaTotpEnabled ? 'totp' : mfaEmailEnabled ? 'email' : 'recovery'
  );

  useEffect(() => {
    // Validation for missing critical info
    if (!email) {
      toast({
        title: t('mfaChallenge.error.missingInfo', 'Error'),
        description: t(
          'mfaChallenge.error.missingAuthInfo',
          'Missing authentication information.'
        ),
        variant: 'destructive',
      });
      onMfaCancel();
    }
  }, [email, onMfaCancel, t]);

  const handleVerifyTotp = async () => {
    setLoading(true);
    try {
      const { data, error } = await authClient.twoFactor.verifyTotp({
        code: totpCode,
      });

      if (error) {
        throw error;
      }

      const user = data?.user as unknown as BetterAuthUser;
      if (user) {
        signIn(
          user.id,
          user.id,
          user.email,
          user.role || 'user',
          true,
          user.name
        );
        onMfaSuccess();
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      toast({
        title: t(
          'mfaChallenge.error.verificationFailed',
          'Verification Failed'
        ),
        description:
          message || t('mfaChallenge.error.totpInvalid', 'Invalid TOTP code.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailCode = async () => {
    setLoading(true);
    try {
      const { error } = await authClient.twoFactor.sendOtp();
      if (error) throw error;

      setEmailCodeSent(true);
      toast({
        title: 'Code Sent',
        description: 'A verification code has been sent to your email.',
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      toast({
        title: 'Error',
        description: message || 'Failed to send code.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    setLoading(true);
    try {
      const { data, error } = await authClient.twoFactor.verifyOtp({
        code: emailOtpCode,
      });

      if (error) {
        throw error;
      }

      const user = data?.user as unknown as BetterAuthUser;

      if (user) {
        signIn(
          user.id,
          user.id,
          user.email,
          user.role || 'user',
          true,
          user.name
        );
        onMfaSuccess();
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      toast({
        title: 'Error',
        description: message || 'Invalid email code.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyRecoveryCode = async () => {
    setLoading(true);
    try {
      const { data, error } = await authClient.twoFactor.verifyBackupCode({
        code: recoveryCode,
      });

      if (error) {
        throw error;
      }

      const user = data?.user as unknown as BetterAuthUser;

      if (user) {
        signIn(
          user.id,
          user.id,
          user.email,
          user.role || 'user',
          true,
          user.name
        );
        onMfaSuccess();
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      toast({
        title: t(
          'mfaChallenge.error.verificationFailed',
          'Verification Failed'
        ),
        description:
          message ||
          t('mfaChallenge.error.recoveryCodeInvalid', 'Invalid recovery code.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // The entire card and its content are returned here
  return (
    <Card className="w-[400px]">
      <CardHeader>
        <CardTitle>
          {t('mfaChallenge.challengeTitle', 'MFA Challenge')}
        </CardTitle>
        <CardDescription>
          {needsMfaSetup
            ? t(
                'mfaChallenge.setupRequired',
                'MFA setup is required for your account. Please complete the setup.'
              )
            : t(
                'mfaChallenge.verifyLogin',
                'Please verify your login using one of your Multi-Factor Authentication methods.'
              )}
        </CardDescription>
        <p className="text-sm text-muted-foreground mt-2">
          {t('mfaChallenge.loggedInAs', 'Logged in as:')}{' '}
          <strong>{email}</strong>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-10 grid w-full grid-cols-3">
            {mfaTotpEnabled && (
              <TabsTrigger value="totp" disabled={needsMfaSetup}>
                <QrCode className="h-4 w-4 mr-2" />{' '}
                {t('mfaChallenge.totpTab', 'App Code')}
              </TabsTrigger>
            )}
            {mfaEmailEnabled && (
              <TabsTrigger value="email" disabled={needsMfaSetup}>
                <Mail className="h-4 w-4 mr-2" />{' '}
                {t('mfaChallenge.emailTab', 'Email Code')}
              </TabsTrigger>
            )}
            <TabsTrigger
              value="recovery"
              className={needsMfaSetup ? 'col-span-3' : ''}
            >
              <KeyRound className="h-4 w-4 mr-2" />{' '}
              {t('mfaChallenge.recoveryTab', 'Recovery Code')}
            </TabsTrigger>
          </TabsList>
          {mfaTotpEnabled && (
            <TabsContent value="totp" className="pt-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerifyTotp();
                }}
                className="space-y-4"
              >
                <Label htmlFor="totp-code">
                  {t('mfaChallenge.totpCodeLabel', 'Authenticator App Code')}
                </Label>
                <Input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  placeholder={t(
                    'mfaChallenge.enterAppCode',
                    'Enter code from authenticator app'
                  )}
                  autoComplete="one-time-code"
                  data-lpignore="true"
                  data-bitwarden-ignore="true"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  maxLength={6}
                />
                <Button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  className="w-full"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('mfaChallenge.verify', 'Verify')}
                </Button>
              </form>
            </TabsContent>
          )}
          {mfaEmailEnabled && (
            <TabsContent value="email" className="pt-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleVerifyEmailCode();
                }}
                className="space-y-4"
              >
                <Label htmlFor="email-code">
                  {t('mfaChallenge.emailCodeLabel', 'Email Verification Code')}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="email-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={emailOtpCode}
                    onChange={(e) => setEmailOtpCode(e.target.value)}
                    placeholder={t(
                      'mfaChallenge.enterEmailCode',
                      'Enter code from email'
                    )}
                    autoComplete="one-time-code"
                    data-lpignore="true"
                    data-bitwarden-ignore="true"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    maxLength={6}
                  />
                  <Button
                    type="button"
                    onClick={handleSendEmailCode}
                    disabled={loading || emailCodeSent}
                  >
                    {loading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {t('mfaChallenge.sendCode', 'Send Code')}
                  </Button>
                </div>
                <Button
                  type="submit"
                  disabled={loading || emailOtpCode.length !== 6}
                  className="w-full"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('mfaChallenge.verify', 'Verify')}
                </Button>
              </form>
            </TabsContent>
          )}
          <TabsContent value="recovery" className="space-y-4 pt-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyRecoveryCode();
              }}
              className="space-y-4"
            >
              <Label htmlFor="recovery-code">
                {t('mfaChallenge.recoveryCodeLabel', 'Recovery Code')}
              </Label>
              <Input
                id="recovery-code"
                type="text"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder={t(
                  'mfaChallenge.enterRecoveryCode',
                  'Enter recovery code'
                )}
                autoComplete="off"
                data-lpignore="true"
                data-bitwarden-ignore="true"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
              />
              <Button
                type="submit"
                disabled={loading || recoveryCode.length === 0}
                className="w-full"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {t('mfaChallenge.verifyRecovery', 'Verify Recovery Code')}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default MfaChallenge;
