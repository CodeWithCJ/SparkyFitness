import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Lock } from 'lucide-react';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'; // Import Accordion components
import MFASettings from '@/pages/Settings/MFASettings';
import PasskeySettings from '@/pages/Settings/PasskeySettings';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { PasswordFormState } from './SettingsPage';
import { toast } from '@/hooks/use-toast';
import { useState } from 'react';
import {
  useChangeEmailMutation,
  useChangePasswordMutation,
} from '@/hooks/Settings/useAccountSecurity';

export const AccountSecurity = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const { mutate: changeEmail, isPending: isEmailPending } =
    useChangeEmailMutation();
  const { mutateAsync: changePassword, isPending: isPasswordPending } =
    useChangePasswordMutation();

  const isLoading = isEmailPending || isPasswordPending;

  const [newEmail, setNewEmail] = useState<string>(user.email || '');
  const handleEmailChange = async () => {
    if (!newEmail || newEmail === user?.email) {
      toast({
        title: 'Error',
        description: 'Please enter a new email address',
        variant: 'destructive',
      });
      return;
    }
    changeEmail({ newEmail });
  };

  const handlePasswordChange = async () => {
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast({
        title: 'Error',
        description: 'New passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (passwordForm.new_password.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters long',
        variant: 'destructive',
      });
      return;
    }

    await changePassword({
      newPassword: passwordForm.new_password,
      currentPassword: passwordForm.current_password,
      revokeOtherSessions: true,
    });
    setPasswordForm({
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
  };
  return (
    <AccordionItem value="account-security" className="border rounded-lg mb-4">
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'settings.accountSecurity.description',
          'Change your email or password and manage MFA'
        )}
      >
        <Lock className="h-5 w-5" />
        {t('settings.accountSecurity.title', 'Account Security')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-6">
        {/* Email Change */}
        <div>
          <Label htmlFor="current_email">
            {t('settings.accountSecurity.currentEmail', 'Current Email')}
          </Label>
          <div className="flex gap-2">
            <Input
              id="current_email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t(
                'settings.accountSecurity.enterNewEmail',
                'Enter new email address'
              )}
            />
            <Button
              onClick={handleEmailChange}
              disabled={isLoading}
              variant="outline"
            >
              {t('settings.accountSecurity.updateEmail', 'Update Email')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t(
              'settings.accountSecurity.verifyNewEmail',
              "You'll need to verify your new email address"
            )}
          </p>
        </div>

        <Separator />

        {/* Password Change */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handlePasswordChange();
          }}
          className="space-y-4"
        >
          <h3 className="text-lg font-medium">
            {t('settings.accountSecurity.changePassword', 'Change Password')}
          </h3>
          {/* Hidden username field for password managers */}
          <Input
            type="text"
            id="username"
            name="username"
            autoComplete="username"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            value={user?.email || ''} // Pre-fill with user's email if available
            readOnly
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="new_password">
                {t('settings.accountSecurity.newPassword', 'New Password')}
              </Label>
              <Input
                id="new_password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.new_password}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    new_password: e.target.value,
                  }))
                }
                placeholder={t(
                  'settings.accountSecurity.enterNewPassword',
                  'Enter new password'
                )}
              />
            </div>
            <div>
              <Label htmlFor="confirm_password">
                {t(
                  'settings.accountSecurity.confirmNewPassword',
                  'Confirm New Password'
                )}
              </Label>
              <Input
                id="confirm_password"
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirm_password}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    confirm_password: e.target.value,
                  }))
                }
                placeholder={t(
                  'settings.accountSecurity.confirmNewPassword',
                  'Confirm New Password'
                )}
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={
              isLoading ||
              !passwordForm.new_password ||
              !passwordForm.confirm_password
            }
          >
            <Lock className="h-4 w-4 mr-2" />
            {isLoading
              ? t('settings.accountSecurity.updating', 'Updating...')
              : t('settings.accountSecurity.updatePassword', 'Update Password')}
          </Button>
        </form>
        <Separator />
        <PasskeySettings />
        <Separator />
        <MFASettings />
      </AccordionContent>
    </AccordionItem>
  );
};
