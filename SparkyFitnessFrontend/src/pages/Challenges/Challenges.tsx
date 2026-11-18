import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, Ticket, Trophy } from 'lucide-react';
import type { ChallengeDetail } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';
import {
  challengeErrorCode,
  useChallenge,
  useChallenges,
  useChallengesAvailable,
} from '@/hooks/Challenges/useChallenges';
import ChallengeDetailView from './ChallengeDetailView';
import ChallengeStandingsPreview from './ChallengeStandingsPreview';
import CreateChallengeDialog from './CreateChallengeDialog';
import JoinChallengeDialog from './JoinChallengeDialog';
import LoadError from './LoadError';
import { metricLabel, periodLabel } from './challengeCopy';

/** The display name a form starts with: the first name, never the email. */
const firstName = (fullName: string | null | undefined) =>
  fullName?.trim().split(/\s+/)[0]?.slice(0, 40) ?? '';

const Notice = ({ children }: { children: string }) => (
  <Card>
    <CardContent className="pt-6 text-sm text-muted-foreground">
      {children}
    </CardContent>
  </Card>
);

/**
 * `/challenges` (the list) and `/challenges/:challengeId` (one challenge);
 * an invite link arrives through ChallengeJoinLink. Owner-only: nothing is read
 * while acting for someone else, and nothing shows while the admin switch
 * is off.
 */
const Challenges = () => {
  const { t } = useTranslation();
  const { challengeId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isActingOnBehalf } = useActiveUser();
  const { formatDateInUserTimezone } = usePreferences();
  const { available, isLoading: statusLoading } = useChallengesAvailable();
  const list = useChallenges(available && !challengeId);
  const detail = useChallenge(available && challengeId ? challengeId : null);
  const [createOpen, setCreateOpen] = useState(false);
  const displayName = firstName(user?.fullName);

  // An invite link hands its code over in route state (ChallengeJoinLink).
  const linkCode = (location.state as { joinCode?: string } | null)?.joinCode;
  const [joinOpen, setJoinOpen] = useState(false);
  const closeJoin = () => {
    setJoinOpen(false);
    if (linkCode !== undefined) navigate('/challenges', { replace: true });
  };

  const openChallenge = (challenge: ChallengeDetail) =>
    navigate(`/challenges/${challenge.id}`);
  // Joined from an invite link: replace the entry holding the code, so Back
  // does not open the join dialog again with a used code.
  const openJoined = (challenge: ChallengeDetail) =>
    navigate(`/challenges/${challenge.id}`, {
      replace: linkCode !== undefined,
    });

  const heading = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Trophy className="h-6 w-6" aria-hidden />
        {t('challenges.title', 'Challenges')}
      </h1>
      {available && !challengeId && (
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setJoinOpen(true)}>
            <Ticket className="mr-2 h-4 w-4" />
            {t('challenges.join.button', 'Join with a code')}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('challenges.create.button', 'New challenge')}
          </Button>
        </div>
      )}
    </div>
  );

  if (isActingOnBehalf) {
    return (
      <div className="space-y-4">
        {heading}
        <Notice>
          {t(
            'challenges.ownOnly',
            'Challenges are personal. Switch back to your own account to see yours.'
          )}
        </Notice>
      </div>
    );
  }
  if (statusLoading) return <Skeleton className="h-40 w-full" />;
  if (!available) {
    return (
      <div className="space-y-4">
        {heading}
        <Notice>
          {t(
            'challenges.disabled',
            'Challenges are turned off on this server. An admin can turn them on in Admin settings.'
          )}
        </Notice>
      </div>
    );
  }

  if (challengeId) {
    if (detail.isLoading) return <Skeleton className="h-64 w-full" />;
    if (
      !detail.data &&
      detail.isError &&
      challengeErrorCode(detail.error) !== 'CHALLENGE_NOT_FOUND'
    ) {
      return (
        <div className="space-y-4">
          {heading}
          <LoadError
            message={t(
              'challenges.errors.loadOne',
              'Could not load this challenge.'
            )}
            onRetry={() => void detail.refetch()}
          />
        </div>
      );
    }
    if (!detail.data) {
      return (
        <div className="space-y-4">
          {heading}
          <Notice>
            {t(
              'challenges.notFound',
              'This challenge was not found, or you are not a member.'
            )}
          </Notice>
        </div>
      );
    }
    // Keyed by challenge: moving between cached challenges starts afresh,
    // so one challenge's invite code or rules draft never shows on another.
    return (
      <ChallengeDetailView
        key={detail.data.id}
        challenge={detail.data}
        currentUserId={user?.id}
      />
    );
  }

  const challenges = list.data ?? [];
  return (
    <div className="space-y-4">
      {heading}
      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.isError && !list.data ? (
        <LoadError
          message={t(
            'challenges.errors.load',
            'Could not load your challenges.'
          )}
          onRetry={() => void list.refetch()}
        />
      ) : challenges.length === 0 ? (
        <Notice>
          {t(
            'challenges.empty',
            'No challenges yet. Start one and invite friends or family, or join with an invite code.'
          )}
        </Notice>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-testid="challenge-list">
          {challenges.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-start justify-between gap-2 text-lg">
                  <Link to={`/challenges/${c.id}`} className="hover:underline">
                    {c.emoji ? `${c.emoji} ` : ''}
                    {c.name}
                  </Link>
                  {c.is_host && (
                    <Badge variant="secondary">
                      {t('challenges.host', 'Host')}
                    </Badge>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {[
                    metricLabel(t, c.rules.metric),
                    periodLabel(t, c.rules.period),
                    t('challenges.memberCount', '{{count}} members', {
                      count: c.member_count,
                      defaultValue_one: '{{count}} member',
                      defaultValue_other: '{{count}} members',
                    }),
                    c.ended_at
                      ? t('challenges.ended', 'Ended')
                      : t('challenges.datesOpen', 'From {{start}}', {
                          start: formatDateInUserTimezone(
                            c.start_date,
                            'MMM d'
                          ),
                        }),
                  ].join(' · ')}
                </p>
              </CardHeader>
              <CardContent>
                <ChallengeStandingsPreview challenge={c} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateChallengeDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          defaultDisplayName={displayName}
          onCreated={openChallenge}
        />
      )}
      {(joinOpen || linkCode !== undefined) && (
        <JoinChallengeDialog
          open
          onOpenChange={(open) => !open && closeJoin()}
          initialCode={linkCode ?? ''}
          defaultDisplayName={displayName}
          onJoined={openJoined}
        />
      )}
    </div>
  );
};

export default Challenges;
