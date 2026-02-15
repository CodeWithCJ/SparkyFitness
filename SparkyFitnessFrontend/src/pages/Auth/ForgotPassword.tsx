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

const ForgotPassword = () => {
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
        'If an account with that email exists, a password reset link has been sent.'
      );
    } catch (err: any) {
      setMessage(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md dark:bg-gray-">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <img
              src="/images/SparkyFitness.webp"
              alt="SparkyFitness Logo"
              className="h-10 w-10 mr-2"
            />
            <CardTitle className="text-2xl font-bold text-gray-900 dark:text-gray-300">
              SparkyFitness
            </CardTitle>
          </div>
          <CardDescription>
            Enter your email to receive a password reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
            {message && (
              <p className="text-center text-sm text-muted-foreground">
                {message}
              </p>
            )}
            <div className="text-center text-sm">
              <a href="/" className="font-medium text-primary hover:underline">
                Back to Sign In
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPassword;
