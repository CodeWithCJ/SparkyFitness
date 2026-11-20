import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import type { ChallengeDetail } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useChallengePeriodStandings } from '@/hooks/Challenges/useChallenges';
import { metricValueText, type MetricUnits } from './challengeCopy';
import LoadError from './LoadError';
import { periodRangeText, recentPeriodStarts } from './challengePeriods';

/** How many of a member's periods the dialog lists (days, for a daily challenge). */
export const MEMBER_PERIODS_SHOWN = 7;

interface MemberPeriodsDialogProps {
  challenge: ChallengeDetail;
  member: { user_id: string; display_name: string } | null;
  /** The period the leaderboard was showing; the list ends with it. */
  upToPeriodStart: string;
  units: MetricUnits;
  onOpenChange: (open: boolean) => void;
}

/**
 * One member's recent periods: place and total in each. For a daily
 * challenge each period is a day, so this is the member's days.
 */
const MemberPeriodsDialog = ({
  challenge,
  member,
  upToPeriodStart,
  units,
  onOpenChange,
}: MemberPeriodsDialogProps) => {
  const { t, i18n } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const starts = member
    ? recentPeriodStarts(
        challenge.rules.period,
        challenge.start_date,
        challenge.end_date,
        upToPeriodStart,
        MEMBER_PERIODS_SHOWN
      )
    : [];
  const results = useChallengePeriodStandings(
    member ? challenge.id : null,
    starts
  );
  const formatDay = (d: string, pattern: string) =>
    formatDateInUserTimezone(d, pattern);

  return (
    <Dialog open={member !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{member?.display_name}</DialogTitle>
          <DialogDescription>
            {challenge.rules.period === 'day'
              ? t(
                  'challenges.member.days',
                  'Their last days in this challenge.'
                )
              : t(
                  'challenges.member.periods',
                  'Their last periods in this challenge.'
                )}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y" data-testid="member-periods">
          {starts.map((start, i) => {
            const result = results[i];
            const data = result?.data;
            const row = data?.rows.find((r) => r.user_id === member?.user_id);
            return (
              <li
                key={start}
                className="flex items-center justify-between gap-2 py-2 text-sm"
              >
                <span>
                  {data
                    ? periodRangeText(
                        t,
                        challenge.rules.period,
                        data.period_start,
                        data.period_end,
                        formatDay
                      )
                    : formatDay(start, 'MMM d')}
                </span>
                {result?.isLoading ? (
                  <Skeleton className="h-4 w-20" />
                ) : row && data ? (
                  <span className="flex items-center gap-2 tabular-nums">
                    {row.winner && data.final && (
                      <Crown
                        className="h-4 w-4 text-amber-500"
                        aria-label={t(
                          'challenges.leaderboard.winner',
                          'Winner'
                        )}
                      />
                    )}
                    <Badge variant="outline">
                      {t('challenges.member.place', '#{{rank}}', {
                        rank: row.rank,
                      })}
                    </Badge>
                    {/* In the units of the rules that scored the period */}
                    {metricValueText(
                      t,
                      data.rules.metric,
                      row.total,
                      units,
                      i18n.language
                    )}
                  </span>
                ) : result?.isError ? (
                  <LoadError
                    compact
                    message={t(
                      'challenges.errors.standings',
                      'Could not load the standings.'
                    )}
                    onRetry={() => void result.refetch()}
                  />
                ) : (
                  <span className="text-muted-foreground">
                    {t('challenges.member.none', 'No score')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
};

export default MemberPeriodsDialog;
