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
import { useTranslation } from 'react-i18next';
interface MagicLinkRequestDialogProps {
  onClose: () => void;
  onRequest: (email: string) => Promise<void>;
  loading: boolean;
  initialEmail?: string;
}

export const MagicLinkRequestDialog: React.FC<MagicLinkRequestDialogProps> = ({
  onClose,
  onRequest,
  loading,
  initialEmail,
}) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState(initialEmail || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onRequest(email);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="magic-link-title"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle id="magic-link-title">
            {t('auth.magicLink.title', 'Email me a sign-in link')}
          </CardTitle>
          <CardDescription>
            {t(
              'auth.magicLink.description',
              'We will send a secure sign-in link to your email.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="magic-link-email">
                {t('auth.email', 'Email')}
              </Label>
              <Input
                id="magic-link-email"
                type="email"
                placeholder={t('auth.emailPlaceholder', 'name@example.com')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading
                  ? t('auth.magicLink.sending', 'Sending link…')
                  : t('auth.magicLink.submit', 'Send sign-in link')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
