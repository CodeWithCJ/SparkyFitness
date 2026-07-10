import { useState } from 'react';
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
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug, info } from '@/utils/logging';
import { useRequestPasswordResetMutation } from '@/hooks/Auth/useAuth';
import { useTranslation } from 'react-i18next';

const ForgotPassword = () => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  debug(loggingLevel, 'ForgotPassword: Component rendered.');

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const { mutateAsync: requestPasswordReset } =
    useRequestPasswordResetMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    info(loggingLevel, 'ForgotPassword: Attempting to request password reset.');
    setLoading(true);
    setMessage('');

    try {
      await requestPasswordReset(email);
      setMessage(
        t(
          'auth.passwordRecovery.requestOutcome',
          'If an account uses that email, we sent it a password reset link.'
        )
      );
    } catch (err: unknown) {
      debug(loggingLevel, 'ForgotPassword: Reset request failed.', err);
      setMessage(
        t(
          'auth.passwordRecovery.error',
          'We could not send the link. Check your connection and try again.'
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
              'auth.passwordRecovery.description',
              'Enter your email and we will send you a password reset link.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email', 'Email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('auth.emailPlaceholder', 'name@example.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading
                ? t('auth.passwordRecovery.sending', 'Sending link…')
                : t('auth.passwordRecovery.submit', 'Send reset link')}
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

export default ForgotPassword;
