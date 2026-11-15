import { useTranslation } from 'react-i18next';
import { Copy, Link2, XCircle } from 'lucide-react';
import type {
  ChallengeDetail,
  ChallengeInviteResponse,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCreateChallengeInvite,
  useRevokeChallengeInvite,
} from '@/hooks/Challenges/useChallenges';
import { challengeInviteLink } from './challengeLinks';

/**
 * The host's invite controls. The server keeps only a hash of the code, so a
 * code is shown once, right after it is made; making a new one replaces it.
 */
const InvitePanel = ({
  challenge,
  invite,
  onInvite,
}: {
  challenge: ChallengeDetail;
  /** Kept by the detail view, so the code survives a switch of tabs. */
  invite: ChallengeInviteResponse | null;
  onInvite: (invite: ChallengeInviteResponse | null) => void;
}) => {
  const { t } = useTranslation();
  const { formatDate } = usePreferences();
  const create = useCreateChallengeInvite();
  const revoke = useRevokeChallengeInvite();
  const link = invite
    ? challengeInviteLink(window.location.origin, invite.code)
    : null;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t('challenges.invite.copied', 'Copied') });
    } catch {
      toast({
        title: t('challenges.invite.copyFailed', 'Could not copy'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-3" data-testid="invite-panel">
      <p className="text-sm text-muted-foreground">
        {challenge.invite_active && challenge.invite_expires_at
          ? t(
              'challenges.invite.active',
              'An invite code works until {{when}}.',
              { when: formatDate(challenge.invite_expires_at) }
            )
          : t('challenges.invite.none', 'No invite code is active.')}
      </p>
      {invite && link && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm">
            {t(
              'challenges.invite.shownOnce',
              'Share this link or code now; it is shown only once.'
            )}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={link}
              aria-label={t('challenges.invite.link', 'Invite link')}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => void copy(link)}
              aria-label={t('challenges.invite.copyLink', 'Copy link')}
            >
              <Link2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              readOnly
              value={invite.code}
              className="font-mono"
              aria-label={t('challenges.invite.code', 'Invite code')}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => void copy(invite.code)}
              aria-label={t('challenges.invite.copyCode', 'Copy code')}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            create.mutate(challenge.id, { onSuccess: (r) => onInvite(r) })
          }
          disabled={create.isPending || !!challenge.ended_at}
        >
          {challenge.invite_active
            ? t('challenges.invite.newCode', 'Make a new code')
            : t('challenges.invite.create', 'Make an invite code')}
        </Button>
        {challenge.invite_active && (
          <Button
            variant="outline"
            onClick={() =>
              revoke.mutate(challenge.id, { onSuccess: () => onInvite(null) })
            }
            disabled={revoke.isPending}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {t('challenges.invite.revoke', 'Turn off the code')}
          </Button>
        )}
      </div>
    </div>
  );
};

export default InvitePanel;
