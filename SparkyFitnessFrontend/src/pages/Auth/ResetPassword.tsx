import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info } from '@/utils/logging';
import useToggle from '@/hooks/use-toggle';
import PasswordToggle from '@/components/PasswordToggle';
import { useResetPasswordMutation } from '@/hooks/Auth/useAuth';
import { useTranslation } from 'react-i18next';
import {
  PASSWORD_REQUIREMENT_DEFAULTS,
  getPasswordValidationIssue,
} from '@/utils/passwordValidation';

const ResetPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, 'ResetPassword: Component rendered.');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const { isToggled: showPassword, toggleHandler: passwordToggleHandler } =
    useToggle();
  const { mutateAsync: resetPassword } = useResetPasswordMutation();

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      const invalidTokenMessage = t(
        'auth.passwordReset.invalidToken',
        'This password reset link is invalid or has expired.'
      );
      setMessage(invalidTokenMessage);
      toast({
        title: t('auth.passwordReset.errorTitle', 'Reset link unavailable'),
        description: invalidTokenMessage,
        variant: 'destructive',
      });
    }
  }, [t, token]);

  const getLocalizedPasswordError = (password: string) => {
    const issue = getPasswordValidationIssue(password);
    return issue
      ? t(
          `auth.passwordRequirements.${issue}`,
          PASSWORD_REQUIREMENT_DEFAULTS[issue]
        )
      : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, 'ResetPassword: Attempting to reset password.');
    setLoading(true);
    setMessage('');
    setPasswordError(null);

    if (!token) {
      setMessage(
        t(
          'auth.passwordReset.invalidToken',
          'This password reset link is invalid or has expired.'
        )
      );
      setLoading(false);
      return;
    }

    const validationError = getLocalizedPasswordError(newPassword);
    if (validationError) {
      setPasswordError(validationError);
      setLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError(
        t('auth.passwordReset.passwordMismatch', 'Passwords do not match.')
      );
      setLoading(false);
      return;
    }

    try {
      await resetPassword({ token, newPassword });
      setMessage(
        t(
          'auth.passwordReset.success',
          'Your password is updated. You can now sign in.'
        )
      );
      navigate('/'); // Redirect to root
    } catch (err: unknown) {
      debug(loggingLevel, 'ResetPassword: Password reset failed.', err);
      setMessage(
        t(
          'auth.passwordReset.error',
          'We could not update your password. Request a new link and try again.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/images/SparkyFitness.webp"
              alt={t('auth.logoAlt', 'SparkyFitness logo')}
              className="h-10 w-10 me-2"
            />
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-300">
              SparkyFitness
            </CardTitle>
          </div>
          <CardDescription>
            {t(
              'auth.passwordReset.description',
              'Choose a new password for your account.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2 relative">
              <Label htmlFor="new-password">
                {t('auth.passwordReset.newPassword', 'New password')}
              </Label>
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t(
                  'auth.passwordReset.newPasswordPlaceholder',
                  'Enter a new password'
                )}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setPasswordError(getLocalizedPasswordError(e.target.value));
                }}
                required
                autoComplete="new-password"
              />
              <PasswordToggle
                showPassword={showPassword}
                passwordToggleHandler={passwordToggleHandler}
              />
              {passwordError && (
                <p className="text-red-500 text-sm">{passwordError}</p>
              )}
            </div>
            <div className="space-y-2 relative">
              <Label htmlFor="confirm-password">
                {t(
                  'auth.passwordReset.confirmPassword',
                  'Confirm new password'
                )}
              </Label>
              <Input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                placeholder={t(
                  'auth.passwordReset.confirmPasswordPlaceholder',
                  'Enter the new password again'
                )}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <PasswordToggle
                showPassword={showPassword}
                passwordToggleHandler={passwordToggleHandler}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={
                loading || !!passwordError || newPassword !== confirmPassword
              }
            >
              {loading
                ? t('auth.passwordReset.resetting', 'Updating password…')
                : t('auth.passwordReset.submit', 'Update password')}
            </Button>
            {message && (
              <p className="text-center text-sm text-muted-foreground">
                {message}
              </p>
            )}
            <div className="text-center text-sm">
              <a href="/" className="font-medium text-primary hover:underline">
                {t('auth.backToSignIn', 'Back to sign in')}
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
