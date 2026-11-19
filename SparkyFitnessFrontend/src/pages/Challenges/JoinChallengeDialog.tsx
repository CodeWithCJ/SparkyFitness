import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_CHALLENGE_GOAL_TYPE,
  parseChallengeInviteCode,
  type ChallengeDetail,
  type ChallengeGoalType,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  challengeErrorCode,
  useJoinChallenge,
} from '@/hooks/Challenges/useChallenges';
import GoalTypeSelect from './GoalTypeSelect';
import { joinErrorText } from './challengeCopy';

interface JoinChallengeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A code handed over by an invite link. */
  initialCode?: string;
  defaultDisplayName: string;
  onJoined: (challenge: ChallengeDetail) => void;
}

const JoinChallengeDialog = ({
  open,
  onOpenChange,
  initialCode = '',
  defaultDisplayName,
  onJoined,
}: JoinChallengeDialogProps) => {
  const { t } = useTranslation();
  const join = useJoinChallenge();
  const codeId = useId();
  const nameId = useId();
  const [codeText, setCodeText] = useState(initialCode);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [goalType, setGoalType] = useState<ChallengeGoalType>(
    DEFAULT_CHALLENGE_GOAL_TYPE
  );
  const code = parseChallengeInviteCode(codeText);
  const canSubmit =
    code !== null && displayName.trim().length > 0 && !join.isPending;

  const submit = () => {
    if (!canSubmit || code === null) return;
    join.mutate(
      { code, display_name: displayName.trim(), goal_type: goalType },
      {
        onSuccess: (challenge) => {
          onOpenChange(false);
          onJoined(challenge);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('challenges.join.title', 'Join a challenge')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'challenges.join.description',
              'Paste the invite link or code. Members see your display name and your scores, never your diary or your email.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={codeId}>
              {t('challenges.join.code', 'Invite link or code')}
            </Label>
            <Input
              id={codeId}
              value={codeText}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setCodeText(e.target.value);
                join.reset();
              }}
            />
            {codeText.trim() !== '' && code === null && (
              <p className="text-sm text-destructive" role="alert">
                {t(
                  'challenges.join.badCode',
                  'That does not look like an invite code.'
                )}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={nameId}>
              {t('challenges.join.displayName', 'Your name in this challenge')}
            </Label>
            <Input
              id={nameId}
              value={displayName}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <GoalTypeSelect value={goalType} onChange={setGoalType} />
          {join.isError && (
            <p className="text-sm text-destructive" role="alert">
              {joinErrorText(t, challengeErrorCode(join.error))}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {t('challenges.join.submit', 'Join')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default JoinChallengeDialog;
