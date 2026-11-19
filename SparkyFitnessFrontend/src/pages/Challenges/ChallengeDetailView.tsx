import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Settings2, Users } from 'lucide-react';
import {
  challengeStateNow,
  type ChallengeDetail,
  type ChallengeInviteResponse,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useChallengeUnits,
  useCreateChallengeInvite,
  useForgetLeftChallenge,
  useLeaveChallenge,
  useRevokeChallengeInvite,
} from '@/hooks/Challenges/useChallenges';
import ChallengeLeaderboard, { type StandingRow } from './ChallengeLeaderboard';
import EditRulesDialog from './EditRulesDialog';
import HowPointsWork from './HowPointsWork';
import InvitePanel from './InvitePanel';
import MemberPeriodsDialog from './MemberPeriodsDialog';
import RuleChangeLog from './RuleChangeLog';
import { formatLabel, metricLabel, periodLabel } from './challengeCopy';

interface ChallengeDetailViewProps {
  challenge: ChallengeDetail;
  currentUserId: string | undefined;
}

const ChallengeDetailView = ({
  challenge,
  currentUserId,
}: ChallengeDetailViewProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatDateInUserTimezone } = usePreferences();
  const units = useChallengeUnits();
  const leave = useLeaveChallenge();
  const forgetLeft = useForgetLeftChallenge();
  // Held here, not in the Members tab, so a code made or turned off while
  // another tab is open still lands when the request finishes.
  const createInvite = useCreateChallengeInvite();
  const revokeInvite = useRevokeChallengeInvite();
  const left = useRef(false);
  const challengeId = challenge.id;
  useEffect(
    () => () => {
      if (left.current) forgetLeft(challengeId);
    },
    [challengeId, forgetLeft]
  );
  const [member, setMember] = useState<{
    row: StandingRow;
    periodStart: string;
  } | null>(null);
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [invite, setInvite] = useState<ChallengeInviteResponse | null>(null);
  // The server sends the rules scoring today and a saved change that waits
  // for the next period.
  const { rules, pending_rules: upcoming } = challenge;
  const day = (d: string) => formatDateInUserTimezone(d, 'MMM d, yyyy');
  const isLastMember = challenge.member_count <= 1;
  // Over once the server closed it or its end date has passed in its zone.
  const ended = challengeStateNow(challenge) === 'ended';

  return (
    <div className="space-y-4">
      <Link
        to="/challenges"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('challenges.title', 'Challenges')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {challenge.emoji ? `${challenge.emoji} ` : ''}
            {challenge.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {challenge.end_date
              ? t('challenges.dates', '{{start}} to {{end}}', {
                  start: day(challenge.start_date),
                  end: day(challenge.end_date),
                })
              : t('challenges.datesOpen', 'From {{start}}', {
                  start: day(challenge.start_date),
                })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">{metricLabel(t, rules.metric)}</Badge>
            <Badge variant="secondary">{formatLabel(t, rules.format)}</Badge>
            <Badge variant="secondary">{periodLabel(t, rules.period)}</Badge>
            <Badge variant="outline">
              <Users className="mr-1 h-3 w-3" aria-hidden />
              {t('challenges.memberCount', '{{count}} members', {
                count: challenge.member_count,
                defaultValue_one: '{{count}} member',
                defaultValue_other: '{{count}} members',
              })}
            </Badge>
            {challenge.is_host && <Badge>{t('challenges.host', 'Host')}</Badge>}
            {ended && (
              <Badge variant="outline">{t('challenges.ended', 'Ended')}</Badge>
            )}
          </div>
          {challenge.description && (
            <p className="mt-2 text-sm">{challenge.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          {challenge.is_host && !ended && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Settings2 className="mr-2 h-4 w-4" />
              {t('challenges.rules.edit', 'Change the rules')}
            </Button>
          )}
          <Button variant="outline" onClick={() => setLeaving(true)}>
            <LogOut className="mr-2 h-4 w-4" />
            {t('challenges.leave.button', 'Leave')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="standings">
        <TabsList className="flex-wrap">
          <TabsTrigger value="standings">
            {t('challenges.tabs.standings', 'Standings')}
          </TabsTrigger>
          <TabsTrigger value="how">
            {t('challenges.tabs.how', 'How points work')}
          </TabsTrigger>
          <TabsTrigger value="log">
            {t('challenges.tabs.log', 'Rule changes')}
          </TabsTrigger>
          <TabsTrigger value="members">
            {t('challenges.tabs.members', 'Members')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="standings">
          <Card>
            <CardContent className="pt-6">
              <ChallengeLeaderboard
                challenge={challenge}
                units={units}
                onSelectMember={(row, periodStart) =>
                  setMember({ row, periodStart })
                }
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="how">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <HowPointsWork rules={rules} units={units} />
              {upcoming && (
                <div className="space-y-2 border-t pt-4">
                  <p className="text-sm font-medium">
                    {t('challenges.how.upcoming', 'From {{day}}:', {
                      day: day(upcoming.effective_from),
                    })}
                  </p>
                  <HowPointsWork rules={upcoming.rules} units={units} />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="log">
          <Card>
            <CardContent className="pt-6">
              <RuleChangeLog challengeId={challenge.id} units={units} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="members" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t('challenges.tabs.members', 'Members')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {challenge.members.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between py-2"
                  >
                    <span>
                      {m.display_name}
                      {m.user_id === currentUserId &&
                        ` (${t('challenges.leaderboard.you', 'You')})`}
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {m.role === 'host' && (
                        <Badge>{t('challenges.host', 'Host')}</Badge>
                      )}
                      {t('challenges.joined', 'Joined {{day}}', {
                        day: formatDateInUserTimezone(m.joined_at, 'MMM d'),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          {challenge.is_host && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {t('challenges.invite.title', 'Invite people')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <InvitePanel
                  challenge={challenge}
                  invite={invite}
                  busy={createInvite.isPending || revokeInvite.isPending}
                  onCreate={() =>
                    createInvite.mutate(challenge.id, {
                      onSuccess: (r) => setInvite(r),
                    })
                  }
                  onRevoke={() =>
                    revokeInvite.mutate(challenge.id, {
                      onSuccess: () => setInvite(null),
                    })
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <MemberPeriodsDialog
        challenge={challenge}
        member={member?.row ?? null}
        upToPeriodStart={member?.periodStart ?? challenge.start_date}
        units={units}
        onOpenChange={(open) => !open && setMember(null)}
      />
      {editing && (
        <EditRulesDialog
          challenge={challenge}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
      <ConfirmationDialog
        open={leaving}
        onOpenChange={setLeaving}
        variant="destructive"
        title={t('challenges.leave.title', 'Leave this challenge?')}
        description={
          isLastMember
            ? t(
                'challenges.leave.last',
                'You are the last member, so the challenge is deleted.'
              )
            : challenge.is_host
              ? t(
                  'challenges.leave.host',
                  'Your scores in it are deleted, and hosting passes to the member who joined first.'
                )
              : t(
                  'challenges.leave.member',
                  'Your scores in it are deleted. You can join again with a new invite.'
                )
        }
        confirmLabel={t('challenges.leave.button', 'Leave')}
        confirmDisabled={leave.isPending}
        onConfirm={() =>
          leave.mutate(challenge.id, {
            onSuccess: () => {
              left.current = true;
              setLeaving(false);
              navigate('/challenges');
            },
          })
        }
      />
    </div>
  );
};

export default ChallengeDetailView;
