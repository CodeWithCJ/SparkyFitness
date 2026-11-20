import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';

/**
 * The server-wide Challenges switch (`enable_challenges`, on by default).
 * Off hides Challenges for everyone and the server refuses every challenge
 * route; nothing is deleted, so turning it back on restores them.
 */
export const ChallengesSettings = () => {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useSettings();
  const { mutate: updateSettings, isPending } = useUpdateSettings();

  if (isLoading || !settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5" aria-hidden />
          {t('admin.challenges.title', 'Challenges')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="enable-challenges">
            {t(
              'admin.challenges.label',
              'Allow challenges and group leaderboards on this server'
            )}
          </Label>
          <Switch
            id="enable-challenges"
            checked={settings.enable_challenges !== false}
            disabled={isPending}
            onCheckedChange={(enabled) =>
              updateSettings({ ...settings, enable_challenges: enabled })
            }
            aria-describedby="enable-challenges-help"
          />
        </div>
        <p
          id="enable-challenges-help"
          className="text-sm text-muted-foreground"
        >
          {t(
            'admin.challenges.help',
            "People can start challenges, invite others with a code and see each other's scores, never their diaries. Turned off, challenges are hidden and scoring stops; nothing is deleted."
          )}
        </p>
      </CardContent>
    </Card>
  );
};
