import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Fingerprint, Trash2, Plus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import {
  useAddPasskeyMutation,
  useDeletePasskeyMutation,
  usePasskeys,
} from '@/hooks/Settings/usePasskeys';

const PasskeySettings = () => {
  const { t } = useTranslation();
  const [newPasskeyName, setNewPasskeyName] = useState('');

  const { data: passkeys = [], isLoading: loading } = usePasskeys();
  const { mutateAsync: addPasskey, isPending: registering } =
    useAddPasskeyMutation();
  const { mutate: deletePasskey } = useDeletePasskeyMutation();

  const handleAddPasskey = async () => {
    addPasskey(newPasskeyName, {
      onSuccess: () => {
        setNewPasskeyName('');
      },
    });
  };

  const handleDeletePasskey = (id: string) => {
    deletePasskey(id);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5 text-primary" />
            {t('settings.passkey.title', 'Passkeys')}
          </CardTitle>
          <CardDescription>
            {t(
              'settings.passkey.description',
              "Passkeys provide a secure, passwordless way to sign in using your device's biometrics or a security key."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="passkey-name">
                {t('settings.passkey.newName', 'Passkey Name (Optional)')}
              </Label>
              <Input
                id="passkey-name"
                placeholder={t(
                  'settings.passkey.namePlaceholder',
                  'e.g. My MacBook, Work Phone'
                )}
                value={newPasskeyName}
                onChange={(e) => setNewPasskeyName(e.target.value)}
              />
            </div>
            <Button
              className="sm:mt-8"
              onClick={handleAddPasskey}
              disabled={registering}
            >
              {registering ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t('settings.passkey.add', 'Add Passkey')}
            </Button>
          </div>

          <div className="space-y-3 pt-4">
            <h4 className="text-sm font-medium">
              {t('settings.passkey.yourPasskeys', 'Your Registered Passkeys')}
            </h4>
            {loading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : passkeys.length === 0 ? (
              <p className="text-sm text-muted-foreground italic px-2">
                {t(
                  'settings.passkey.noPasskeys',
                  'No passkeys registered yet.'
                )}
              </p>
            ) : (
              <div className="divide-y border rounded-md">
                {passkeys.map((pk) => (
                  <div
                    key={pk.id}
                    className="flex items-center justify-between p-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {pk.name ||
                          t('settings.passkey.unnamed', 'Unnamed Passkey')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.passkey.addedOn', 'Added on')}{' '}
                        {format(new Date(pk.createdAt), 'PPp')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeletePasskey(pk.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PasskeySettings;
